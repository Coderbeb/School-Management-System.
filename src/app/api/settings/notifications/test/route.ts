import { NextRequest, NextResponse } from 'next/server';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';
import { sendTestEmail } from '@/lib/email-provider';
import { sendTestWhatsApp } from '@/lib/whatsapp-provider';

/**
 * POST /api/settings/notifications/test — Send test email or WhatsApp
 */
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School context required' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const { type, target } = body;

        if (type === 'email') {
            if (!target || !target.includes('@')) {
                return NextResponse.json({ error: 'Valid test email address required' }, { status: 400 });
            }
            const res = await sendTestEmail(target);
            if (!res.success) {
                return NextResponse.json({ error: res.error || 'Failed to send test email' }, { status: 400 });
            }
            return NextResponse.json({ success: true, message: 'Test email sent successfully' });
        } else if (type === 'whatsapp') {
            if (!target) {
                return NextResponse.json({ error: 'Test phone number required' }, { status: 400 });
            }
            const res = await sendTestWhatsApp(target);
            if (!res.success) {
                return NextResponse.json({ error: res.error || 'Failed to send test WhatsApp message' }, { status: 400 });
            }
            return NextResponse.json({
                success: true,
                message: res.mock ? 'Mock WhatsApp message logged successfully (Mock Mode)' : 'Test WhatsApp message sent successfully',
                mock: res.mock
            });
        } else {
            return NextResponse.json({ error: 'Invalid test type' }, { status: 400 });
        }
    } catch (error: any) {
        console.error('[Settings Notifications Test] Error:', error);
        return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
    }
}
