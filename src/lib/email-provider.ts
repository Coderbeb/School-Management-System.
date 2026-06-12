import nodemailer from 'nodemailer';
import { queryOne } from '@/lib/db';

interface EmailPayload {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

interface SMTPConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    fromEmail: string;
    fromName: string;
}

/**
 * Get SMTP configuration from school_settings
 */
async function getSMTPConfig(): Promise<SMTPConfig | null> {
    try {
        const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_email', 'smtp_from_name'];
        const results: Record<string, string> = {};

        for (const key of keys) {
            const row = await queryOne<{ value: any }>(`SELECT value FROM school_settings WHERE key = $1`, [key]);
            if (row) {
                const val = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
                results[key] = val.replace(/^"|"$/g, ''); // strip JSONB quotes
            }
        }

        if (!results.smtp_host || !results.smtp_user || !results.smtp_password) {
            return null;
        }

        return {
            host: results.smtp_host,
            port: parseInt(results.smtp_port || '587', 10),
            user: results.smtp_user,
            password: results.smtp_password,
            fromEmail: results.smtp_from_email || results.smtp_user,
            fromName: results.smtp_from_name || 'School Management System',
        };
    } catch (error) {
        console.error('[EmailProvider] Failed to get SMTP config:', error);
        return null;
    }
}

/**
 * Send an email using Nodemailer
 */
export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; error?: string }> {
    const config = await getSMTPConfig();

    if (!config) {
        return { success: false, error: 'SMTP not configured. Go to Settings → Notifications to set up email.' };
    }

    try {
        const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.port === 465,
            auth: {
                user: config.user,
                pass: config.password,
            },
        });

        await transporter.sendMail({
            from: `"${config.fromName}" <${config.fromEmail}>`,
            to: payload.to,
            subject: payload.subject,
            html: payload.html,
            text: payload.text || '',
        });

        return { success: true };
    } catch (error: any) {
        console.error('[EmailProvider] Send failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send a test email to verify SMTP configuration
 */
export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; error?: string }> {
    return sendEmail({
        to: toEmail,
        subject: '✅ Test Email — School Management System',
        html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #f8fafc; border-radius: 16px;">
                <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #3b82f6, #6366f1); border-radius: 12px; margin-bottom: 20px;">
                    <h1 style="color: white; margin: 0; font-size: 22px;">✅ Email Connected!</h1>
                </div>
                <p style="color: #334155; font-size: 14px; line-height: 1.6;">
                    Your SMTP email configuration is working correctly. The School Management System can now send automated notifications via email.
                </p>
                <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">
                    This is a test email sent at ${new Date().toLocaleString('en-IN')}.
                </p>
            </div>
        `,
    });
}

// ─── Email Templates ────────────────────────────────────────────────

export function buildFeeReceiptEmail(vars: Record<string, string>): { subject: string; html: string } {
    return {
        subject: `✅ Fee Payment Receipt — ${vars.studentName}`,
        html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #f8fafc; border-radius: 16px;">
            <div style="padding: 20px; background: linear-gradient(135deg, #059669, #10b981); border-radius: 12px; color: white; margin-bottom: 20px;">
                <h2 style="margin: 0 0 4px 0; font-size: 18px;">✅ Fee Payment Received</h2>
                <p style="margin: 0; font-size: 13px; opacity: 0.9;">${vars.schoolName}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
                <tr><td style="padding: 8px 0; color: #64748b;">Student</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${vars.studentName}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Amount</td><td style="padding: 8px 0; font-weight: 700; text-align: right; color: #059669; font-size: 18px;">₹${vars.amount}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Receipt #</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${vars.receiptNo}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Mode</td><td style="padding: 8px 0; text-align: right;">${vars.paymentMode}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Date</td><td style="padding: 8px 0; text-align: right;">${vars.date}</td></tr>
            </table>
            <p style="color: #94a3b8; font-size: 11px; margin-top: 20px; text-align: center;">Thank you for the payment!</p>
        </div>`,
    };
}

export function buildResultEmail(vars: Record<string, string>): { subject: string; html: string } {
    return {
        subject: `📊 Exam Result Published — ${vars.studentName}`,
        html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #f8fafc; border-radius: 16px;">
            <div style="padding: 20px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px; color: white; margin-bottom: 20px;">
                <h2 style="margin: 0 0 4px 0; font-size: 18px;">📊 Exam Result Published</h2>
                <p style="margin: 0; font-size: 13px; opacity: 0.9;">${vars.schoolName}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
                <tr><td style="padding: 8px 0; color: #64748b;">Student</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${vars.studentName}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Exam</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${vars.examName}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Total</td><td style="padding: 8px 0; font-weight: 700; text-align: right; font-size: 18px;">${vars.totalMarks}/${vars.maxMarks}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Percentage</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${vars.percentage}%</td></tr>
            </table>
            <p style="color: #64748b; font-size: 12px; margin-top: 16px; text-align: center;">Login to view the full report card.</p>
        </div>`,
    };
}

export function buildAttendanceAlertEmail(vars: Record<string, string>): { subject: string; html: string } {
    return {
        subject: `⚠️ Low Attendance Alert — ${vars.studentName}`,
        html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #fff7ed; border-radius: 16px; border: 1px solid #fed7aa;">
            <div style="padding: 20px; background: linear-gradient(135deg, #ea580c, #f97316); border-radius: 12px; color: white; margin-bottom: 20px;">
                <h2 style="margin: 0 0 4px 0; font-size: 18px;">⚠️ Attendance Alert</h2>
                <p style="margin: 0; font-size: 13px; opacity: 0.9;">${vars.schoolName}</p>
            </div>
            <p style="color: #9a3412; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
                Dear Parent, <strong>${vars.studentName}</strong>'s attendance for <strong>${vars.month}</strong> is <strong style="color: #dc2626;">${vars.percentage}%</strong> (below 60%).
            </p>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
                <tr><td style="padding: 8px 0; color: #64748b;">Present</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${vars.presentDays}/${vars.totalDays} days</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Absent</td><td style="padding: 8px 0; font-weight: 700; text-align: right; color: #dc2626;">${vars.absentDays} days</td></tr>
            </table>
            <p style="color: #9a3412; font-size: 13px; margin-top: 16px;">Please ensure regular attendance.</p>
        </div>`,
    };
}

export function buildBookDueReminderEmail(vars: Record<string, string>): { subject: string; html: string } {
    return {
        subject: `📚 Book Due Reminder — ${vars.studentName}`,
        html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #f0f9ff; border-radius: 16px; border: 1px solid #bae6fd;">
            <div style="padding: 20px; background: linear-gradient(135deg, #0284c7, #0ea5e9); border-radius: 12px; color: white; margin-bottom: 20px;">
                <h2 style="margin: 0 0 4px 0; font-size: 18px;">📚 Library Book Due Soon</h2>
                <p style="margin: 0; font-size: 13px; opacity: 0.9;">${vars.schoolName}</p>
            </div>
            <p style="color: #0c4a6e; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
                Dear Parent, <strong>${vars.studentName}</strong>'s library book is due soon.
            </p>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
                <tr><td style="padding: 8px 0; color: #64748b;">Book</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${vars.bookTitle}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Due Date</td><td style="padding: 8px 0; font-weight: 700; text-align: right; color: #0284c7;">${vars.dueDate}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Days Left</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${vars.daysLeft} days</td></tr>
            </table>
            <p style="color: #0c4a6e; font-size: 13px; margin-top: 16px;">Please return or renew the book before the due date to avoid fines.</p>
        </div>`,
    };
}

export function buildBookOverdueEmail(vars: Record<string, string>): { subject: string; html: string } {
    return {
        subject: `⚠️ Library Book Overdue — ${vars.studentName}`,
        html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #fef2f2; border-radius: 16px; border: 1px solid #fecaca;">
            <div style="padding: 20px; background: linear-gradient(135deg, #dc2626, #ef4444); border-radius: 12px; color: white; margin-bottom: 20px;">
                <h2 style="margin: 0 0 4px 0; font-size: 18px;">⚠️ Library Book Overdue</h2>
                <p style="margin: 0; font-size: 13px; opacity: 0.9;">${vars.schoolName}</p>
            </div>
            <p style="color: #991b1b; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
                Dear Parent, <strong>${vars.studentName}</strong> has an overdue library book.
            </p>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
                <tr><td style="padding: 8px 0; color: #64748b;">Book</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${vars.bookTitle}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Due Date</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${vars.dueDate}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Overdue By</td><td style="padding: 8px 0; font-weight: 700; text-align: right; color: #dc2626;">${vars.overdueDays} days</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Fine</td><td style="padding: 8px 0; font-weight: 700; text-align: right; color: #dc2626; font-size: 18px;">₹${vars.fineAmount}</td></tr>
            </table>
            <p style="color: #991b1b; font-size: 13px; margin-top: 16px;">Please return the book to the library immediately.</p>
        </div>`,
    };
}

export function buildReservationAvailableEmail(vars: Record<string, string>): { subject: string; html: string } {
    return {
        subject: `🔖 Reserved Book Available — ${vars.studentName}`,
        html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #f0fdf4; border-radius: 16px; border: 1px solid #bbf7d0;">
            <div style="padding: 20px; background: linear-gradient(135deg, #059669, #10b981); border-radius: 12px; color: white; margin-bottom: 20px;">
                <h2 style="margin: 0 0 4px 0; font-size: 18px;">🔖 Reserved Book Now Available!</h2>
                <p style="margin: 0; font-size: 13px; opacity: 0.9;">${vars.schoolName}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
                <tr><td style="padding: 8px 0; color: #64748b;">Book</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${vars.bookTitle}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Author</td><td style="padding: 8px 0; text-align: right;">${vars.bookAuthor}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Collect Before</td><td style="padding: 8px 0; font-weight: 700; text-align: right; color: #059669;">${vars.collectBy}</td></tr>
            </table>
            <p style="color: #065f46; font-size: 13px; margin-top: 16px;">Visit the library to collect your reserved book.</p>
        </div>`,
    };
}

export function buildBookIssuedEmail(vars: Record<string, string>): { subject: string; html: string } {
    return {
        subject: `📖 Book Issued — ${vars.studentName}`,
        html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #f8fafc; border-radius: 16px;">
            <div style="padding: 20px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px; color: white; margin-bottom: 20px;">
                <h2 style="margin: 0 0 4px 0; font-size: 18px;">📖 Book Issued</h2>
                <p style="margin: 0; font-size: 13px; opacity: 0.9;">${vars.schoolName}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
                <tr><td style="padding: 8px 0; color: #64748b;">Student</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${vars.studentName}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Book</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${vars.bookTitle}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Issue Date</td><td style="padding: 8px 0; text-align: right;">${vars.issueDate}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Due Date</td><td style="padding: 8px 0; font-weight: 700; text-align: right; color: #6366f1;">${vars.dueDate}</td></tr>
            </table>
            <p style="color: #64748b; font-size: 12px; margin-top: 16px; text-align: center;">Please return or renew before the due date.</p>
        </div>`,
    };
}

export function buildFeeOverdueEmail(vars: Record<string, string>): { subject: string; html: string } {
    return {
        subject: `🔔 Fee Overdue Reminder — ${vars.studentName}`,
        html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #fef2f2; border-radius: 16px; border: 1px solid #fecaca;">
            <div style="padding: 20px; background: linear-gradient(135deg, #dc2626, #ef4444); border-radius: 12px; color: white; margin-bottom: 20px;">
                <h2 style="margin: 0 0 4px 0; font-size: 18px;">🔔 Fee Payment Reminder</h2>
                <p style="margin: 0; font-size: 13px; opacity: 0.9;">${vars.schoolName}</p>
            </div>
            <p style="color: #991b1b; font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
                Dear Parent, <strong>${vars.studentName}</strong> has an overdue fee payment.
            </p>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
                <tr><td style="padding: 8px 0; color: #64748b;">Amount Due</td><td style="padding: 8px 0; font-weight: 700; text-align: right; color: #dc2626; font-size: 18px;">₹${vars.amount}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Due Date</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${vars.dueDate}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Overdue</td><td style="padding: 8px 0; font-weight: 600; text-align: right; color: #dc2626;">${vars.overdueDays} days</td></tr>
            </table>
            <p style="color: #991b1b; font-size: 13px; margin-top: 16px;">Please pay at the earliest to avoid further escalation.</p>
        </div>`,
    };
}
