import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * Student Self-Service Library API
 * GET  = Student's library dashboard (current issues, history, fines, reservations)
 * POST = Student self-renewal
 * PUT  = Student place/cancel reservation
 */

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['student']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        // Get student ID from user
        const studentRecord = await queryOne<any>(
            `SELECT id FROM students WHERE user_id = $1 AND school_id = $2`,
            [auth.user.userId, schoolId]
        );

        if (!studentRecord) {
            return NextResponse.json({ error: 'Student record not found' }, { status: 404 });
        }

        const studentId = studentRecord.id;

        // Get library settings
        const settings = await queryOne<any>(
            `SELECT allow_student_renewal, allow_student_reservation, max_renewals, loan_duration_days
             FROM library_settings WHERE school_id = $1`, [schoolId]
        );

        // Currently issued books
        const currentBooks = await query<any>(
            `SELECT lt.id, lt.issued_date, lt.due_date, lt.renewed_count,
                    lt.transaction_type,
                    lb.title, lb.author, lb.isbn, lb.cover_image_url,
                    bc.accession_number,
                    CASE WHEN lt.due_date < CURRENT_DATE THEN true ELSE false END as is_overdue,
                    CASE WHEN lt.due_date < CURRENT_DATE 
                         THEN (CURRENT_DATE - lt.due_date) ELSE 0 END as overdue_days,
                    (lt.due_date - CURRENT_DATE) as days_remaining,
                    CASE WHEN lt.renewed_count < $3 THEN true ELSE false END as can_renew
             FROM library_transactions lt
             JOIN library_books lb ON lt.book_id = lb.id
             JOIN library_book_copies bc ON lt.copy_id = bc.id
             WHERE lt.student_id = $1 AND lt.school_id = $2 AND lt.is_active = true AND lt.returned_date IS NULL
             ORDER BY lt.due_date ASC`,
            [studentId, schoolId, settings?.max_renewals || 2]
        );

        // Reading history (last 50)
        const history = await query<any>(
            `SELECT lt.id, lt.issued_date, lt.due_date, lt.returned_date,
                    lt.renewed_count, lt.fine_amount,
                    lb.title, lb.author, lb.cover_image_url
             FROM library_transactions lt
             JOIN library_books lb ON lt.book_id = lb.id
             WHERE lt.student_id = $1 AND lt.school_id = $2 AND lt.returned_date IS NOT NULL
             ORDER BY lt.returned_date DESC
             LIMIT 50`,
            [studentId, schoolId]
        );

        // Active reservations
        const reservations = await query<any>(
            `SELECT lr.id, lr.reserved_date, lr.expiry_date, lr.status,
                    lb.title, lb.author, lb.cover_image_url,
                    lb.available_copies
             FROM library_reservations lr
             JOIN library_books lb ON lr.book_id = lb.id
             WHERE lr.student_id = $1 AND lr.school_id = $2 AND lr.status = 'active'
             ORDER BY lr.reserved_date DESC`,
            [studentId, schoolId]
        );

        // Fines
        const fines = await query<any>(
            `SELECT lf.id, lf.amount, lf.paid_amount, lf.status,
                    lf.paid_date, lf.waived_reason,
                    lb.title as book_title
             FROM library_fines lf
             JOIN library_transactions lt ON lf.transaction_id = lt.id
             JOIN library_books lb ON lt.book_id = lb.id
             WHERE lf.student_id = $1 AND lf.school_id = $2
             ORDER BY lf.created_at DESC`,
            [studentId, schoolId]
        );

        const pendingFines = fines
            .filter((f: any) => f.status === 'pending' || f.status === 'partial')
            .reduce((sum: number, f: any) => sum + parseFloat(f.amount) - parseFloat(f.paid_amount || '0'), 0);

        return NextResponse.json({
            currentBooks,
            history,
            reservations,
            fines,
            pendingFines,
            settings: {
                allowRenewal: settings?.allow_student_renewal ?? true,
                allowReservation: settings?.allow_student_reservation ?? true,
                maxRenewals: settings?.max_renewals || 2,
                loanDurationDays: settings?.loan_duration_days || 14,
            },
        });
    } catch (error) {
        console.error('Error fetching student library data:', error);
        return NextResponse.json({ error: 'Failed to fetch library data' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    // Student self-renewal — delegates to circulation API logic
    const auth = requireSchoolAuth(request, ['student']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { transactionId } = await request.json();

        if (!transactionId) {
            return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 });
        }

        // Verify student owns this transaction
        const studentRecord = await queryOne<any>(
            `SELECT id FROM students WHERE user_id = $1`, [auth.user.userId]
        );
        if (!studentRecord) {
            return NextResponse.json({ error: 'Student record not found' }, { status: 404 });
        }

        const txn = await queryOne<any>(
            `SELECT lt.*, ls.max_renewals, ls.loan_duration_days, ls.allow_student_renewal
             FROM library_transactions lt
             JOIN library_settings ls ON ls.school_id = lt.school_id
             WHERE lt.id = $1 AND lt.school_id = $2 AND lt.student_id = $3
                   AND lt.is_active = true AND lt.returned_date IS NULL`,
            [transactionId, schoolId, studentRecord.id]
        );

        if (!txn) {
            return NextResponse.json({ error: 'Active transaction not found' }, { status: 404 });
        }

        if (!txn.allow_student_renewal) {
            return NextResponse.json({ error: 'Self-renewal is not enabled for your school' }, { status: 403 });
        }

        if (txn.renewed_count >= (txn.max_renewals || 2)) {
            return NextResponse.json({
                error: `Maximum renewals (${txn.max_renewals || 2}) reached. Please return the book.`
            }, { status: 400 });
        }

        // Check if book is reserved by someone else
        const hasReservation = await queryOne<any>(
            `SELECT id FROM library_reservations
             WHERE book_id = $1 AND school_id = $2 AND status = 'active' AND student_id != $3`,
            [txn.book_id, schoolId, studentRecord.id]
        );
        if (hasReservation) {
            return NextResponse.json({
                error: 'Cannot renew: Another student has reserved this book.'
            }, { status: 400 });
        }

        // Check if the book is overdue — students cannot renew overdue books
        const dueDate = new Date(txn.due_date);
        if (new Date() > dueDate) {
            return NextResponse.json({
                error: 'Cannot renew: This book is overdue. Please return it to the library.'
            }, { status: 400 });
        }

        // Extend due date
        const loanDays = txn.loan_duration_days || 14;
        const newDueDate = new Date();
        newDueDate.setDate(newDueDate.getDate() + loanDays);
        const newDueDateStr = newDueDate.toISOString().split('T')[0];

        await query(
            `UPDATE library_transactions SET
                due_date = $2,
                renewed_count = renewed_count + 1,
                transaction_type = 'renew',
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [transactionId, newDueDateStr]
        );

        return NextResponse.json({
            success: true,
            newDueDate: newDueDateStr,
            renewalsUsed: txn.renewed_count + 1,
            renewalsRemaining: (txn.max_renewals || 2) - txn.renewed_count - 1,
            message: `Book renewed successfully! New due date: ${newDueDateStr}`,
        });
    } catch (error) {
        console.error('Error in student self-renewal:', error);
        return NextResponse.json({ error: 'Failed to renew book' }, { status: 500 });
    }
}
