import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/salary/payments — List salary payments
 * POST /api/salary/payments — Record a salary payment
 */

// GET: List salary payments
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'accountant']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month');
        const userId = searchParams.get('userId');

        let sql = `
            SELECT sp.*,
                u.first_name || ' ' || u.last_name as staff_name,
                u.email as staff_email,
                ss.designation, ss.base_salary as structure_base_salary
            FROM salary_payments sp
            JOIN users u ON sp.user_id = u.id
            LEFT JOIN salary_structures ss ON sp.salary_structure_id = ss.id
            WHERE 1=1
        `;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) {
            sql += ` AND sp.school_id = $${idx++}`;
            params.push(schoolId);
        }
        if (month) {
            sql += ` AND sp.month = $${idx++}`;
            params.push(month);
        }
        if (userId) {
            sql += ` AND sp.user_id = $${idx++}`;
            params.push(userId);
        }

        sql += ` ORDER BY sp.payment_date DESC`;
        const payments = await query<any>(sql, params);
        return NextResponse.json({ payments });
    } catch (error) {
        console.error('Error fetching salary payments:', error);
        return NextResponse.json({ error: 'Failed to fetch salary payments' }, { status: 500 });
    }
}

// POST: Record a salary payment
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const {
            userId, salaryStructureId, month, grossAmount,
            deductionsAmount, netAmount, paymentMode,
            paymentDate, referenceNumber, remarks
        } = await request.json();

        if (!userId || !month || grossAmount === undefined || netAmount === undefined) {
            return NextResponse.json({ error: 'userId, month, grossAmount, and netAmount are required' }, { status: 400 });
        }

        const payment = await queryOne<any>(
            `INSERT INTO salary_payments
                (school_id, user_id, salary_structure_id, month, gross_amount, deductions_amount, net_amount, payment_mode, payment_date, reference_number, remarks, paid_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [schoolId, userId, salaryStructureId || null, month, grossAmount,
             deductionsAmount || 0, netAmount, paymentMode || 'bank_transfer',
             paymentDate || new Date().toISOString().split('T')[0],
             referenceNumber || null, remarks || null, auth.user.userId]
        );

        return NextResponse.json({ payment }, { status: 201 });
    } catch (error) {
        console.error('Error recording salary payment:', error);
        return NextResponse.json({ error: 'Failed to record salary payment' }, { status: 500 });
    }
}
