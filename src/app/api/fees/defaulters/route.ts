import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/fees/defaulters — V3: Invoice-based defaulters only (V1 legacy deprecated)
 * Returns students with overdue invoices, grouped by severity
 */
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const defaulters = await query<any>(
            `SELECT 
                s.id as student_id,
                s.first_name,
                s.last_name,
                s.admission_number,
                s.guardian_phone,
                c.name as class_name,
                inv.id as invoice_id,
                inv.invoice_number as fee_name,
                inv.billing_month,
                inv.billing_type,
                inv.total_amount as fee_amount,
                inv.due_date,
                inv.paid_amount as amount_paid,
                (inv.total_amount - inv.paid_amount) as remaining_amount,
                (CURRENT_DATE - inv.due_date::date) as overdue_days,
                CASE 
                    WHEN (CURRENT_DATE - inv.due_date::date) > 30 THEN 'severe'
                    WHEN (CURRENT_DATE - inv.due_date::date) > 15 THEN 'moderate'
                    ELSE 'mild'
                END as severity
            FROM students s
            JOIN student_enrollments se ON s.id = se.student_id
            JOIN class_sections cs ON se.class_section_id = cs.id
            JOIN classes c ON cs.class_id = c.id
            JOIN invoices inv ON inv.student_id = s.id AND inv.session_id = se.session_id
            WHERE s.school_id = $1
              AND se.status = 'active'
              AND inv.status IN ('unpaid', 'partially_paid', 'overdue')
              AND inv.due_date < CURRENT_DATE
            ORDER BY (CURRENT_DATE - inv.due_date::date) DESC, s.first_name ASC`,
            [schoolId]
        );

        // Calculate summary stats
        const totalOverdue = defaulters.reduce((sum: number, d: any) => sum + parseFloat(d.remaining_amount || '0'), 0);
        const severeCount = defaulters.filter((d: any) => d.severity === 'severe').length;
        const moderateCount = defaulters.filter((d: any) => d.severity === 'moderate').length;
        const mildCount = defaulters.filter((d: any) => d.severity === 'mild').length;
        const uniqueStudents = new Set(defaulters.map((d: any) => d.student_id)).size;

        return NextResponse.json({
            defaulters,
            summary: {
                totalOverdue,
                uniqueStudents,
                severe: severeCount,
                moderate: moderateCount,
                mild: mildCount
            }
        });
    } catch (error: any) {
        console.error('Error fetching defaulters:', error);
        return NextResponse.json({ error: 'Failed to fetch fee defaulters' }, { status: 500 });
    }
}
