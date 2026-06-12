import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'accountant']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    try {
        let sql = `
            SELECT sa.*, 
                u.first_name || ' ' || u.last_name as staff_name,
                u.email as staff_email
            FROM salary_advances sa
            JOIN users u ON sa.user_id = u.id
            WHERE sa.school_id = $1
        `;
        const params: unknown[] = [schoolId];
        let idx = 2;

        if (userId) {
            sql += ` AND sa.user_id = $${idx++}`;
            params.push(userId);
        }

        sql += ` ORDER BY sa.given_date DESC, sa.created_at DESC`;
        const advances = await query<any>(sql, params);

        return NextResponse.json({ advances });
    } catch (error) {
        console.error('Error fetching salary advances:', error);
        return NextResponse.json({ error: 'Failed to fetch advances' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { userId, amount, monthlyDeduction, repaymentStartMonth, givenDate } = await request.json();

        if (!userId || !amount || !monthlyDeduction || !repaymentStartMonth) {
            return NextResponse.json({ error: 'Staff User, Amount, Monthly Deduction, and Start Month are required' }, { status: 400 });
        }

        // Check if user has an active advance already that is not fully repaid
        const existing = await queryOne<any>(
            `SELECT id FROM salary_advances 
             WHERE school_id = $1 AND user_id = $2 AND status = 'active'`,
            [schoolId, userId]
        );

        if (existing) {
            return NextResponse.json({ error: 'This staff member already has an active unpaid salary advance' }, { status: 450 });
        }

        const advance = await queryOne<any>(
            `INSERT INTO salary_advances (school_id, user_id, amount, monthly_deduction, repayment_start_month, given_date, amount_repaid, status)
             VALUES ($1, $2, $3, $4, $5, $6, 0, 'active')
             RETURNING *`,
            [
                schoolId,
                userId,
                parseFloat(amount),
                parseFloat(monthlyDeduction),
                repaymentStartMonth, // e.g. "2026-06"
                givenDate || new Date().toISOString().split('T')[0]
            ]
        );

        return NextResponse.json({ advance }, { status: 201 });
    } catch (error) {
        console.error('Error creating advance payment:', error);
        return NextResponse.json({ error: 'Failed to record advance payment' }, { status: 500 });
    }
}
