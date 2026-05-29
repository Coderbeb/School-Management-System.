import { NextRequest, NextResponse } from 'next/server';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';

interface StaffUser {
    id: string;
    first_name: string;
    last_name: string;
    role: string;
}

interface AttendanceRecord {
    user_id: string;
    date: string;
    status: string;
    check_in_time: string | null;
    check_out_time: string | null;
    working_hours: number | null;
}

interface LeaveRecord {
    user_id: string;
    from_date: string;
    to_date: string;
}

// GET: Monthly staff attendance report
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month'); // YYYY-MM

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return NextResponse.json({ error: 'month parameter required (YYYY-MM)' }, { status: 400 });
        }

        if (!schoolId) {
            return NextResponse.json({ error: 'School context required (pass schoolId for developer)' }, { status: 400 });
        }

        // 1. Get all staff for this school
        const staff = await query<StaffUser>(
            `SELECT id, first_name, last_name, role FROM users
             WHERE school_id = $1 AND role IN ('teacher', 'accountant') AND is_active = true
             ORDER BY first_name ASC`,
            [schoolId]
        );

        // 2. Get all attendance records for this month
        const attendanceRecords = await query<AttendanceRecord>(
            `SELECT user_id, date::text as date, status, check_in_time, check_out_time,
                    CASE WHEN check_out_time IS NOT NULL AND check_in_time IS NOT NULL
                         THEN ROUND(EXTRACT(EPOCH FROM (check_out_time - check_in_time))/3600, 2)
                         ELSE NULL
                    END as working_hours
             FROM staff_attendance
             WHERE school_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2`,
            [schoolId, month]
        );

        // 3. Get all approved leave requests that overlap with this month
        const [year, mon] = month.split('-').map(Number);
        const monthStart = `${month}-01`;
        const lastDay = new Date(year, mon, 0).getDate();
        const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

        const leaveRecords = await query<LeaveRecord>(
            `SELECT user_id, from_date::text as from_date, to_date::text as to_date
             FROM leave_requests
             WHERE school_id = $1 AND status = 'approved'
               AND from_date <= $3 AND to_date >= $2`,
            [schoolId, monthStart, monthEnd]
        );

        // Build lookup maps
        // attendance: userId -> { date -> record }
        const attendanceMap: Record<string, Record<string, AttendanceRecord>> = {};
        for (const rec of attendanceRecords) {
            if (!attendanceMap[rec.user_id]) attendanceMap[rec.user_id] = {};
            attendanceMap[rec.user_id][rec.date] = rec;
        }

        // leaves: userId -> Set<date>
        const leaveMap: Record<string, Set<string>> = {};
        for (const leave of leaveRecords) {
            if (!leaveMap[leave.user_id]) leaveMap[leave.user_id] = new Set();
            const start = new Date(leave.from_date);
            const end = new Date(leave.to_date);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                // Only include dates within the requested month
                if (dateStr >= monthStart && dateStr <= monthEnd) {
                    leaveMap[leave.user_id].add(dateStr);
                }
            }
        }

        // 4. Build report for each staff member
        const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        const staffReport = staff.map(member => {
            const records: Record<string, string> = {};
            let totalPresent = 0;
            let totalLate = 0;
            let totalAbsent = 0;
            let totalLeave = 0;
            let totalHalfDay = 0;
            let totalWorkingHours = 0;
            let workingDays = 0;

            for (let day = 1; day <= lastDay; day++) {
                const dateStr = `${month}-${String(day).padStart(2, '0')}`;
                const dayOfWeek = new Date(dateStr).getDay();

                // Skip weekends (0 = Sunday, 6 = Saturday)
                if (dayOfWeek === 0 || dayOfWeek === 6) continue;

                // Skip future dates
                if (dateStr > todayIST) continue;

                workingDays++;
                const attRecord = attendanceMap[member.id]?.[dateStr];
                const isOnLeave = leaveMap[member.id]?.has(dateStr);

                if (attRecord) {
                    records[dateStr] = attRecord.status;
                    if (attRecord.working_hours) totalWorkingHours += attRecord.working_hours;

                    switch (attRecord.status) {
                        case 'present': totalPresent++; break;
                        case 'late': totalLate++; break;
                        case 'absent': totalAbsent++; break;
                        case 'on_leave': totalLeave++; break;
                        case 'half_day': totalHalfDay++; break;
                    }
                } else if (isOnLeave) {
                    records[dateStr] = 'on_leave';
                    totalLeave++;
                } else {
                    // No record and no leave on a weekday = auto-absent
                    records[dateStr] = 'absent';
                    totalAbsent++;
                }
            }

            const attendedDays = totalPresent + totalLate + totalHalfDay;
            const attendancePercentage = workingDays > 0
                ? Math.round((attendedDays / workingDays) * 100 * 100) / 100
                : 0;

            return {
                id: member.id,
                name: `${member.first_name} ${member.last_name}`,
                role: member.role,
                records,
                summary: {
                    totalPresent,
                    totalLate,
                    totalAbsent,
                    totalLeave,
                    totalHalfDay,
                    totalWorkingHours: Math.round(totalWorkingHours * 100) / 100,
                    workingDays,
                    attendancePercentage,
                },
            };
        });

        return NextResponse.json({ staff: staffReport, month });
    } catch (error) {
        console.error('GET staff-attendance reports error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
