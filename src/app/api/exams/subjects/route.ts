import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';

// GET: List exam-subject configurations for a given exam (and optionally class)
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request);
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const examId = searchParams.get('examId');
        const classId = searchParams.get('classId');

        if (!examId) {
            return NextResponse.json({ error: 'examId is required' }, { status: 400 });
        }

        let sql = `
            SELECT 
                es.*,
                s.name as subject_name,
                s.code as subject_code,
                c.name as class_name
            FROM exam_subjects es
            JOIN subjects s ON es.subject_id = s.id
            JOIN classes c ON es.class_id = c.id
            WHERE es.exam_id = $1
        `;
        const params: string[] = [examId];

        if (classId) {
            params.push(classId);
            sql += ` AND es.class_id = $${params.length}`;
        }

        sql += ' ORDER BY c.display_order ASC, s.name ASC';

        const result = await query<any>(sql, params);

        // Fetch components for each exam-subject
        const examSubjects = await Promise.all(
            result.map(async (es: any) => {
                const components = await query<any>(
                    `SELECT esc.*, mc.name as component_name, mc.short_name
                     FROM exam_subject_components esc
                     JOIN mark_components mc ON esc.component_id = mc.id
                     WHERE esc.exam_subject_id = $1
                     ORDER BY esc.display_order ASC`,
                    [es.id]
                );
                return { ...es, components };
            })
        );

        return NextResponse.json({ examSubjects });
    } catch (error) {
        console.error('Error fetching exam subjects:', error);
        return NextResponse.json({ error: 'Failed to fetch exam subjects' }, { status: 500 });
    }
}

// POST: Configure subjects for an exam (bulk setup)
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    try {
        const body = await request.json();
        const { examId, classId, subjects } = body;

        if (!examId || !classId || !subjects || !Array.isArray(subjects)) {
            return NextResponse.json(
                { error: 'examId, classId, and subjects array are required' },
                { status: 400 }
            );
        }

        const results = [];

        for (const subjectConfig of subjects) {
            const { subjectId, totalMaxMarks = 100, passingMarks = 33, components = [] } = subjectConfig;

            if (!subjectId) continue;

            // Upsert exam_subject
            const examSubject = await queryOne<any>(
                `INSERT INTO exam_subjects (exam_id, subject_id, class_id, total_max_marks, passing_marks)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (exam_id, subject_id, class_id)
                 DO UPDATE SET total_max_marks = $4, passing_marks = $5
                 RETURNING *`,
                [examId, subjectId, classId, totalMaxMarks, passingMarks]
            );

            if (examSubject && components.length > 0) {
                // Clear existing components
                await query(`DELETE FROM exam_subject_components WHERE exam_subject_id = $1`, [examSubject.id]);

                // Insert new components
                for (const comp of components) {
                    await query(
                        `INSERT INTO exam_subject_components (exam_subject_id, component_id, max_marks, display_order)
                         VALUES ($1, $2, $3, $4)`,
                        [examSubject.id, comp.componentId, comp.maxMarks, comp.displayOrder || 0]
                    );
                }
            }

            results.push(examSubject);
        }

        return NextResponse.json({ examSubjects: results }, { status: 201 });
    } catch (error) {
        console.error('Error configuring exam subjects:', error);
        return NextResponse.json({ error: 'Failed to configure exam subjects' }, { status: 500 });
    }
}

// DELETE: Remove a subject configuration from an exam
export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Exam subject ID is required' }, { status: 400 });
        }

        // Check for existing marks
        const hasMarks = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM marks_records WHERE exam_subject_id = $1`,
            [id]
        );

        if (hasMarks && parseInt(hasMarks.count) > 0) {
            return NextResponse.json(
                { error: 'Cannot remove a subject that has marks entered' },
                { status: 400 }
            );
        }

        await query('DELETE FROM exam_subjects WHERE id = $1', [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting exam subject:', error);
        return NextResponse.json({ error: 'Failed to delete exam subject' }, { status: 500 });
    }
}
