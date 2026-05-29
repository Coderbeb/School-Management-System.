import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { id: studentId } = await params;
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        const { role, userId } = auth.user;

        // Resolve active session
        const currentSession = await queryOne<{ id: string }>(
            `SELECT id FROM academic_sessions WHERE is_current = true LIMIT 1`
        );
        const sessionId = currentSession?.id;

        if (!sessionId) {
            return NextResponse.json({ error: 'No active academic session found' }, { status: 400 });
        }

        // Get student basic info with enrollments (with school isolation check)
        const studentInfo = await query<any>(
            `SELECT 
                s.id,
                s.admission_number as "studentId",
                se.roll_number as "rollNumber",
                s.first_name,
                s.last_name,
                s.email,
                (c.name || ' - ' || sec.name) as "department_name"
             FROM students s
             JOIN student_enrollments se ON se.student_id = s.id AND se.session_id = $1
             JOIN class_sections cs ON cs.id = se.class_section_id
             JOIN classes c ON c.id = cs.class_id
             JOIN sections sec ON sec.id = cs.section_id
             WHERE s.id = $2 AND ($3::uuid IS NULL OR cs.school_id = $3::uuid)`,
            [sessionId, studentId, schoolId]
        );

        if (studentInfo.length === 0) {
            return NextResponse.json({ error: 'Student enrollment not found or access denied' }, { status: 404 });
        }

        const student = studentInfo[0];

        // Core filters for attendance
        const attendanceParams: any[] = [studentId, sessionId];
        let dateFilter = '';

        if (startDate) {
            attendanceParams.push(startDate);
            dateFilter += ` AND ar.date >= $${attendanceParams.length}`;
        }
        if (endDate) {
            attendanceParams.push(endDate);
            dateFilter += ` AND ar.date <= $${attendanceParams.length}`;
        }

        let teacherFilter = '';
        if (role === 'teacher') {
            attendanceParams.push(userId);
            teacherFilter = ` AND ar.class_section_id IN (
                SELECT class_section_id FROM teacher_assignments WHERE teacher_id = $${attendanceParams.length} AND session_id = $2
            )`;
        }

        // 1. Get Subject-wise attendance stats
        const subjectStatsQuery = `
            SELECT 
                sub.id as "subject_id",
                sub.name as "subject_name",
                sub.code as "subject_code",
                COUNT(DISTINCT ar.date::text || '-' || COALESCE(ar.subject_id::text, 'general') || '-' || ar.period_number::text) as "total_classes",
                COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.date::text || '-' || COALESCE(ar.subject_id::text, 'general') || '-' || ar.period_number::text END) as "attended"
            FROM attendance_records ar
            LEFT JOIN subjects sub ON sub.id = ar.subject_id
            WHERE ar.student_id = $1 AND ar.session_id = $2 ${dateFilter} ${teacherFilter}
            GROUP BY sub.id, sub.name, sub.code
            ORDER BY sub.name
        `;
        const subjectStats = await query<any>(subjectStatsQuery, attendanceParams);

        // 2. Get Monthly trends
        const monthlyQuery = `
            SELECT 
                TO_CHAR(ar.date, 'YYYY-MM') as month,
                COUNT(DISTINCT ar.date::text || '-' || COALESCE(ar.subject_id::text, 'general') || '-' || ar.period_number::text) as total_classes,
                COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.date::text || '-' || COALESCE(ar.subject_id::text, 'general') || '-' || ar.period_number::text END) as attended
            FROM attendance_records ar
            WHERE ar.student_id = $1 AND ar.session_id = $2 ${dateFilter} ${teacherFilter}
            GROUP BY TO_CHAR(ar.date, 'YYYY-MM')
            ORDER BY month DESC
        `;
        const monthlyStats = await query<any>(monthlyQuery, attendanceParams);

        // 3. Overall Summary
        const overallQuery = `
            SELECT 
                COUNT(DISTINCT ar.date::text || '-' || COALESCE(ar.subject_id::text, 'general') || '-' || ar.period_number::text) as total_classes,
                COUNT(DISTINCT CASE WHEN ar.status = 'present' THEN ar.date::text || '-' || COALESCE(ar.subject_id::text, 'general') || '-' || ar.period_number::text END) as attended
            FROM attendance_records ar
            WHERE ar.student_id = $1 AND ar.session_id = $2 ${dateFilter} ${teacherFilter}
        `;
        const overallStats = await queryOne<any>(overallQuery, attendanceParams);

        const total = parseInt(overallStats?.total_classes || '0');
        const attended = parseInt(overallStats?.attended || '0');

        return NextResponse.json({
            student: {
                id: student.id,
                studentId: student.studentId,
                rollNumber: student.rollNumber,
                name: `${student.first_name} ${student.last_name}`,
                email: student.email || 'N/A',
                department: student.department_name || 'N/A',
                semester: 1
            },
            summary: {
                totalClasses: total,
                attended: attended,
                attendancePercentage: total > 0 ? Math.round((attended / total) * 100) : 0
            },
            subjects: subjectStats.map((s: any) => {
                const subTotal = parseInt(s.total_classes) || 0;
                const subAtt = parseInt(s.attended) || 0;
                return {
                    id: s.subject_id || 'general',
                    name: s.subject_name || 'General Attendance',
                    code: s.subject_code || 'GEN',
                    totalClasses: subTotal,
                    attended: subAtt,
                    attendance: subTotal > 0 ? Math.round((subAtt / subTotal) * 100) : 0
                };
            }),
            monthlyTrend: monthlyStats.map((m: any) => {
                const mTotal = parseInt(m.total_classes) || 0;
                const mAtt = parseInt(m.attended) || 0;
                return {
                    month: m.month,
                    totalClasses: mTotal,
                    attended: mAtt,
                    attendance: mTotal > 0 ? Math.round((mAtt / mTotal) * 100) : 0
                };
            }),
            dateRange: startDate && endDate ? { startDate, endDate } : null
        });
    } catch (error) {
        console.error('Student details report error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
