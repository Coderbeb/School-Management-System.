import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';

// GET: List all available mark components (Theory, Practical, etc.)
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request);
    if (auth.error) return auth.error;

    try {
        const result = await query<any>(
            `SELECT * FROM mark_components ORDER BY display_order ASC`
        );
        return NextResponse.json({ components: result });
    } catch (error) {
        console.error('Error fetching mark components:', error);
        return NextResponse.json({ error: 'Failed to fetch mark components' }, { status: 500 });
    }
}
