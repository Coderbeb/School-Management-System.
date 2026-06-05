import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';
import { sendNotification } from '@/lib/notifications';

/**
 * POST /api/notifications/fee-reminders
 * Sends fee overdue reminders to parents of students with unpaid/overdue invoices.
 */
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School context required' }, { status: 400 });
    }

    try {
        // Get all overdue invoices grouped by student
        const defaulters = await query<any>(
            `SELECT 
                s.id as student_id,
                s.first_name || ' ' || s.last_name as student_name,
                s.guardian_phone, s.guardian_email,
                SUM(inv.total_amount - inv.paid_amount) as total_due,
                MIN(inv.due_date) as earliest_due_date,
                MAX(CURRENT_DATE - inv.due_date::date) as max_overdue_days,
                COUNT(inv.id) as overdue_invoices
            FROM students s
            JOIN student_enrollments se ON s.id = se.student_id AND se.status = 'active'
            JOIN invoices inv ON inv.student_id = s.id AND inv.session_id = se.session_id
            WHERE s.school_id = $1
              AND inv.status IN ('unpaid', 'partially_paid', 'overdue')
              AND inv.due_date < CURRENT_DATE
            GROUP BY s.id, s.first_name, s.last_name, s.guardian_phone, s.guardian_email
            ORDER BY total_due DESC`,
            [schoolId]
        );

        let sentCount = 0;
        let failCount = 0;
        const reminders: any[] = [];

        for (const defaulter of defaulters) {
            const totalDue = parseFloat(defaulter.total_due || '0');
            const overdueDays = parseInt(defaulter.max_overdue_days || '0');
            const dueDate = new Date(defaulter.earliest_due_date).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric'
            });

            reminders.push({
                studentId: defaulter.student_id,
                studentName: defaulter.student_name,
                totalDue: totalDue.toFixed(2),
                overdueDays,
                overdueInvoices: parseInt(defaulter.overdue_invoices || '0'),
            });

            try {
                await sendNotification({
                    schoolId,
                    studentId: defaulter.student_id,
                    event: 'fee_overdue',
                    variables: {
                        studentName: defaulter.student_name,
                        amount: totalDue.toFixed(2),
                        dueDate,
                        overdueDays: overdueDays.toString(),
                    },
                });
                sentCount++;
            } catch {
                failCount++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Fee reminders sent to ${sentCount} parents`,
            totalDefaulters: defaulters.length,
            sent: sentCount,
            failed: failCount,
            totalOverdueAmount: defaulters.reduce((s: number, d: any) => s + parseFloat(d.total_due || '0'), 0).toFixed(2),
            reminders,
        });
    } catch (error: any) {
        console.error('[fee-reminders] Error:', error);
        return NextResponse.json({ error: 'Failed to send fee reminders' }, { status: 500 });
    }
}
