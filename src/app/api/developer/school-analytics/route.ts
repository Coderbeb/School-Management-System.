import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// GET: Per-school analytics for developer dashboard
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = verifyToken(authHeader.substring(7));
    if (!user || user.role !== 'developer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    try {
        // Get all schools
        const schools = await query<any>(
            `SELECT id, name, short_name, board_type, is_active, created_at FROM schools ORDER BY name ASC`
        );

        const today = new Date().toISOString().split('T')[0];
        const schoolReports: any[] = [];

        for (const school of schools) {
            // Counts per school
            const [studentCount, teacherCount, classCount, examCount, marksCount, sessionInfo] = await Promise.all([
                query<{ count: string }>(`SELECT COUNT(*) as count FROM students WHERE school_id = $1`, [school.id]),
                query<{ count: string }>(`SELECT COUNT(*) as count FROM users WHERE school_id = $1 AND role = 'teacher' AND is_active = true`, [school.id]),
                query<{ count: string }>(`SELECT COUNT(*) as count FROM classes WHERE school_id = $1`, [school.id]),
                query<{ count: string }>(`SELECT COUNT(*) as count FROM exams WHERE school_id = $1`, [school.id]),
                query<{ count: string }>(`SELECT COUNT(*) as count FROM marks_records mr JOIN exam_subjects es ON mr.exam_subject_id = es.id JOIN exams e ON es.exam_id = e.id WHERE e.school_id = $1`, [school.id]),
                query<any>(`SELECT id, name, is_current FROM academic_sessions WHERE school_id = $1 AND is_current = true LIMIT 1`, [school.id]),
            ]);

            // Today's attendance for this school
            let todayAttendanceTotal = 0;
            let todayAttendancePresent = 0;
            try {
                const attendanceStats = await query<any>(
                    `SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present
                     FROM attendance_records ar
                     JOIN class_sections cs ON ar.class_section_id = cs.id
                     JOIN classes c ON cs.class_id = c.id
                     WHERE c.school_id = $1 AND ar.date = $2`,
                    [school.id, today]
                );
                todayAttendanceTotal = parseInt(attendanceStats[0]?.total || '0');
                todayAttendancePresent = parseInt(attendanceStats[0]?.present || '0');
            } catch { /* table might not have school_id join */ }

            // Exams with entry status
            let publishedExams = 0;
            let openExams = 0;
            try {
                const examStats = await query<any>(
                    `SELECT 
                        COUNT(CASE WHEN is_published = true THEN 1 END) as published,
                        COUNT(CASE WHEN is_entry_open = true THEN 1 END) as open
                     FROM exams WHERE school_id = $1`,
                    [school.id]
                );
                publishedExams = parseInt(examStats[0]?.published || '0');
                openExams = parseInt(examStats[0]?.open || '0');
            } catch { /* silent */ }

            // Admin user for this school
            let adminEmail = null;
            try {
                const admin = await query<any>(
                    `SELECT email FROM users WHERE school_id = $1 AND role = 'super_admin' AND is_active = true LIMIT 1`,
                    [school.id]
                );
                adminEmail = admin[0]?.email || null;
            } catch { /* silent */ }

            const todayAttendancePct = todayAttendanceTotal > 0
                ? Math.round((todayAttendancePresent / todayAttendanceTotal) * 100)
                : null;

            schoolReports.push({
                id: school.id,
                name: school.name,
                board: school.board_type,
                code: school.short_name,
                isActive: school.is_active,
                createdAt: school.created_at,
                adminEmail,
                activeSession: sessionInfo[0]?.name || null,
                students: parseInt(studentCount[0]?.count || '0'),
                teachers: parseInt(teacherCount[0]?.count || '0'),
                classes: parseInt(classCount[0]?.count || '0'),
                exams: parseInt(examCount[0]?.count || '0'),
                publishedExams,
                openExams,
                marksRecords: parseInt(marksCount[0]?.count || '0'),
                todayAttendance: {
                    total: todayAttendanceTotal,
                    present: todayAttendancePresent,
                    percentage: todayAttendancePct,
                },
            });
        }

        // Generate alerts
        const alerts: { type: 'warning' | 'info' | 'error'; school: string; message: string; }[] = [];

        for (const report of schoolReports) {
            if (report.students === 0) {
                alerts.push({ type: 'warning', school: report.name, message: 'No students enrolled yet' });
            }
            if (report.teachers === 0) {
                alerts.push({ type: 'warning', school: report.name, message: 'No teachers assigned yet' });
            }
            if (report.exams === 0) {
                alerts.push({ type: 'info', school: report.name, message: 'No exams created yet' });
            }
            if (report.todayAttendance.percentage !== null && report.todayAttendance.percentage < 75) {
                alerts.push({ type: 'warning', school: report.name, message: `Low attendance today: ${report.todayAttendance.percentage}%` });
            }
            if (report.todayAttendance.total === 0 && report.students > 0) {
                alerts.push({ type: 'info', school: report.name, message: 'No attendance marked today' });
            }
            if (!report.activeSession) {
                alerts.push({ type: 'error', school: report.name, message: 'No active academic session' });
            }
        }

        return NextResponse.json({ schoolReports, alerts });
    } catch (error) {
        console.error('Error fetching school analytics:', error);
        return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }
}
