import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const { role, userId } = auth.user;
        const schoolId = resolveSchoolId(auth.user, request);
        const { searchParams } = new URL(request.url);

        const classSectionId = searchParams.get('classSectionId') || searchParams.get('departmentId'); // backward compatibility
        const subjectIdsParam = searchParams.get('subjectIds') || searchParams.get('subjectId');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

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
            return NextResponse.json({ students: [] });
        }

        const params: any[] = [sessionId];
        const filters: string[] = ['se.session_id = $1'];

        if (classSectionId) {
            params.push(classSectionId);
            filters.push(`se.class_section_id = $${params.length}`);
        }

        if (role === 'teacher') {
            params.push(userId);
            filters.push(`se.class_section_id IN (
                SELECT class_section_id FROM teacher_assignments WHERE teacher_id = $${params.length} AND session_id = $1
            )`);
        }

        const filterClause = filters.length > 0 ? 'WHERE ' + filters.join(' AND ') : '';

        // Secondary filters for attendance
        const attendanceFilters: string[] = ['ar.session_id = $1'];
        const attendanceParams: any[] = [sessionId];

        if (subjectIdsParam) {
            const subjectIds = subjectIdsParam.split(',').filter(Boolean);
            if (subjectIds.length > 0) {
                const placeholders = subjectIds.map(id => {
                    attendanceParams.push(id);
                    return `$${attendanceParams.length}`;
                }).join(', ');
                attendanceFilters.push(`ar.subject_id IN (${placeholders})`);
            }
        }

        if (startDate) {
            attendanceParams.push(startDate);
            attendanceFilters.push(`ar.date >= $${attendanceParams.length}`);
        }
        if (endDate) {
            attendanceParams.push(endDate);
            attendanceFilters.push(`ar.date <= $${attendanceParams.length}`);
        }

        const attClause = attendanceFilters.length > 0 ? 'AND ' + attendanceFilters.join(' AND ') : '';

        // Core student aggregations
        const queryStr = `
            SELECT 
                s.id,
                s.admission_number as "studentId",
                se.roll_number as "rollNumber",
                (s.first_name || ' ' || s.last_name) as "name",
                (c.name || ' - ' || sec.name) as "department",
                COALESCE(att.total_lectures, 0) as "totalClasses",
                COALESCE(att.attended, 0) as "attended"
            FROM student_enrollments se
            JOIN students s ON s.id = se.student_id
            JOIN class_sections cs ON cs.id = se.class_section_id
            JOIN classes c ON c.id = cs.class_id
            JOIN sections sec ON sec.id = cs.section_id
            LEFT JOIN (
                SELECT 
                    student_id,
                    COUNT(DISTINCT ar.date::text || '-' || COALESCE(ar.subject_id::text, 'general') || '-' || ar.period_number::text) as total_lectures,
                    COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.date::text || '-' || COALESCE(ar.subject_id::text, 'general') || '-' || ar.period_number::text END) as attended
                FROM attendance_records ar
                WHERE 1=1 ${attClause}
                GROUP BY student_id
            ) att ON att.student_id = se.student_id
            ${filterClause}
            ORDER BY c.name, sec.name, se.roll_number ASC
        `;

        // Select the right parameters based on query
        // Since the LEFT JOIN subquery has a separate WHERE clause, we need to pass a merged list of parameters
        // Let's resolve in-memory or build a safe parameterized query
        // A much cleaner way is to include student_enrollment joins inside the LEFT JOIN subquery!
        // Let's write the query with inlined parameter lists to avoid parameter count mismatch!

        // Safer approach: Let's do single parameter array!
        // Parameters: $1 = sessionId, $2 = classSectionId (optional), $3 = userId (optional), $4 = subjectId (optional), $5 = startDate (optional), $6 = endDate (optional)
        const safeParams: any[] = [sessionId];
        let classSectionParam = '';
        let teacherParam = '';
        let subjectParam = '';
        let dateParam = '';

        if (classSectionId) {
            safeParams.push(classSectionId);
            classSectionParam = `AND se.class_section_id = $${safeParams.length}`;
        }
        if (role === 'teacher') {
            safeParams.push(userId);
            teacherParam = `AND se.class_section_id IN (
                SELECT class_section_id FROM teacher_assignments WHERE teacher_id = $${safeParams.length} AND session_id = $1
            )`;
        }
        if (subjectIdsParam) {
            const subjectIds = subjectIdsParam.split(',').filter(Boolean);
            if (subjectIds.length > 0) {
                const placeholders = subjectIds.map(id => {
                    safeParams.push(id);
                    return `$${safeParams.length}`;
                }).join(', ');
                subjectParam = `AND ar.subject_id IN (${placeholders})`;
            }
        }
        if (startDate) {
            safeParams.push(startDate);
            dateParam += ` AND ar.date >= $${safeParams.length}`;
        }
        if (endDate) {
            safeParams.push(endDate);
            dateParam += ` AND ar.date <= $${safeParams.length}`;
        }

        const safeQuery = `
            SELECT 
                s.id,
                s.admission_number as "studentId",
                se.roll_number as "rollNumber",
                (s.first_name || ' ' || s.last_name) as "name",
                (c.name || ' - ' || sec.name) as "department",
                COUNT(DISTINCT ar.date::text || '-' || COALESCE(ar.subject_id::text, 'general') || '-' || ar.period_number::text) as "totalClasses",
                COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.date::text || '-' || COALESCE(ar.subject_id::text, 'general') || '-' || ar.period_number::text END) as "attended"
            FROM student_enrollments se
            JOIN students s ON s.id = se.student_id
            JOIN class_sections cs ON cs.id = se.class_section_id
            JOIN classes c ON c.id = cs.class_id
            JOIN sections sec ON sec.id = cs.section_id
            LEFT JOIN attendance_records ar ON ar.student_id = se.student_id AND ar.session_id = se.session_id ${subjectParam} ${dateParam}
            WHERE se.session_id = $1 ${classSectionParam} ${teacherParam}
            GROUP BY s.id, s.admission_number, se.roll_number, s.first_name, s.last_name, c.name, sec.name
            ORDER BY c.name, sec.name, se.roll_number ASC
        `;

        const studentsList = await query<any>(safeQuery, safeParams);

        const formattedStudents = studentsList.map(s => {
            const total = parseInt(s.totalClasses) || 0;
            const attended = parseInt(s.attended) || 0;
            return {
                id: s.id,
                studentId: s.studentId,
                rollNumber: s.rollNumber,
                name: s.name,
                department: s.department || 'N/A',
                semester: 1, // Default or mapped order
                totalClasses: total,
                attended: attended,
                percentage: total > 0 ? Math.round((attended / total) * 100) : 0
            };
        });

        return NextResponse.json({ students: formattedStudents });
    } catch (error) {
        console.error('Student report API error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
