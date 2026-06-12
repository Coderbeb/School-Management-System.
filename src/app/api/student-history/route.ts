import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId, schoolFilter } from '@/lib/auth';

// GET /api/student-history — Fetch student history timeline or date-based snapshots
export async function GET(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin', 'teacher']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const url = new URL(request.url);
    const studentId = url.searchParams.get('studentId');
    const date = url.searchParams.get('date');
    const classId = url.searchParams.get('classId');
    const sessionId = url.searchParams.get('sessionId');
    const eventType = url.searchParams.get('type');

    const sf = schoolFilter(schoolId, 'h', 1);
    let paramIdx = sf.nextIndex;
    const params: unknown[] = [...sf.params];
    let clauses = '';

    // 1. Single student timeline
    if (studentId) {
        clauses += ` AND h.student_id = $${paramIdx}`;
        params.push(studentId);
        paramIdx++;

        if (eventType) {
            clauses += ` AND h.event_type = $${paramIdx}`;
            params.push(eventType);
            paramIdx++;
        }

        const history = await query(
            `SELECT h.*,
                s.name as student_name, s.admission_number, s.photo_url,
                ses.name as session_name,
                u.first_name || ' ' || u.last_name as recorded_by_name
             FROM student_history h
             LEFT JOIN students s ON s.id = h.student_id
             LEFT JOIN academic_sessions ses ON ses.id = h.session_id
             LEFT JOIN users u ON u.id = h.recorded_by
             WHERE 1=1 ${sf.clause} ${clauses}
             ORDER BY h.event_date DESC, h.created_at DESC`,
            params
        );

        return NextResponse.json({ history });
    }

    // 2. Date-based snapshot: "Who was in which class on this date?"
    if (date) {
        let classClause = '';
        const snapParams: unknown[] = [schoolId, date];
        let snapIdx = 3;

        if (classId) {
            classClause = ` AND c.id = $${snapIdx}`;
            snapParams.push(classId);
            snapIdx++;
        }

        // Find students who were enrolled on or before the given date
        // by checking student_history and enrollment records
        const snapshot = await query(
            `SELECT DISTINCT ON (s.id)
                s.id as student_id,
                s.name as student_name,
                s.admission_number,
                s.guardian_name,
                s.guardian_phone,
                s.date_of_birth,
                s.gender,
                c.name as class_name,
                sec.name as section_name,
                ses.name as session_name,
                e.roll_number,
                e.status as enrollment_status,
                e.enrolled_at
             FROM students s
             JOIN student_enrollments e ON e.student_id = s.id
             JOIN class_sections cs ON cs.id = e.class_section_id
             JOIN classes c ON c.id = cs.class_id
             LEFT JOIN sections sec ON sec.id = cs.section_id
             JOIN academic_sessions ses ON ses.id = e.session_id
             WHERE s.school_id = $1
               AND e.enrolled_at::date <= $2::date
               AND (e.status = 'active' OR e.enrolled_at::date <= $2::date)
               ${classClause}
             ORDER BY s.id, e.enrolled_at DESC`,
            snapParams
        );

        return NextResponse.json({ snapshot, date });
    }

    // 3. Session-based history (all events for a session)
    if (sessionId) {
        clauses += ` AND h.session_id = $${paramIdx}`;
        params.push(sessionId);
        paramIdx++;

        if (eventType) {
            clauses += ` AND h.event_type = $${paramIdx}`;
            params.push(eventType);
            paramIdx++;
        }

        const history = await query(
            `SELECT h.*,
                s.name as student_name, s.admission_number,
                ses.name as session_name,
                u.first_name || ' ' || u.last_name as recorded_by_name
             FROM student_history h
             LEFT JOIN students s ON s.id = h.student_id
             LEFT JOIN academic_sessions ses ON ses.id = h.session_id
             LEFT JOIN users u ON u.id = h.recorded_by
             WHERE 1=1 ${sf.clause} ${clauses}
             ORDER BY h.event_date DESC, h.created_at DESC
             LIMIT 500`,
            params
        );

        return NextResponse.json({ history });
    }

    return NextResponse.json({ error: 'Provide studentId, date, or sessionId' }, { status: 400 });
}
