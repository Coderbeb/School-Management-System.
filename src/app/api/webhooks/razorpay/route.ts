import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import crypto from 'crypto';
import { sendNotification } from '@/lib/notifications';

/**
 * POST /api/webhooks/razorpay
 * 
 * Handles Razorpay webhook events for payment confirmations.
 * This is critical for cases where the student closes the browser
 * after paying but before the frontend verification callback fires.
 * 
 * Events handled:
 * - payment.captured: Payment was successfully captured
 * - payment.failed: Payment failed
 * - order.paid: Order was fully paid
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.text();
        const signature = request.headers.get('x-razorpay-signature');

        if (!signature) {
            return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
        }

        // Parse the webhook payload
        let payload: any;
        try {
            payload = JSON.parse(body);
        } catch {
            return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
        }

        const event = payload.event;
        const entity = payload.payload?.payment?.entity || payload.payload?.order?.entity;

        if (!entity) {
            return NextResponse.json({ error: 'Missing entity in payload' }, { status: 400 });
        }

        // Determine the order_id from the event
        const razorpayOrderId = entity.order_id || entity.id;

        if (!razorpayOrderId) {
            // Can't process without an order reference
            return NextResponse.json({ status: 'ignored', reason: 'No order_id found' });
        }

        // Find the order in our database
        const order = await queryOne<any>(
            `SELECT fpo.*, s.school_id 
             FROM fee_payment_orders fpo
             JOIN students s ON fpo.student_id = s.id
             WHERE fpo.razorpay_order_id = $1`,
            [razorpayOrderId]
        );

        if (!order) {
            // Not our order — might be a platform billing order or unknown
            return NextResponse.json({ status: 'ignored', reason: 'Order not found in fee_payment_orders' });
        }

        // Verify webhook signature using the school's webhook_secret
        const pgConfig = await queryOne<any>(
            `SELECT webhook_secret, key_secret FROM payment_gateway_config 
             WHERE school_id = $1 AND gateway_type = 'razorpay' AND is_active = true`,
            [order.school_id]
        );

        if (pgConfig) {
            const secret = pgConfig.webhook_secret || pgConfig.key_secret;
            if (secret) {
                const expectedSignature = crypto
                    .createHmac('sha256', secret)
                    .update(body)
                    .digest('hex');

                if (expectedSignature !== signature) {
                    console.error('[Webhook] Signature mismatch for order:', razorpayOrderId);
                    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
                }
            }
        }

        // Process based on event type
        switch (event) {
            case 'payment.captured':
            case 'order.paid': {
                // Only process if not already paid
                if (order.status === 'paid') {
                    return NextResponse.json({ status: 'already_processed' });
                }

                const razorpayPaymentId = entity.id || entity.payment_id;
                const paymentAmount = parseFloat(order.amount);

                // Update order status
                await query(
                    `UPDATE fee_payment_orders 
                     SET status = 'paid', razorpay_payment_id = $1, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $2`,
                    [razorpayPaymentId, order.id]
                );

                // Check if payment already recorded (frontend might have done it first)
                const existingPayment = await queryOne<any>(
                    `SELECT id FROM fee_payments WHERE razorpay_order_id = $1`,
                    [razorpayOrderId]
                );

                if (!existingPayment) {
                    // Record the payment
                    const receiptNumber = `REC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

                    if (order.invoice_id) {
                        // Update invoice
                        const invoice = await queryOne<any>(
                            `SELECT * FROM invoices WHERE id = $1`,
                            [order.invoice_id]
                        );
                        if (invoice) {
                            const newPaid = parseFloat(invoice.paid_amount || '0') + paymentAmount;
                            const newStatus = newPaid >= parseFloat(invoice.total_amount) ? 'paid' : 'partially_paid';
                            await query(
                                `UPDATE invoices SET paid_amount = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                                [order.invoice_id, newPaid, newStatus]
                            );
                        }

                        await query(
                            `INSERT INTO fee_payments
                                (student_id, invoice_id, fee_structure_id, amount_paid, payment_mode, payment_date, receipt_number, payment_status, remarks, razorpay_payment_id, razorpay_order_id, school_id)
                            VALUES ($1, $2, NULL, $3, 'online', CURRENT_DATE, $4, 'completed', 'Payment confirmed via Razorpay webhook', $5, $6, $7)`,
                            [order.student_id, order.invoice_id, paymentAmount, receiptNumber, razorpayPaymentId, razorpayOrderId, order.school_id]
                        );
                    } else {
                        await query(
                            `INSERT INTO fee_payments
                                (student_id, fee_structure_id, invoice_id, amount_paid, payment_mode, payment_date, receipt_number, payment_status, remarks, razorpay_payment_id, razorpay_order_id, school_id)
                            VALUES ($1, $2, NULL, $3, 'online', CURRENT_DATE, $4, 'completed', 'Payment confirmed via Razorpay webhook', $5, $6, $7)`,
                            [order.student_id, order.fee_structure_id, paymentAmount, receiptNumber, razorpayPaymentId, razorpayOrderId, order.school_id]
                        );
                    }
                }

                // Send fee receipt notification (fire-and-forget)
                sendNotification({
                    schoolId: order.school_id,
                    studentId: order.student_id,
                    event: 'fee_receipt',
                    variables: {
                        amount: paymentAmount.toFixed(2),
                        receiptNo: existingPayment ? 'Online Payment' : receiptNumber,
                        paymentMode: 'online',
                        date: new Date().toISOString().split('T')[0],
                    },
                }).catch(err => console.error('[Webhook Notification] Error:', err));

                console.log(`[Webhook] ✅ Payment captured for order ${razorpayOrderId}`);
                return NextResponse.json({ status: 'ok' });
            }

            case 'payment.failed': {
                await query(
                    `UPDATE fee_payment_orders SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                    [order.id]
                );
                console.log(`[Webhook] ❌ Payment failed for order ${razorpayOrderId}`);
                return NextResponse.json({ status: 'ok' });
            }

            default:
                return NextResponse.json({ status: 'ignored', reason: `Unhandled event: ${event}` });
        }
    } catch (error: any) {
        console.error('[Webhook] Error processing Razorpay webhook:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
