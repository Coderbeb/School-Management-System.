import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher', 'student']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const status = searchParams.get('status'); // pending, paid, waived, partial

    try {
        let sql = `SELECT lf.*,
                    lt.due_date, lt.returned_date, lt.issued_date,
                    lb.title as book_title, lb.author as book_author,
                    s.first_name || ' ' || s.last_name as student_name,
                    s.admission_number,
                    CASE WHEN lf.waived_by IS NOT NULL 
                         THEN wu.name ELSE NULL END as waived_by_name
                 FROM library_fines lf
                 JOIN library_transactions lt ON lf.transaction_id = lt.id
                 JOIN library_books lb ON lt.book_id = lb.id
                 JOIN students s ON lf.student_id = s.id
                 LEFT JOIN users wu ON lf.waived_by = wu.id
                 WHERE lf.school_id = $1`;
        const params: unknown[] = [schoolId];
        let idx = 2;

        // Students can only see their own fines
        if (auth.user.role === 'student') {
            const studentRecord = await queryOne<any>(
                `SELECT id FROM students WHERE user_id = $1`, [auth.user.userId]
            );
            if (studentRecord) {
                sql += ` AND lf.student_id = $${idx++}`;
                params.push(studentRecord.id);
            }
        } else if (studentId) {
            sql += ` AND lf.student_id = $${idx++}`;
            params.push(studentId);
        }

        if (status) {
            sql += ` AND lf.status = $${idx++}`;
            params.push(status);
        }

        sql += ` ORDER BY lf.created_at DESC`;

        const fines = await query<any>(sql, params);

        // Summary stats
        const summary = await queryOne<any>(
            `SELECT 
                COUNT(*)::integer as total_fines,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as total_pending,
                COALESCE(SUM(CASE WHEN status = 'paid' THEN paid_amount ELSE 0 END), 0) as total_collected,
                COALESCE(SUM(CASE WHEN status = 'waived' THEN amount ELSE 0 END), 0) as total_waived
             FROM library_fines WHERE school_id = $1`,
            [schoolId]
        );

        return NextResponse.json({ fines, summary });
    } catch (error) {
        console.error('Error fetching library fines:', error);
        return NextResponse.json({ error: 'Failed to fetch fines' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { fineId, action, amount, reason } = await request.json();
        // action: 'pay' | 'waive' | 'partial_pay'

        if (!fineId || !action) {
            return NextResponse.json({ error: 'Fine ID and action are required' }, { status: 400 });
        }

        const fine = await queryOne<any>(
            `SELECT * FROM library_fines WHERE id = $1 AND school_id = $2`,
            [fineId, schoolId]
        );

        if (!fine) {
            return NextResponse.json({ error: 'Fine not found' }, { status: 404 });
        }

        if (fine.status === 'paid' || fine.status === 'waived') {
            return NextResponse.json({ error: 'This fine has already been settled' }, { status: 400 });
        }

        if (action === 'pay') {
            await query(
                `UPDATE library_fines SET
                    status = 'paid', paid_amount = amount,
                    paid_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [fineId]
            );

            // Also update transaction
            await query(
                `UPDATE library_transactions SET fine_paid = true WHERE id = $1`,
                [fine.transaction_id]
            );

            return NextResponse.json({ success: true, message: 'Fine marked as paid' });

        } else if (action === 'waive') {
            await query(
                `UPDATE library_fines SET
                    status = 'waived', waived_by = $2, waived_reason = $3,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [fineId, auth.user.userId, reason || 'Waived by admin']
            );

            await query(
                `UPDATE library_transactions SET fine_waived = true WHERE id = $1`,
                [fine.transaction_id]
            );

            return NextResponse.json({ success: true, message: 'Fine waived' });

        } else if (action === 'partial_pay') {
            const payAmount = parseFloat(amount);
            if (!payAmount || payAmount <= 0) {
                return NextResponse.json({ error: 'Valid amount is required for partial payment' }, { status: 400 });
            }

            const newPaid = parseFloat(fine.paid_amount || '0') + payAmount;
            const isFullyPaid = newPaid >= parseFloat(fine.amount);

            await query(
                `UPDATE library_fines SET
                    status = $2, paid_amount = $3,
                    paid_date = CASE WHEN $2 = 'paid' THEN CURRENT_TIMESTAMP ELSE paid_date END,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [fineId, isFullyPaid ? 'paid' : 'partial', newPaid]
            );

            if (isFullyPaid) {
                await query(
                    `UPDATE library_transactions SET fine_paid = true WHERE id = $1`,
                    [fine.transaction_id]
                );
            }

            return NextResponse.json({
                success: true,
                message: isFullyPaid
                    ? 'Fine fully paid'
                    : `₹${payAmount.toFixed(2)} paid. Remaining: ₹${(parseFloat(fine.amount) - newPaid).toFixed(2)}`,
            });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Error updating library fine:', error);
        return NextResponse.json({ error: 'Failed to update fine' }, { status: 500 });
    }
}
