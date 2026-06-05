import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';
import { sendNotification } from '@/lib/notifications';

/**
 * GET /api/fees/payments — List fee payments (with filters)
 * POST /api/fees/payments — Record a new fee payment (invoice-based or structure-based)
 */

// GET: List payments
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer', 'student']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { searchParams } = new URL(request.url);
        const studentId = searchParams.get('studentId');
        const feeStructureId = searchParams.get('feeStructureId');
        const invoiceId = searchParams.get('invoiceId');
        const status = searchParams.get('status');

        let sql = `
            SELECT fp.*,
                st.first_name || ' ' || st.last_name as student_name,
                st.admission_number,
                fs.name as fee_name, fs.amount as fee_amount, fs.fee_type,
                inv.invoice_number, inv.total_amount as invoice_total,
                u.first_name || ' ' || u.last_name as collected_by_name
            FROM fee_payments fp
            JOIN students st ON fp.student_id = st.id
            LEFT JOIN fee_structures fs ON fp.fee_structure_id = fs.id
            LEFT JOIN invoices inv ON fp.invoice_id = inv.id
            LEFT JOIN users u ON fp.collected_by = u.id
            WHERE 1=1
        `;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) {
            sql += ` AND st.school_id = $${idx++}`;
            params.push(schoolId);
        }
        if (studentId) {
            sql += ` AND fp.student_id = $${idx++}`;
            params.push(studentId);
        }
        if (feeStructureId) {
            sql += ` AND fp.fee_structure_id = $${idx++}`;
            params.push(feeStructureId);
        }
        if (invoiceId) {
            sql += ` AND fp.invoice_id = $${idx++}`;
            params.push(invoiceId);
        }
        if (status) {
            sql += ` AND fp.payment_status = $${idx++}`;
            params.push(status);
        }

        sql += ` ORDER BY fp.payment_date DESC, fp.created_at DESC`;
        const payments = await query<any>(sql, params);
        return NextResponse.json({ payments });
    } catch (error) {
        console.error('Error fetching payments:', error);
        return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
    }
}

// POST: Record a payment
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
    if (auth.error) return auth.error;

    try {
        const { studentId, feeStructureId, invoiceId, amountPaid, paymentMode, paymentDate, receiptNumber, remarks } = await request.json();

        if (!studentId || !amountPaid) {
            return NextResponse.json({ error: 'studentId and amountPaid are required' }, { status: 400 });
        }

        const parsedAmountPaid = parseFloat(amountPaid);
        const finalReceipt = receiptNumber || `RCP-${Date.now().toString(36).toUpperCase()}`;

        // 1. Invoice-Based Payment Flow
        if (invoiceId) {
            const invoice = await queryOne<any>(
                `SELECT * FROM invoices WHERE id = $1`, [invoiceId]
            );
            if (!invoice) {
                return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
            }

            const currentPaid = parseFloat(invoice.paid_amount || '0');
            const totalAmount = parseFloat(invoice.total_amount || '0');
            const newPaid = currentPaid + parsedAmountPaid;

            let invoiceStatus = 'unpaid';
            if (newPaid >= totalAmount) {
                invoiceStatus = 'paid';
            } else if (newPaid > 0) {
                invoiceStatus = 'partially_paid';
            }

            // Update Invoice
            await query(
                `UPDATE invoices SET paid_amount = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [invoiceId, newPaid, invoiceStatus]
            );

            // Record Payment
            const payment = await queryOne<any>(
                `INSERT INTO fee_payments (student_id, invoice_id, amount_paid, payment_mode, payment_date, receipt_number, payment_status, remarks, collected_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
                [studentId, invoiceId, parsedAmountPaid, paymentMode || 'cash', paymentDate || new Date().toISOString().split('T')[0],
                 finalReceipt, 'completed', remarks || null, auth.user.userId]
            );

            // Send fee receipt notification (fire-and-forget)
            const schoolId = resolveSchoolId(auth.user, request);
            if (schoolId) {
                sendNotification({
                    schoolId, studentId,
                    event: 'fee_receipt',
                    variables: {
                        amount: parsedAmountPaid.toFixed(2),
                        receiptNo: finalReceipt,
                        paymentMode: paymentMode || 'cash',
                        date: paymentDate || new Date().toISOString().split('T')[0],
                    },
                }).catch(err => console.error('[Notification] Fee receipt error:', err));
            }

            return NextResponse.json({
                payment,
                summary: {
                    totalAmount,
                    totalPaid: newPaid,
                    remaining: Math.max(0, totalAmount - newPaid),
                    status: invoiceStatus
                }
            }, { status: 201 });
        }

        // 2. Backward Compatible Flow (using feeStructureId)
        if (!feeStructureId) {
            return NextResponse.json({ error: 'Either invoiceId or feeStructureId must be provided' }, { status: 400 });
        }

        const feeStructure = await queryOne<any>(
            `SELECT * FROM fee_structures WHERE id = $1`, [feeStructureId]
        );
        if (!feeStructure) {
            return NextResponse.json({ error: 'Fee structure not found' }, { status: 404 });
        }

        const alreadyPaid = await queryOne<{ total: string }>(
            `SELECT COALESCE(SUM(amount_paid), 0) as total FROM fee_payments 
             WHERE student_id = $1 AND fee_structure_id = $2 AND payment_status = 'completed'`,
            [studentId, feeStructureId]
        );

        const totalPaid = parseFloat(alreadyPaid?.total || '0') + parsedAmountPaid;
        const feeAmount = parseFloat(feeStructure.amount);
        const paymentStatus = totalPaid >= feeAmount ? 'completed' : 'partial';

        const payment = await queryOne<any>(
            `INSERT INTO fee_payments (student_id, fee_structure_id, amount_paid, payment_mode, payment_date, receipt_number, payment_status, remarks, collected_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [studentId, feeStructureId, parsedAmountPaid, paymentMode || 'cash', paymentDate || new Date().toISOString().split('T')[0],
             finalReceipt, paymentStatus, remarks || null, auth.user.userId]
        );

        // Send fee receipt notification (fire-and-forget)
        const schoolId2 = resolveSchoolId(auth.user, request);
        if (schoolId2) {
            sendNotification({
                schoolId: schoolId2, studentId,
                event: 'fee_receipt',
                variables: {
                    amount: parsedAmountPaid.toFixed(2),
                    receiptNo: finalReceipt,
                    paymentMode: paymentMode || 'cash',
                    date: paymentDate || new Date().toISOString().split('T')[0],
                },
            }).catch(err => console.error('[Notification] Fee receipt error:', err));
        }

        return NextResponse.json({
            payment,
            summary: {
                feeAmount,
                totalPaid,
                remaining: Math.max(0, feeAmount - totalPaid),
                status: paymentStatus
            }
        }, { status: 201 });
    } catch (error) {
        console.error('Error recording payment:', error);
        return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
    }
}
