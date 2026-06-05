import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET: Fetch complete report card data for a student or a class
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request);
    if (auth.error) return auth.error;
    const user = auth.user;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { searchParams } = new URL(request.url);
        const examId = searchParams.get('examId');
        const examGroupId = searchParams.get('examGroupId');
        const studentId = searchParams.get('studentId');
        const classSectionId = searchParams.get('classSectionId');

        if (!examId && !examGroupId) return NextResponse.json({ error: 'examId or examGroupId required' }, { status: 400 });

        // If exam group is requested, generate consolidated report card
        if (examGroupId) {
            return generateConsolidatedReportCard(examGroupId, studentId, classSectionId, schoolId, user);
        }

        // Get exam + grading scale
        const exam = await queryOne<any>(
            `SELECT e.*, s.name as session_name, gs.name as grading_scale_name
             FROM exams e
             JOIN academic_sessions s ON e.session_id = s.id
             LEFT JOIN grading_scales gs ON e.grading_scale_id = gs.id
             WHERE e.id = $1`, [examId]
        );
        if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 });

        // Students can only see published results
        if (user.role === 'student' && !exam.is_published) {
            return NextResponse.json({ error: 'Results not yet published' }, { status: 403 });
        }

        // Get grading scale definitions
        const scaleId = exam.grading_scale_id || '00000000-0000-0000-0000-000000000001';
        const grades = await query<any>(
            `SELECT * FROM grade_definitions WHERE grading_scale_id = $1 ORDER BY display_order ASC`, [scaleId]
        );

        // Get school settings (scoped by school)
        const schoolSettings: Record<string, string> = {};
        let settingsRes;
        if (schoolId) {
            settingsRes = await query(`SELECT key, value FROM school_settings WHERE school_id = $1`, [schoolId]);
        } else {
            settingsRes = await query(`SELECT key, value FROM school_settings`);
        }
        for (const row of (settingsRes as any[]) || []) {
            try { schoolSettings[(row as any).key] = JSON.parse((row as any).value); } catch { schoolSettings[(row as any).key] = (row as any).value; }
        }

        // Get school profile for branding
        let schoolBranding: Record<string, any> = {};
        if (schoolId) {
            const school = await queryOne<any>(
                `SELECT name, short_name, address, city, state, principal_name, logo_url, board_type
                 FROM schools WHERE id = $1`, [schoolId]
            );
            if (school) {
                schoolBranding = {
                    schoolName: school.name || schoolSettings['school_name'] || 'School',
                    address: school.address ? `${school.address}${school.city ? ', ' + school.city : ''}${school.state ? ', ' + school.state : ''}` : schoolSettings['school_address'] || '',
                    tagline: schoolSettings['report_card_tagline'] || `Affiliated to ${(school.board_type || 'Board').toUpperCase()}`,
                    principalName: school.principal_name || schoolSettings['principal_name'] || '',
                    logoUrl: school.logo_url || schoolSettings['logo_url'] || null,
                    primaryColor: schoolSettings['primary_color'] || '#1e3a8a',
                    accentColor: schoolSettings['accent_color'] || '#b45309',
                    footerText: schoolSettings['report_card_footer'] || '',
                };
            }
        }

        // Determine which students to fetch
        let studentIds: string[] = [];
        if (studentId) {
            studentIds = [studentId];
        } else if (classSectionId) {
            const enrollments = await query<{ student_id: string }>(
                `SELECT student_id FROM student_enrollments WHERE class_section_id = $1 AND session_id = $2 AND status = 'active' ORDER BY roll_number ASC`,
                [classSectionId, exam.session_id]
            );
            studentIds = enrollments.map((r) => r.student_id);
        } else {
            return NextResponse.json({ error: 'studentId or classSectionId required' }, { status: 400 });
        }

        // Build report card data for each student
        const reportCards = [];

        for (const sid of studentIds) {
            // Student info
            const student = await queryOne<any>(
                `SELECT st.*, se.roll_number, se.class_section_id,
                        c.name as class_name, sec.name as section_name
                 FROM students st
                 JOIN student_enrollments se ON se.student_id = st.id AND se.session_id = $2
                 JOIN class_sections cs ON se.class_section_id = cs.id
                 JOIN classes c ON cs.class_id = c.id
                 JOIN sections sec ON cs.section_id = sec.id
                 WHERE st.id = $1`, [sid, exam.session_id]
            );
            if (!student) continue;

            // Get all exam-subjects for this student's class
            const examSubjects = await query<any>(
                `SELECT es.*, s.name as subject_name, s.code as subject_code
                 FROM exam_subjects es
                 JOIN subjects s ON es.subject_id = s.id
                 JOIN class_sections cs2 ON cs2.class_id = es.class_id
                 WHERE es.exam_id = $1 AND cs2.id = $2
                 ORDER BY s.name ASC`,
                [examId, student.class_section_id]
            );

            // For each subject, get marks and components
            const subjectResults = [];
            let grandTotal = 0, grandMax = 0;

            for (const es of examSubjects) {
                // Get components
                const comps = await query<any>(
                    `SELECT esc.*, mc.name as component_name, mc.short_name
                     FROM exam_subject_components esc
                     JOIN mark_components mc ON esc.component_id = mc.id
                     WHERE esc.exam_subject_id = $1 ORDER BY esc.display_order`, [es.id]
                );

                // Get marks
                const marks = await query<any>(
                    `SELECT mr.*, mc.name as component_name, mc.short_name
                     FROM marks_records mr
                     LEFT JOIN mark_components mc ON mr.component_id = mc.id
                     WHERE mr.student_id = $1 AND mr.exam_subject_id = $2`,
                    [sid, es.id]
                );

                let subjectTotal = 0;
                let isAbsent = false;
                const componentMarks = [];

                if (comps.length > 0) {
                    for (const comp of comps) {
                        const mark = marks.find((m: any) => m.component_id === comp.component_id);
                        const obtained = mark?.status === 'scored' ? parseFloat(mark.marks_obtained) || 0 : 0;
                        if (mark?.status === 'absent') isAbsent = true;
                        subjectTotal += obtained;
                        componentMarks.push({
                            name: comp.component_name, shortName: comp.short_name,
                            maxMarks: parseFloat(comp.max_marks), obtained, status: mark?.status || 'scored',
                        });
                    }
                } else {
                    const mark = marks[0];
                    const obtained = mark?.status === 'scored' ? parseFloat(mark?.marks_obtained) || 0 : 0;
                    if (mark?.status === 'absent') isAbsent = true;
                    subjectTotal = obtained;
                }

                const maxMarks = parseFloat(es.total_max_marks);
                const percentage = maxMarks > 0 ? (subjectTotal / maxMarks) * 100 : 0;
                const passingMarks = parseFloat(es.passing_marks);
                const isPassed = subjectTotal >= passingMarks && !isAbsent;

                // Calculate grade from grading scale
                let grade = '-';
                let gradePoint = 0;
                for (const g of grades) {
                    if (percentage >= parseFloat(g.min_percentage) && percentage <= parseFloat(g.max_percentage)) {
                        grade = g.grade_name;
                        gradePoint = parseFloat(g.grade_point);
                        break;
                    }
                }

                grandTotal += subjectTotal;
                grandMax += maxMarks;

                subjectResults.push({
                    subjectName: es.subject_name, subjectCode: es.subject_code,
                    maxMarks, obtained: subjectTotal, percentage: Math.round(percentage * 100) / 100,
                    passingMarks, isPassed, isAbsent, grade, gradePoint, componentMarks,
                });
            }

            // Co-scholastic grades
            const coScholastic = await query<any>(
                `SELECT csr.grade, csr.remarks, csa.name as area_name
                 FROM co_scholastic_records csr
                 JOIN co_scholastic_areas csa ON csr.area_id = csa.id
                 WHERE csr.student_id = $1 AND csr.exam_id = $2
                 ORDER BY csa.display_order`, [sid, examId]
            );

            // Attendance summary (from existing attendance system)
            const attendance = await queryOne<any>(
                `SELECT 
                    COUNT(*) as total_days,
                    COUNT(CASE WHEN ar.status = 'present' OR ar.status = 'late' THEN 1 END) as days_present
                 FROM attendance_records ar
                 WHERE ar.student_id = $1 AND ar.session_id = $2`,
                [sid, exam.session_id]
            );

            const overallPercentage = grandMax > 0 ? Math.round((grandTotal / grandMax) * 100 * 100) / 100 : 0;
            const failedSubjects = subjectResults.filter(s => !s.isPassed && !s.isAbsent).length;
            const overallResult = failedSubjects === 0 ? 'PASS' : failedSubjects <= 2 ? 'COMPARTMENT' : 'FAIL';
            const totalGradePoints = subjectResults.reduce((sum, s) => sum + s.gradePoint, 0);
            const cgpa = subjectResults.length > 0 ? Math.round((totalGradePoints / subjectResults.length) * 100) / 100 : 0;

            reportCards.push({
                student: {
                    name: `${student.first_name} ${student.last_name}`,
                    fatherName: student.guardian_name || '-',
                    admissionNumber: student.admission_number || '-',
                    rollNumber: student.roll_number,
                    className: student.class_name,
                    sectionName: student.section_name,
                    dateOfBirth: student.date_of_birth,
                    gender: student.gender,
                },
                subjects: subjectResults,
                coScholastic: coScholastic,
                attendance: { totalDays: parseInt(attendance?.total_days || '0'), daysPresent: parseInt(attendance?.days_present || '0') },
                summary: { grandTotal, grandMax, overallPercentage, cgpa, overallResult, failedSubjects },
            });
        }

        return NextResponse.json({
            exam: { name: exam.name, sessionName: exam.session_name, category: exam.exam_category },
            schoolSettings,
            schoolBranding,
            gradingScale: { name: exam.grading_scale_name, grades },
            reportCards,
        });
    } catch (error) {
        console.error('Error generating report card:', error);
        return NextResponse.json({ error: 'Failed to generate report card' }, { status: 500 });
    }
}

// Consolidated Report Card: Multiple exams combined into one report card
async function generateConsolidatedReportCard(
    examGroupId: string, studentId: string | null, classSectionId: string | null,
    schoolId: string | null, user: any
) {
    try {
        // Get exam group
        const group = await queryOne<any>(
            `SELECT eg.*, s.name as session_name FROM exam_groups eg
             JOIN academic_sessions s ON eg.session_id = s.id
             WHERE eg.id = $1`, [examGroupId]
        );
        if (!group) return NextResponse.json({ error: 'Exam group not found' }, { status: 404 });

        // Get member exams
        const members = await query<any>(
            `SELECT egm.weightage, e.id as exam_id, e.name as exam_name, e.grading_scale_id
             FROM exam_group_members egm
             JOIN exams e ON egm.exam_id = e.id
             WHERE egm.exam_group_id = $1
             ORDER BY egm.display_order ASC`, [examGroupId]
        );

        if (members.length === 0) {
            return NextResponse.json({ error: 'No exams in this group' }, { status: 400 });
        }

        // Get grading scale from the first exam's scale
        const scaleId = members[0].grading_scale_id || '00000000-0000-0000-0000-000000000001';
        const grades = await query<any>(
            `SELECT * FROM grade_definitions WHERE grading_scale_id = $1 ORDER BY display_order ASC`, [scaleId]
        );

        // School branding
        let schoolBranding: Record<string, any> = {};
        const schoolSettings: Record<string, string> = {};
        if (schoolId) {
            const settingsRes = await query<any>(`SELECT key, value FROM school_settings WHERE school_id = $1`, [schoolId]);
            for (const row of settingsRes || []) {
                try { schoolSettings[row.key] = JSON.parse(row.value); } catch { schoolSettings[row.key] = row.value; }
            }
            const school = await queryOne<any>(
                `SELECT name, short_name, address, city, state, principal_name, logo_url, board_type FROM schools WHERE id = $1`, [schoolId]
            );
            if (school) {
                schoolBranding = {
                    schoolName: school.name || schoolSettings['school_name'] || 'School',
                    address: school.address ? `${school.address}${school.city ? ', ' + school.city : ''}${school.state ? ', ' + school.state : ''}` : schoolSettings['school_address'] || '',
                    tagline: schoolSettings['report_card_tagline'] || `Affiliated to ${(school.board_type || 'Board').toUpperCase()}`,
                    principalName: school.principal_name || schoolSettings['principal_name'] || '',
                    logoUrl: school.logo_url || schoolSettings['logo_url'] || null,
                    primaryColor: schoolSettings['primary_color'] || '#1e3a8a',
                    accentColor: schoolSettings['accent_color'] || '#b45309',
                };
            }
        }

        // Determine students
        let targetStudentIds: string[] = [];
        if (studentId) {
            targetStudentIds = [studentId];
        } else if (classSectionId) {
            const enrollments = await query<{ student_id: string }>(
                `SELECT student_id FROM student_enrollments WHERE class_section_id = $1 AND session_id = $2 AND status = 'active' ORDER BY roll_number ASC`,
                [classSectionId, group.session_id]
            );
            targetStudentIds = enrollments.map((r) => r.student_id);
        } else {
            return NextResponse.json({ error: 'studentId or classSectionId required' }, { status: 400 });
        }

        const reportCards = [];

        for (const sid of targetStudentIds) {
            const student = await queryOne<any>(
                `SELECT st.*, se.roll_number, se.class_section_id,
                        c.name as class_name, sec.name as section_name, cs.class_id
                 FROM students st
                 JOIN student_enrollments se ON se.student_id = st.id AND se.session_id = $2
                 JOIN class_sections cs ON se.class_section_id = cs.id
                 JOIN classes c ON cs.class_id = c.id
                 JOIN sections sec ON cs.section_id = sec.id
                 WHERE st.id = $1`, [sid, group.session_id]
            );
            if (!student) continue;

            // Get all subjects for this class across all exams
            const examIds = members.map((m: any) => m.exam_id);
            const subjectsList = await query<any>(
                `SELECT DISTINCT ON (sub.id) sub.id as subject_id, sub.name as subject_name, sub.code as subject_code,
                        es.total_max_marks, es.passing_marks
                 FROM exam_subjects es
                 JOIN subjects sub ON es.subject_id = sub.id
                 WHERE es.exam_id = ANY($1) AND es.class_id = $2
                 ORDER BY sub.id, sub.name ASC`,
                [examIds, student.class_id]
            );

            // For each subject, get marks from each exam
            const subjectResults = [];
            let grandWeightedTotal = 0;
            let grandWeightedMax = 0;
            const totalWeightage = members.reduce((s: number, m: any) => s + parseFloat(m.weightage), 0);

            for (const subject of subjectsList) {
                const perExamMarks: { examName: string; obtained: number; max: number; weightage: number }[] = [];
                let weightedObtained = 0;

                for (const member of members) {
                    // Find the exam_subject for this exam + subject + class
                    const es = await queryOne<any>(
                        `SELECT es.id, es.total_max_marks FROM exam_subjects es
                         WHERE es.exam_id = $1 AND es.subject_id = $2 AND es.class_id = $3`,
                        [member.exam_id, subject.subject_id, student.class_id]
                    );

                    let obtained = 0;
                    const max = es ? parseFloat(es.total_max_marks) : parseFloat(subject.total_max_marks);

                    if (es) {
                        const marksRows = await query<any>(
                            `SELECT marks_obtained, status FROM marks_records
                             WHERE student_id = $1 AND exam_subject_id = $2`,
                            [sid, es.id]
                        );
                        for (const mr of marksRows) {
                            if (mr.status === 'scored') obtained += parseFloat(mr.marks_obtained || '0');
                        }
                    }

                    perExamMarks.push({
                        examName: member.exam_name,
                        obtained,
                        max,
                        weightage: parseFloat(member.weightage),
                    });

                    const pctInExam = max > 0 ? obtained / max : 0;
                    weightedObtained += pctInExam * parseFloat(member.weightage);
                }

                const consolidatedPct = totalWeightage > 0 ? (weightedObtained / totalWeightage) * 100 : 0;
                const passingPct = parseFloat(subject.total_max_marks) > 0
                    ? (parseFloat(subject.passing_marks) / parseFloat(subject.total_max_marks)) * 100 : 33;
                const isPassed = consolidatedPct >= passingPct;

                let grade = '-';
                let gradePoint = 0;
                for (const g of grades) {
                    if (consolidatedPct >= parseFloat(g.min_percentage) && consolidatedPct <= parseFloat(g.max_percentage)) {
                        grade = g.grade_name;
                        gradePoint = parseFloat(g.grade_point);
                        break;
                    }
                }

                grandWeightedTotal += weightedObtained;
                grandWeightedMax += totalWeightage;

                subjectResults.push({
                    subjectName: subject.subject_name,
                    subjectCode: subject.subject_code,
                    maxMarks: parseFloat(subject.total_max_marks),
                    consolidatedPercentage: Math.round(consolidatedPct * 100) / 100,
                    isPassed,
                    grade,
                    gradePoint,
                    perExamMarks,
                    // For backward compat
                    obtained: Math.round(consolidatedPct),
                    percentage: Math.round(consolidatedPct * 100) / 100,
                    passingMarks: parseFloat(subject.passing_marks),
                    isAbsent: false,
                    componentMarks: [],
                });
            }

            // Co-scholastic (from the last exam in the group)
            const lastExamId = examIds[examIds.length - 1];
            const coScholastic = await query<any>(
                `SELECT csr.grade, csr.remarks, csa.name as area_name
                 FROM co_scholastic_records csr
                 JOIN co_scholastic_areas csa ON csr.area_id = csa.id
                 WHERE csr.student_id = $1 AND csr.exam_id = $2
                 ORDER BY csa.display_order`, [sid, lastExamId]
            );

            // Attendance
            const attendance = await queryOne<any>(
                `SELECT COUNT(*) as total_days,
                        COUNT(CASE WHEN ar.status = 'present' OR ar.status = 'late' THEN 1 END) as days_present
                 FROM attendance_records ar
                 WHERE ar.student_id = $1 AND ar.session_id = $2`,
                [sid, group.session_id]
            );

            const overallPct = grandWeightedMax > 0
                ? Math.round((grandWeightedTotal / grandWeightedMax) * 100 * 100) / 100 : 0;
            const failedSubjects = subjectResults.filter(s => !s.isPassed).length;
            const overallResult = failedSubjects === 0 ? 'PASS' : failedSubjects <= 2 ? 'COMPARTMENT' : 'FAIL';
            const totalGradePoints = subjectResults.reduce((sum, s) => sum + s.gradePoint, 0);
            const cgpa = subjectResults.length > 0 ? Math.round((totalGradePoints / subjectResults.length) * 100) / 100 : 0;

            reportCards.push({
                student: {
                    name: `${student.first_name} ${student.last_name}`,
                    fatherName: student.guardian_name || '-',
                    admissionNumber: student.admission_number || '-',
                    rollNumber: student.roll_number,
                    className: student.class_name,
                    sectionName: student.section_name,
                    dateOfBirth: student.date_of_birth,
                    gender: student.gender,
                },
                subjects: subjectResults,
                coScholastic,
                attendance: { totalDays: parseInt(attendance?.total_days || '0'), daysPresent: parseInt(attendance?.days_present || '0') },
                summary: {
                    grandTotal: Math.round(grandWeightedTotal * 100) / 100,
                    grandMax: Math.round(grandWeightedMax * 100) / 100,
                    overallPercentage: overallPct, cgpa, overallResult, failedSubjects,
                },
            });
        }

        return NextResponse.json({
            exam: { name: group.name, sessionName: group.session_name, category: 'consolidated' },
            schoolSettings,
            schoolBranding,
            gradingScale: { name: 'Grading Scale', grades },
            reportCards,
            mode: 'consolidated',
            exams: members.map((m: any) => ({ name: m.exam_name, weightage: m.weightage })),
        });
    } catch (error) {
        console.error('Error generating consolidated report card:', error);
        return NextResponse.json({ error: 'Failed to generate consolidated report card' }, { status: 500 });
    }
}
