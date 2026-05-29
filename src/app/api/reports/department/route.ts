import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const { role, userId } = auth.user;
        const schoolId = resolveSchoolId(auth.user, request);
        const searchParams = request.nextUrl.searchParams;
        const classSectionId = searchParams.get('classSectionId') || searchParams.get('departmentId');

        if (!classSectionId) {
            return NextResponse.json({ error: 'Class section ID is required' }, { status: 400 });
        }

        // Resolve active session
        let sessionSql = `SELECT id FROM academic_sessions WHERE is_current = true`;
        const sessionParams: unknown[] = [];
        if (schoolId) {
            sessionSql += ` AND school_id = $1`;
            sessionParams.push(schoolId);
        }
        sessionSql += ` LIMIT 1`;
        const currentSession = await queryOne<{ id: string }>(sessionSql, sessionParams);
        const sessionId = currentSession?.id;

        if (!sessionId) {
            return NextResponse.json({ error: 'No active academic session' }, { status: 400 });
        }

        // Get class section info
        const classroomInfo = await queryOne<any>(
            `SELECT 
                cs.id,
                (c.name || ' - ' || sec.name) as name,
                c.name as code,
                c.id as class_id
             FROM class_sections cs
             JOIN classes c ON c.id = cs.class_id
             JOIN sections sec ON sec.id = cs.section_id
             WHERE cs.id = $1 AND cs.session_id = $2`,
            [classSectionId, sessionId]
        );

        if (!classroomInfo) {
            return NextResponse.json({ error: 'Class section not found' }, { status: 404 });
        }

        // 1. Semester (mapped to simple stats)
        const semesterStats = await query<any>(
            `SELECT 
                '1' as semester,
                COUNT(DISTINCT se.student_id) as total_students,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as avg_attendance
             FROM student_enrollments se
             LEFT JOIN attendance_records ar ON ar.student_id = se.student_id AND ar.session_id = se.session_id AND ar.class_section_id = se.class_section_id
             WHERE se.class_section_id = $1 AND se.session_id = $2
             GROUP BY se.class_section_id`,
            [classSectionId, sessionId]
        );

        // 2. Subject-wise stats for this class section
        const subjectStats = await query<any>(
            `SELECT 
                sub.id,
                sub.name,
                sub.code,
                '1' as semester,
                COUNT(DISTINCT se.student_id) as total_students,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as avg_attendance
             FROM class_subjects csub
             JOIN subjects sub ON sub.id = csub.subject_id
             JOIN class_sections cs ON cs.class_id = csub.class_id AND cs.session_id = csub.session_id
             LEFT JOIN student_enrollments se ON se.class_section_id = cs.id AND se.session_id = cs.session_id
             LEFT JOIN attendance_records ar ON ar.subject_id = sub.id AND ar.student_id = se.student_id AND ar.class_section_id = cs.id AND ar.session_id = cs.session_id
             WHERE cs.id = $1 AND cs.session_id = $2
             GROUP BY sub.id, sub.name, sub.code
             ORDER BY sub.name`,
            [classSectionId, sessionId]
        );

        // 3. Critical students (<60% attendance)
        const criticalStudents = await query<any>(
            `SELECT 
                s.id,
                s.admission_number as "studentId",
                se.roll_number as "rollNumber",
                (s.first_name || ' ' || s.last_name) as name,
                '1' as semester,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as attendance_pct
             FROM student_enrollments se
             JOIN students s ON s.id = se.student_id
             LEFT JOIN attendance_records ar ON ar.student_id = se.student_id AND ar.session_id = se.session_id AND ar.class_section_id = se.class_section_id
             WHERE se.class_section_id = $1 AND se.session_id = $2
             GROUP BY s.id, se.roll_number, s.first_name, s.last_name
             HAVING COUNT(ar.id) > 0 AND 
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) < 60
             ORDER BY attendance_pct ASC`,
            [classSectionId, sessionId]
        );

        // 4. Warning students (60-75% attendance)
        const warningStudents = await query<any>(
            `SELECT 
                s.id,
                s.admission_number as "studentId",
                se.roll_number as "rollNumber",
                (s.first_name || ' ' || s.last_name) as name,
                '1' as semester,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as attendance_pct
             FROM student_enrollments se
             JOIN students s ON s.id = se.student_id
             LEFT JOIN attendance_records ar ON ar.student_id = se.student_id AND ar.session_id = se.session_id AND ar.class_section_id = se.class_section_id
             WHERE se.class_section_id = $1 AND se.session_id = $2
             GROUP BY s.id, se.roll_number, s.first_name, s.last_name
             HAVING COUNT(ar.id) > 0 AND 
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) BETWEEN 60 AND 74.9
             ORDER BY attendance_pct ASC`,
            [classSectionId, sessionId]
        );

        const totalStudents = semesterStats.reduce((acc: number, s: any) => acc + parseInt(s.total_students || '0'), 0);
        const totalSubjects = subjectStats.length;

        return NextResponse.json({
            department: {
                id: classroomInfo.id,
                name: classroomInfo.name,
                code: classroomInfo.code,
                degreeType: 'academic'
            },
            overallStats: {
                totalStudents,
                totalSubjects,
                criticalCount: criticalStudents.length,
                warningCount: warningStudents.length
            },
            semesterStats: semesterStats.map((s: any) => ({
                semester: 1,
                totalStudents: parseInt(s.total_students || '0'),
                avgAttendance: Math.round(parseFloat(s.avg_attendance || '0'))
            })),
            subjectStats: subjectStats.map((s: any) => ({
                id: s.id,
                name: s.name,
                code: s.code,
                semester: '1',
                totalStudents: parseInt(s.total_students || '0'),
                avgAttendance: Math.round(parseFloat(s.avg_attendance || '0'))
            })),
            criticalStudents: criticalStudents.map((s: any) => ({
                id: s.id,
                studentId: s.studentId,
                rollNumber: s.rollNumber,
                name: s.name,
                semester: 1,
                attendancePercentage: Math.round(parseFloat(s.attendance_pct || '0'))
            })),
            warningStudents: warningStudents.map((s: any) => ({
                id: s.id,
                studentId: s.studentId,
                rollNumber: s.rollNumber,
                name: s.name,
                semester: 1,
                attendancePercentage: Math.round(parseFloat(s.attendance_pct || '0'))
            }))
        });
    } catch (error) {
        console.error('Classroom/Department overview report error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
