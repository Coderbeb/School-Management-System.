import nodemailer from 'nodemailer';
import { query, queryOne } from '@/lib/db';
import { generateReportCardPDF, PDFReportData } from '@/lib/pdf-report';

// ============================================================
// Email Configuration — reads from database (application_settings)
// ============================================================

interface EmailConfig {
    email: string;
    password: string;
    enabled: boolean;
}

/**
 * Fetches email configuration from the database.
 * Falls back to .env variables if no database config exists.
 */
export async function getEmailConfig(): Promise<EmailConfig> {
    try {
        const row = await queryOne<{ value: EmailConfig }>(
            `SELECT value FROM application_settings WHERE key = 'email_config'`
        );
        if (row && row.value && row.value.email && row.value.password) {
            return {
                email: row.value.email,
                password: row.value.password,
                enabled: row.value.enabled ?? false,
            };
        }
    } catch {
        // Table may not exist yet or query failed — fall back to .env
    }

    // Fallback to .env
    return {
        email: process.env.EMAIL_USER || '',
        password: process.env.EMAIL_PASS || '',
        enabled: false,
    };
}

/**
 * Creates a reusable nodemailer transport.
 * Uses Gmail SMTP with App Password authentication.
 */
function createTransport(email: string, password: string) {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: email,
            pass: password,
        },
        // Pool connections for batch sending (prevents opening new connection per email)
        pool: true,
        maxConnections: 3,
        maxMessages: 50,
        // Rate limiting: 2 second gap between messages to avoid spam flags
        rateDelta: 2000,
        rateLimit: 5,
    });
}

// ============================================================
// Anti-Spam Best Practices for Email Content
// ============================================================
// 1. Always include BOTH html and plain text versions
// 2. Use a consistent, professional "From" name
// 3. Include a proper subject (not ALL CAPS, no excessive punctuation)
// 4. Keep HTML clean — no JavaScript, minimal images
// 5. Include sender identification in the footer
// 6. Add List-Unsubscribe header
// 7. Maintain a good text-to-HTML ratio
// 8. Send in small batches with delays between them

// ============================================================
// Student Report Card Data Interface
// ============================================================

export interface StudentReportData {
    studentName: string;
    studentEmail: string;
    studentId?: string;
    rollNumber: string | number;
    department: string;
    semester: number;
    totalClasses: number;
    attendedClasses: number;
    percentage: number;
    hodName: string; // Department HOD's name for the report footer
    reportMonth?: string;  // e.g. "April 2026"
    reportPeriod?: string; // e.g. "1 April 2026 – 30 April 2026"
    // Subject-wise breakdown
    subjects?: {
        name: string;
        code?: string;
        paperCode?: string;
        totalClasses: number;
        attended: number;
        percentage: number;
    }[];
}

// ============================================================
// Email Body HTML — Professional College Communication
// ============================================================

function generateEmailHTML(data: StudentReportData): string {
    const currentDate = new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Official Communication — Yogoda Satsanga Mahavidyalaya</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: Georgia, 'Times New Roman', Times, serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 24px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 4px; overflow: hidden; border: 1px solid #d1d5db;">
                    
                    <!-- College Header -->
                    <tr>
                        <td style="background: #1e3a5f; padding: 24px 36px; text-align: center; border-bottom: 4px solid #b45309;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; font-family: Georgia, serif;">Yogoda Satsanga Mahavidyalaya</h1>
                            <p style="margin: 6px 0 0; color: #93c5fd; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase;">Established 1967 &bull; NAAC Accredited Grade 'B'++ &bull; Jagannathpur, Dhurwa, Ranchi-834004</p>
                        </td>
                    </tr>

                    <!-- Subject Line -->
                    <tr>
                        <td style="padding: 20px 36px 0;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="color: #6b7280; font-size: 12px; font-family: Arial, sans-serif;">Ref. No.: YSM/ATT/${new Date().getFullYear()}/${String(Math.floor(Math.random() * 9000) + 1000)}</td>
                                    <td style="color: #6b7280; font-size: 12px; font-family: Arial, sans-serif; text-align: right;">Date: ${currentDate}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 24px 36px;">
                            <p style="margin: 0 0 4px; color: #1e293b; font-size: 14px; line-height: 1.7; font-family: Arial, sans-serif;">
                                <strong>Subject:</strong> Monthly Attendance Report${data.reportMonth ? ` — ${data.reportMonth}` : ''} — Attendance Below Minimum Requirement
                            </p>
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
                            
                            <p style="margin: 0 0 16px; color: #374151; font-size: 14px; line-height: 1.8; font-family: Arial, sans-serif;">
                                Dear <strong>${data.studentName}</strong>,
                            </p>
                            
                            <p style="margin: 0 0 14px; color: #374151; font-size: 14px; line-height: 1.8; font-family: Arial, sans-serif;">
                                This is to inform you that as per the attendance records maintained by the Department of <strong>${data.department}</strong>${data.reportPeriod ? ` for the period <strong>${data.reportPeriod}</strong>` : `, Semester <strong>${data.semester}</strong>`}, your attendance has been recorded at <strong style="color: #dc2626;">${data.percentage}%</strong>, which is below the minimum mandatory attendance requirement of <strong>60%</strong> prescribed by the college.
                            </p>

                            <p style="margin: 0 0 14px; color: #374151; font-size: 14px; line-height: 1.8; font-family: Arial, sans-serif;">
                                Your detailed Attendance Report Card has been enclosed as a <strong>PDF attachment</strong> with this communication for your reference and records. Kindly review it carefully.
                            </p>

                            <!-- Student Summary Card -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
                                <tr>
                                    <td style="padding: 16px 20px;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-family: Arial, sans-serif;">
                                            <tr>
                                                <td style="padding: 5px 0; color: #64748b; font-size: 13px; width: 40%;">Student Name</td>
                                                <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600; text-align: right;">${data.studentName}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Roll Number</td>
                                                <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600; text-align: right;">${data.rollNumber}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Department</td>
                                                <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600; text-align: right;">${data.department}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Semester</td>
                                                <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600; text-align: right;">${data.semester}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Total Classes Held</td>
                                                <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600; text-align: right;">${data.totalClasses}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Classes Attended</td>
                                                <td style="padding: 5px 0; color: #1e293b; font-size: 13px; font-weight: 600; text-align: right;">${data.attendedClasses}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Overall Attendance</td>
                                                <td style="padding: 5px 0; color: #dc2626; font-size: 16px; font-weight: 800; text-align: right;">${data.percentage}%</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 0 0 14px; color: #374151; font-size: 14px; line-height: 1.8; font-family: Arial, sans-serif;">
                                As per the regulations of the institution, students failing to maintain the requisite minimum attendance may be subject to academic consequences, which may include restriction from appearing in the end-semester examinations.
                            </p>

                            <p style="margin: 0 0 14px; color: #374151; font-size: 14px; line-height: 1.8; font-family: Arial, sans-serif;">
                                You are hereby advised to improve your attendance forthwith and to meet the undersigned at your earliest convenience to discuss the matter further.
                            </p>

                            <p style="margin: 0 0 6px; color: #374151; font-size: 14px; line-height: 1.8; font-family: Arial, sans-serif;">
                                Regards,
                            </p>
                            <p style="margin: 0 0 2px; color: #1e293b; font-size: 14px; font-weight: 700; font-family: Arial, sans-serif;">
                                ${data.hodName}
                            </p>
                            <p style="margin: 0; color: #64748b; font-size: 12px; font-family: Arial, sans-serif;">
                                Head of Department, ${data.department}
                            </p>
                            <p style="margin: 0; color: #64748b; font-size: 12px; font-family: Arial, sans-serif;">
                                Yogoda Satsanga Mahavidyalaya, Ranchi
                            </p>
                        </td>
                    </tr>

                    <!-- Attachment Notice -->
                    <tr>
                        <td style="padding: 0 36px 20px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px;">
                                <tr>
                                    <td style="padding: 12px 16px; font-family: Arial, sans-serif;">
                                        <p style="margin: 0; color: #1e40af; font-size: 13px; font-weight: 600;">
                                            📎 Attachment: Attendance Report Card (PDF)
                                        </p>
                                        <p style="margin: 4px 0 0; color: #3b82f6; font-size: 12px;">
                                            Please download and review the attached document for the complete subject-wise attendance breakdown.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f1f5f9; padding: 16px 36px; border-top: 1px solid #e2e8f0; text-align: center;">
                            <p style="margin: 0; color: #94a3b8; font-size: 10px; font-family: Arial, sans-serif; letter-spacing: 0.3px;">
                                This is a computer-generated communication from the Attendance Management System of Yogoda Satsanga Mahavidyalaya.
                            </p>
                            <p style="margin: 4px 0 0; color: #94a3b8; font-size: 10px; font-family: Arial, sans-serif;">
                                For any discrepancies in the attendance record, please contact your respective department office directly.
                            </p>
                            <p style="margin: 6px 0 0; color: #cbd5e1; font-size: 9px; font-family: Arial, sans-serif;">
                                Sent to: ${data.studentEmail} &bull; Please do not reply to this email.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

// ============================================================
// Plain Text Version (Anti-Spam: Gmail requires both HTML + Text)
// ============================================================

function generatePlainText(data: StudentReportData): string {
    const currentDate = new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return `
YOGODA SATSANGA MAHAVIDYALAYA
Established 1967 | NAAC Accredited Grade 'B'++
Jagannathpur, Dhurwa, Ranchi-834004
=================================================

Date: ${currentDate}

Subject: Monthly Attendance Report${data.reportMonth ? ` — ${data.reportMonth}` : ''} — Attendance Below Minimum Requirement

Dear ${data.studentName},

This is to inform you that as per the attendance records maintained by the Department of ${data.department}${data.reportPeriod ? ` for the period ${data.reportPeriod}` : `, Semester ${data.semester}`}, your attendance has been recorded at ${data.percentage}%, which is below the minimum mandatory attendance requirement of 60% prescribed by the college.

STUDENT DETAILS
- Name: ${data.studentName}
- Roll Number: ${data.rollNumber}
- Department: ${data.department}
- Semester: ${data.semester}
- Total Classes Held: ${data.totalClasses}
- Classes Attended: ${data.attendedClasses}
- Overall Attendance: ${data.percentage}%

Your detailed Attendance Report Card has been enclosed as a PDF attachment with this communication for your reference and records.

As per the regulations of the institution, students failing to maintain the requisite minimum attendance may be subject to academic consequences, which may include restriction from appearing in the end-semester examinations.

You are hereby advised to improve your attendance forthwith and to meet the undersigned at your earliest convenience.

Regards,
${data.hodName}
Head of Department, ${data.department}
Yogoda Satsanga Mahavidyalaya, Ranchi

---
This is a computer-generated communication from the Attendance Management System.
For any discrepancies, please contact your respective department office directly.
Sent to: ${data.studentEmail}
`;
}

// ============================================================
// Send Report Card Email with PDF Attachment
// ============================================================

export async function sendReportCardEmail(data: StudentReportData): Promise<{ success: boolean; error?: string }> {
    const config = await getEmailConfig();

    if (!config.email || !config.password) {
        return { success: false, error: 'Email credentials not configured. Please set up email in Settings.' };
    }

    if (!data.studentEmail) {
        return { success: false, error: `No email address for student ${data.studentName}` };
    }

    try {
        // Generate PDF report card
        const pdfData: PDFReportData = {
            studentName: data.studentName,
            studentId: data.studentId,
            rollNumber: data.rollNumber,
            department: data.department,
            semester: data.semester,
            totalClasses: data.totalClasses,
            attendedClasses: data.attendedClasses,
            percentage: data.percentage,
            hodName: data.hodName,
            subjects: data.subjects,
            reportPeriod: data.reportPeriod,
        };

        const pdfBuffer = await generateReportCardPDF(pdfData);
        const fromName = process.env.EMAIL_FROM_NAME || 'YSM Attendance System';
        const transporter = createTransport(config.email, config.password);

        const monthSuffix = data.reportMonth ? `_${data.reportMonth.replace(/\s+/g, '_')}` : '';

        const mailOptions = {
            from: `"${fromName}" <${config.email}>`,
            to: data.studentEmail,
            subject: `Attendance Report Card${data.reportMonth ? ` — ${data.reportMonth}` : ''} — ${data.studentName} (${data.percentage}%)`,
            // Both HTML and plain text (critical for anti-spam)
            html: generateEmailHTML(data),
            text: generatePlainText(data),
            // Attach PDF report card
            attachments: [
                {
                    filename: `Report_Card_${data.studentName.replace(/\s+/g, '_')}${monthSuffix}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                },
            ],
            // Anti-spam headers
            headers: {
                'X-Priority': '3', // Normal priority (1=high triggers spam)
                'X-Mailer': 'YSM Attendance System',
            },
        };

        await transporter.sendMail(mailOptions);
        transporter.close();

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown email error';
        console.error(`[Email] Failed to send to ${data.studentEmail}:`, message);
        return { success: false, error: message };
    }
}

// ============================================================
// Batch Send with Rate Limiting (for monthly cron)
// ============================================================

export async function sendBatchReportEmails(
    students: StudentReportData[]
): Promise<{ sent: number; failed: number; errors: string[] }> {
    const result = { sent: 0, failed: 0, errors: [] as string[] };

    const config = await getEmailConfig();

    if (!config.email || !config.password) {
        result.errors.push('Email credentials not configured in Settings');
        return result;
    }

    // Process in batches of 5 with 5-second delay between batches
    // (PDF generation + email sending is heavier than plain HTML)
    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 5000;

    for (let i = 0; i < students.length; i += BATCH_SIZE) {
        const batch = students.slice(i, i + BATCH_SIZE);

        // Send each email in the batch sequentially to avoid memory spikes from PDF generation
        for (const student of batch) {
            const res = await sendReportCardEmail(student);
            if (res.success) {
                result.sent++;
                console.log(`[Email] Sent PDF report to ${student.studentEmail}`);
            } else {
                result.failed++;
                result.errors.push(`${student.studentName}: ${res.error}`);
            }
        }

        // Delay between batches to avoid Gmail rate limits and spam flags
        if (i + BATCH_SIZE < students.length) {
            await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
    }

    return result;
}
