import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/settings/notifications — Fetch current SMTP & WhatsApp notification config
 * POST /api/settings/notifications — Save SMTP & WhatsApp notification config
 */

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School context required' }, { status: 400 });
    }

    try {
        const keys = [
            'notification_email_enabled',
            'notification_whatsapp_enabled',
            'smtp_host',
            'smtp_port',
            'smtp_user',
            'smtp_password',
            'smtp_from_email',
            'smtp_from_name',
            'whatsapp_provider',
            'whatsapp_api_key',
            'whatsapp_phone_number_id'
        ];

        const settings = await query<{ key: string; value: string }>(
            `SELECT key, value FROM school_settings WHERE school_id = $1 AND key = ANY($2)`,
            [schoolId, keys]
        );

        const settingsMap: Record<string, any> = {};
        for (const s of settings) {
            try {
                settingsMap[s.key] = JSON.parse(s.value);
            } catch {
                settingsMap[s.key] = s.value;
            }
        }

        return NextResponse.json({
            config: {
                notification_email_enabled: settingsMap['notification_email_enabled'] === true || settingsMap['notification_email_enabled'] === 'true',
                notification_whatsapp_enabled: settingsMap['notification_whatsapp_enabled'] === true || settingsMap['notification_whatsapp_enabled'] === 'true',
                smtp_host: settingsMap['smtp_host'] || '',
                smtp_port: settingsMap['smtp_port'] || '587',
                smtp_user: settingsMap['smtp_user'] || '',
                smtp_passwordSet: !!settingsMap['smtp_password'],
                smtp_passwordHint: settingsMap['smtp_password'] ? `••••${settingsMap['smtp_password'].slice(-4)}` : '',
                smtp_from_email: settingsMap['smtp_from_email'] || '',
                smtp_from_name: settingsMap['smtp_from_name'] || '',
                whatsapp_provider: settingsMap['whatsapp_provider'] || 'meta',
                whatsapp_api_key_set: !!settingsMap['whatsapp_api_key'],
                whatsapp_phone_number_id: settingsMap['whatsapp_phone_number_id'] || '',
            }
        });
    } catch (error) {
        console.error('[Settings Notifications GET] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch notification settings' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School context required' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const {
            notification_email_enabled,
            notification_whatsapp_enabled,
            smtp_host,
            smtp_port,
            smtp_user,
            smtp_password,
            smtp_from_email,
            smtp_from_name,
            whatsapp_provider,
            whatsapp_api_key,
            whatsapp_phone_number_id
        } = body;

        // Fetch existing settings first to preserve passwords if empty
        const existingKeys = ['smtp_password', 'whatsapp_api_key'];
        const existing = await query<{ key: string; value: string }>(
            `SELECT key, value FROM school_settings WHERE school_id = $1 AND key = ANY($2)`,
            [schoolId, existingKeys]
        );
        const existingMap: Record<string, string> = {};
        for (const s of existing) {
            try {
                existingMap[s.key] = JSON.parse(s.value);
            } catch {
                existingMap[s.key] = s.value;
            }
        }

        const finalSmtpPassword = smtp_password || existingMap['smtp_password'] || '';
        const finalWhatsappApiKey = whatsapp_api_key || existingMap['whatsapp_api_key'] || '';

        const settingsToSave = [
            { key: 'notification_email_enabled', value: !!notification_email_enabled },
            { key: 'notification_whatsapp_enabled', value: !!notification_whatsapp_enabled },
            { key: 'smtp_host', value: smtp_host || '' },
            { key: 'smtp_port', value: smtp_port || '587' },
            { key: 'smtp_user', value: smtp_user || '' },
            { key: 'smtp_password', value: finalSmtpPassword },
            { key: 'smtp_from_email', value: smtp_from_email || '' },
            { key: 'smtp_from_name', value: smtp_from_name || '' },
            { key: 'whatsapp_provider', value: whatsapp_provider || 'meta' },
            { key: 'whatsapp_api_key', value: finalWhatsappApiKey },
            { key: 'whatsapp_phone_number_id', value: whatsapp_phone_number_id || '' }
        ];

        for (const setting of settingsToSave) {
            await query(
                `INSERT INTO school_settings (key, value, school_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (key, school_id) DO UPDATE SET value = $2`,
                [setting.key, JSON.stringify(setting.value), schoolId]
            );
        }

        return NextResponse.json({ success: true, message: 'Notification settings saved successfully' });
    } catch (error) {
        console.error('[Settings Notifications POST] Error:', error);
        return NextResponse.json({ error: 'Failed to save notification settings' }, { status: 500 });
    }
}
