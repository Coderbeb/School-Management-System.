import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';

/**
 * GET /api/salary/my-salary — Returns the caller's own salary structure and payment history
 */

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['teacher', 'accountant']);
    if (auth.error) return auth.error;

    try {
        // Fetch the caller's salary structure
        const structure = await queryOne<any>(
            `SELECT * FROM salary_structures
             WHERE user_id = $1 AND is_active = true
             ORDER BY effective_from DESC
             LIMIT 1`,
            [auth.user.userId]
        );

        // Fetch the caller's payment history
        const payments = await query<any>(
            `SELECT * FROM salary_payments
             WHERE user_id = $1
             ORDER BY payment_date DESC`,
            [auth.user.userId]
        );

        return NextResponse.json({
            structure: structure || null,
            payments,
        });
    } catch (error) {
        console.error('Error fetching my salary:', error);
        return NextResponse.json({ error: 'Failed to fetch salary information' }, { status: 500 });
    }
}
