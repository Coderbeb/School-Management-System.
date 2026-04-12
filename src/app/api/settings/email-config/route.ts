import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// ============================================================
// Email Config Settings API (Super Admin Only)
// Stores email credentials & enabled toggle in application_settings
// ============================================================

interface EmailConfigRow {
    value: {
        email: string;
        password: string;
        enabled: boolean;
    };
}

// GET — Fetch current email configuration
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);

        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const row = await queryOne<EmailConfigRow>(
            `SELECT value FROM application_settings WHERE key = 'email_config'`
        );

        if (row && row.value) {
            return NextResponse.json({
                email: row.value.email || '',
                // Mask password — only send last 4 chars for display
                passwordSet: !!row.value.password,
                passwordHint: row.value.password ? `****${row.value.password.slice(-4)}` : '',
                enabled: row.value.enabled ?? false,
            });
        }

        // Fallback: check .env for existing config
        const envEmail = process.env.EMAIL_USER || '';
        const envPass = process.env.EMAIL_PASS || '';

        return NextResponse.json({
            email: envEmail,
            passwordSet: !!envPass,
            passwordHint: envPass ? `****${envPass.slice(-4)}` : '',
            enabled: false,
        });
    } catch (error) {
        console.error('Email config fetch error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST — Save email configuration
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);

        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const body = await request.json();
        const { email, password, enabled } = body;

        // Validation
        if (enabled && (!email || !password)) {
            return NextResponse.json(
                { error: 'Email and password are required to enable the feature' },
                { status: 400 }
            );
        }

        if (email && !email.includes('@')) {
            return NextResponse.json(
                { error: 'Please enter a valid email address' },
                { status: 400 }
            );
        }

        // If password is not provided, keep the existing password
        let finalPassword = password;
        if (!password || password === '') {
            const existing = await queryOne<EmailConfigRow>(
                `SELECT value FROM application_settings WHERE key = 'email_config'`
            );
            if (existing && existing.value && existing.value.password) {
                finalPassword = existing.value.password;
            } else {
                // Fallback to .env
                finalPassword = process.env.EMAIL_PASS || '';
            }
        }

        const configValue = {
            email: email || '',
            password: finalPassword || '',
            enabled: !!enabled,
        };

        await query(
            `INSERT INTO application_settings (key, value, updated_at) 
             VALUES ('email_config', $1::jsonb, CURRENT_TIMESTAMP) 
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
            [JSON.stringify(configValue)]
        );

        return NextResponse.json({
            message: 'Email configuration saved successfully',
            enabled: configValue.enabled,
        });
    } catch (error) {
        console.error('Email config save error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
