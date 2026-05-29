import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const { role, userId } = auth.user;  
        const schoolId = resolveSchoolId(auth.user, request);

        // Resolve active session
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
            return NextResponse.json({ teachers: [] });
        }

        const filters: string[] = ["u.role = 'teacher'"];
        const params: any[] = [sessionId];

        if (role === 'teacher') {
            params.push(userId);
            filters.push(`u.id = $${params.length}`);
        }

        const filterClause = filters.length > 0 ? 'WHERE ' + filters.join(' AND ') : '';

        // Query teacher aggregate stats
        const teachersList = await query<any>(
            `SELECT 
                u.id as teacher_id,
                u.first_name,
                u.last_name,
                u.email,
                COALESCE(
                    STRING_AGG(DISTINCT s.name, ', ' ORDER BY s.name),
                    '-'
                ) as subject_names,
                COUNT(DISTINCT ar.class_section_id || '-' || ar.date || '-' || COALESCE(ar.subject_id::text, 'general') || '-' || ar.period_number) as total_sessions,
                COUNT(DISTINCT ar.date) as working_days,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as avg_attendance
             FROM users u
             LEFT JOIN teacher_assignments ta ON ta.teacher_id = u.id AND ta.session_id = $1
             LEFT JOIN subjects s ON s.id = ta.subject_id
             LEFT JOIN attendance_records ar ON ar.teacher_id = u.id AND ar.session_id = $1
             ${filterClause}
             GROUP BY u.id, u.first_name, u.last_name, u.email
             ORDER BY u.first_name ASC, u.last_name ASC`,
            params
        );

        const formattedTeachers = teachersList.map((t: any) => ({
            id: t.teacher_id,
            name: `${t.first_name} ${t.last_name}`,
            email: t.email,
            department: 'Faculty of Academics',
            subjects: t.subject_names || '-',
            totalSessions: parseInt(t.total_sessions) || 0,
            workingDays: parseInt(t.working_days) || 0,
            averageAttendance: Math.round(parseFloat(t.avg_attendance) || 0)
        }));

        return NextResponse.json({ teachers: formattedTeachers });
    } catch (error) {
        console.error('Teacher report API error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
