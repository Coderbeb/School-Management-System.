import { queryOne } from '@/lib/db';

interface WhatsAppPayload {
    phone: string;
    message: string;
}

interface WhatsAppConfig {
    provider: 'meta' | 'twilio' | 'gupshup';
    apiKey: string;
    phoneNumberId: string;
}

/**
 * Get WhatsApp configuration from school_settings
 */
async function getWhatsAppConfig(): Promise<WhatsAppConfig | null> {
    try {
        const keys = ['whatsapp_provider', 'whatsapp_api_key', 'whatsapp_phone_number_id'];
        const results: Record<string, string> = {};

        for (const key of keys) {
            const row = await queryOne<{ value: any }>(`SELECT value FROM school_settings WHERE key = $1`, [key]);
            if (row) {
                const val = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
                results[key] = val.replace(/^"|"$/g, '');
            }
        }

        if (!results.whatsapp_api_key) {
            return null;
        }

        return {
            provider: (results.whatsapp_provider as WhatsAppConfig['provider']) || 'meta',
            apiKey: results.whatsapp_api_key,
            phoneNumberId: results.whatsapp_phone_number_id || '',
        };
    } catch (error) {
        console.error('[WhatsAppProvider] Failed to get config:', error);
        return null;
    }
}

/**
 * Format phone number to international format (India +91)
 */
function formatPhone(phone: string): string {
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
    if (cleaned.length === 10) cleaned = '91' + cleaned;
    if (!cleaned.startsWith('91') && cleaned.length === 10) cleaned = '91' + cleaned;
    return cleaned;
}

/**
 * Send WhatsApp message via Meta Cloud API
 */
async function sendViaMeta(config: WhatsAppConfig, payload: WhatsAppPayload): Promise<{ success: boolean; error?: string }> {
    try {
        const phone = formatPhone(payload.phone);
        const res = await fetch(
            `https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: phone,
                    type: 'text',
                    text: { body: payload.message },
                }),
            }
        );

        if (!res.ok) {
            const err = await res.json();
            return { success: false, error: JSON.stringify(err.error || err) };
        }
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Send WhatsApp message via Twilio
 */
async function sendViaTwilio(config: WhatsAppConfig, payload: WhatsAppPayload): Promise<{ success: boolean; error?: string }> {
    try {
        const phone = formatPhone(payload.phone);
        // config.phoneNumberId = Twilio Account SID
        // config.apiKey = Twilio Auth Token
        // For Twilio, we need from number in a different config but we'll use phoneNumberId as the from whatsapp number
        const accountSid = config.phoneNumberId;
        const authToken = config.apiKey;

        const res = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            {
                method: 'POST',
                headers: {
                    Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    To: `whatsapp:+${phone}`,
                    From: `whatsapp:+${config.phoneNumberId}`,
                    Body: payload.message,
                }),
            }
        );

        if (!res.ok) {
            const err = await res.json();
            return { success: false, error: JSON.stringify(err) };
        }
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Send WhatsApp message (routes to appropriate provider)
 */
export async function sendWhatsApp(payload: WhatsAppPayload): Promise<{ success: boolean; error?: string; mock?: boolean }> {
    const config = await getWhatsAppConfig();

    if (!config) {
        // Mock mode — log but don't actually send
        console.log(`[WhatsApp-MOCK] → ${payload.phone}: ${payload.message.substring(0, 80)}...`);
        return { success: true, mock: true };
    }

    switch (config.provider) {
        case 'meta':
            return sendViaMeta(config, payload);
        case 'twilio':
            return sendViaTwilio(config, payload);
        default:
            // If provider not recognized, use mock mode
            console.log(`[WhatsApp-MOCK] Unknown provider ${config.provider} → ${payload.phone}`);
            return { success: true, mock: true };
    }
}

/**
 * Send a test WhatsApp message
 */
export async function sendTestWhatsApp(phone: string): Promise<{ success: boolean; error?: string; mock?: boolean }> {
    return sendWhatsApp({
        phone,
        message: '✅ *Test Message — School Management System*\n\nYour WhatsApp integration is working correctly!\n\nThis is a test message sent at ' + new Date().toLocaleString('en-IN') + '.',
    });
}

// ─── WhatsApp Message Templates ──────────────────────────────────

export function buildFeeReceiptWhatsApp(vars: Record<string, string>): string {
    return `✅ *Fee Payment Received*

Student: ${vars.studentName}
Amount: ₹${vars.amount}
Receipt: ${vars.receiptNo}
Mode: ${vars.paymentMode}
Date: ${vars.date}

Thank you! — ${vars.schoolName}`;
}

export function buildResultWhatsApp(vars: Record<string, string>): string {
    return `📊 *Exam Result Published*

Student: ${vars.studentName}
Exam: ${vars.examName}
Total: ${vars.totalMarks}/${vars.maxMarks}
Percentage: ${vars.percentage}%

Login to view full report card.
— ${vars.schoolName}`;
}

export function buildAttendanceAlertWhatsApp(vars: Record<string, string>): string {
    return `⚠️ *Attendance Alert*

Dear Parent,
${vars.studentName}'s attendance for ${vars.month} is ${vars.percentage}% (below 60%).

Present: ${vars.presentDays}/${vars.totalDays} days
Absent: ${vars.absentDays} days

Please ensure regular attendance.
— ${vars.schoolName}`;
}

export function buildFeeOverdueWhatsApp(vars: Record<string, string>): string {
    return `🔔 *Fee Payment Reminder*

Dear Parent,
${vars.studentName} has an overdue fee of ₹${vars.amount}.
Due Date: ${vars.dueDate} (${vars.overdueDays} days overdue)

Please pay at the earliest.
— ${vars.schoolName}`;
}

export function buildBookDueReminderWhatsApp(vars: Record<string, string>): string {
    return `📚 *Library Book Due Soon*

Dear Parent,
${vars.studentName}'s library book is due soon.

Book: ${vars.bookTitle}
Due Date: ${vars.dueDate}
Days Left: ${vars.daysLeft}

Please return or renew before the due date.
— ${vars.schoolName}`;
}

export function buildBookOverdueWhatsApp(vars: Record<string, string>): string {
    return `⚠️ *Library Book Overdue*

Dear Parent,
${vars.studentName} has an overdue library book.

Book: ${vars.bookTitle}
Due Date: ${vars.dueDate}
Overdue: ${vars.overdueDays} days
Fine: ₹${vars.fineAmount}

Please return the book immediately.
— ${vars.schoolName}`;
}

export function buildReservationAvailableWhatsApp(vars: Record<string, string>): string {
    return `🔖 *Reserved Book Available!*

Dear ${vars.studentName},
The book you reserved is now available!

Book: ${vars.bookTitle}
Author: ${vars.bookAuthor}
Collect Before: ${vars.collectBy}

Visit the library to collect your book.
— ${vars.schoolName}`;
}

export function buildBookIssuedWhatsApp(vars: Record<string, string>): string {
    return `📖 *Book Issued*

Student: ${vars.studentName}
Book: ${vars.bookTitle}
Issue Date: ${vars.issueDate}
Due Date: ${vars.dueDate}

Please return or renew before the due date.
— ${vars.schoolName}`;
}
