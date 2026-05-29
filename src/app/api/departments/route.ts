import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const currentSession = await queryOne<{ id: string }>(
            `SELECT id FROM academic_sessions WHERE is_current = true LIMIT 1`
        );
        const sessionId = currentSession?.id;

        if (!sessionId) {
            return NextResponse.json({ departments: [] });
        }

        const classSections = await query<any>(
            `SELECT cs.id, (c.name || ' - ' || s.name) as name, c.name as code
             FROM class_sections cs
             JOIN classes c ON c.id = cs.class_id
             JOIN sections s ON s.id = cs.section_id
             WHERE cs.session_id = $1
             ORDER BY c.display_order ASC, s.name ASC`,
            [sessionId]
        );

        return NextResponse.json({
            departments: classSections.map(cs => ({
                id: cs.id,
                name: cs.name,
                code: cs.code,
                deptType: 'regular'
            }))
        });
    } catch (error) {
        console.error('Get departments mapping error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
