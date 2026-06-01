import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        // V2 Defaulters: from invoices system
        const v2Defaulters = await query<any>(
            `SELECT 
                s.id as student_id,
                s.first_name,
                s.last_name,
                s.admission_number,
                c.name as class_name,
                inv.invoice_number as fee_name,
                inv.total_amount as fee_amount,
                inv.due_date,
                inv.paid_amount as amount_paid,
                (inv.total_amount - inv.paid_amount) as remaining_amount,
                'invoice' as source
            FROM students s
            JOIN student_enrollments se ON s.id = se.student_id
            JOIN class_sections cs ON se.class_section_id = cs.id
            JOIN classes c ON cs.class_id = c.id
            JOIN invoices inv ON inv.student_id = s.id AND inv.session_id = se.session_id
            WHERE s.school_id = $1
              AND se.status = 'active'
              AND inv.status IN ('unpaid', 'partially_paid', 'overdue')
              AND inv.due_date < CURRENT_DATE
            ORDER BY inv.due_date ASC, s.first_name ASC`,
            [schoolId]
        );

        // V1 Defaulters: from legacy fee_structures + fee_payments
        const v1Defaulters = await query<any>(
            `SELECT 
                s.id as student_id,
                s.first_name,
                s.last_name,
                s.admission_number,
                c.name as class_name,
                fs.name as fee_name,
                fs.amount as fee_amount,
                fs.due_date,
                COALESCE(paid.total_paid, 0) as amount_paid,
                (fs.amount - COALESCE(paid.total_paid, 0)) as remaining_amount,
                'legacy' as source
            FROM students s
            JOIN student_enrollments se ON s.id = se.student_id AND se.status = 'active'
            JOIN class_sections cs ON se.class_section_id = cs.id
            JOIN classes c ON cs.class_id = c.id
            JOIN fee_structures fs ON (fs.class_id = c.id OR fs.class_id IS NULL)
                AND fs.school_id = $1 AND fs.is_active = true
            LEFT JOIN (
                SELECT fee_structure_id, student_id, SUM(amount_paid) as total_paid
                FROM fee_payments
                WHERE payment_status = 'completed'
                GROUP BY fee_structure_id, student_id
            ) paid ON paid.fee_structure_id = fs.id AND paid.student_id = s.id
            WHERE s.school_id = $1
              AND fs.due_date < CURRENT_DATE
              AND (fs.amount - COALESCE(paid.total_paid, 0)) > 0
            ORDER BY fs.due_date ASC, s.first_name ASC`,
            [schoolId]
        );

        // Combine and deduplicate by student_id + fee_name
        const seen = new Set<string>();
        const combined: any[] = [];

        // V2 takes priority
        for (const d of v2Defaulters) {
            const key = `${d.student_id}__${d.fee_name}`;
            if (!seen.has(key)) {
                seen.add(key);
                combined.push(d);
            }
        }
        for (const d of v1Defaulters) {
            const key = `${d.student_id}__${d.fee_name}`;
            if (!seen.has(key)) {
                seen.add(key);
                combined.push(d);
            }
        }

        return NextResponse.json({ defaulters: combined });
    } catch (error: any) {
        console.error('Error fetching defaulters:', error);
        return NextResponse.json({ error: 'Failed to fetch fee defaulters' }, { status: 500 });
    }
}
