import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { sendBatchReportEmails, StudentReportData, getEmailConfig } from '@/lib/email';

// ============================================================
// Automated Monthly Attendance Alert Cron Endpoint
// ============================================================
// Runs on the 1st of every month. Generates report for the PREVIOUS month.
// Example: Running on 1st May → report covers 1 April – 30 April
//
// The feature must be ENABLED by the super admin in Settings → Email Automation.
//
// Usage:
//   GET /api/cron/send-attendance-alerts?secret=YOUR_CRON_SECRET
//
// Cron Schedule (external): 0 9 1 * *  (9 AM on 1st of every month)

interface StudentRow {
    id: string;
    first_name: string;
    last_name: string;
    student_id: string;
    email: string;
    roll_number: string;
    department_id: string;
    department_name: string;
    current_semester: number;
    total_classes: string;
    attended_classes: string;
}

interface SubjectRow {
    student_id: string;
    subject_name: string;
    subject_code: string;
    subject_paper_code: string | null;
    total_classes: string;
    attended_classes: string;
}

interface HODRow {
    department_id: string;
    hod_name: string;
}

/**
 * Calculate previous month's date range.
 * If today is 1st May 2026, returns { start: '2026-04-01', end: '2026-04-30', monthName: 'April 2026' }
 */
function getPreviousMonthRange() {
    const now = new Date();
    // Go to previous month
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startDate = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;

    // Last day of previous month = day 0 of current month
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    const endDate = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

    const monthName = prevMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    // Formatted for display: "1 April 2026 – 30 April 2026"
    const displayRange = `${prevMonth.getDate()} ${prevMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} – ${lastDay.getDate()} ${lastDay.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;

    return { startDate, endDate, monthName, displayRange };
}

export async function GET(request: NextRequest) {
    try {
        // ---- Security Check ----
        const { searchParams } = new URL(request.url);
        const secret = searchParams.get('secret');
        const cronSecret = process.env.CRON_SECRET;

        if (!cronSecret || secret !== cronSecret) {
            return NextResponse.json(
                { error: 'Unauthorized. Invalid or missing secret.' },
                { status: 401 }
            );
        }

        // ---- Check if email feature is enabled ----
        const emailConfig = await getEmailConfig();

        if (!emailConfig.enabled) {
            return NextResponse.json({
                success: true,
                message: 'Email automation is disabled. Enable it in Settings → Email Automation.',
                emailsSent: 0,
            });
        }

        if (!emailConfig.email || !emailConfig.password) {
            return NextResponse.json({
                success: false,
                message: 'Email credentials not configured. Please set up email in Settings.',
                emailsSent: 0,
            });
        }

        // ---- Calculate previous month's date range ----
        const { startDate, endDate, monthName, displayRange } = getPreviousMonthRange();
        console.log(`[Cron] Generating monthly report for: ${displayRange}`);

        // ---- Step 1: Get attendance for PREVIOUS MONTH only ----
        const students = await query<StudentRow>(`
            SELECT
                s.id,
                s.first_name,
                s.last_name,
                s.student_id,
                s.email,
                s.roll_number,
                s.department_id,
                COALESCE(d.name, 'N/A') as department_name,
                s.current_semester,
                COUNT(ar.id) as total_classes,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as attended_classes
            FROM students s
            LEFT JOIN departments d ON d.id = s.department_id
            LEFT JOIN attendance_records ar ON ar.student_id = s.id
                AND ar.date >= $1 AND ar.date <= $2
            WHERE s.is_active = true
              AND s.email IS NOT NULL
              AND s.email != ''
            GROUP BY s.id, s.first_name, s.last_name, s.student_id, s.email, s.roll_number, 
                     s.department_id, d.name, s.current_semester
            HAVING COUNT(ar.id) > 0
            ORDER BY s.roll_number ASC
        `, [startDate, endDate]);

        // ---- Step 2: Filter students below 60% in that month ----
        const lowAttendanceStudents = students.filter((st) => {
            const total = parseInt(st.total_classes) || 0;
            const attended = parseInt(st.attended_classes) || 0;
            if (total === 0) return false;
            const percentage = Math.round((attended / total) * 100);
            return percentage < 60;
        });

        if (lowAttendanceStudents.length === 0) {
            return NextResponse.json({
                success: true,
                message: `No students found below 60% attendance for ${monthName}.`,
                reportPeriod: displayRange,
                totalStudentsChecked: students.length,
                emailsSent: 0,
            });
        }

        // ---- Step 3: Get HOD name for each department ----
        const hodData = await query<HODRow>(`
            SELECT 
                u.department_id,
                CONCAT(u.first_name, ' ', u.last_name) as hod_name
            FROM users u
            WHERE u.role = 'hod'
              AND u.is_active = true
        `);
        const hodByDept: Record<string, string> = {};
        hodData.forEach((h) => {
            hodByDept[h.department_id] = h.hod_name;
        });

        // ---- Step 4: Get subject-wise breakdown for PREVIOUS MONTH ----
        const studentIds = lowAttendanceStudents.map((s) => s.id);
        const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(', ');
        // Date params come after student IDs
        const dateParamStart = studentIds.length + 1;
        const dateParamEnd = studentIds.length + 2;

        const subjectBreakdown = await query<SubjectRow>(
            `
            SELECT
                ar.student_id,
                sub.name as subject_name,
                sub.code as subject_code,
                sub.paper_code as subject_paper_code,
                COUNT(ar.id) as total_classes,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as attended_classes
            FROM attendance_records ar
            JOIN subjects sub ON sub.id = ar.subject_id
            WHERE ar.student_id IN (${placeholders})
              AND ar.date >= $${dateParamStart} AND ar.date <= $${dateParamEnd}
            GROUP BY ar.student_id, sub.name, sub.code, sub.paper_code
            ORDER BY sub.name ASC
        `,
            [...studentIds, startDate, endDate]
        );

        // Group subject data by student_id
        const subjectsByStudent: Record<string, { name: string; code: string; paperCode: string; totalClasses: number; attended: number; percentage: number }[]> = {};
        subjectBreakdown.forEach((row) => {
            if (!subjectsByStudent[row.student_id]) {
                subjectsByStudent[row.student_id] = [];
            }
            const total = parseInt(row.total_classes) || 0;
            const attended = parseInt(row.attended_classes) || 0;
            subjectsByStudent[row.student_id].push({
                name: row.subject_name,
                code: row.subject_code || '',
                paperCode: row.subject_paper_code || row.subject_code || '',
                totalClasses: total,
                attended: attended,
                percentage: total > 0 ? Math.round((attended / total) * 100) : 0,
            });
        });

        // ---- Step 5: Prepare email data with HOD name + month info ----
        const emailData: StudentReportData[] = lowAttendanceStudents.map((st) => {
            const total = parseInt(st.total_classes) || 0;
            const attended = parseInt(st.attended_classes) || 0;
            return {
                studentName: `${st.first_name} ${st.last_name}`,
                studentEmail: st.email,
                studentId: st.student_id,
                rollNumber: st.roll_number,
                department: st.department_name,
                semester: st.current_semester,
                totalClasses: total,
                attendedClasses: attended,
                percentage: total > 0 ? Math.round((attended / total) * 100) : 0,
                hodName: hodByDept[st.department_id] || 'Head of Department',
                subjects: subjectsByStudent[st.id] || [],
                reportMonth: monthName,
                reportPeriod: displayRange,
            };
        });

        // ---- Step 6: Send emails with PDF attachments in batches ----
        console.log(`[Cron] Sending PDF attendance reports (${monthName}) to ${emailData.length} students...`);
        const result = await sendBatchReportEmails(emailData);

        return NextResponse.json({
            success: true,
            reportPeriod: displayRange,
            totalStudentsChecked: students.length,
            studentsBelow60: lowAttendanceStudents.length,
            emailsSent: result.sent,
            emailsFailed: result.failed,
            errors: result.errors.length > 0 ? result.errors : undefined,
        });
    } catch (error) {
        console.error('[Cron] Attendance alert error:', error);
        return NextResponse.json(
            { error: 'Failed to process attendance alerts', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
