import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * CIRCULATION API
 * POST = Issue book to student
 * PUT  = Return or Renew a book
 * GET  = List active issues
 */

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const status = searchParams.get('status'); // 'active', 'returned', 'overdue', 'all'
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    try {
        let sql = `SELECT lt.*,
                    lb.title as book_title, lb.author as book_author, lb.isbn,
                    lb.cover_image_url,
                    bc.accession_number, bc.barcode,
                    s.first_name || ' ' || s.last_name as student_name,
                    s.admission_number,
                    u.name as issued_by_name,
                    CASE WHEN lt.returned_date IS NULL AND lt.due_date < CURRENT_DATE
                         THEN true ELSE false END as is_overdue,
                    CASE WHEN lt.returned_date IS NULL AND lt.due_date < CURRENT_DATE
                         THEN (CURRENT_DATE - lt.due_date) ELSE 0 END as overdue_days
                 FROM library_transactions lt
                 JOIN library_books lb ON lt.book_id = lb.id
                 JOIN library_book_copies bc ON lt.copy_id = bc.id
                 JOIN students s ON lt.student_id = s.id
                 JOIN users u ON lt.issued_by = u.id
                 WHERE lt.school_id = $1`;
        const params: unknown[] = [schoolId];
        let idx = 2;

        if (studentId) {
            sql += ` AND lt.student_id = $${idx++}`;
            params.push(studentId);
        }

        if (status === 'active') {
            sql += ` AND lt.is_active = true AND lt.returned_date IS NULL`;
        } else if (status === 'returned') {
            sql += ` AND lt.returned_date IS NOT NULL`;
        } else if (status === 'overdue') {
            sql += ` AND lt.is_active = true AND lt.returned_date IS NULL AND lt.due_date < CURRENT_DATE`;
        }

        // Count
        const countSql = sql.replace(/SELECT lt\.\*.*?FROM/, 'SELECT COUNT(*)::integer as total FROM');
        const countResult = await queryOne<{ total: number }>(countSql, params);
        const total = countResult?.total || 0;

        sql += ` ORDER BY lt.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
        params.push(limit, offset);

        const transactions = await query<any>(sql, params);

        return NextResponse.json({
            transactions,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('Error fetching circulation data:', error);
        return NextResponse.json({ error: 'Failed to fetch circulation data' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { bookId, copyId, studentId, remarks } = await request.json();

        if (!bookId || !studentId) {
            return NextResponse.json({ error: 'Book ID and Student ID are required' }, { status: 400 });
        }

        // Get library settings for this school
        const settings = await queryOne<any>(
            `SELECT * FROM library_settings WHERE school_id = $1`, [schoolId]
        );
        const maxBooks = settings?.max_books_per_student || 3;
        const loanDays = settings?.loan_duration_days || 14;

        // Check if student already has max books issued
        const currentIssued = await queryOne<{ count: string }>(
            `SELECT COUNT(*)::integer as count FROM library_transactions
             WHERE school_id = $1 AND student_id = $2 AND is_active = true AND returned_date IS NULL`,
            [schoolId, studentId]
        );
        if (currentIssued && parseInt(currentIssued.count) >= maxBooks) {
            return NextResponse.json({
                error: `Student already has ${currentIssued.count} books issued (limit: ${maxBooks}). Return a book first.`
            }, { status: 400 });
        }

        // Find an available copy (use provided copyId or auto-pick one)
        let selectedCopy: any;
        if (copyId) {
            selectedCopy = await queryOne<any>(
                `SELECT * FROM library_book_copies WHERE id = $1 AND school_id = $2 AND status = 'available'`,
                [copyId, schoolId]
            );
        } else {
            selectedCopy = await queryOne<any>(
                `SELECT * FROM library_book_copies WHERE book_id = $1 AND school_id = $2 AND status = 'available'
                 ORDER BY accession_number ASC LIMIT 1`,
                [bookId, schoolId]
            );
        }

        if (!selectedCopy) {
            return NextResponse.json({ error: 'No available copy of this book' }, { status: 400 });
        }

        // Check if student already has this specific book
        const alreadyIssued = await queryOne<any>(
            `SELECT id FROM library_transactions
             WHERE school_id = $1 AND student_id = $2 AND book_id = $3 AND is_active = true AND returned_date IS NULL`,
            [schoolId, studentId, bookId]
        );
        if (alreadyIssued) {
            return NextResponse.json({ error: 'Student already has a copy of this book issued' }, { status: 400 });
        }

        // Calculate due date
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + loanDays);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        // Create transaction
        const transaction = await queryOne<any>(
            `INSERT INTO library_transactions (
                school_id, copy_id, book_id, student_id, issued_by,
                transaction_type, issued_date, due_date, remarks
            )
             VALUES ($1, $2, $3, $4, $5, 'issue', CURRENT_DATE, $6, $7)
             RETURNING *`,
            [schoolId, selectedCopy.id, bookId, studentId, auth.user.userId, dueDateStr, remarks || null]
        );

        // Update copy status
        await query(
            `UPDATE library_book_copies SET status = 'issued' WHERE id = $1`,
            [selectedCopy.id]
        );

        // Update book available count
        await query(
            `UPDATE library_books SET
                available_copies = (SELECT COUNT(*)::integer FROM library_book_copies WHERE book_id = $1 AND status = 'available'),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [bookId]
        );

        // Check if any reservation for this book by this student, and fulfill it
        await query(
            `UPDATE library_reservations SET status = 'fulfilled'
             WHERE book_id = $1 AND student_id = $2 AND status = 'active'`,
            [bookId, studentId]
        );

        return NextResponse.json({ transaction }, { status: 201 });
    } catch (error) {
        console.error('Error issuing book:', error);
        return NextResponse.json({ error: 'Failed to issue book' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher', 'student']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { transactionId, action, remarks } = await request.json();
        // action: 'return' | 'renew'

        if (!transactionId || !action) {
            return NextResponse.json({ error: 'Transaction ID and action are required' }, { status: 400 });
        }

        // Fetch the transaction
        const txn = await queryOne<any>(
            `SELECT lt.*, ls.max_renewals, ls.loan_duration_days, ls.fine_per_day
             FROM library_transactions lt
             JOIN library_settings ls ON ls.school_id = lt.school_id
             WHERE lt.id = $1 AND lt.school_id = $2 AND lt.is_active = true AND lt.returned_date IS NULL`,
            [transactionId, schoolId]
        );

        if (!txn) {
            return NextResponse.json({ error: 'Active transaction not found' }, { status: 404 });
        }

        // Student can only renew their own books
        if (auth.user.role === 'student') {
            // Get student record linked to this user
            const studentRecord = await queryOne<any>(
                `SELECT id FROM students WHERE user_id = $1`, [auth.user.userId]
            );
            if (!studentRecord || studentRecord.id !== txn.student_id) {
                return NextResponse.json({ error: 'You can only manage your own books' }, { status: 403 });
            }
            if (action !== 'renew') {
                return NextResponse.json({ error: 'Students can only renew, not return through API' }, { status: 403 });
            }
        }

        if (action === 'return') {
            // Calculate fine if overdue
            const today = new Date();
            const dueDate = new Date(txn.due_date);
            let fineAmount = 0;

            if (today > dueDate) {
                const overdueDays = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
                fineAmount = overdueDays * parseFloat(txn.fine_per_day || '1');
            }

            // Update transaction
            await query(
                `UPDATE library_transactions SET
                    returned_date = CURRENT_DATE,
                    is_active = false,
                    fine_amount = $2,
                    remarks = COALESCE($3, remarks),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [transactionId, fineAmount, remarks || null]
            );

            // Create fine record if overdue
            if (fineAmount > 0) {
                await query(
                    `INSERT INTO library_fines (school_id, transaction_id, student_id, amount)
                     VALUES ($1, $2, $3, $4)`,
                    [schoolId, transactionId, txn.student_id, fineAmount]
                );
            }

            // Update copy status back to available
            await query(
                `UPDATE library_book_copies SET status = 'available' WHERE id = $1`,
                [txn.copy_id]
            );

            // Update book availability
            await query(
                `UPDATE library_books SET
                    available_copies = (SELECT COUNT(*)::integer FROM library_book_copies WHERE book_id = $1 AND status = 'available'),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [txn.book_id]
            );

            return NextResponse.json({
                success: true,
                action: 'returned',
                fineAmount,
                message: fineAmount > 0
                    ? `Book returned. Overdue fine: ₹${fineAmount.toFixed(2)}`
                    : 'Book returned successfully. No fine.',
            });

        } else if (action === 'renew') {
            const maxRenewals = txn.max_renewals || 2;

            if (txn.renewed_count >= maxRenewals) {
                return NextResponse.json({
                    error: `Maximum renewals (${maxRenewals}) reached. Please return the book.`
                }, { status: 400 });
            }

            // Check if anyone has reserved this book
            const hasReservation = await queryOne<any>(
                `SELECT id FROM library_reservations
                 WHERE book_id = $1 AND school_id = $2 AND status = 'active'
                 LIMIT 1`,
                [txn.book_id, schoolId]
            );
            if (hasReservation) {
                return NextResponse.json({
                    error: 'Cannot renew: Another student has reserved this book.'
                }, { status: 400 });
            }

            // Extend due date from today
            const loanDays = txn.loan_duration_days || 14;
            const newDueDate = new Date();
            newDueDate.setDate(newDueDate.getDate() + loanDays);
            const newDueDateStr = newDueDate.toISOString().split('T')[0];

            await query(
                `UPDATE library_transactions SET
                    due_date = $2,
                    renewed_count = renewed_count + 1,
                    transaction_type = 'renew',
                    remarks = COALESCE($3, remarks),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [transactionId, newDueDateStr, remarks || null]
            );

            return NextResponse.json({
                success: true,
                action: 'renewed',
                newDueDate: newDueDateStr,
                renewalsUsed: txn.renewed_count + 1,
                renewalsRemaining: maxRenewals - txn.renewed_count - 1,
                message: `Book renewed. New due date: ${newDueDateStr}`,
            });
        }

        return NextResponse.json({ error: 'Invalid action. Use "return" or "renew".' }, { status: 400 });
    } catch (error) {
        console.error('Error in circulation action:', error);
        return NextResponse.json({ error: 'Failed to process circulation action' }, { status: 500 });
    }
}
