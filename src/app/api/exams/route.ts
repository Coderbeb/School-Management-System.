import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET: List all exams (with optional session filter, scoped by school)
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);
    const user = auth.user;

    try {
        const { searchParams } = new URL(request.url);
        const sessionId = searchParams.get('sessionId');
        const includeTeacherTests = searchParams.get('includeTeacherTests');
        const onlyTeacherTests = searchParams.get('onlyTeacherTests');
        const onlyFormal = searchParams.get('onlyFormal');

        let sql = `
            SELECT 
                e.*,
                gs.name as grading_scale_name,
                s.name as session_name,
                u.first_name || ' ' || u.last_name as created_by_name,
                (SELECT COUNT(*) FROM exam_subjects es WHERE es.exam_id = e.id) as subject_count,
                (SELECT COUNT(*) FROM marks_submissions ms WHERE ms.exam_id = e.id AND ms.status = 'submitted') as submitted_count,
                (SELECT COUNT(*) FROM marks_submissions ms WHERE ms.exam_id = e.id) as total_submissions
            FROM exams e
            LEFT JOIN grading_scales gs ON e.grading_scale_id = gs.id
            LEFT JOIN academic_sessions s ON e.session_id = s.id
            LEFT JOIN users u ON e.created_by = u.id
            WHERE 1=1
        `;
        const params: unknown[] = [];
        let idx = 1;

        // School isolation
        if (schoolId) {
            sql += ` AND e.school_id = $${idx++}`;
            params.push(schoolId);
        }

        if (sessionId) {
            sql += ` AND e.session_id = $${idx++}`;
            params.push(sessionId);
        }

        // Filter teacher tests
        if (onlyTeacherTests === 'true') {
            sql += ` AND e.is_teacher_test = true`;
            // Teachers only see their own tests
            if (user.role === 'teacher') {
                sql += ` AND e.created_by = $${idx++}`;
                params.push(user.userId);
            }
        } else if (onlyFormal === 'true') {
            sql += ` AND e.is_teacher_test = false`;
        } else if (includeTeacherTests !== 'true' && user.role === 'teacher') {
            // By default, teachers see formal exams + their own tests
            sql += ` AND (e.is_teacher_test = false OR e.created_by = $${idx++})`;
            params.push(user.userId);
        }

        sql += ' ORDER BY e.display_order ASC, e.start_date DESC NULLS LAST, e.created_at DESC';

        const result = await query(sql, params);
        return NextResponse.json({ exams: result });
    } catch (error) {
        console.error('Error fetching exams:', error);
        return NextResponse.json({ error: 'Failed to fetch exams' }, { status: 500 });
    }
}

// POST: Create a new exam (admin creates formal exams, teachers can create informal tests)
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);
    const user = auth.user;

    try {
        const body = await request.json();
        const {
            name,
            examCategory = 'term_exam',
            sessionId,
            gradingScaleId,
            startDate,
            endDate,
            weightage = 100,
            description,
            generatesReportCard = true,
            isTeacherTest = false,
        } = body;

        if (!name || !sessionId) {
            return NextResponse.json(
                { error: 'Exam name and session are required' },
                { status: 400 }
            );
        }
        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        // Teachers can only create informal tests
        const teacherTest = user.role === 'teacher' ? true : isTeacherTest;
        const reportsEnabled = user.role === 'teacher' ? false : generatesReportCard;

        const result = await queryOne(
            `INSERT INTO exams (name, exam_category, session_id, grading_scale_id, start_date, end_date, weightage, description, school_id, generates_report_card, is_teacher_test, created_by, is_entry_open)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [
                name, examCategory, sessionId, gradingScaleId || null,
                startDate || null, endDate || null, weightage,
                description || null, schoolId, reportsEnabled, teacherTest,
                user.userId,
                teacherTest ? true : false, // Teacher tests are immediately open for entry
            ]
        );

        return NextResponse.json({ exam: result }, { status: 201 });
    } catch (error: unknown) {
        console.error('Error creating exam:', error);
        const msg = error instanceof Error ? error.message : 'Failed to create exam';
        if (msg.includes('unique') || msg.includes('duplicate')) {
            return NextResponse.json({ error: 'An exam with this name already exists in this session' }, { status: 409 });
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// PUT: Update an exam
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const body = await request.json();
        const { id, name, examCategory, gradingScaleId, startDate, endDate, weightage, description, isEntryOpen, isPublished, isLocked, generatesReportCard, displayOrder } = body;

        if (!id) {
            return NextResponse.json({ error: 'Exam ID is required' }, { status: 400 });
        }

        let sql = `UPDATE exams SET
                name = COALESCE($2, name),
                exam_category = COALESCE($3, exam_category),
                grading_scale_id = COALESCE($4, grading_scale_id),
                start_date = COALESCE($5, start_date),
                end_date = COALESCE($6, end_date),
                weightage = COALESCE($7, weightage),
                description = COALESCE($8, description),
                is_entry_open = COALESCE($9, is_entry_open),
                is_published = COALESCE($10, is_published),
                is_locked = COALESCE($11, is_locked),
                generates_report_card = COALESCE($12, generates_report_card),
                display_order = COALESCE($13, display_order),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`;
        const params: unknown[] = [id, name, examCategory, gradingScaleId, startDate, endDate, weightage, description, isEntryOpen, isPublished, isLocked, generatesReportCard, displayOrder];

        if (schoolId) {
            sql += ` AND school_id = $14`;
            params.push(schoolId);
        }

        sql += ` RETURNING *`;
        const result = await queryOne(sql, params);

        if (!result) {
            return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
        }

        return NextResponse.json({ exam: result });
    } catch (error) {
        console.error('Error updating exam:', error);
        return NextResponse.json({ error: 'Failed to update exam' }, { status: 500 });
    }
}

// DELETE: Delete an exam
export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Exam ID is required' }, { status: 400 });
        }

        // Check if exam has any marks entered
        const hasMarks = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM marks_records mr 
             JOIN exam_subjects es ON mr.exam_subject_id = es.id 
             WHERE es.exam_id = $1`,
            [id]
        );

        if (hasMarks && parseInt(hasMarks.count) > 0) {
            return NextResponse.json(
                { error: 'Cannot delete an exam that has marks entered. Please remove all marks first.' },
                { status: 400 }
            );
        }

        let sql = 'DELETE FROM exams WHERE id = $1';
        const params: unknown[] = [id];
        if (schoolId) {
            sql += ' AND school_id = $2';
            params.push(schoolId);
        }

        await query(sql, params);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting exam:', error);
        return NextResponse.json({ error: 'Failed to delete exam' }, { status: 500 });
    }
}
