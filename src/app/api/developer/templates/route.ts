import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = verifyToken(authHeader.substring(7));
    if (!user || user.role !== 'developer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    try {
        const templates = await query(`
            SELECT t.*, gs.name as grading_scale_name
            FROM school_board_templates t
            LEFT JOIN grading_scales gs ON t.grading_scale_id = gs.id
            ORDER BY t.board_type ASC
        `);
        return NextResponse.json({ templates });
    } catch (error) {
        console.error('Error fetching templates:', error);
        return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }
}
