import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET: Fetch marks data for a given exam + class + subject (for the entry grid)
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { searchParams } = new URL(request.url);
        const examId = searchParams.get('examId');
        const classSectionId = searchParams.get('classSectionId');
        const subjectId = searchParams.get('subjectId');

        if (!examId || !classSectionId || !subjectId) {
            return NextResponse.json(
                { error: 'examId, classSectionId, and subjectId are required' },
                { status: 400 }
            );
        }

        // Get the current session (school-scoped)
        let sessionSql = `SELECT id FROM academic_sessions WHERE is_current = true`;
        const sessionParams: unknown[] = [];
        if (schoolId) {
            sessionSql += ` AND school_id = $1`;
            sessionParams.push(schoolId);
        }
        sessionSql += ` LIMIT 1`;
        const session = await queryOne<{ id: string }>(sessionSql, sessionParams);
        if (!session) {
            return NextResponse.json({ error: 'No active academic session' }, { status: 400 });
        }

        // Get class_id from class_section
        const classSection = await queryOne<any>(
            `SELECT cs.class_id, c.name as class_name, sec.name as section_name
             FROM class_sections cs
             JOIN classes c ON cs.class_id = c.id
             JOIN sections sec ON cs.section_id = sec.id
             WHERE cs.id = $1`,
            [classSectionId]
        );

        if (!classSection) {
            return NextResponse.json({ error: 'Class section not found' }, { status: 404 });
        }

        // Get exam_subject config
        const examSubject = await queryOne<any>(
            `SELECT es.*, s.name as subject_name, s.code as subject_code
             FROM exam_subjects es
             JOIN subjects s ON es.subject_id = s.id
             WHERE es.exam_id = $1 AND es.subject_id = $2 AND es.class_id = $3`,
            [examId, subjectId, classSection.class_id]
        );

        if (!examSubject) {
            return NextResponse.json({ error: 'This subject is not configured for this exam' }, { status: 404 });
        }

        // Get components for this exam-subject
        const components = await query<any>(
            `SELECT esc.*, mc.name as component_name, mc.short_name
             FROM exam_subject_components esc
             JOIN mark_components mc ON esc.component_id = mc.id
             WHERE esc.exam_subject_id = $1
             ORDER BY esc.display_order ASC`,
            [examSubject.id]
        );

        // Get all enrolled students in this class-section
        const students = await query<any>(
            `SELECT 
                st.id as student_id,
                st.first_name || ' ' || st.last_name as student_name,
                st.admission_number,
                se.roll_number
             FROM student_enrollments se
             JOIN students st ON se.student_id = st.id
             WHERE se.class_section_id = $1 AND se.session_id = $2 AND se.status = 'active'
             ORDER BY se.roll_number ASC, st.first_name ASC`,
            [classSectionId, session.id]
        );

        // Get existing marks for each student
        const existingMarks = await query<any>(
            `SELECT mr.* 
             FROM marks_records mr
             WHERE mr.exam_subject_id = $1`,
            [examSubject.id]
        );

        // Build marks map: student_id -> { component_id: marks_record }
        const marksMap: Record<string, Record<string, { marks_obtained: number | null; status: string; remarks: string | null }>> = {};
        for (const mark of existingMarks) {
            if (!marksMap[mark.student_id]) marksMap[mark.student_id] = {};
            const key = mark.component_id || 'total';
            marksMap[mark.student_id][key] = {
                marks_obtained: mark.marks_obtained,
                status: mark.status,
                remarks: mark.remarks,
            };
        }

        // Get submission status
        const submission = await queryOne<any>(
            `SELECT * FROM marks_submissions
             WHERE exam_id = $1 AND class_section_id = $2 AND subject_id = $3`,
            [examId, classSectionId, subjectId]
        );

        // Get exam info
        const exam = await queryOne<any>(`SELECT * FROM exams WHERE id = $1`, [examId]);

        return NextResponse.json({
            exam,
            examSubject,
            classSection,
            components,
            students,
            marksMap,
            submission: submission || null,
        });
    } catch (error) {
        console.error('Error fetching marks entry data:', error);
        return NextResponse.json({ error: 'Failed to fetch marks data' }, { status: 500 });
    }
}

// POST: Save marks (bulk upsert for a class)
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['teacher', 'super_admin', 'developer']);
    if (auth.error) return auth.error;
    const user = auth.user;

    try {
        const body = await request.json();
        const { examId, classSectionId, subjectId, marks, action = 'draft' } = body;

        if (!examId || !classSectionId || !subjectId || !marks || !Array.isArray(marks)) {
            return NextResponse.json(
                { error: 'examId, classSectionId, subjectId, and marks array are required' },
                { status: 400 }
            );
        }

        // Verify exam is open for entry
        const exam = await queryOne<any>(`SELECT * FROM exams WHERE id = $1`, [examId]);
        if (!exam) {
            return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
        }

        if (!exam.is_entry_open && user.role === 'teacher') {
            return NextResponse.json({ error: 'Marks entry is not open for this exam' }, { status: 403 });
        }

        if (exam.is_locked && user.role === 'teacher') {
            return NextResponse.json({ error: 'This exam is locked. Contact admin to unlock.' }, { status: 403 });
        }

        // Check existing submission status
        const existingSubmission = await queryOne<any>(
            `SELECT * FROM marks_submissions
             WHERE exam_id = $1 AND class_section_id = $2 AND subject_id = $3`,
            [examId, classSectionId, subjectId]
        );

        if (existingSubmission && existingSubmission.status === 'locked' && user.role === 'teacher') {
            return NextResponse.json({ error: 'Marks are locked by admin. Contact admin to unlock.' }, { status: 403 });
        }

        // Get class_id
        const classSection = await queryOne<any>(
            `SELECT class_id FROM class_sections WHERE id = $1`,
            [classSectionId]
        );

        // Get exam_subject config
        const examSubject = await queryOne<any>(
            `SELECT * FROM exam_subjects
             WHERE exam_id = $1 AND subject_id = $2 AND class_id = $3`,
            [examId, subjectId, classSection?.class_id]
        );

        if (!examSubject) {
            return NextResponse.json({ error: 'Subject not configured for this exam' }, { status: 404 });
        }

        // Upsert each mark entry
        let savedCount = 0;
        for (const entry of marks) {
            const { studentId, componentId, marksObtained, status = 'scored', remarks } = entry;

            if (!studentId) continue;

            // Validate marks against max
            if (status === 'scored' && marksObtained !== null && marksObtained !== undefined) {
                // Get max marks for this component
                if (componentId) {
                    const comp = await queryOne<any>(
                        `SELECT max_marks FROM exam_subject_components
                         WHERE exam_subject_id = $1 AND component_id = $2`,
                        [examSubject.id, componentId]
                    );
                    if (comp && parseFloat(marksObtained) > parseFloat(comp.max_marks)) {
                        continue; // Skip invalid marks silently
                    }
                }
            }

            await query(
                `INSERT INTO marks_records (student_id, exam_subject_id, component_id, marks_obtained, status, remarks, entered_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (student_id, exam_subject_id, component_id)
                 DO UPDATE SET 
                    marks_obtained = $4,
                    status = $5,
                    remarks = $6,
                    entered_by = $7,
                    updated_at = CURRENT_TIMESTAMP`,
                [
                    studentId,
                    examSubject.id,
                    componentId || null,
                    status === 'scored' ? marksObtained : null,
                    status,
                    remarks || null,
                    user.userId,
                ]
            );
            savedCount++;
        }

        // Update or create submission record
        const submissionStatus = action === 'submit' ? 'submitted' : 'draft';
        await query(
            `INSERT INTO marks_submissions (exam_id, class_section_id, subject_id, teacher_id, status, submitted_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (exam_id, class_section_id, subject_id)
             DO UPDATE SET 
                status = $5,
                submitted_at = $6,
                updated_at = CURRENT_TIMESTAMP`,
            [
                examId,
                classSectionId,
                subjectId,
                user.userId,
                submissionStatus,
                action === 'submit' ? new Date().toISOString() : null,
            ]
        );

        return NextResponse.json({
            success: true,
            savedCount,
            status: submissionStatus,
            message: action === 'submit' ? 'Marks submitted successfully' : 'Marks saved as draft',
        });
    } catch (error) {
        console.error('Error saving marks:', error);
        return NextResponse.json({ error: 'Failed to save marks' }, { status: 500 });
    }
}
