import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';
import Razorpay from 'razorpay';

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['student']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { feeStructureId, invoiceId } = await request.json();

        if (!feeStructureId && !invoiceId) {
            return NextResponse.json({ error: 'Fee Structure ID or Invoice ID is required' }, { status: 400 });
        }

        // 1. Resolve student ID from auth.user.userId
        const student = await queryOne<any>(
            `SELECT id FROM students WHERE user_id = $1 AND school_id = $2`,
            [auth.user.userId, schoolId]
        );

        if (!student) {
            return NextResponse.json({ error: 'Student record not found' }, { status: 404 });
        }

        let remainingAmount = 0;
        let dbInsertCol = '';
        let dbInsertVal: string | null = null;

        // 2. Fetch invoice/structure details and calculate remaining amount
        if (invoiceId) {
            const invoice = await queryOne<any>(
                `SELECT * FROM invoices WHERE id = $1 AND student_id = $2 AND school_id = $3`,
                [invoiceId, student.id, schoolId]
            );
            if (!invoice) {
                return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
            }
            if (invoice.status === 'paid') {
                return NextResponse.json({ error: 'This invoice is already fully paid' }, { status: 400 });
            }
            remainingAmount = parseFloat(invoice.total_amount) - parseFloat(invoice.paid_amount || '0');
            dbInsertCol = 'invoice_id';
            dbInsertVal = invoiceId;
        } else {
            const structure = await queryOne<any>(
                `SELECT * FROM fee_structures WHERE id = $1 AND school_id = $2 AND is_active = true`,
                [feeStructureId, schoolId]
            );
            if (!structure) {
                return NextResponse.json({ error: 'Fee structure not found or inactive' }, { status: 404 });
            }
            const paidResult = await queryOne<any>(
                `SELECT SUM(amount_paid) as total_paid FROM fee_payments WHERE student_id = $1 AND fee_structure_id = $2`,
                [student.id, feeStructureId]
            );
            const totalPaid = parseFloat(paidResult?.total_paid || '0');
            remainingAmount = parseFloat(structure.amount) - totalPaid;
            dbInsertCol = 'fee_structure_id';
            dbInsertVal = feeStructureId;
        }

        if (remainingAmount <= 0) {
            return NextResponse.json({ error: 'This fee is already fully paid' }, { status: 400 });
        }

        // 4. Fetch school's payment gateway configuration
        const pgConfig = await queryOne<any>(
            `SELECT key_id, key_secret, is_active FROM payment_gateway_config WHERE school_id = $1 AND gateway_type = 'razorpay'`,
            [schoolId]
        );

        if (!pgConfig || !pgConfig.is_active || !pgConfig.key_id || !pgConfig.key_secret) {
            return NextResponse.json({ error: 'Online payments are currently not configured for this school' }, { status: 400 });
        }

        // 5. Initialize Razorpay and create order
        const razorpay = new Razorpay({
            key_id: pgConfig.key_id,
            key_secret: pgConfig.key_secret
        });

        const order = await razorpay.orders.create({
            amount: Math.round(remainingAmount * 100), // Razorpay expects amount in paise
            currency: 'INR',
            receipt: `rcpt_${student.id.slice(0, 8)}_${Date.now()}`
        });

        // 6. Record order in fee_payment_orders
        await query(
            `INSERT INTO fee_payment_orders
                (student_id, ${dbInsertCol}, school_id, razorpay_order_id, amount, status)
            VALUES ($1, $2, $3, $4, $5, 'created')`,
            [student.id, dbInsertVal, schoolId, order.id, remainingAmount]
        );

        return NextResponse.json({
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: pgConfig.key_id
        });
    } catch (error: any) {
        console.error('Error creating payment order:', error);
        return NextResponse.json({ error: error.message || 'Failed to create payment order' }, { status: 500 });
    }
}
