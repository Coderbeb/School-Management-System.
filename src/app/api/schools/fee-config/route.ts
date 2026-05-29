import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/schools/fee-config — Return fee config flags for the school
 * PUT /api/schools/fee-config — Update fee config flags
 */

// GET: Return late_fee_enabled and concession_enabled
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        if (!schoolId) {
            return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });
        }

        const config = await queryOne<any>(
            `SELECT late_fee_enabled, concession_enabled FROM schools WHERE id = $1`,
            [schoolId]
        );

        if (!config) {
            return NextResponse.json({ error: 'School not found' }, { status: 404 });
        }

        return NextResponse.json({ config });
    } catch (error) {
        console.error('Error fetching fee config:', error);
        return NextResponse.json({ error: 'Failed to fetch fee config' }, { status: 500 });
    }
}

// PUT: Update fee config flags
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        if (!schoolId) {
            return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });
        }

        const { lateFeeEnabled, concessionEnabled } = await request.json();

        const updated = await queryOne<any>(
            `UPDATE schools SET
                late_fee_enabled = COALESCE($2, late_fee_enabled),
                concession_enabled = COALESCE($3, concession_enabled),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING late_fee_enabled, concession_enabled`,
            [schoolId, lateFeeEnabled, concessionEnabled]
        );

        return NextResponse.json({ config: updated });
    } catch (error) {
        console.error('Error updating fee config:', error);
        return NextResponse.json({ error: 'Failed to update fee config' }, { status: 500 });
    }
}
