import { NextRequest, NextResponse } from 'next/server';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

// GET: Staff attendance analytics for a specific teacher (or self for teachers)
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        let targetUserId = searchParams.get('userId') || auth.user.userId;

        // Teachers can only see their own analytics
        if (auth.user.role === 'teacher') {
            targetUserId = auth.user.userId;
        }

        // Get current month analytics
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Overall stats: all-time
        const overallStats = await queryOne<{
            total_days: string;
            present_days: string;
            late_days: string;
            absent_days: string;
            leave_days: string;
            half_days: string;
            avg_working_hours: string;
        }>(
            `SELECT
                COUNT(*) as total_days,
                COUNT(*) FILTER (WHERE status = 'present') as present_days,
                COUNT(*) FILTER (WHERE status = 'late') as late_days,
                COUNT(*) FILTER (WHERE status = 'absent') as absent_days,
                COUNT(*) FILTER (WHERE status = 'on_leave') as leave_days,
                COUNT(*) FILTER (WHERE status = 'half_day') as half_days,
                ROUND(AVG(
                    CASE WHEN check_out_time IS NOT NULL AND check_in_time IS NOT NULL
                    THEN EXTRACT(EPOCH FROM (check_out_time - check_in_time))/3600
                    ELSE NULL END
                )::numeric, 1) as avg_working_hours
            FROM staff_attendance
            WHERE user_id = $1 AND school_id = $2`,
            [targetUserId, schoolId]
        );

        // Current month stats
        const monthStats = await queryOne<{
            total_days: string;
            present_days: string;
            late_days: string;
            absent_days: string;
            leave_days: string;
            half_days: string;
            avg_working_hours: string;
            earliest_checkin: string;
            latest_checkin: string;
        }>(
            `SELECT
                COUNT(*) as total_days,
                COUNT(*) FILTER (WHERE status = 'present') as present_days,
                COUNT(*) FILTER (WHERE status = 'late') as late_days,
                COUNT(*) FILTER (WHERE status = 'absent') as absent_days,
                COUNT(*) FILTER (WHERE status = 'on_leave') as leave_days,
                COUNT(*) FILTER (WHERE status = 'half_day') as half_days,
                ROUND(AVG(
                    CASE WHEN check_out_time IS NOT NULL AND check_in_time IS NOT NULL
                    THEN EXTRACT(EPOCH FROM (check_out_time - check_in_time))/3600
                    ELSE NULL END
                )::numeric, 1) as avg_working_hours,
                MIN(check_in_time::time) as earliest_checkin,
                MAX(check_in_time::time) as latest_checkin
            FROM staff_attendance
            WHERE user_id = $1 AND school_id = $2
            AND TO_CHAR(date, 'YYYY-MM') = $3`,
            [targetUserId, schoolId, currentMonth]
        );

        // Monthly trend - last 6 months
        const monthlyTrend = await query<{
            month: string;
            present_days: string;
            late_days: string;
            absent_days: string;
            leave_days: string;
            half_days: string;
            total_days: string;
            avg_hours: string;
        }>(
            `SELECT
                TO_CHAR(date, 'YYYY-MM') as month,
                COUNT(*) FILTER (WHERE status = 'present') as present_days,
                COUNT(*) FILTER (WHERE status = 'late') as late_days,
                COUNT(*) FILTER (WHERE status = 'absent') as absent_days,
                COUNT(*) FILTER (WHERE status = 'on_leave') as leave_days,
                COUNT(*) FILTER (WHERE status = 'half_day') as half_days,
                COUNT(*) as total_days,
                ROUND(AVG(
                    CASE WHEN check_out_time IS NOT NULL AND check_in_time IS NOT NULL
                    THEN EXTRACT(EPOCH FROM (check_out_time - check_in_time))/3600
                    ELSE NULL END
                )::numeric, 1) as avg_hours
            FROM staff_attendance
            WHERE user_id = $1 AND school_id = $2
            AND date >= (CURRENT_DATE - INTERVAL '6 months')
            GROUP BY TO_CHAR(date, 'YYYY-MM')
            ORDER BY month ASC`,
            [targetUserId, schoolId]
        );

        // Recent records (last 10)
        const recentRecords = await query<{
            id: string;
            date: string;
            check_in_time: string;
            check_out_time: string;
            status: string;
            working_hours: string;
        }>(
            `SELECT id, date, check_in_time, check_out_time, status,
                CASE WHEN check_out_time IS NOT NULL AND check_in_time IS NOT NULL
                    THEN ROUND(EXTRACT(EPOCH FROM (check_out_time - check_in_time))/3600, 1)
                    ELSE NULL
                END as working_hours
            FROM staff_attendance
            WHERE user_id = $1 AND school_id = $2
            ORDER BY date DESC
            LIMIT 10`,
            [targetUserId, schoolId]
        );

        // Calculate punctuality score
        const totalPresentAndLate = parseInt(overallStats?.present_days || '0') + parseInt(overallStats?.late_days || '0') + parseInt(overallStats?.half_days || '0');
        const onTimeCount = parseInt(overallStats?.present_days || '0');
        const punctualityScore = totalPresentAndLate > 0 ? Math.round((onTimeCount / totalPresentAndLate) * 100) : 0;

        // Attendance rate
        const totalDays = parseInt(overallStats?.total_days || '0');
        const presentEquivalent = parseInt(overallStats?.present_days || '0') + parseInt(overallStats?.late_days || '0') + parseInt(overallStats?.half_days || '0');
        const attendanceRate = totalDays > 0 ? Math.round((presentEquivalent / totalDays) * 100) : 0;

        return NextResponse.json({
            analytics: {
                overall: {
                    totalDays: parseInt(overallStats?.total_days || '0'),
                    presentDays: parseInt(overallStats?.present_days || '0'),
                    lateDays: parseInt(overallStats?.late_days || '0'),
                    absentDays: parseInt(overallStats?.absent_days || '0'),
                    leaveDays: parseInt(overallStats?.leave_days || '0'),
                    halfDays: parseInt(overallStats?.half_days || '0'),
                    avgWorkingHours: parseFloat(overallStats?.avg_working_hours || '0'),
                    punctualityScore,
                    attendanceRate,
                },
                currentMonth: {
                    totalDays: parseInt(monthStats?.total_days || '0'),
                    presentDays: parseInt(monthStats?.present_days || '0'),
                    lateDays: parseInt(monthStats?.late_days || '0'),
                    absentDays: parseInt(monthStats?.absent_days || '0'),
                    leaveDays: parseInt(monthStats?.leave_days || '0'),
                    halfDays: parseInt(monthStats?.half_days || '0'),
                    avgWorkingHours: parseFloat(monthStats?.avg_working_hours || '0'),
                    earliestCheckIn: monthStats?.earliest_checkin || null,
                    latestCheckIn: monthStats?.latest_checkin || null,
                },
                monthlyTrend: monthlyTrend.map(m => ({
                    month: m.month,
                    present: parseInt(m.present_days),
                    late: parseInt(m.late_days),
                    absent: parseInt(m.absent_days),
                    leave: parseInt(m.leave_days),
                    halfDay: parseInt(m.half_days),
                    total: parseInt(m.total_days),
                    avgHours: parseFloat(m.avg_hours || '0'),
                })),
                recentRecords,
            }
        });
    } catch (error) {
        console.error('GET staff-attendance/reports/analytics error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
