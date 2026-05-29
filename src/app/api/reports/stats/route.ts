import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const { role, userId } = auth.user;
        const schoolId = resolveSchoolId(auth.user, request);

        // Resolve active academic session
        let sessionSql = `SELECT id FROM academic_sessions WHERE is_current = true`;
        const sessionParams: unknown[] = [];
        if (schoolId) {
            sessionSql += ` AND school_id = $1`;
            sessionParams.push(schoolId);
        }
        sessionSql += ` LIMIT 1`;
        const currentSession = await queryOne<{ id: string }>(sessionSql, sessionParams);
        const sessionId = currentSession?.id;

        if (!sessionId) {
            return NextResponse.json({
                stats: {
                    totalStudents: 0,
                    totalSubjects: 0,
                    totalSessions: 0,
                    todaySessions: 0,
                    workingDays: 0,
                    averageAttendance: 0,
                    lowAttendanceCount: 0,
                    warningAttendanceCount: 0,
                    departmentStats: []
                }
            });
        }

        // Filters based on role
        let studentFilter = 'WHERE se.session_id = $1';
        let attendanceFilter = 'WHERE ar.session_id = $1';
        const params: string[] = [sessionId];

        if (role === 'teacher') {
            studentFilter += ` AND se.class_section_id IN (
                SELECT class_section_id FROM teacher_assignments WHERE teacher_id = $2 AND session_id = $1
            )`;
            attendanceFilter += ` AND ar.class_section_id IN (
                SELECT class_section_id FROM teacher_assignments WHERE teacher_id = $2 AND session_id = $1
            )`;
            params.push(userId);
        }

        // 1. Total Students
        const studentsCount = await queryOne<{ count: string }>(
            `SELECT COUNT(DISTINCT se.student_id) as count FROM student_enrollments se ${studentFilter}`,
            params
        );
        const totalStudents = parseInt(studentsCount?.count || '0');

        // 2. Total Subjects
        let subjectSql = `SELECT COUNT(*) as count FROM subjects WHERE is_active = true`;
        const subjectParams: unknown[] = [];
        if (schoolId) {
            subjectSql += ` AND school_id = $1`;
            subjectParams.push(schoolId);
        }
        const subjectsCount = await queryOne<{ count: string }>(subjectSql, subjectParams);
        const totalSubjects = parseInt(subjectsCount?.count || '0');

        // 3. Working Days & Total Sessions
        const lectureCount = await queryOne<{ count: string; working_days: string }>(
            `SELECT 
                COUNT(DISTINCT ar.class_section_id || '-' || ar.date::text || '-' || COALESCE(ar.subject_id::text, 'general') || '-' || ar.period_number::text) as count,
                COUNT(DISTINCT ar.date) as working_days
             FROM attendance_records ar ${attendanceFilter}`,
            params
        );
        const totalSessions = parseInt(lectureCount?.count || '0');
        const workingDays = parseInt(lectureCount?.working_days || '0');

        // 4. Today's Sessions
        const todayStr = new Date().toISOString().split('T')[0];
        const todayParams = [...params, todayStr];
        const todaySessionsCount = await queryOne<{ count: string }>(
            `SELECT COUNT(DISTINCT ar.class_section_id || '-' || COALESCE(ar.subject_id::text, 'general') || '-' || ar.period_number::text) as count
             FROM attendance_records ar ${attendanceFilter} AND ar.date = $${todayParams.length}`,
            todayParams
        );
        const todaySessions = parseInt(todaySessionsCount?.count || '0');

        // 5. Average Attendance
        const stats = await queryOne<{ total: string; present: string }>(
            `SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present
             FROM attendance_records ar ${attendanceFilter}`,
            params
        );
        const averageAttendance = stats && parseInt(stats.total) > 0
            ? Math.round((parseInt(stats.present) / parseInt(stats.total)) * 100)
            : 0;

        // 6. Low (<60%) & Warning (60%-75%) Attendance counts
        let lowAttendanceCount = 0;
        let warningAttendanceCount = 0;

        const studentStats = await query<{ student_id: string; attendance_pct: string }>(
            `SELECT 
                se.student_id,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as attendance_pct
             FROM student_enrollments se
             LEFT JOIN attendance_records ar ON ar.student_id = se.student_id AND ar.session_id = se.session_id
             ${studentFilter}
             GROUP BY se.student_id
             HAVING COUNT(ar.id) > 0`,
            params
        );

        for (const s of studentStats) {
            const pct = parseFloat(s.attendance_pct);
            if (pct < 60) {
                lowAttendanceCount++;
            } else if (pct < 75) {
                warningAttendanceCount++;
            }
        }

        // 7. Classroom (Mapped as Class Stats for Department overview)
        const classStats = await query<{ class_section_id: string; class_name: string; total_students: string; avg_attendance: string }>(
            `SELECT 
                cs.id as class_section_id,
                (c.name || ' - ' || sec.name) as class_name,
                COUNT(DISTINCT se.student_id) as total_students,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as avg_attendance
             FROM class_sections cs
             JOIN classes c ON c.id = cs.class_id
             JOIN sections sec ON sec.id = cs.section_id
             LEFT JOIN student_enrollments se ON se.class_section_id = cs.id AND se.session_id = cs.session_id
             LEFT JOIN attendance_records ar ON ar.class_section_id = cs.id AND ar.session_id = cs.session_id
             WHERE cs.session_id = $1
             GROUP BY cs.id, c.name, sec.name
             ORDER BY c.name, sec.name`,
            [sessionId]
        );

        const departmentStats = classStats.map(c => ({
            departmentId: c.class_section_id,
            departmentName: c.class_name,
            totalStudents: parseInt(c.total_students) || 0,
            avgAttendance: Math.round(parseFloat(c.avg_attendance) || 0)
        }));

        return NextResponse.json({
            stats: {
                totalStudents,
                totalSubjects,
                totalSessions,
                todaySessions,
                workingDays,
                averageAttendance,
                lowAttendanceCount,
                warningAttendanceCount,
                departmentStats
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
