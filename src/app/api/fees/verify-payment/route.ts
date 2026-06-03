import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['student']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await request.json();

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return NextResponse.json({ error: 'All Razorpay payment details are required' }, { status: 400 });
        }

        // 1. Resolve student ID from auth.user.userId
        const student = await queryOne<any>(
            `SELECT id FROM students WHERE user_id = $1 AND school_id = $2`,
            [auth.user.userId, schoolId]
        );

        if (!student) {
            return NextResponse.json({ error: 'Student record not found' }, { status: 404 });
        }

        // 2. Fetch the corresponding order
        const order = await queryOne<any>(
            `SELECT * FROM fee_payment_orders WHERE razorpay_order_id = $1 AND student_id = $2 AND school_id = $3`,
            [razorpay_order_id, student.id, schoolId]
        );

        if (!order) {
            return NextResponse.json({ error: 'Payment order not found' }, { status: 404 });
        }

        if (order.status === 'paid') {
            return NextResponse.json({ success: true, message: 'Payment already verified' });
        }

        // 3. Fetch school's payment gateway configuration for verification
        const pgConfig = await queryOne<any>(
            `SELECT key_secret FROM payment_gateway_config WHERE school_id = $1 AND gateway_type = 'razorpay' AND is_active = true`,
            [schoolId]
        );

        if (!pgConfig || !pgConfig.key_secret) {
            return NextResponse.json({ error: 'Online payments are currently not configured for this school' }, { status: 400 });
        }

        // 4. Verify the signature
        const generatedSignature = crypto
            .createHmac('sha256', pgConfig.key_secret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            // Mark the order as failed
            await query(
                `UPDATE fee_payment_orders SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [order.id]
            );
            return NextResponse.json({ error: 'Payment verification failed: signature mismatch' }, { status: 400 });
        }

        // 5. Update order status to paid
        await query(
            `UPDATE fee_payment_orders
             SET status = 'paid', razorpay_payment_id = $1, razorpay_signature = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [razorpay_payment_id, razorpay_signature, order.id]
        );

        // 6. Generate a unique receipt number
        const receiptNumber = `REC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        let payment;

        if (order.invoice_id) {
            // ── Invoice-based payment ──
            const invoice = await queryOne<any>(
                `SELECT * FROM invoices WHERE id = $1`, [order.invoice_id]
            );
            if (invoice) {
                const currentPaid = parseFloat(invoice.paid_amount || '0');
                const totalAmount = parseFloat(invoice.total_amount || '0');
                const orderAmount = parseFloat(order.amount);
                const newPaid = currentPaid + orderAmount;
                const newStatus = newPaid >= totalAmount ? 'paid' : 'partially_paid';

                await query(
                    `UPDATE invoices SET paid_amount = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                    [order.invoice_id, newPaid, newStatus]
                );
            }

            // Insert into fee_payments with invoice_id (fee_structure_id is NULL)
            payment = await queryOne<any>(
                `INSERT INTO fee_payments
                    (student_id, invoice_id, fee_structure_id, amount_paid, payment_mode, payment_date, receipt_number, payment_status, remarks, razorpay_payment_id, razorpay_order_id, school_id)
                VALUES ($1, $2, NULL, $3, 'online', CURRENT_DATE, $4, 'completed', 'Online invoice payment via Razorpay', $5, $6, $7)
                RETURNING id, receipt_number, amount_paid, payment_date`,
                [student.id, order.invoice_id, order.amount, receiptNumber, razorpay_payment_id, razorpay_order_id, schoolId]
            );
        } else {
            // ── Fee-structure-based payment ──
            payment = await queryOne<any>(
                `INSERT INTO fee_payments
                    (student_id, fee_structure_id, invoice_id, amount_paid, payment_mode, payment_date, receipt_number, payment_status, remarks, razorpay_payment_id, razorpay_order_id, school_id)
                VALUES ($1, $2, NULL, $3, 'online', CURRENT_DATE, $4, 'completed', 'Online payment via Razorpay', $5, $6, $7)
                RETURNING id, receipt_number, amount_paid, payment_date`,
                [student.id, order.fee_structure_id, order.amount, receiptNumber, razorpay_payment_id, razorpay_order_id, schoolId]
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Payment verified and recorded successfully!',
            payment
        });
    } catch (error: any) {
        console.error('Error verifying payment:', error);
        return NextResponse.json({ error: error.message || 'Failed to verify payment' }, { status: 500 });
    }
}
