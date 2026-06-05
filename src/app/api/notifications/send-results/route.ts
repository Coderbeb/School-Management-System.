import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';
import { sendNotification } from '@/lib/notifications';

/**
 * POST /api/notifications/send-results
 * Sends exam result notifications to all students in a class/section for a given exam.
 * Body: { examId, classSectionId }
 */
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School context required' }, { status: 400 });
    }

    try {
        const { examId, classSectionId } = await request.json();

        if (!examId) {
            return NextResponse.json({ error: 'examId is required' }, { status: 400 });
        }

        // Get exam info
        const exam = await query<any>(
            `SELECT e.name as exam_name FROM exams e WHERE e.id = $1`,
            [examId]
        );
        const examName = exam[0]?.exam_name || 'Exam';

        // Build class filter
        let studentFilter = `AND se.class_section_id IS NOT NULL`;
        const params: any[] = [schoolId, examId];
        if (classSectionId) {
            studentFilter = `AND se.class_section_id = $3`;
            params.push(classSectionId);
        }

        // Get all students with their marks for this exam
        const students = await query<any>(
            `SELECT 
                s.id as student_id,
                s.first_name || ' ' || s.last_name as student_name,
                s.guardian_phone, s.guardian_email,
                (
                    SELECT COALESCE(SUM(mr.marks_obtained), 0)
                    FROM marks_records mr
                    JOIN exam_subjects es ON mr.exam_subject_id = es.id
                    WHERE mr.student_id = s.id AND es.exam_id = $2
                ) as total_marks,
                (
                    SELECT COALESCE(SUM(es.total_max_marks), 0)
                    FROM exam_subjects es
                    WHERE es.exam_id = $2 AND es.class_id = cs.class_id
                ) as max_marks
            FROM students s
            JOIN student_enrollments se ON s.id = se.student_id AND se.status = 'active'
            JOIN class_sections cs ON se.class_section_id = cs.id
            WHERE s.school_id = $1 ${studentFilter}`,
            params
        );

        let sentCount = 0;
        let failCount = 0;

        for (const student of students) {
            const maxMarks = parseFloat(student.max_marks || '0');
            if (maxMarks === 0) continue; // Skip if no subjects/marks configured for this class in this exam

            const totalMarks = parseFloat(student.total_marks || '0');
            const percentage = ((totalMarks / maxMarks) * 100).toFixed(1);

            try {
                await sendNotification({
                    schoolId,
                    studentId: student.student_id,
                    event: 'result_published',
                    variables: {
                        studentName: student.student_name,
                        examName,
                        totalMarks: totalMarks.toString(),
                        maxMarks: maxMarks.toString(),
                        percentage,
                    },
                });
                sentCount++;
            } catch {
                failCount++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Result notifications sent to ${sentCount} parents`,
            totalStudents: students.length,
            sent: sentCount,
            failed: failCount,
        });
    } catch (error: any) {
        console.error('[send-results] Error:', error);
        return NextResponse.json({ error: 'Failed to send result notifications' }, { status: 500 });
    }
}
