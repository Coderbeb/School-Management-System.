import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// GET batch mappings for any authenticated user (for batch label display)
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
        }

        // Get all batch mappings for all department types
        const rows = await query<{ key: string, value: any }>(
            `SELECT key, value FROM application_settings WHERE key LIKE 'batch_mapping_%'`
        );

        const result: Record<string, any> = {};
        rows.forEach(row => {
            // Extract dept type from key: "batch_mapping_regular" -> "regular"
            const deptType = row.key.replace('batch_mapping_', '');
            result[deptType] = row.value;
        });

        return NextResponse.json({ mappings: result });

    } catch (error) {
        console.error('Fetch batch config error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
