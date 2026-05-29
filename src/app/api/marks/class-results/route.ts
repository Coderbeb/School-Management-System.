import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET: Compute class results, rankings, and subject statistics
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { searchParams } = new URL(request.url);
        const examId = searchParams.get('examId');
        const classSectionId = searchParams.get('classSectionId');

        if (!examId || !classSectionId) {
            return NextResponse.json({ error: 'examId and classSectionId are required' }, { status: 400 });
        }

        // Get the class_id from class_sections
        const csInfo = await query<any>(
            `SELECT cs.class_id, c.name as class_name, s.name as section_name
             FROM class_sections cs
             JOIN classes c ON cs.class_id = c.id
             JOIN sections s ON cs.section_id = s.id
             WHERE cs.id = $1`,
            [classSectionId]
        );

        if (csInfo.length === 0) {
            return NextResponse.json({ error: 'Class section not found' }, { status: 404 });
        }

        const classId = csInfo[0].class_id;

        // Get current session
        let sessionParams: unknown[] = [];
        let sessionSql = `SELECT id FROM academic_sessions WHERE is_current = true`;
        if (schoolId) { sessionSql += ` AND school_id = $1`; sessionParams.push(schoolId); }
        sessionSql += ` LIMIT 1`;
        const sessions = await query<{ id: string }>(sessionSql, sessionParams);
        if (sessions.length === 0) {
            return NextResponse.json({ error: 'No active session' }, { status: 400 });
        }
        const sessionId = sessions[0].id;

        // Get enrolled students
        const students = await query<any>(
            `SELECT st.id as student_id, st.first_name || ' ' || st.last_name as student_name, se.roll_number
             FROM student_enrollments se
             JOIN students st ON se.student_id = st.id
             WHERE se.class_section_id = $1 AND se.session_id = $2 AND se.status = 'active'
             ORDER BY se.roll_number ASC, st.first_name ASC`,
            [classSectionId, sessionId]
        );

        if (students.length === 0) {
            return NextResponse.json({ studentResults: [], subjectStats: [], summary: null });
        }

        // Get exam subjects for this class
        const examSubjects = await query<any>(
            `SELECT es.id as exam_subject_id, es.subject_id, es.total_max_marks, es.passing_marks,
                    sub.name as subject_name, sub.code as subject_code
             FROM exam_subjects es
             JOIN subjects sub ON es.subject_id = sub.id
             WHERE es.exam_id = $1 AND es.class_id = $2
             ORDER BY sub.name ASC`,
            [examId, classId]
        );

        if (examSubjects.length === 0) {
            return NextResponse.json({ studentResults: [], subjectStats: [], summary: null });
        }

        // Get grading scale for this exam
        const exam = await query<any>(`SELECT grading_scale_id FROM exams WHERE id = $1`, [examId]);
        let gradeDefs: any[] = [];
        const scaleId = exam[0]?.grading_scale_id;
        if (scaleId) {
            gradeDefs = await query<any>(
                `SELECT * FROM grade_definitions WHERE grading_scale_id = $1 ORDER BY min_percentage DESC`,
                [scaleId]
            );
        } else {
            // Use default grading scale
            gradeDefs = await query<any>(
                `SELECT gd.* FROM grade_definitions gd 
                 JOIN grading_scales gs ON gd.grading_scale_id = gs.id
                 WHERE gs.is_default = true
                 ORDER BY gd.min_percentage DESC`
            );
        }

        // Get all marks records for this exam's subjects
        const studentIds = students.map((s: any) => s.student_id);
        const examSubjectIds = examSubjects.map((es: any) => es.exam_subject_id);

        const marks = await query<any>(
            `SELECT student_id, exam_subject_id, marks_obtained, status
             FROM marks_records
             WHERE exam_subject_id = ANY($1) AND student_id = ANY($2)`,
            [examSubjectIds, studentIds]
        );

        // Build marks lookup: student_id -> { exam_subject_id -> { marks, status } }
        const marksLookup: Record<string, Record<string, { marks: number; status: string }>> = {};
        for (const m of marks) {
            if (!marksLookup[m.student_id]) marksLookup[m.student_id] = {};
            if (!marksLookup[m.student_id][m.exam_subject_id]) {
                marksLookup[m.student_id][m.exam_subject_id] = { marks: 0, status: m.status };
            }
            marksLookup[m.student_id][m.exam_subject_id].marks += parseFloat(m.marks_obtained || '0');
        }

        // Compute grade for a percentage
        const getGrade = (pct: number): string => {
            for (const gd of gradeDefs) {
                if (pct >= gd.min_percentage && pct <= gd.max_percentage) return gd.grade_name;
            }
            return '-';
        };

        // Calculate student results
        const studentResults: any[] = [];
        for (const student of students) {
            let totalObtained = 0;
            let totalMax = 0;
            let subjectsPassed = 0;
            let subjectsFailed = 0;

            for (const es of examSubjects) {
                const record = marksLookup[student.student_id]?.[es.exam_subject_id];
                const obtained = record?.marks || 0;
                const maxMarks = parseFloat(es.total_max_marks);
                const passingMarks = parseFloat(es.passing_marks);

                totalObtained += obtained;
                totalMax += maxMarks;

                if (record?.status === 'absent') {
                    subjectsFailed++;
                } else if (obtained >= passingMarks) {
                    subjectsPassed++;
                } else {
                    subjectsFailed++;
                }
            }

            const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100 * 100) / 100 : 0;
            let result = 'PASS';
            if (subjectsFailed > 2) result = 'FAIL';
            else if (subjectsFailed > 0) result = 'COMPARTMENT';

            studentResults.push({
                student_id: student.student_id,
                student_name: student.student_name,
                roll_number: student.roll_number,
                total_obtained: totalObtained,
                total_max: totalMax,
                percentage,
                grade: getGrade(percentage),
                subjects_passed: subjectsPassed,
                subjects_failed: subjectsFailed,
                total_subjects: examSubjects.length,
                result,
                rank: 0,
            });
        }

        // Sort by percentage DESC and assign ranks
        studentResults.sort((a, b) => b.percentage - a.percentage);
        let currentRank = 1;
        for (let i = 0; i < studentResults.length; i++) {
            if (i > 0 && studentResults[i].percentage < studentResults[i - 1].percentage) {
                currentRank = i + 1;
            }
            studentResults[i].rank = currentRank;
        }

        // Subject statistics
        const subjectStats: any[] = [];
        for (const es of examSubjects) {
            const subjectMarks: number[] = [];
            let passCount = 0;
            let failCount = 0;

            for (const student of students) {
                const record = marksLookup[student.student_id]?.[es.exam_subject_id];
                const obtained = record?.marks || 0;
                subjectMarks.push(obtained);
                if (obtained >= parseFloat(es.passing_marks)) passCount++;
                else failCount++;
            }

            const highest = subjectMarks.length > 0 ? Math.max(...subjectMarks) : 0;
            const lowest = subjectMarks.length > 0 ? Math.min(...subjectMarks) : 0;
            const average = subjectMarks.length > 0 ? Math.round(subjectMarks.reduce((a, b) => a + b, 0) / subjectMarks.length * 100) / 100 : 0;

            subjectStats.push({
                subject_name: es.subject_name,
                subject_code: es.subject_code,
                max_marks: parseFloat(es.total_max_marks),
                highest, lowest, average,
                pass_count: passCount, fail_count: failCount,
                total_students: students.length,
            });
        }

        // Class summary
        const totalPassed = studentResults.filter(s => s.result === 'PASS').length;
        const totalFailed = studentResults.filter(s => s.result === 'FAIL').length;
        const totalCompartment = studentResults.filter(s => s.result === 'COMPARTMENT').length;
        const classAverage = studentResults.length > 0 ? Math.round(studentResults.reduce((a, s) => a + s.percentage, 0) / studentResults.length * 100) / 100 : 0;
        const highestPct = studentResults.length > 0 ? Math.max(...studentResults.map(s => s.percentage)) : 0;
        const lowestPct = studentResults.length > 0 ? Math.min(...studentResults.map(s => s.percentage)) : 0;

        const summary = {
            totalStudents: students.length,
            totalPassed, totalFailed, totalCompartment,
            passPercentage: students.length > 0 ? Math.round((totalPassed / students.length) * 100) : 0,
            classAverage, highestPercentage: highestPct, lowestPercentage: lowestPct,
        };

        return NextResponse.json({ studentResults, subjectStats, summary });
    } catch (error) {
        console.error('Error computing class results:', error);
        return NextResponse.json({ error: 'Failed to compute results' }, { status: 500 });
    }
}
