import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface TeacherDetail {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    department_id: string;
    department_name: string;
}

interface DepartmentInfo {
    id: string;
    name: string;
    code: string;
}

interface SubjectStats {
    subject_id: string;
    subject_name: string;
    subject_code: string;
    semester: number;
    department_id: string;
    department_name: string;
    total_sessions: string;
    total_students: string;
    avg_attendance: string;
}

interface MonthlyStats {
    month: string;
    sessions: string;
    avg_attendance: string;
}

// GET - Get detailed stats for a specific teacher
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id: teacherId } = await params;
        const { searchParams } = new URL(request.url);
        const filterDeptId = searchParams.get('departmentId');
        const filterSemester = searchParams.get('semester');

        // Get teacher basic info
        const teacherInfo = await query<TeacherDetail>(
            `SELECT u.id, u.first_name, u.last_name, u.email, 
                    u.department_id, d.name as department_name
             FROM users u
             LEFT JOIN departments d ON d.id = u.department_id
             WHERE u.id = $1`,
            [teacherId]
        );

        if (teacherInfo.length === 0) {
            return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
        }

        // Get all departments this teacher is associated with (primary + additional)
        const departments = await query<DepartmentInfo>(
            `SELECT DISTINCT d.id, d.name, d.code FROM (
                SELECT department_id FROM users WHERE id = $1
                UNION
                SELECT department_id FROM user_departments WHERE user_id = $1
             ) ud
             JOIN departments d ON d.id = ud.department_id
             ORDER BY d.name`,
            [teacherId]
        );

        // Get unique semesters from teacher's subjects
        const semesters = await query<{ semester: number }>(
            `SELECT DISTINCT s.semester
             FROM teacher_subjects ts
             JOIN subjects s ON s.id = ts.subject_id
             WHERE ts.teacher_id = $1
             ORDER BY s.semester`,
            [teacherId]
        );

        // Build filters for subject stats
        const subjectFilters: string[] = ['ts.teacher_id = $1'];
        const subjectParams: (string | number)[] = [teacherId];

        if (filterDeptId) {
            subjectParams.push(filterDeptId);
            subjectFilters.push(`d.id = $${subjectParams.length}`);
        }
        if (filterSemester) {
            subjectParams.push(parseInt(filterSemester));
            subjectFilters.push(`s.semester = $${subjectParams.length}`);
        }

        // Get subject-wise stats with filters
        const subjectStats = await query<SubjectStats>(
            `SELECT 
                s.id as subject_id,
                s.name as subject_name,
                s.code as subject_code,
                s.semester,
                d.id as department_id,
                d.name as department_name,
                COUNT(DISTINCT ar.date || '-' || ar.lecture_number) as total_sessions,
                COUNT(DISTINCT ar.student_id) as total_students,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as avg_attendance
             FROM teacher_subjects ts
             JOIN subjects s ON s.id = ts.subject_id
             LEFT JOIN departments d ON d.degree_type = s.degree_type
             LEFT JOIN attendance_records ar ON ar.subject_id = s.id
             WHERE ${subjectFilters.join(' AND ')}
             GROUP BY s.id, s.name, s.code, s.semester, d.id, d.name
             ORDER BY s.semester, s.name`,
            subjectParams
        );

        // Build filters for monthly stats
        const monthlyFilters: string[] = ['ts.teacher_id = $1', 'ar.date >= CURRENT_DATE - INTERVAL \'6 months\''];
        const monthlyParams: (string | number)[] = [teacherId];

        if (filterDeptId) {
            monthlyParams.push(filterDeptId);
            monthlyFilters.push(`ar.subject_id IN (SELECT id FROM subjects WHERE degree_type IN (SELECT degree_type FROM departments WHERE id = $${monthlyParams.length}))`);
        }
        if (filterSemester) {
            monthlyParams.push(parseInt(filterSemester));
            monthlyFilters.push(`ar.subject_id IN (SELECT id FROM subjects WHERE semester = $${monthlyParams.length})`);
        }

        // Get monthly stats with filters
        const monthlyStats = await query<MonthlyStats>(
            `SELECT 
                TO_CHAR(ar.date, 'YYYY-MM') as month,
                COUNT(DISTINCT ar.date || '-' || ar.lecture_number) as sessions,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as avg_attendance
             FROM attendance_records ar
             JOIN teacher_subjects ts ON ts.subject_id = ar.subject_id
             WHERE ${monthlyFilters.join(' AND ')}
             GROUP BY TO_CHAR(ar.date, 'YYYY-MM')
             ORDER BY month DESC`,
            monthlyParams
        );

        // Build filters for overall stats
        const overallFilters: string[] = ['ts.teacher_id = $1'];
        const overallParams: (string | number)[] = [teacherId];

        if (filterDeptId) {
            overallParams.push(filterDeptId);
            overallFilters.push(`ar.subject_id IN (SELECT id FROM subjects WHERE degree_type IN (SELECT degree_type FROM departments WHERE id = $${overallParams.length}))`);
        }
        if (filterSemester) {
            overallParams.push(parseInt(filterSemester));
            overallFilters.push(`ar.subject_id IN (SELECT id FROM subjects WHERE semester = $${overallParams.length})`);
        }

        // Overall summary with filters
        const overallStats = await query<{ total_sessions: string; total_students: string; present_count: string; absent_count: string; avg_attendance: string }>(
            `SELECT 
                COUNT(DISTINCT ar.date || '-' || ar.subject_id || '-' || ar.lecture_number) as total_sessions,
                COUNT(DISTINCT ar.student_id) as total_students,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present_count,
                COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent_count,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as avg_attendance
             FROM attendance_records ar
             JOIN teacher_subjects ts ON ts.subject_id = ar.subject_id
             WHERE ${overallFilters.join(' AND ')}`,
            overallParams
        );

        const teacher = teacherInfo[0];
        const overall = overallStats[0] || { total_sessions: '0', total_students: '0', present_count: '0', absent_count: '0', avg_attendance: '0' };

        return NextResponse.json({
            teacher: {
                id: teacher.id,
                name: `${teacher.first_name} ${teacher.last_name}`,
                email: teacher.email,
                department: teacher.department_name || 'N/A'
            },
            filters: {
                departments: departments.map(d => ({ id: d.id, name: d.name, code: d.code })),
                semesters: semesters.map(s => s.semester)
            },
            summary: {
                totalSessions: parseInt(overall.total_sessions) || 0,
                totalStudents: parseInt(overall.total_students) || 0,
                presentCount: parseInt(overall.present_count) || 0,
                absentCount: parseInt(overall.absent_count) || 0,
                averageAttendance: Math.round(parseFloat(overall.avg_attendance) || 0)
            },
            subjects: subjectStats.map(s => ({
                id: s.subject_id,
                name: s.subject_name,
                code: s.subject_code,
                semester: s.semester,
                department: s.department_name,
                sessions: parseInt(s.total_sessions) || 0,
                students: parseInt(s.total_students) || 0,
                attendance: Math.round(parseFloat(s.avg_attendance) || 0)
            })),
            monthlyTrend: monthlyStats.map(m => ({
                month: m.month,
                sessions: parseInt(m.sessions) || 0,
                attendance: Math.round(parseFloat(m.avg_attendance) || 0)
            }))
        });
    } catch (error) {
        console.error('Teacher detail error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
