import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const charges = await query<any>(
            `SELECT * FROM platform_charges
             WHERE school_id = $1
             ORDER BY billing_month DESC`,
            [schoolId]
        );

        return NextResponse.json({ charges });
    } catch (error: any) {
        console.error('Error fetching platform charges for school:', error);
        return NextResponse.json({ error: 'Failed to fetch platform billing charges' }, { status: 500 });
    }
}
