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

        const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
        const classSectionId = searchParams.get('classSectionId') || searchParams.get('departmentId'); // Map legacy parameter name
        const subjectId = searchParams.get('subjectId');
        const detailed = searchParams.get('detailed') === 'true';

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
            return NextResponse.json({ records: [], lecturesSummary: [], detailedRecords: [] });
        }

        const params: any[] = [date, sessionId];
        const filters: string[] = ['ar.date = $1', 'ar.session_id = $2'];

        if (classSectionId) {
            params.push(classSectionId);
            filters.push(`ar.class_section_id = $${params.length}`);
        }

        if (subjectId) {
            params.push(subjectId);
            filters.push(`ar.subject_id = $${params.length}`);
        }

        if (role === 'teacher') {
            params.push(userId);
            filters.push(`ar.class_section_id IN (
                SELECT class_section_id FROM teacher_assignments WHERE teacher_id = $${params.length} AND session_id = $2
            )`);
        }

        const filterClause = filters.length > 0 ? 'WHERE ' + filters.join(' AND ') : '';

        // Detailed Report
        if (detailed) {
            const detailedQuery = `
                SELECT 
                    ar.id,
                    ar.student_id,
                    se.roll_number as "rollNumber",
                    s.admission_number as "studentCustomId",
                    (s.first_name || ' ' || s.last_name) as "studentName",
                    (c.name || ' - ' || sec.name) as "departmentCode",
                    sub.code as "subjectCode",
                    sub.name as "subjectName",
                    ar.period_number as "lectureNumber",
                    ar.status
                FROM attendance_records ar
                JOIN students s ON s.id = ar.student_id
                JOIN student_enrollments se ON se.student_id = ar.student_id AND se.session_id = ar.session_id
                JOIN class_sections cs ON cs.id = ar.class_section_id
                JOIN classes c ON c.id = cs.class_id
                JOIN sections sec ON sec.id = cs.section_id
                LEFT JOIN subjects sub ON sub.id = ar.subject_id
                ${filterClause}
                ORDER BY c.name, sec.name, se.roll_number, ar.period_number
            `;
            const detailedRecords = await query<any>(detailedQuery, params);
            return NextResponse.json({ detailedRecords });
        }

        // Summary queries
        const summaryQuery = `
            SELECT 
                ar.date::text as date,
                COUNT(*) as total_students,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present,
                COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent,
                COUNT(CASE WHEN ar.status = 'late' THEN 1 END) as late
            FROM attendance_records ar
            ${filterClause}
            GROUP BY ar.date
            ORDER BY ar.date DESC
        `;
        const records = await query<any>(summaryQuery, params);

        const formattedRecords = records.map((r: any) => ({
            date: r.date,
            totalStudents: parseInt(r.total_students) || 0,
            present: parseInt(r.present) || 0,
            absent: parseInt(r.absent) || 0,
            late: parseInt(r.late) || 0,
            attendancePercentage: parseInt(r.total_students) > 0
                ? Math.round((parseInt(r.present) / parseInt(r.total_students)) * 100)
                : 0
        }));

        // Lectures summary
        const lecturesSummaryQuery = `
            SELECT 
                sub.id as subject_id,
                sub.code as subject_code,
                sub.name as subject_name,
                ar.period_number as lecture_number,
                (c.name || ' - ' || sec.name) as department_names,
                (t.first_name || ' ' || t.last_name) as teacher_names,
                COUNT(*) as total_students,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present,
                COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent
            FROM attendance_records ar
            JOIN class_sections cs ON cs.id = ar.class_section_id
            JOIN classes c ON c.id = cs.class_id
            JOIN sections sec ON sec.id = cs.section_id
            LEFT JOIN subjects sub ON sub.id = ar.subject_id
            LEFT JOIN users t ON t.id = ar.teacher_id
            ${filterClause}
            GROUP BY sub.id, sub.code, sub.name, ar.period_number, c.name, sec.name, t.first_name, t.last_name
            ORDER BY ar.period_number, c.name, sec.name
        `;
        const lectureRows = await query<any>(lecturesSummaryQuery, params);

        const lecturesSummary = lectureRows.map((r: any) => ({
            subjectCode: r.subject_code || 'GEN',
            subjectName: r.subject_name || 'General Presence',
            lectureNumber: r.lecture_number,
            departmentNames: r.department_names || '',
            teacherName: r.teacher_names || '',
            totalStudents: parseInt(r.total_students) || 0,
            present: parseInt(r.present) || 0,
            absent: parseInt(r.absent) || 0
        }));

        return NextResponse.json({
            records: formattedRecords,
            lecturesSummary
        });
    } catch (error) {
        console.error('Get daily report error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
