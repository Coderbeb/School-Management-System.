import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// Helper: Apply result preset rules
function computeResult(preset: string, subjectsPassed: number, subjectsFailed: number, percentage: number): string {
    switch (preset) {
        case 'strict':
            // Any subject failed = FAIL
            return subjectsFailed > 0 ? 'FAIL' : 'PASS';

        case 'grade_only':
            // No pass/fail concept — everything is graded
            return 'GRADED';

        case 'percentage_only':
            // Simple pass/fail based on percentage
            return percentage >= 33 ? 'PASS' : 'FAIL';

        case 'standard':
        default:
            // Standard Indian school pattern
            if (subjectsFailed > 2) return 'FAIL';
            if (subjectsFailed > 0) return 'COMPARTMENT';
            return 'PASS';
    }
}

// GET: Compute class results, rankings, and subject statistics
// Supports both individual exam and consolidated exam group results
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { searchParams } = new URL(request.url);
        const examId = searchParams.get('examId');
        const examGroupId = searchParams.get('examGroupId');
        const classSectionId = searchParams.get('classSectionId');

        if (!classSectionId) {
            return NextResponse.json({ error: 'classSectionId is required' }, { status: 400 });
        }

        if (!examId && !examGroupId) {
            return NextResponse.json({ error: 'examId or examGroupId is required' }, { status: 400 });
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

        // Get school's result preset
        let resultPreset = 'standard';
        if (schoolId) {
            const school = await queryOne<{ result_preset: string }>(
                `SELECT result_preset FROM schools WHERE id = $1`,
                [schoolId]
            );
            if (school?.result_preset) resultPreset = school.result_preset;
        }

        // =============================================
        // SINGLE EXAM RESULTS
        // =============================================
        if (examId) {
            return computeSingleExamResults(examId, classId, students, resultPreset, schoolId);
        }

        // =============================================
        // CONSOLIDATED EXAM GROUP RESULTS
        // =============================================
        if (examGroupId) {
            return computeGroupResults(examGroupId, classId, classSectionId, sessionId, students, resultPreset, schoolId);
        }

        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    } catch (error) {
        console.error('Error computing class results:', error);
        return NextResponse.json({ error: 'Failed to compute results' }, { status: 500 });
    }
}

// Compute results for a single exam
async function computeSingleExamResults(
    examId: string, classId: string, students: any[], resultPreset: string, schoolId: string | null
) {
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

    // Get grading scale
    const exam = await query<any>(`SELECT grading_scale_id FROM exams WHERE id = $1`, [examId]);
    let gradeDefs: any[] = [];
    const scaleId = exam[0]?.grading_scale_id;
    if (scaleId) {
        gradeDefs = await query<any>(
            `SELECT * FROM grade_definitions WHERE grading_scale_id = $1 ORDER BY min_percentage DESC`,
            [scaleId]
        );
    } else {
        gradeDefs = await query<any>(
            `SELECT gd.* FROM grade_definitions gd 
             JOIN grading_scales gs ON gd.grading_scale_id = gs.id
             WHERE gs.is_default = true
             ORDER BY gd.min_percentage DESC`
        );
    }

    // Get all marks records
    const studentIds = students.map((s: any) => s.student_id);
    const examSubjectIds = examSubjects.map((es: any) => es.exam_subject_id);

    const marks = await query<any>(
        `SELECT student_id, exam_subject_id, marks_obtained, status
         FROM marks_records
         WHERE exam_subject_id = ANY($1) AND student_id = ANY($2)`,
        [examSubjectIds, studentIds]
    );

    // Build marks lookup
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

        // Use dynamic result preset instead of hardcoded logic
        const result = computeResult(resultPreset, subjectsPassed, subjectsFailed, percentage);

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

    // Sort and assign ranks
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
    const totalGraded = studentResults.filter(s => s.result === 'GRADED').length;
    const classAverage = studentResults.length > 0 ? Math.round(studentResults.reduce((a, s) => a + s.percentage, 0) / studentResults.length * 100) / 100 : 0;
    const highestPct = studentResults.length > 0 ? Math.max(...studentResults.map(s => s.percentage)) : 0;
    const lowestPct = studentResults.length > 0 ? Math.min(...studentResults.map(s => s.percentage)) : 0;

    const summary = {
        totalStudents: students.length,
        totalPassed, totalFailed, totalCompartment, totalGraded,
        passPercentage: students.length > 0 ? Math.round((totalPassed / students.length) * 100) : 0,
        classAverage, highestPercentage: highestPct, lowestPercentage: lowestPct,
        resultPreset,
    };

    return NextResponse.json({ studentResults, subjectStats, summary, mode: 'single_exam' });
}

// Compute consolidated results across an exam group
async function computeGroupResults(
    examGroupId: string, classId: string, classSectionId: string, sessionId: string,
    students: any[], resultPreset: string, schoolId: string | null
) {
    // Get the exam group details
    const group = await queryOne<any>(
        `SELECT * FROM exam_groups WHERE id = $1`,
        [examGroupId]
    );
    if (!group) {
        return NextResponse.json({ error: 'Exam group not found' }, { status: 404 });
    }

    // Get all member exams with their weightage
    const members = await query<any>(
        `SELECT egm.weightage, e.id as exam_id, e.name as exam_name
         FROM exam_group_members egm
         JOIN exams e ON egm.exam_id = e.id
         WHERE egm.exam_group_id = $1
         ORDER BY egm.display_order ASC`,
        [examGroupId]
    );

    if (members.length === 0) {
        return NextResponse.json({ studentResults: [], subjectStats: [], summary: null, mode: 'group' });
    }

    // Get all subjects configured across ALL exams in the group (union of all subjects)
    const examIds = members.map((m: any) => m.exam_id);
    const allSubjects = await query<any>(
        `SELECT DISTINCT ON (sub.id) sub.id as subject_id, sub.name as subject_name, sub.code as subject_code,
                es.total_max_marks, es.passing_marks
         FROM exam_subjects es
         JOIN subjects sub ON es.subject_id = sub.id
         WHERE es.exam_id = ANY($1) AND es.class_id = $2
         ORDER BY sub.id, sub.name ASC`,
        [examIds, classId]
    );

    if (allSubjects.length === 0) {
        return NextResponse.json({ studentResults: [], subjectStats: [], summary: null, mode: 'group' });
    }

    // Get grading scale from first exam in group
    const firstExam = await queryOne<any>(`SELECT grading_scale_id FROM exams WHERE id = $1`, [examIds[0]]);
    let gradeDefs: any[] = [];
    const scaleId = firstExam?.grading_scale_id;
    if (scaleId) {
        gradeDefs = await query<any>(
            `SELECT * FROM grade_definitions WHERE grading_scale_id = $1 ORDER BY min_percentage DESC`,
            [scaleId]
        );
    } else {
        gradeDefs = await query<any>(
            `SELECT gd.* FROM grade_definitions gd 
             JOIN grading_scales gs ON gd.grading_scale_id = gs.id
             WHERE gs.is_default = true ORDER BY gd.min_percentage DESC`
        );
    }

    const getGrade = (pct: number): string => {
        for (const gd of gradeDefs) {
            if (pct >= gd.min_percentage && pct <= gd.max_percentage) return gd.grade_name;
        }
        return '-';
    };

    // For each student, calculate weighted marks across all exams
    const totalWeightage = members.reduce((sum: number, m: any) => sum + parseFloat(m.weightage), 0);

    // Build per-exam, per-subject, per-student marks
    const studentIds = students.map((s: any) => s.student_id);

    // For each exam in the group, fetch marks
    interface ExamMarks {
        examId: string;
        examName: string;
        weightage: number;
        // student_id -> subject_id -> { obtained, max }
        marks: Record<string, Record<string, { obtained: number; max: number; status: string }>>;
    }

    const examMarksArray: ExamMarks[] = [];

    for (const member of members) {
        const examSubjects = await query<any>(
            `SELECT es.id as exam_subject_id, es.subject_id, es.total_max_marks
             FROM exam_subjects es
             WHERE es.exam_id = $1 AND es.class_id = $2`,
            [member.exam_id, classId]
        );

        const esIds = examSubjects.map((es: any) => es.exam_subject_id);
        const esIdToSubject: Record<string, { subject_id: string; max: number }> = {};
        for (const es of examSubjects) {
            esIdToSubject[es.exam_subject_id] = { subject_id: es.subject_id, max: parseFloat(es.total_max_marks) };
        }

        const rawMarks = esIds.length > 0 ? await query<any>(
            `SELECT student_id, exam_subject_id, marks_obtained, status
             FROM marks_records
             WHERE exam_subject_id = ANY($1) AND student_id = ANY($2)`,
            [esIds, studentIds]
        ) : [];

        const marksMap: Record<string, Record<string, { obtained: number; max: number; status: string }>> = {};
        for (const m of rawMarks) {
            const esInfo = esIdToSubject[m.exam_subject_id];
            if (!esInfo) continue;
            if (!marksMap[m.student_id]) marksMap[m.student_id] = {};
            if (!marksMap[m.student_id][esInfo.subject_id]) {
                marksMap[m.student_id][esInfo.subject_id] = { obtained: 0, max: esInfo.max, status: m.status };
            }
            marksMap[m.student_id][esInfo.subject_id].obtained += parseFloat(m.marks_obtained || '0');
        }

        examMarksArray.push({
            examId: member.exam_id,
            examName: member.exam_name,
            weightage: parseFloat(member.weightage),
            marks: marksMap,
        });
    }

    // Compute consolidated student results
    const studentResults: any[] = [];

    for (const student of students) {
        let grandWeightedTotal = 0;
        let grandWeightedMax = 0;
        let subjectsPassed = 0;
        let subjectsFailed = 0;

        const perExamBreakdown: Record<string, { obtained: number; max: number }> = {};

        for (const subject of allSubjects) {
            let weightedObtained = 0;
            let weightedMax = 0;

            for (const examData of examMarksArray) {
                const studentSubjectMarks = examData.marks[student.student_id]?.[subject.subject_id];
                const obtained = studentSubjectMarks?.obtained || 0;
                const max = studentSubjectMarks?.max || parseFloat(subject.total_max_marks);

                // Apply weightage: convert to percentage in that exam, then multiply by weightage
                if (group.aggregation_method === 'weighted_sum') {
                    const pctInExam = max > 0 ? (obtained / max) : 0;
                    weightedObtained += pctInExam * parseFloat(String(examData.weightage));
                    weightedMax += parseFloat(String(examData.weightage));
                } else {
                    // Simple average
                    weightedObtained += obtained;
                    weightedMax += max;
                }

                // Track per-exam totals
                if (!perExamBreakdown[examData.examId]) {
                    perExamBreakdown[examData.examId] = { obtained: 0, max: 0 };
                }
                perExamBreakdown[examData.examId].obtained += obtained;
                perExamBreakdown[examData.examId].max += max;
            }

            // Determine pass/fail for this subject
            const subjectPct = weightedMax > 0 ? (weightedObtained / weightedMax) * 100 : 0;
            const passingMarks = parseFloat(subject.passing_marks);
            const passingPct = parseFloat(subject.total_max_marks) > 0
                ? (passingMarks / parseFloat(subject.total_max_marks)) * 100
                : 33;

            if (subjectPct >= passingPct) subjectsPassed++;
            else subjectsFailed++;

            grandWeightedTotal += weightedObtained;
            grandWeightedMax += weightedMax;
        }

        const percentage = grandWeightedMax > 0 ? Math.round((grandWeightedTotal / grandWeightedMax) * 100 * 100) / 100 : 0;
        const result = computeResult(resultPreset, subjectsPassed, subjectsFailed, percentage);

        studentResults.push({
            student_id: student.student_id,
            student_name: student.student_name,
            roll_number: student.roll_number,
            total_obtained: Math.round(grandWeightedTotal * 100) / 100,
            total_max: Math.round(grandWeightedMax * 100) / 100,
            percentage,
            grade: getGrade(percentage),
            subjects_passed: subjectsPassed,
            subjects_failed: subjectsFailed,
            total_subjects: allSubjects.length,
            result,
            rank: 0,
            per_exam_breakdown: perExamBreakdown,
        });
    }

    // Sort and assign ranks
    studentResults.sort((a, b) => b.percentage - a.percentage);
    let currentRank = 1;
    for (let i = 0; i < studentResults.length; i++) {
        if (i > 0 && studentResults[i].percentage < studentResults[i - 1].percentage) {
            currentRank = i + 1;
        }
        studentResults[i].rank = currentRank;
    }

    // Subject statistics (aggregate across group)
    const subjectStats: any[] = [];
    for (const subject of allSubjects) {
        const subjectMarks: number[] = [];
        let passCount = 0;
        let failCount = 0;

        for (const student of students) {
            let weightedPct = 0;
            let totalWeight = 0;

            for (const examData of examMarksArray) {
                const sm = examData.marks[student.student_id]?.[subject.subject_id];
                const max = sm?.max || parseFloat(subject.total_max_marks);
                const obtained = sm?.obtained || 0;
                const pct = max > 0 ? (obtained / max) * 100 : 0;
                weightedPct += pct * examData.weightage;
                totalWeight += examData.weightage;
            }

            const finalPct = totalWeight > 0 ? weightedPct / totalWeight : 0;
            subjectMarks.push(Math.round(finalPct * 100) / 100);

            const passingPct = parseFloat(subject.total_max_marks) > 0
                ? (parseFloat(subject.passing_marks) / parseFloat(subject.total_max_marks)) * 100 : 33;
            if (finalPct >= passingPct) passCount++; else failCount++;
        }

        subjectStats.push({
            subject_name: subject.subject_name,
            subject_code: subject.subject_code,
            max_marks: 100, // Consolidated is always shown as percentage
            highest: subjectMarks.length > 0 ? Math.max(...subjectMarks) : 0,
            lowest: subjectMarks.length > 0 ? Math.min(...subjectMarks) : 0,
            average: subjectMarks.length > 0 ? Math.round(subjectMarks.reduce((a, b) => a + b, 0) / subjectMarks.length * 100) / 100 : 0,
            pass_count: passCount, fail_count: failCount,
            total_students: students.length,
        });
    }

    // Summary
    const totalPassed = studentResults.filter(s => s.result === 'PASS').length;
    const totalFailed = studentResults.filter(s => s.result === 'FAIL').length;
    const totalCompartment = studentResults.filter(s => s.result === 'COMPARTMENT').length;
    const totalGraded = studentResults.filter(s => s.result === 'GRADED').length;
    const classAverage = studentResults.length > 0 ? Math.round(studentResults.reduce((a, s) => a + s.percentage, 0) / studentResults.length * 100) / 100 : 0;

    const summary = {
        totalStudents: students.length,
        totalPassed, totalFailed, totalCompartment, totalGraded,
        passPercentage: students.length > 0 ? Math.round((totalPassed / students.length) * 100) : 0,
        classAverage,
        highestPercentage: studentResults.length > 0 ? Math.max(...studentResults.map(s => s.percentage)) : 0,
        lowestPercentage: studentResults.length > 0 ? Math.min(...studentResults.map(s => s.percentage)) : 0,
        resultPreset,
    };

    return NextResponse.json({
        studentResults, subjectStats, summary,
        mode: 'group',
        group: { id: group.id, name: group.name, aggregation_method: group.aggregation_method },
        exams: members.map((m: any) => ({ id: m.exam_id, name: m.exam_name, weightage: m.weightage })),
    });
}
