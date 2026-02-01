import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface MonthlyData {
    total_days: string;
    total_lectures: string;
    present_count: string;
    total_count: string;
}

// GET - Monthly attendance summary
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
        const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
        const subjectId = searchParams.get('subjectId');
        const departmentId = searchParams.get('departmentId');
        const semester = searchParams.get('semester');
        const [year, monthNum] = month.split('-');

        // Build role-based filter
        const filters: string[] = [];
        const params: (string | number)[] = [parseInt(year), parseInt(monthNum)];

        // Role-based restrictions
        if (role === 'hod' && userDeptId) {
            // HOD: filter by their department (students.department_id)
            filters.push(`ar.student_id IN (
                SELECT id FROM students WHERE department_id = $${params.length + 1}
            )`);
            params.push(userDeptId);
        } else if (role === 'teacher') {
            // Teacher: if departmentId param is provided, filter by it
            if (departmentId) {
                filters.push(`ar.student_id IN (
                    SELECT id FROM students WHERE department_id = $${params.length + 1}
                )`);
                params.push(departmentId);
            } else {
                filters.push(`ar.student_id IN (
                    SELECT ss.student_id FROM student_subjects ss
                    JOIN teacher_subjects ts ON ss.subject_id = ts.subject_id
                    WHERE ts.teacher_id = $${params.length + 1}
                )`);
                params.push(userId);
            }
        } else if (role === 'super_admin' && departmentId) {
            // Super admin with department filter (students.department_id)
            filters.push(`ar.student_id IN (
                SELECT id FROM students WHERE department_id = $${params.length + 1}
            )`);
            params.push(departmentId);
        }

        // Semester filter (applies to all roles)
        if (semester) {
            filters.push(`ar.student_id IN (
                SELECT id FROM students WHERE current_semester = $${params.length + 1}
            )`);
            params.push(parseInt(semester));
        }

        // Subject filter
        if (subjectId) {
            params.push(subjectId as unknown as number);
            filters.push(`ar.subject_id = $${params.length}`);
        }

        const filterClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

        const queryStr = `
            SELECT 
                COUNT(DISTINCT ar.date) as total_days,
                COUNT(DISTINCT ar.date || '-' || ar.lecture_number) as total_lectures,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present_count,
                COUNT(*) as total_count
            FROM attendance_records ar
            WHERE EXTRACT(YEAR FROM ar.date) = $1 
              AND EXTRACT(MONTH FROM ar.date) = $2
              ${filterClause}
        `;

        const result = await query<MonthlyData>(queryStr, params);

        // Get daily stats for min/max
        const dailyQueryStr = `
            SELECT 
                CASE WHEN COUNT(*) > 0 
                    THEN (COUNT(CASE WHEN status = 'present' THEN 1 END)::float / COUNT(*) * 100)
                    ELSE 0 
                END as attendance_pct
            FROM attendance_records ar
            WHERE EXTRACT(YEAR FROM ar.date) = $1 
              AND EXTRACT(MONTH FROM ar.date) = $2
              ${filterClause}
            GROUP BY ar.date
        `;

        const dailyStats = await query<{ attendance_pct: string }>(dailyQueryStr, params);

        const percentages = dailyStats.map(d => parseFloat(d.attendance_pct) || 0);
        const data = result[0] || {
            total_days: '0',
            total_lectures: '0',
            present_count: '0',
            total_count: '0'
        };

        const avgAttendance = parseInt(data.total_count) > 0
            ? Math.round((parseInt(data.present_count) / parseInt(data.total_count)) * 100)
            : 0;

        return NextResponse.json({
            stats: {
                month,
                totalDays: parseInt(data.total_days) || 0,
                totalSessions: parseInt(data.total_lectures) || 0,
                averageAttendance: avgAttendance,
                highestAttendance: percentages.length > 0 ? Math.round(Math.max(...percentages)) : 0,
                lowestAttendance: percentages.length > 0 ? Math.round(Math.min(...percentages)) : 0
            }
        });
    } catch (error) {
        console.error('Monthly report error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
