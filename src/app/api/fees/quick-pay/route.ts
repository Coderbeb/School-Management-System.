import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * POST /api/fees/quick-pay — Record a payment without requiring an existing invoice.
 * Creates an adhoc invoice automatically for audit trail, then records the payment.
 * 
 * Use cases:
 * - Walk-in fee collection (parent pays cash at counter)
 * - Ad-hoc charges (exam re-evaluation, damage fee, etc.)
 * - Miscellaneous fees that don't fit into regular fee groups
 */
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const {
            studentId,
            amount,
            description,
            feeHeadId,
            paymentMode,
            remarks
        } = await request.json();

        // Validation
        if (!studentId || !amount || !description) {
            return NextResponse.json(
                { error: 'studentId, amount, and description are required' },
                { status: 400 }
            );
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
        }

        // Verify student exists and belongs to this school
        const student = await queryOne<any>(
            `SELECT s.id, s.first_name, s.last_name, s.admission_number, se.session_id
             FROM students s
             JOIN student_enrollments se ON se.student_id = s.id AND se.status = 'active'
             WHERE s.id = $1 AND s.school_id = $2
             LIMIT 1`,
            [studentId, schoolId]
        );

        if (!student) {
            return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

        // 1. Create an adhoc invoice for audit trail
        const rand = Math.floor(1000 + Math.random() * 9000);
        const ts = Date.now().toString().slice(-6);
        const invoiceNumber = `ADHOC-${ts}-${rand}`;
        const today = new Date().toISOString().split('T')[0];
        const billingMonth = today.substring(0, 7);

        const invoice = await queryOne<any>(
            `INSERT INTO invoices
                (school_id, student_id, session_id, invoice_number, due_date,
                 billing_month, billing_type, subtotal, tax_amount, discount_amount,
                 total_amount, paid_amount, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'adhoc', $7, 0, 0, $7, $7, 'paid')
             RETURNING id`,
            [schoolId, studentId, student.session_id, invoiceNumber, today, billingMonth, parsedAmount]
        );

        // 2. Create invoice item
        await query(
            `INSERT INTO invoice_items (invoice_id, fee_head_id, name, amount, tax_amount, discount_amount, total_amount)
             VALUES ($1, $2, $3, $4, 0, 0, $4)`,
            [invoice.id, feeHeadId || null, description, parsedAmount]
        );

        // 3. Create payment record
        const receiptNumber = `REC-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        const payment = await queryOne<any>(
            `INSERT INTO fee_payments
                (student_id, invoice_id, fee_structure_id, amount_paid, payment_mode,
                 payment_date, receipt_number, payment_status, remarks, school_id)
             VALUES ($1, $2, NULL, $3, $4, CURRENT_DATE, $5, 'completed', $6, $7)
             RETURNING id, receipt_number, amount_paid, payment_date`,
            [
                studentId, invoice.id, parsedAmount,
                paymentMode || 'cash', receiptNumber,
                remarks || `Quick Pay: ${description}`, schoolId
            ]
        );

        return NextResponse.json({
            success: true,
            message: `Payment of ₹${parsedAmount.toLocaleString('en-IN')} recorded for ${student.first_name} ${student.last_name}`,
            payment,
            invoice: { id: invoice.id, invoice_number: invoiceNumber }
        }, { status: 201 });

    } catch (error) {
        console.error('Error processing quick pay:', error);
        return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 });
    }
}
