import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/notifications/log
 * Fetch notification history with filters.
 * Query params: event_type, channel, status, limit, offset
 */
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School context required' }, { status: 400 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const eventType = searchParams.get('event_type');
        const channel = searchParams.get('channel');
        const status = searchParams.get('status');
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
        const offset = parseInt(searchParams.get('offset') || '0');

        let sql = `
            SELECT nl.*,
                s.first_name || ' ' || s.last_name as student_name,
                s.admission_number
            FROM notification_log nl
            LEFT JOIN students s ON nl.student_id = s.id
            WHERE nl.school_id = $1
        `;
        const params: any[] = [schoolId];
        let idx = 2;

        if (eventType) {
            sql += ` AND nl.event_type = $${idx++}`;
            params.push(eventType);
        }
        if (channel) {
            sql += ` AND nl.channel = $${idx++}`;
            params.push(channel);
        }
        if (status) {
            sql += ` AND nl.status = $${idx++}`;
            params.push(status);
        }

        // Get total count
        const countSql = sql.replace(/SELECT nl\.\*,[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
        const countResult = await query<any>(countSql, params);
        const total = parseInt(countResult[0]?.total || '0');

        // Get paginated results
        sql += ` ORDER BY nl.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
        params.push(limit, offset);

        const logs = await query<any>(sql, params);

        // Get summary stats
        const stats = await query<any>(
            `SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
                COUNT(CASE WHEN status = 'mock' THEN 1 END) as mock,
                COUNT(CASE WHEN channel = 'whatsapp' THEN 1 END) as whatsapp,
                COUNT(CASE WHEN channel = 'email' THEN 1 END) as email
            FROM notification_log WHERE school_id = $1`,
            [schoolId]
        );

        return NextResponse.json({
            logs,
            total,
            limit,
            offset,
            stats: stats[0] || {},
        });
    } catch (error: any) {
        console.error('[notification-log] Error:', error);
        return NextResponse.json({ error: 'Failed to fetch notification log' }, { status: 500 });
    }
}
