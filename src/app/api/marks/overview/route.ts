import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';

// GET: Overview of marks submission status for an exam
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const examId = searchParams.get('examId');

        if (!examId) {
            return NextResponse.json({ error: 'examId is required' }, { status: 400 });
        }

        // Get exam details
        const exam = await queryOne<any>(
            `SELECT e.*, s.name as session_name FROM exams e 
             JOIN academic_sessions s ON e.session_id = s.id WHERE e.id = $1`,
            [examId]
        );
        if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 });

        // Get all class-subject combos that should have marks
        const submissions = await query<any>(
            `SELECT 
                ms.id, ms.status, ms.submitted_at, ms.locked_at,
                cs.id as class_section_id,
                c.name as class_name, sec.name as section_name,
                sub.name as subject_name, sub.code as subject_code,
                u.first_name || ' ' || u.last_name as teacher_name,
                u.email as teacher_email,
                (SELECT COUNT(*) FROM student_enrollments se 
                 WHERE se.class_section_id = cs.id AND se.session_id = e.session_id AND se.status = 'active') as student_count,
                (SELECT COUNT(*) FROM marks_records mr 
                 JOIN exam_subjects es2 ON mr.exam_subject_id = es2.id
                 WHERE es2.exam_id = $1 AND es2.subject_id = ms.subject_id AND es2.class_id = cs.class_id) as marks_entered
             FROM marks_submissions ms
             JOIN exams e ON ms.exam_id = e.id
             JOIN class_sections cs ON ms.class_section_id = cs.id
             JOIN classes c ON cs.class_id = c.id
             JOIN sections sec ON cs.section_id = sec.id
             JOIN subjects sub ON ms.subject_id = sub.id
             JOIN users u ON ms.teacher_id = u.id
             WHERE ms.exam_id = $1
             ORDER BY c.display_order ASC, sec.name ASC, sub.name ASC`,
            [examId]
        );

        // Get configured exam-subjects (expected submissions)
        const configured = await query<any>(
            `SELECT es.*, s.name as subject_name, c.name as class_name
             FROM exam_subjects es
             JOIN subjects s ON es.subject_id = s.id
             JOIN classes c ON es.class_id = c.id
             WHERE es.exam_id = $1
             ORDER BY c.display_order ASC, s.name ASC`,
            [examId]
        );

        // Summary stats
        const totalExpected = configured.length;
        const totalSubmitted = submissions.filter((s: any) => s.status === 'submitted' || s.status === 'locked').length;
        const totalDraft = submissions.filter((s: any) => s.status === 'draft').length;
        const totalLocked = submissions.filter((s: any) => s.status === 'locked').length;

        return NextResponse.json({
            exam,
            submissions,
            configured,
            summary: { totalExpected, totalSubmitted, totalDraft, totalLocked, totalPending: totalExpected - submissions.length },
        });
    } catch (error) {
        console.error('Error fetching marks overview:', error);
        return NextResponse.json({ error: 'Failed to fetch overview' }, { status: 500 });
    }
}

// PUT: Lock/unlock a specific submission
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const user = auth.user;

    try {
        const body = await request.json();
        const { submissionId, action } = body;

        if (!submissionId || !action) {
            return NextResponse.json({ error: 'submissionId and action required' }, { status: 400 });
        }

        if (action === 'lock') {
            await query(
                `UPDATE marks_submissions SET status = 'locked', locked_at = CURRENT_TIMESTAMP, locked_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [submissionId, user.userId]
            );
        } else if (action === 'unlock') {
            await query(
                `UPDATE marks_submissions SET status = 'reopened', locked_at = NULL, locked_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [submissionId]
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating submission:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}
