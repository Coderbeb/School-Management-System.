import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';

/**
 * GET /api/fees/payments/[id] — Fetch a single payment with full receipt details
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer', 'student']);
    if (auth.error) return auth.error;

    const { id } = await params;

    try {
        // Fetch payment with student, school, and fee details
        const payment = await queryOne<any>(
            `SELECT fp.*,
                st.first_name as student_first_name, st.last_name as student_last_name,
                st.admission_number, st.guardian_name, st.guardian_phone,
                st.school_id,
                sc.name as school_name, sc.address as school_address,
                sc.phone as school_phone, sc.email as school_email, sc.logo_url as school_logo,
                inv.invoice_number, inv.total_amount as invoice_total, inv.paid_amount as invoice_paid,
                inv.status as invoice_status,
                fs.name as fee_structure_name, fs.amount as fee_structure_amount,
                u.first_name || ' ' || u.last_name as collected_by_name
            FROM fee_payments fp
            JOIN students st ON fp.student_id = st.id
            JOIN schools sc ON st.school_id = sc.id
            LEFT JOIN invoices inv ON fp.invoice_id = inv.id
            LEFT JOIN fee_structures fs ON fp.fee_structure_id = fs.id
            LEFT JOIN users u ON fp.collected_by = u.id
            WHERE fp.id = $1`,
            [id]
        );

        if (!payment) {
            return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
        }

        // Student can only view their own payment
        if (auth.user.role === 'student') {
            const student = await queryOne<{ id: string }>(
                `SELECT id FROM students WHERE user_id = $1`,
                [auth.user.userId]
            );
            if (!student || student.id !== payment.student_id) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        // If invoice-based, get invoice items
        let invoiceItems: any[] = [];
        if (payment.invoice_id) {
            invoiceItems = await query<any>(
                `SELECT ii.*, fh.name as head_name, fh.category as head_category
                 FROM invoice_items ii
                 LEFT JOIN fee_heads fh ON ii.fee_head_id = fh.id
                 WHERE ii.invoice_id = $1`,
                [payment.invoice_id]
            );
        }

        // Get class info from enrollment
        const enrollment = await queryOne<any>(
            `SELECT c.name as class_name, sec.name as section_name
             FROM student_enrollments se
             JOIN class_sections cs ON se.class_section_id = cs.id
             JOIN classes c ON cs.class_id = c.id
             JOIN sections sec ON cs.section_id = sec.id
             WHERE se.student_id = $1 AND se.status = 'active'
             LIMIT 1`,
            [payment.student_id]
        );

        return NextResponse.json({
            payment: {
                ...payment,
                class_name: enrollment?.class_name || null,
                section_name: enrollment?.section_name || null,
                invoice_items: invoiceItems,
            }
        });
    } catch (error) {
        console.error('Error fetching payment details:', error);
        return NextResponse.json({ error: 'Failed to fetch payment details' }, { status: 500 });
    }
}
