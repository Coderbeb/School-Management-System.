import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface CountResult {
    count: string;
}

interface AttendanceStats {
    total: string;
    present: string;
}

interface StudentAttendanceStatus {
    id: string;
    attendance_pct: string;
}

interface DepartmentStats {
    department_id: string;
    department_name: string;
    total_students: string;
    avg_attendance: string;
}

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

        const { role, departmentId, userId } = payload;

        // Build role-based filter conditions
        let studentFilter = '';
        let subjectFilter = '';
        let attendanceFilter = '';
        const studentParams: string[] = [];
        const subjectParams: string[] = [];
        const attendanceParams: string[] = [];

        if (role === 'hod' && departmentId) {
            // HOD: filter by their department
            studentFilter = `AND s.department_id = $1`;
            studentParams.push(departmentId);
            subjectFilter = `WHERE department_id = $1`;
            subjectParams.push(departmentId);
            attendanceFilter = `AND ar.student_id IN (
                SELECT id FROM students WHERE department_id = $1
            )`;
            attendanceParams.push(departmentId);
        } else if (role === 'teacher') {
            // Teacher: filter by students in their assigned subjects
            // teacher_subjects.teacher_id references users.id directly
            studentFilter = `AND s.id IN (
                SELECT ss.student_id FROM student_subjects ss
                JOIN teacher_subjects ts ON ss.subject_id = ts.subject_id
                WHERE ts.teacher_id = $1
            ) AND s.department_id IN (
                SELECT department_id FROM users WHERE id = $1
                UNION
                SELECT department_id FROM user_departments WHERE user_id = $1
            )`;
            studentParams.push(userId);

            subjectFilter = `WHERE id IN (
                SELECT ts.subject_id FROM teacher_subjects ts
                WHERE ts.teacher_id = $1
            )`;
            subjectParams.push(userId);

            attendanceFilter = `AND ar.student_id IN (
                SELECT ss.student_id FROM student_subjects ss
                JOIN teacher_subjects ts ON ss.subject_id = ts.subject_id
                WHERE ts.teacher_id = $1
            ) AND ar.teacher_id = $1`;
            attendanceParams.push(userId);
        }
        // super_admin: no filter, sees everything

        // Get total students
        let totalStudents = 0;
        try {
            const studentQuery = `SELECT COUNT(*) as count FROM students s WHERE 1=1 ${studentFilter}`;
            const studentCount = await queryOne<CountResult>(studentQuery, studentParams);
            totalStudents = parseInt(studentCount?.count || '0');
        } catch {
            // Table might not exist
        }

        // Get total subjects
        let totalSubjects = 0;
        try {
            const subjectQuery = `SELECT COUNT(*) as count FROM subjects ${subjectFilter}`;
            const subjectCount = await queryOne<CountResult>(subjectQuery, subjectParams);
            totalSubjects = parseInt(subjectCount?.count || '0');
        } catch {
            // Table might not exist
        }

        // Get total lectures (distinct date + subject + lecture_number)
        let totalLectures = 0;
        try {
            const lectureQuery = `SELECT COUNT(DISTINCT ar.date::text || ar.subject_id::text || ar.lecture_number::text) as count 
                FROM attendance_records ar WHERE 1=1 ${attendanceFilter}`;
            const lectureCount = await queryOne<CountResult>(lectureQuery, attendanceParams);
            totalLectures = parseInt(lectureCount?.count || '0');
        } catch (err) {
            console.error('Error counting lectures:', err);
        }

        // Calculate actual average attendance from attendance_records
        let averageAttendance = 0;
        try {
            const statsQuery = `SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present
                 FROM attendance_records ar WHERE 1=1 ${attendanceFilter}`;
            const stats = await queryOne<AttendanceStats>(statsQuery, attendanceParams);
            if (stats && parseInt(stats.total) > 0) {
                averageAttendance = Math.round((parseInt(stats.present) / parseInt(stats.total)) * 100);
            }
        } catch {
            // Table might not exist
        }

        // For HOD and Super Admin: Get low attendance and warning counts
        let lowAttendanceCount = 0;
        let warningAttendanceCount = 0;

        if (role === 'hod' || role === 'super_admin') {
            try {
                // Get student-wise attendance percentages
                let studentAttendanceQuery = `
                    SELECT 
                        s.id,
                        COALESCE(
                            ROUND(
                                COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                                NULLIF(COUNT(ar.id), 0),
                                1
                            ),
                            0
                        ) as attendance_pct
                    FROM students s
                    LEFT JOIN attendance_records ar ON ar.student_id = s.id
                    WHERE 1=1 ${studentFilter}
                    GROUP BY s.id
                    HAVING COUNT(ar.id) > 0
                `;
                
                const studentStats = await query<StudentAttendanceStatus>(studentAttendanceQuery, studentParams);
                
                for (const student of studentStats) {
                    const pct = parseFloat(student.attendance_pct);
                    if (pct < 60) {
                        lowAttendanceCount++;
                    } else if (pct < 75) {
                        warningAttendanceCount++;
                    }
                }
            } catch (err) {
                console.error('Error getting attendance counts:', err);
            }
        }

        // For Super Admin: Get department-wise stats
        let departmentStats: { departmentId: string; departmentName: string; totalStudents: number; avgAttendance: number }[] = [];

        if (role === 'super_admin') {
            try {
                const deptQuery = `
                    SELECT 
                        d.id as department_id,
                        d.name as department_name,
                        COUNT(DISTINCT s.id) as total_students,
                        COALESCE(
                            ROUND(
                                COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                                NULLIF(COUNT(ar.id), 0),
                                1
                            ),
                            0
                        ) as avg_attendance
                    FROM departments d
                    LEFT JOIN students s ON s.department_id = d.id
                    LEFT JOIN attendance_records ar ON ar.student_id = s.id
                    GROUP BY d.id, d.name
                    ORDER BY d.name
                `;
                
                const deptStats = await query<DepartmentStats>(deptQuery, []);
                departmentStats = deptStats.map(d => ({
                    departmentId: d.department_id,
                    departmentName: d.department_name,
                    totalStudents: parseInt(d.total_students) || 0,
                    avgAttendance: Math.round(parseFloat(d.avg_attendance) || 0)
                }));
            } catch (err) {
                console.error('Error getting department stats:', err);
            }
        }

        return NextResponse.json({
            stats: {
                totalStudents,
                totalSubjects,
                totalSessions: totalLectures,
                averageAttendance,
                // Role-specific data
                ...(role === 'hod' || role === 'super_admin' ? {
                    lowAttendanceCount,
                    warningAttendanceCount,
                } : {}),
                ...(role === 'super_admin' && departmentStats.length > 0 ? {
                    departmentStats,
                } : {}),
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
