import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';

/**
 * GET /api/developer/schools/export?schoolId=xxx
 * Exports all data for a specific school as a JSON package.
 * Only accessible by the platform developer.
 */
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['developer']);
        if (auth.error) return auth.error;

        const { searchParams } = new URL(request.url);
        const schoolId = searchParams.get('schoolId');

        if (!schoolId) {
            return NextResponse.json({ error: 'schoolId query parameter is required' }, { status: 400 });
        }

        // Verify school exists
        const school = await queryOne<any>(
            `SELECT * FROM schools WHERE id = $1`,
            [schoolId]
        );
        if (!school) {
            return NextResponse.json({ error: 'School not found' }, { status: 404 });
        }

        // Export all school data in parallel
        const [
            sessions,
            classes,
            sections,
            subjects,
            users,
            students,
            enrollments,
            classSections,
            teacherAssignments,
            exams,
            examSubjects,
            attendanceCount,
            marksCount,
            settings,
        ] = await Promise.all([
            query(`SELECT * FROM academic_sessions WHERE school_id = $1 ORDER BY start_date DESC`, [schoolId]),
            query(`SELECT * FROM classes WHERE school_id = $1 ORDER BY display_order`, [schoolId]),
            query(`SELECT * FROM sections WHERE school_id = $1 ORDER BY name`, [schoolId]),
            query(`SELECT * FROM subjects WHERE school_id = $1 ORDER BY name`, [schoolId]),
            query(`SELECT id, email, first_name, last_name, role, is_active, created_at FROM users WHERE school_id = $1 ORDER BY role, first_name`, [schoolId]),
            query(`SELECT * FROM students WHERE school_id = $1 ORDER BY first_name`, [schoolId]),
            query(`SELECT se.* FROM student_enrollments se JOIN students s ON se.student_id = s.id WHERE s.school_id = $1`, [schoolId]),
            query(`SELECT cs.* FROM class_sections cs JOIN classes c ON cs.class_id = c.id WHERE c.school_id = $1`, [schoolId]),
            query(`SELECT ta.* FROM teacher_assignments ta JOIN users u ON ta.teacher_id = u.id WHERE u.school_id = $1`, [schoolId]),
            query(`SELECT * FROM exams WHERE school_id = $1 ORDER BY created_at DESC`, [schoolId]),
            query(`SELECT es.* FROM exam_subjects es JOIN exams e ON es.exam_id = e.id WHERE e.school_id = $1`, [schoolId]),
            queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM attendance_records ar JOIN students s ON ar.student_id = s.id WHERE s.school_id = $1`, [schoolId]),
            queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM marks_records mr JOIN exam_subjects es ON mr.exam_subject_id = es.id JOIN exams e ON es.exam_id = e.id WHERE e.school_id = $1`, [schoolId]),
            query(`SELECT * FROM school_settings WHERE school_id = $1`, [schoolId]),
        ]);

        const exportData = {
            exportedAt: new Date().toISOString(),
            school,
            summary: {
                totalSessions: sessions.length,
                totalClasses: classes.length,
                totalSections: sections.length,
                totalSubjects: subjects.length,
                totalUsers: users.length,
                totalStudents: students.length,
                totalEnrollments: enrollments.length,
                totalClassSections: classSections.length,
                totalTeacherAssignments: teacherAssignments.length,
                totalExams: exams.length,
                totalExamSubjects: examSubjects.length,
                totalAttendanceRecords: parseInt(attendanceCount?.count || '0'),
                totalMarksRecords: parseInt(marksCount?.count || '0'),
            },
            data: {
                sessions,
                classes,
                sections,
                subjects,
                users,
                students,
                enrollments,
                classSections,
                teacherAssignments,
                exams,
                examSubjects,
                settings,
            }
        };

        // Return as downloadable JSON
        return new NextResponse(JSON.stringify(exportData, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="school-export-${school.short_name || school.name}-${new Date().toISOString().split('T')[0]}.json"`,
            },
        });
    } catch (error) {
        console.error('Error exporting school data:', error);
        return NextResponse.json({ error: 'Failed to export school data' }, { status: 500 });
    }
}
