import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const defaulters = await query<any>(
            `SELECT 
                s.id as student_id,
                s.first_name,
                s.last_name,
                s.admission_number,
                c.name as class_name,
                fs.name as fee_name,
                fs.amount as fee_amount,
                fs.due_date,
                COALESCE(SUM(fp.amount_paid), 0) as amount_paid,
                fs.amount - COALESCE(SUM(fp.amount_paid), 0) as remaining_amount
            FROM students s
            JOIN student_enrollments se ON s.id = se.student_id
            JOIN class_sections cs ON se.class_section_id = cs.id
            JOIN classes c ON cs.class_id = c.id
            JOIN fee_structures fs ON (fs.class_id = c.id OR fs.class_id IS NULL)
            LEFT JOIN fee_payments fp ON fp.student_id = s.id AND fp.fee_structure_id = fs.id AND fp.payment_status = 'completed'
            WHERE s.school_id = $1
              AND se.status = 'active'
              AND fs.is_active = true
              AND fs.due_date < CURRENT_DATE
            GROUP BY s.id, s.first_name, s.last_name, s.admission_number, c.name, fs.id, fs.name, fs.amount, fs.due_date
            HAVING COALESCE(SUM(fp.amount_paid), 0) < fs.amount
            ORDER BY fs.due_date ASC, s.first_name ASC`,
            [schoolId]
        );

        return NextResponse.json({ defaulters });
    } catch (error: any) {
        console.error('Error fetching defaulters:', error);
        return NextResponse.json({ error: 'Failed to fetch fee defaulters' }, { status: 500 });
    }
}
