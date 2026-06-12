import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);
    const { id: bookId } = await params;

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const copies = await query<any>(
            `SELECT bc.*, 
                CASE WHEN lt.id IS NOT NULL THEN json_build_object(
                    'studentId', lt.student_id,
                    'studentName', s.first_name || ' ' || s.last_name,
                    'issuedDate', lt.issued_date,
                    'dueDate', lt.due_date,
                    'renewedCount', lt.renewed_count
                ) ELSE NULL END as current_issue
             FROM library_book_copies bc
             LEFT JOIN library_transactions lt ON lt.copy_id = bc.id AND lt.is_active = true AND lt.returned_date IS NULL
             LEFT JOIN students s ON s.id = lt.student_id
             WHERE bc.book_id = $1 AND bc.school_id = $2
             ORDER BY bc.accession_number ASC`,
            [bookId, schoolId]
        );

        return NextResponse.json({ copies });
    } catch (error) {
        console.error('Error fetching book copies:', error);
        return NextResponse.json({ error: 'Failed to fetch copies' }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);
    const { id: bookId } = await params;

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { count, condition } = await request.json();
        const numCopies = parseInt(count) || 1;

        // Verify book ownership
        const book = await queryOne<any>(
            `SELECT id, accession_number_prefix FROM library_books WHERE id = $1 AND school_id = $2`,
            [bookId, schoolId]
        );
        if (!book) {
            return NextResponse.json({ error: 'Book not found' }, { status: 404 });
        }

        const prefix = book.accession_number_prefix || 'LB';
        const lastAccession = await queryOne<{ max_num: string }>(
            `SELECT MAX(CAST(REGEXP_REPLACE(accession_number, '[^0-9]', '', 'g') AS INTEGER)) as max_num
             FROM library_book_copies WHERE school_id = $1`,
            [schoolId]
        );
        let nextNum = (lastAccession?.max_num ? parseInt(lastAccession.max_num) : 0) + 1;

        const newCopies = [];
        for (let i = 0; i < numCopies; i++) {
            const accNum = `${prefix}-${String(nextNum).padStart(5, '0')}`;
            const copy = await queryOne<any>(
                `INSERT INTO library_book_copies (book_id, school_id, accession_number, condition)
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
                [bookId, schoolId, accNum, condition || 'new']
            );
            if (copy) newCopies.push(copy);
            nextNum++;
        }

        // Update total and available counts on the book
        await query(
            `UPDATE library_books SET
                total_copies = (SELECT COUNT(*)::integer FROM library_book_copies WHERE book_id = $1 AND status != 'withdrawn'),
                available_copies = (SELECT COUNT(*)::integer FROM library_book_copies WHERE book_id = $1 AND status = 'available'),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [bookId]
        );

        return NextResponse.json({ copies: newCopies, added: newCopies.length }, { status: 201 });
    } catch (error) {
        console.error('Error adding book copies:', error);
        return NextResponse.json({ error: 'Failed to add copies' }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);
    await params; // consume params

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { copyId, condition, status, remarks } = await request.json();

        if (!copyId) {
            return NextResponse.json({ error: 'Copy ID is required' }, { status: 400 });
        }

        const existing = await queryOne<any>(
            `SELECT school_id, book_id FROM library_book_copies WHERE id = $1`, [copyId]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        const copy = await queryOne<any>(
            `UPDATE library_book_copies SET
                condition = COALESCE($2, condition),
                status = COALESCE($3, status),
                remarks = COALESCE($4, remarks)
             WHERE id = $1
             RETURNING *`,
            [copyId, condition || null, status || null, remarks || null]
        );

        // Recalculate book availability
        await query(
            `UPDATE library_books SET
                total_copies = (SELECT COUNT(*)::integer FROM library_book_copies WHERE book_id = $1 AND status != 'withdrawn'),
                available_copies = (SELECT COUNT(*)::integer FROM library_book_copies WHERE book_id = $1 AND status = 'available'),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [existing.book_id]
        );

        return NextResponse.json({ copy });
    } catch (error) {
        console.error('Error updating book copy:', error);
        return NextResponse.json({ error: 'Failed to update copy' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);
    await params;

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const copyId = searchParams.get('copyId');

    if (!copyId) {
        return NextResponse.json({ error: 'Copy ID is required' }, { status: 400 });
    }

    try {
        const existing = await queryOne<any>(
            `SELECT school_id, book_id, status FROM library_book_copies WHERE id = $1`, [copyId]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        if (existing.status === 'issued') {
            return NextResponse.json({ error: 'Cannot delete: This copy is currently issued' }, { status: 400 });
        }

        // Withdraw instead of hard delete (preserves history)
        await query(
            `UPDATE library_book_copies SET status = 'withdrawn' WHERE id = $1`,
            [copyId]
        );

        // Recalculate book counts
        await query(
            `UPDATE library_books SET
                total_copies = (SELECT COUNT(*)::integer FROM library_book_copies WHERE book_id = $1 AND status != 'withdrawn'),
                available_copies = (SELECT COUNT(*)::integer FROM library_book_copies WHERE book_id = $1 AND status = 'available'),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [existing.book_id]
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting book copy:', error);
        return NextResponse.json({ error: 'Failed to delete copy' }, { status: 500 });
    }
}
