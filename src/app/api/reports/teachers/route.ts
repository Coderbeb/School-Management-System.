import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface TeacherData {
    teacher_id: string;
    first_name: string;
    last_name: string;
    email: string;
    department_name: string;
    subject_names: string;
    total_sessions: string;
    avg_attendance: string;
}

// GET - Teacher-wise attendance report
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
        const departmentId = searchParams.get('departmentId');

        // Build role-based filter
        const filters: string[] = [];
        const params: string[] = [];

        if (role === 'hod' && userDeptId) {
            // HOD: filter by their department
            params.push(userDeptId);
            filters.push(`u.department_id = $${params.length}`);
        } else if (role === 'teacher') {
            // Teacher: only see their own stats
            params.push(userId);
            filters.push(`u.id = $${params.length}`);
        } else if (role === 'super_admin' && departmentId) {
            // Super admin with department filter
            params.push(departmentId);
            filters.push(`u.department_id = $${params.length}`);
        }

        const filterClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

        // Teachers are stored in users table with role = 'teacher' or 'hod'
        const teachers = await query<TeacherData>(
            `SELECT 
                u.id as teacher_id,
                u.first_name,
                u.last_name,
                u.email,
                d.name as department_name,
                COALESCE(
                    STRING_AGG(DISTINCT s.name, ', ' ORDER BY s.name),
                    ''
                ) as subject_names,
                COUNT(DISTINCT ar.date || '-' || ar.subject_id || '-' || ar.lecture_number) as total_sessions,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as avg_attendance
             FROM users u
             LEFT JOIN departments d ON d.id = u.department_id
             LEFT JOIN teacher_subjects ts ON ts.teacher_id = u.id
             LEFT JOIN subjects s ON s.id = ts.subject_id
             LEFT JOIN attendance_records ar ON ar.subject_id = ts.subject_id
             WHERE u.role IN ('teacher', 'hod') ${filterClause}
             GROUP BY u.id, u.first_name, u.last_name, u.email, d.name
             ORDER BY u.first_name ASC, u.last_name ASC`,
            params
        );

        const formattedTeachers = teachers.map(t => ({
            id: t.teacher_id,
            name: `${t.first_name} ${t.last_name}`,
            email: t.email,
            department: t.department_name || 'N/A',
            subjects: t.subject_names || '-',
            totalSessions: parseInt(t.total_sessions) || 0,
            averageAttendance: Math.round(parseFloat(t.avg_attendance) || 0)
        }));

        return NextResponse.json({ teachers: formattedTeachers });
    } catch (error) {
        console.error('Teacher report error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
