import { query, queryOne } from '@/lib/db';
import { sendEmail, buildFeeReceiptEmail, buildResultEmail, buildAttendanceAlertEmail, buildFeeOverdueEmail } from '@/lib/email-provider';
import { sendWhatsApp, buildFeeReceiptWhatsApp, buildResultWhatsApp, buildAttendanceAlertWhatsApp, buildFeeOverdueWhatsApp } from '@/lib/whatsapp-provider';

export type NotificationEvent = 'fee_receipt' | 'result_published' | 'low_attendance' | 'fee_overdue';

interface SendNotificationParams {
    schoolId: string;
    studentId: string;
    event: NotificationEvent;
    variables: Record<string, string>;
    /** Override: send directly to this phone (skip student lookup) */
    overridePhone?: string;
    /** Override: send directly to this email (skip student lookup) */
    overrideEmail?: string;
}

interface NotificationResult {
    emailSent: boolean;
    whatsappSent: boolean;
    emailError?: string;
    whatsappError?: string;
}

/**
 * Check if a notification channel is enabled in school_settings
 */
async function isChannelEnabled(channel: 'notification_email_enabled' | 'notification_whatsapp_enabled'): Promise<boolean> {
    try {
        const row = await queryOne<{ value: any }>(`SELECT value FROM school_settings WHERE key = $1`, [channel]);
        if (!row) return false;
        const val = typeof row.value === 'boolean' ? row.value : row.value === true || row.value === 'true';
        return val;
    } catch {
        return false;
    }
}

/**
 * Get school name from settings
 */
async function getSchoolName(): Promise<string> {
    try {
        const row = await queryOne<{ value: any }>(`SELECT value FROM school_settings WHERE key = 'school_name'`);
        if (row) {
            const val = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
            return val.replace(/^"|"$/g, '') || 'School';
        }
        return 'School';
    } catch {
        return 'School';
    }
}

/**
 * Get student + guardian contact info
 */
async function getStudentContact(studentId: string): Promise<{ phone: string; email: string; studentName: string } | null> {
    try {
        const student = await queryOne<any>(
            `SELECT first_name, last_name, guardian_phone, guardian_email FROM students WHERE id = $1`,
            [studentId]
        );
        if (!student) return null;
        return {
            phone: student.guardian_phone || '',
            email: student.guardian_email || '',
            studentName: `${student.first_name} ${student.last_name}`,
        };
    } catch {
        return null;
    }
}

/**
 * Log a notification attempt to the database
 */
async function logNotification(params: {
    schoolId: string;
    studentId: string;
    event: string;
    channel: 'whatsapp' | 'email';
    phone?: string;
    email?: string;
    messageBody: string;
    status: 'sent' | 'failed' | 'mock';
    error?: string;
}) {
    try {
        await query(
            `INSERT INTO notification_log (school_id, student_id, event_type, channel, recipient_phone, recipient_email, template_key, message_body, status, error_message, sent_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
                params.schoolId,
                params.studentId,
                params.event,
                params.channel,
                params.phone || null,
                params.email || null,
                params.event,
                params.messageBody.substring(0, 500),
                params.status,
                params.error || null,
                params.status === 'sent' || params.status === 'mock' ? new Date().toISOString() : null,
            ]
        );
    } catch (err) {
        console.error('[Notification] Failed to log notification:', err);
    }
}

/**
 * Build message content based on event type
 */
function buildMessages(event: NotificationEvent, vars: Record<string, string>) {
    switch (event) {
        case 'fee_receipt':
            return {
                whatsapp: buildFeeReceiptWhatsApp(vars),
                email: buildFeeReceiptEmail(vars),
            };
        case 'result_published':
            return {
                whatsapp: buildResultWhatsApp(vars),
                email: buildResultEmail(vars),
            };
        case 'low_attendance':
            return {
                whatsapp: buildAttendanceAlertWhatsApp(vars),
                email: buildAttendanceAlertEmail(vars),
            };
        case 'fee_overdue':
            return {
                whatsapp: buildFeeOverdueWhatsApp(vars),
                email: buildFeeOverdueEmail(vars),
            };
    }
}

/**
 * Central notification dispatcher
 * 
 * Usage:
 * ```
 * await sendNotification({
 *   schoolId, studentId,
 *   event: 'fee_receipt',
 *   variables: { studentName, amount, receiptNo, paymentMode, date },
 * });
 * ```
 */
export async function sendNotification(params: SendNotificationParams): Promise<NotificationResult> {
    const result: NotificationResult = { emailSent: false, whatsappSent: false };

    try {
        // Get contact info
        const contact = await getStudentContact(params.studentId);
        const phone = params.overridePhone || contact?.phone || '';
        const email = params.overrideEmail || contact?.email || '';
        const schoolName = await getSchoolName();

        // Inject school name into variables
        const vars = { ...params.variables, schoolName };
        if (contact?.studentName && !vars.studentName) {
            vars.studentName = contact.studentName;
        }

        const messages = buildMessages(params.event, vars);

        // Check channels & send
        const emailEnabled = await isChannelEnabled('notification_email_enabled');
        const whatsappEnabled = await isChannelEnabled('notification_whatsapp_enabled');

        // Send WhatsApp
        if (whatsappEnabled && phone) {
            const waResult = await sendWhatsApp({ phone, message: messages.whatsapp });
            result.whatsappSent = waResult.success;
            result.whatsappError = waResult.error;

            await logNotification({
                schoolId: params.schoolId,
                studentId: params.studentId,
                event: params.event,
                channel: 'whatsapp',
                phone,
                messageBody: messages.whatsapp,
                status: waResult.mock ? 'mock' : waResult.success ? 'sent' : 'failed',
                error: waResult.error,
            });
        }

        // Send Email
        if (emailEnabled && email) {
            const emailResult = await sendEmail({
                to: email,
                subject: messages.email.subject,
                html: messages.email.html,
            });
            result.emailSent = emailResult.success;
            result.emailError = emailResult.error;

            await logNotification({
                schoolId: params.schoolId,
                studentId: params.studentId,
                event: params.event,
                channel: 'email',
                email,
                messageBody: messages.email.subject,
                status: emailResult.success ? 'sent' : 'failed',
                error: emailResult.error,
            });
        }
    } catch (error: any) {
        console.error('[Notification] Error in sendNotification:', error);
    }

    return result;
}
