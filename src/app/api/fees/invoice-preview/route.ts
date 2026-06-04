import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * POST /api/fees/invoice-preview — Preview invoice generation without creating anything
 * Returns: count of invoices to create, skip count, total amount, fee breakdown
 */
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { sessionId, billingMonth, classId, feeGroupId } = await request.json();

        if (!sessionId || !billingMonth) {
            return NextResponse.json({ error: 'sessionId and billingMonth are required' }, { status: 400 });
        }

        // 1. Get all students with fee group assignments
        let studentsSql = `
            SELECT DISTINCT s.id as student_id, s.first_name, s.last_name, s.admission_number,
                c.name as class_name, c.id as class_id
            FROM students s
            JOIN student_enrollments se ON se.student_id = s.id AND se.session_id = $1 AND se.status = 'active'
            JOIN class_sections cs ON se.class_section_id = cs.id
            JOIN classes c ON cs.class_id = c.id
            JOIN student_fee_groups sfg ON sfg.student_id = s.id AND sfg.session_id = $1
            WHERE s.school_id = $2
        `;
        const params: unknown[] = [sessionId, schoolId];
        let idx = 3;

        if (classId) {
            studentsSql += ` AND cs.class_id = $${idx++}`;
            params.push(classId);
        }
        if (feeGroupId) {
            studentsSql += ` AND sfg.fee_group_id = $${idx++}`;
            params.push(feeGroupId);
        }

        const students = await query<any>(studentsSql, params);

        // 2. Check which students already have an invoice for this billing month
        const existingInvoices = await query<any>(
            `SELECT student_id FROM invoices 
             WHERE session_id = $1 AND billing_month = $2 AND status != 'void' AND billing_type = 'regular'
             AND student_id = ANY($3::uuid[])`,
            [sessionId, billingMonth, students.map(s => s.student_id)]
        );
        const existingStudentIds = new Set(existingInvoices.map(i => i.student_id));

        // 3. Students without groups (enrolled but no assignment)
        const unassignedCount = await query<any>(
            `SELECT COUNT(DISTINCT s.id) as cnt
             FROM students s
             JOIN student_enrollments se ON se.student_id = s.id AND se.session_id = $1 AND se.status = 'active'
             LEFT JOIN student_fee_groups sfg ON sfg.student_id = s.id AND sfg.session_id = $1
             WHERE s.school_id = $2 AND sfg.id IS NULL`,
            [sessionId, schoolId]
        );

        // 4. Get fee breakdown for all groups assigned to these students
        const studentIds = students.filter(s => !existingStudentIds.has(s.student_id)).map(s => s.student_id);
        
        let feeBreakdown: any[] = [];
        let totalAmount = 0;

        if (studentIds.length > 0) {
            // Get all group assignments for eligible students
            const assignments = await query<any>(
                `SELECT sfg.student_id, fgh.fee_head_id, fh.name as head_name, 
                        fgh.amount, fgh.frequency, fg.name as group_name
                 FROM student_fee_groups sfg
                 JOIN fee_group_heads fgh ON fgh.fee_group_id = sfg.fee_group_id
                 JOIN fee_heads fh ON fh.id = fgh.fee_head_id
                 JOIN fee_groups fg ON fg.id = sfg.fee_group_id
                 WHERE sfg.student_id = ANY($1::uuid[]) AND sfg.session_id = $2`,
                [studentIds, sessionId]
            );

            // Determine which month number in the session this billing month is
            const billingDate = new Date(billingMonth + '-01');
            const monthNum = billingDate.getMonth() + 1; // 1-12

            // Check frequency eligibility
            const isQuarterMonth = [4, 7, 10, 1].includes(monthNum); // Apr, Jul, Oct, Jan
            const isHalfYearMonth = [4, 10].includes(monthNum); // Apr, Oct
            const isYearMonth = monthNum === 4; // April only

            // Check which one-time fees have already been billed
            const existingOneTime = await query<any>(
                `SELECT DISTINCT ii.fee_head_id, inv.student_id
                 FROM invoice_items ii
                 JOIN invoices inv ON inv.id = ii.invoice_id
                 WHERE inv.session_id = $1 AND inv.status != 'void'
                   AND inv.student_id = ANY($2::uuid[])
                   AND ii.fee_head_id IS NOT NULL`,
                [sessionId, studentIds]
            );
            const billedOneTimeSet = new Set(existingOneTime.map(e => `${e.student_id}__${e.fee_head_id}`));

            // Group by fee head for breakdown
            const headMap = new Map<string, { name: string; frequency: string; studentCount: number; perStudent: number; total: number; included: boolean; reason?: string }>();

            for (const a of assignments) {
                const amt = parseFloat(a.amount || '0');
                const freq = a.frequency || 'monthly';
                const key = `${a.fee_head_id}__${freq}`;

                // Check if this frequency applies this month
                let included = true;
                let reason = '';
                if (freq === 'quarterly' && !isQuarterMonth) { included = false; reason = 'Not a quarter month'; }
                if (freq === 'half_yearly' && !isHalfYearMonth) { included = false; reason = 'Not a half-year month'; }
                if (freq === 'yearly' && !isYearMonth) { included = false; reason = 'Not the yearly billing month'; }
                if (freq === 'one_time' && billedOneTimeSet.has(`${a.student_id}__${a.fee_head_id}`)) {
                    included = false; reason = 'Already billed (one-time)';
                }

                if (!headMap.has(key)) {
                    headMap.set(key, { name: a.head_name, frequency: freq, studentCount: 0, perStudent: amt, total: 0, included, reason });
                }
                const entry = headMap.get(key)!;
                if (included) {
                    entry.studentCount++;
                    entry.total += amt;
                    totalAmount += amt;
                }
            }

            feeBreakdown = Array.from(headMap.values());
        }

        return NextResponse.json({
            preview: {
                willCreate: studentIds.length,
                willSkip: existingStudentIds.size,
                unassigned: parseInt(unassignedCount[0]?.cnt || '0'),
                totalAmount,
                feeBreakdown,
                billingMonth,
                totalStudentsInScope: students.length
            }
        });
    } catch (error: any) {
        console.error('Invoice preview error:', error);
        return NextResponse.json({ error: 'Failed to generate preview' }, { status: 500 });
    }
}
