import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface MonthlyData {
    total_days: string;
    total_lectures: string;
    present_count: string;
    absent_count: string;
    total_count: string;
}

interface DailyData {
    date: string;
    total_records: string;
    present_count: string;
    absent_count: string;
    late_count: string;
}

interface SubjectData {
    subject_id: string;
    subject_name: string;
    subject_code: string;
    semester: string;
    total_records: string;
    present_count: string;
    absent_count: string;
}

// GET - Monthly attendance summary with day-by-day breakdown
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const { role, departmentId: userDeptId, userId } = payload;

        const { searchParams } = new URL(request.url);
        const getISTMonthStr = () => {
            const now = new Date();
            const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
            return istTime.toISOString().slice(0, 7);
        };
        const month = searchParams.get('month') || getISTMonthStr();
        const departmentId = searchParams.get('departmentId');
        const semester = searchParams.get('semester');
        const [year, monthNum] = month.split('-');

        // Build role-based filter
        const filters: string[] = [];
        const params: (string | number)[] = [parseInt(year), parseInt(monthNum)];

        // Role-based restrictions
        if (role === 'hod' && userDeptId) {
            filters.push(`ar.student_id IN (
                SELECT id FROM students WHERE department_id = $${params.length + 1}
            )`);
            params.push(userDeptId);
        } else if (role === 'teacher') {
            filters.push(`ar.teacher_id = $${params.length + 1}`);
            params.push(userId);
        } else if (role === 'super_admin' && departmentId) {
            filters.push(`ar.student_id IN (
                SELECT id FROM students WHERE department_id = $${params.length + 1}
            )`);
            params.push(departmentId);
        }

        // Semester filter
        if (semester) {
            filters.push(`ar.student_id IN (
                SELECT id FROM students WHERE current_semester = $${params.length + 1}
            )`);
            params.push(parseInt(semester));
        }

        const filterClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

        // 1. Overall summary
        const summaryResult = await query<MonthlyData>(
            `SELECT 
                COUNT(DISTINCT ar.date) as total_days,
                COUNT(DISTINCT ar.date || '-' || ar.lecture_number) as total_lectures,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present_count,
                COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent_count,
                COUNT(*) as total_count
            FROM attendance_records ar
            WHERE EXTRACT(YEAR FROM ar.date) = $1 
              AND EXTRACT(MONTH FROM ar.date) = $2
              ${filterClause}`,
            params
        );

        // 2. Day-by-day breakdown
        const dailyResult = await query<DailyData>(
            `SELECT 
                ar.date::text as date,
                COUNT(*) as total_records,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present_count,
                COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent_count,
                COUNT(CASE WHEN ar.status = 'late' THEN 1 END) as late_count
            FROM attendance_records ar
            WHERE EXTRACT(YEAR FROM ar.date) = $1 
              AND EXTRACT(MONTH FROM ar.date) = $2
              ${filterClause}
            GROUP BY ar.date
            ORDER BY ar.date ASC`,
            params
        );

        // 3. Subject-wise breakdown
        const subjectResult = await query<SubjectData>(
            `SELECT 
                sub.id as subject_id,
                sub.name as subject_name,
                sub.code as subject_code,
                COALESCE(
                    (SELECT string_agg(ss.semester::text, ', ' ORDER BY ss.semester)
                     FROM subject_semesters ss WHERE ss.subject_id = sub.id),
                    ''
                ) as semester,
                COUNT(ar.id) as total_records,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present_count,
                COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent_count
            FROM attendance_records ar
            JOIN subjects sub ON sub.id = ar.subject_id
            WHERE EXTRACT(YEAR FROM ar.date) = $1 
              AND EXTRACT(MONTH FROM ar.date) = $2
              ${filterClause}
            GROUP BY sub.id, sub.name, sub.code
            ORDER BY sub.name`,
            params
        );

        // 4. Daily percentages for min/max
        const percentages = dailyResult.map(d => {
            const total = parseInt(d.total_records) || 0;
            const present = parseInt(d.present_count) || 0;
            return total > 0 ? Math.round((present / total) * 100) : 0;
        });

        const data = summaryResult[0] || {
            total_days: '0',
            total_lectures: '0',
            present_count: '0',
            absent_count: '0',
            total_count: '0'
        };

        const totalCount = parseInt(data.total_count) || 0;
        const presentCount = parseInt(data.present_count) || 0;
        const absentCount = parseInt(data.absent_count) || 0;
        const avgAttendance = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

        return NextResponse.json({
            stats: {
                month,
                totalDays: parseInt(data.total_days) || 0,
                totalSessions: parseInt(data.total_lectures) || 0,
                totalPresent: presentCount,
                totalAbsent: absentCount,
                totalRecords: totalCount,
                averageAttendance: avgAttendance,
                highestAttendance: percentages.length > 0 ? Math.max(...percentages) : 0,
                lowestAttendance: percentages.length > 0 ? Math.min(...percentages) : 0
            },
            dailyBreakdown: dailyResult.map(d => {
                const total = parseInt(d.total_records) || 0;
                const present = parseInt(d.present_count) || 0;
                return {
                    date: d.date,
                    total,
                    present,
                    absent: parseInt(d.absent_count) || 0,
                    late: parseInt(d.late_count) || 0,
                    percentage: total > 0 ? Math.round((present / total) * 100) : 0
                };
            }),
            subjectStats: subjectResult.map(s => {
                const total = parseInt(s.total_records) || 0;
                const present = parseInt(s.present_count) || 0;
                return {
                    id: s.subject_id,
                    name: s.subject_name,
                    code: s.subject_code,
                    semester: s.semester,
                    totalRecords: total,
                    present,
                    absent: parseInt(s.absent_count) || 0,
                    percentage: total > 0 ? Math.round((present / total) * 100) : 0
                };
            })
        });
    } catch (error) {
        console.error('Monthly report error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
