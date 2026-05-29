import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { id: teacherId } = await params;

        // RBAC: Teachers can only view their own detail report
        if (auth.user.role === 'teacher' && auth.user.userId !== teacherId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const filterClassSectionId = searchParams.get('classSectionId') || searchParams.get('departmentId');
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');

        // Resolve active session
        const currentSession = await queryOne<{ id: string }>(
            `SELECT id FROM academic_sessions WHERE is_current = true LIMIT 1`
        );
        const sessionId = currentSession?.id;

        if (!sessionId) {
            return NextResponse.json({ error: 'No active academic session found' }, { status: 400 });
        }

        // Get teacher basic info (with school isolation check)
        const teacherInfo = await query<any>(
            `SELECT u.id, u.first_name, u.last_name, u.email
             FROM users u
             WHERE u.id = $1 AND u.role = 'teacher' AND ($2::uuid IS NULL OR u.school_id = $2::uuid)`,
            [teacherId, schoolId]
        );

        if (teacherInfo.length === 0) {
            return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
        }

        const teacher = teacherInfo[0];

        // Get classrooms this teacher is assigned to
        const classrooms = await query<any>(
            `SELECT DISTINCT cs.id, (c.name || ' - ' || sec.name) as name, c.name as code
             FROM teacher_assignments ta
             JOIN class_sections cs ON cs.id = ta.class_section_id
             JOIN classes c ON c.id = cs.class_id
             JOIN sections sec ON sec.id = cs.section_id
             WHERE ta.teacher_id = $1 AND ta.session_id = $2
             ORDER BY name`,
            [teacherId, sessionId]
        );

        // Core filters for attendance stats
        const queryParams: any[] = [teacherId, sessionId];
        let filterClause = 'WHERE ar.teacher_id = $1 AND ar.session_id = $2';

        if (filterClassSectionId) {
            queryParams.push(filterClassSectionId);
            filterClause += ` AND ar.class_section_id = $${queryParams.length}`;
        }
        if (dateFrom) {
            queryParams.push(dateFrom);
            filterClause += ` AND ar.date >= $${queryParams.length}`;
        }
        if (dateTo) {
            queryParams.push(dateTo);
            filterClause += ` AND ar.date <= $${queryParams.length}`;
        }

        // 1. Get Subject-wise stats taught by teacher
        const subjectStats = await query<any>(
            `SELECT 
                sub.id as "subject_id",
                sub.name as "subject_name",
                sub.code as "subject_code",
                (c.name || ' - ' || sec.name) as "department_name",
                COUNT(DISTINCT ar.date || '-' || ar.class_section_id || '-' || ar.period_number) as "total_sessions",
                COUNT(DISTINCT ar.date) as "working_days",
                COUNT(DISTINCT ar.student_id) as "total_students",
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as "avg_attendance"
             FROM teacher_assignments ta
             JOIN subjects sub ON sub.id = ta.subject_id
             JOIN class_sections cs ON cs.id = ta.class_section_id
             JOIN classes c ON c.id = cs.class_id
             JOIN sections sec ON sec.id = cs.section_id
             LEFT JOIN attendance_records ar ON ar.teacher_id = ta.teacher_id AND ar.subject_id = ta.subject_id AND ar.class_section_id = ta.class_section_id AND ar.session_id = ta.session_id
             WHERE ta.teacher_id = $1 AND ta.session_id = $2
             GROUP BY sub.id, sub.name, sub.code, c.name, sec.name
             ORDER BY sub.name`,
            [teacherId, sessionId]
        );

        // 2. Day-by-day breakdown
        const dailyResult = await query<any>(
            `SELECT 
                ar.date::text as date,
                COUNT(*) as total_records,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present_count,
                COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent_count
             FROM attendance_records ar
             ${filterClause}
             GROUP BY ar.date
             ORDER BY ar.date DESC
             LIMIT 60`,
            queryParams
        );

        // 3. Monthly trends
        const monthlyStats = await query<any>(
            `SELECT 
                TO_CHAR(ar.date, 'YYYY-MM') as month,
                COUNT(DISTINCT ar.date || '-' || ar.class_section_id || '-' || ar.period_number) as sessions,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as avg_attendance
             FROM attendance_records ar
             ${filterClause}
             GROUP BY TO_CHAR(ar.date, 'YYYY-MM')
             ORDER BY month DESC`,
            queryParams
        );

        // 4. Overall Summary
        const overallStats = await queryOne<any>(
            `SELECT 
                COUNT(DISTINCT ar.date || '-' || ar.class_section_id || '-' || ar.period_number) as total_sessions,
                COUNT(DISTINCT ar.date) as working_days,
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
             ${filterClause}`,
            queryParams
        );

        const overall = overallStats || { total_sessions: '0', working_days: '0', total_students: '0', present_count: '0', absent_count: '0', avg_attendance: '0' };
        const computedTotalSessions = subjectStats.reduce((sum: number, s: any) => sum + (parseInt(s.total_sessions) || 0), 0);

        return NextResponse.json({
            teacher: {
                id: teacher.id,
                name: `${teacher.first_name} ${teacher.last_name}`,
                email: teacher.email,
                department: 'Faculty of Academics'
            },
            filters: {
                departments: classrooms.map((d: any) => ({ id: d.id, name: d.name, code: d.code, deptType: 'standard' })),
                semesters: [1]
            },
            summary: {
                totalSessions: computedTotalSessions,
                workingDays: parseInt(overall.working_days) || 0,
                totalStudents: parseInt(overall.total_students) || 0,
                presentCount: parseInt(overall.present_count) || 0,
                absentCount: parseInt(overall.absent_count) || 0,
                averageAttendance: Math.round(parseFloat(overall.avg_attendance) || 0)
            },
            subjects: subjectStats.map((s: any) => ({
                id: s.subject_id,
                name: s.subject_name,
                code: s.subject_code,
                semester: 1,
                department: s.department_name,
                sessions: parseInt(s.total_sessions) || 0,
                workingDays: parseInt(s.working_days) || 0,
                students: parseInt(s.total_students) || 0,
                attendance: Math.round(parseFloat(s.avg_attendance) || 0)
            })),
            monthlyTrend: monthlyStats.map((m: any) => ({
                month: m.month,
                sessions: parseInt(m.sessions) || 0,
                attendance: Math.round(parseFloat(m.avg_attendance) || 0)
            })),
            dailyBreakdown: dailyResult.map((d: any) => {
                const total = parseInt(d.total_records) || 0;
                const present = parseInt(d.present_count) || 0;
                return {
                    date: d.date,
                    total,
                    present,
                    absent: parseInt(d.absent_count) || 0,
                    topics: '',
                    percentage: total > 0 ? Math.round((present / total) * 100) : 0
                };
            })
        });
    } catch (error) {
        console.error('Teacher detail report API error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
