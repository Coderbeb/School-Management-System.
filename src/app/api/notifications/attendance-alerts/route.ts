import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';
import { sendNotification } from '@/lib/notifications';

/**
 * POST /api/notifications/attendance-alerts
 * Sends attendance alerts for students below 60% for a given month.
 * Body: { month (YYYY-MM), sessionId? }
 */
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School context required' }, { status: 400 });
    }

    try {
        const body = await request.json();
        // Default to previous month if not specified
        const now = new Date();
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const month = body.month || `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

        const [year, monthNum] = month.split('-').map(Number);
        const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
        const lastDay = new Date(year, monthNum, 0).getDate();
        const endDate = `${year}-${String(monthNum).padStart(2, '0')}-${lastDay}`;

        const monthName = new Date(year, monthNum - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

        // Get all active students with their attendance in the date range
        const students = await query<any>(
            `SELECT 
                s.id as student_id,
                s.first_name || ' ' || s.last_name as student_name,
                s.guardian_phone, s.guardian_email,
                COUNT(ar.id) as total_records,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present_count,
                COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent_count
            FROM students s
            JOIN student_enrollments se ON s.id = se.student_id AND se.status = 'active'
            LEFT JOIN attendance_records ar 
                ON ar.student_id = s.id 
                AND ar.date >= $2 AND ar.date <= $3
            WHERE s.school_id = $1
            GROUP BY s.id, s.first_name, s.last_name, s.guardian_phone, s.guardian_email
            HAVING COUNT(ar.id) > 0`,
            [schoolId, startDate, endDate]
        );

        const lowAttendance = students.filter((s: any) => {
            const total = parseInt(s.total_records || '0');
            const present = parseInt(s.present_count || '0');
            if (total === 0) return false;
            return (present / total) * 100 < 60;
        });

        let sentCount = 0;
        let failCount = 0;
        const alerts: any[] = [];

        for (const student of lowAttendance) {
            const total = parseInt(student.total_records || '0');
            const present = parseInt(student.present_count || '0');
            const absent = parseInt(student.absent_count || '0');
            const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : '0';

            alerts.push({
                studentId: student.student_id,
                studentName: student.student_name,
                percentage,
                present,
                absent,
                total,
            });

            try {
                await sendNotification({
                    schoolId,
                    studentId: student.student_id,
                    event: 'low_attendance',
                    variables: {
                        studentName: student.student_name,
                        month: monthName,
                        percentage,
                        presentDays: present.toString(),
                        totalDays: total.toString(),
                        absentDays: absent.toString(),
                    },
                });
                sentCount++;
            } catch {
                failCount++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Attendance alerts sent to ${sentCount} parents`,
            month: monthName,
            totalStudents: students.length,
            lowAttendanceCount: lowAttendance.length,
            sent: sentCount,
            failed: failCount,
            alerts,
        });
    } catch (error: any) {
        console.error('[attendance-alerts] Error:', error);
        return NextResponse.json({ error: 'Failed to send attendance alerts' }, { status: 500 });
    }
}
