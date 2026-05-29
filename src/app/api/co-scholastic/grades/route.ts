import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET: Load co-scholastic grades grid for a class + exam
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { searchParams } = new URL(request.url);
        const examId = searchParams.get('examId');
        const classSectionId = searchParams.get('classSectionId');

        if (!examId || !classSectionId) {
            return NextResponse.json({ error: 'examId and classSectionId are required' }, { status: 400 });
        }

        // Get current session
        let sessionSql = `SELECT id FROM academic_sessions WHERE is_current = true`;
        const sessionParams: unknown[] = [];
        if (schoolId) { sessionSql += ` AND school_id = $1`; sessionParams.push(schoolId); }
        sessionSql += ` LIMIT 1`;
        const session = await queryOne<{ id: string }>(sessionSql, sessionParams);
        if (!session) return NextResponse.json({ error: 'No active session' }, { status: 400 });

        // Get enrolled students
        const students = await query<any>(
            `SELECT st.id as student_id, st.first_name || ' ' || st.last_name as student_name, se.roll_number
             FROM student_enrollments se
             JOIN students st ON se.student_id = st.id
             WHERE se.class_section_id = $1 AND se.session_id = $2 AND se.status = 'active'
             ORDER BY se.roll_number ASC, st.first_name ASC`,
            [classSectionId, session.id]
        );

        // Get active co-scholastic areas
        const areas = await query<any>(
            `SELECT * FROM co_scholastic_areas WHERE is_active = true ORDER BY display_order ASC`
        );

        // Get existing grades
        const existingGrades = await query<any>(
            `SELECT * FROM co_scholastic_records WHERE exam_id = $1`,
            [examId]
        );

        // Build grades map: student_id -> { area_id: grade }
        const gradesMap: Record<string, Record<string, string>> = {};
        for (const record of existingGrades) {
            if (!gradesMap[record.student_id]) gradesMap[record.student_id] = {};
            gradesMap[record.student_id][record.area_id] = record.grade;
        }

        return NextResponse.json({ students, areas, gradesMap });
    } catch (error) {
        console.error('Error fetching co-scholastic grades:', error);
        return NextResponse.json({ error: 'Failed to fetch grades' }, { status: 500 });
    }
}

// POST: Save co-scholastic grades (bulk upsert)
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['teacher', 'super_admin', 'developer']);
    if (auth.error) return auth.error;
    const user = auth.user;

    try {
        const body = await request.json();
        const { examId, entries } = body;

        if (!examId || !entries || !Array.isArray(entries)) {
            return NextResponse.json({ error: 'examId and entries array are required' }, { status: 400 });
        }

        let savedCount = 0;
        for (const entry of entries) {
            const { studentId, areaId, grade } = entry;
            if (!studentId || !areaId || !grade) continue;

            await query(
                `INSERT INTO co_scholastic_records (student_id, exam_id, area_id, grade, entered_by)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (student_id, exam_id, area_id)
                 DO UPDATE SET grade = $4, entered_by = $5`,
                [studentId, examId, areaId, grade, user.userId]
            );
            savedCount++;
        }

        return NextResponse.json({ success: true, savedCount, message: `${savedCount} grades saved` });
    } catch (error) {
        console.error('Error saving co-scholastic grades:', error);
        return NextResponse.json({ error: 'Failed to save grades' }, { status: 500 });
    }
}
