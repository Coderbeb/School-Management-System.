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
    const search = searchParams.get('search');
    const categoryId = searchParams.get('categoryId');
    const available = searchParams.get('available'); // 'true' to filter only available books
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    try {
        let sql = `SELECT b.*, 
                    c.name as category_name,
                    v.name as vendor_name,
                    b.total_copies,
                    b.available_copies
                 FROM library_books b
                 LEFT JOIN library_categories c ON b.category_id = c.id
                 LEFT JOIN library_vendors v ON b.vendor_id = v.id
                 WHERE b.school_id = $1 AND b.is_active = true`;
        const params: unknown[] = [schoolId];
        let idx = 2;

        if (search) {
            sql += ` AND (
                b.title ILIKE $${idx} OR 
                b.author ILIKE $${idx} OR 
                b.isbn ILIKE $${idx} OR
                b.publisher ILIKE $${idx}
            )`;
            params.push(`%${search}%`);
            idx++;
        }

        if (categoryId) {
            sql += ` AND b.category_id = $${idx++}`;
            params.push(categoryId);
        }

        if (available === 'true') {
            sql += ` AND b.available_copies > 0`;
        }

        // Count total for pagination
        const countSql = sql.replace(/SELECT b\.\*.*?FROM/, 'SELECT COUNT(*)::integer as total FROM');
        const countResult = await queryOne<{ total: number }>(countSql, params);
        const total = countResult?.total || 0;

        sql += ` ORDER BY b.title ASC LIMIT $${idx++} OFFSET $${idx++}`;
        params.push(limit, offset);

        const books = await query<any>(sql, params);

        return NextResponse.json({
            books,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Error fetching library books:', error);
        return NextResponse.json({ error: 'Failed to fetch books' }, { status: 500 });
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
        const {
            title, author, isbn, publisher, edition,
            publicationYear, categoryId, language, description,
            coverImageUrl, totalCopies, shelfLocation,
            accessionNumberPrefix, vendorId, purchasePrice, purchaseDate
        } = await request.json();

        if (!title?.trim()) {
            return NextResponse.json({ error: 'Book title is required' }, { status: 400 });
        }

        const copies = totalCopies ? parseInt(totalCopies) : 1;

        const book = await queryOne<any>(
            `INSERT INTO library_books (
                school_id, title, author, isbn, publisher, edition,
                publication_year, category_id, language, description,
                cover_image_url, total_copies, available_copies,
                shelf_location, accession_number_prefix,
                vendor_id, purchase_price, purchase_date
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13, $14, $15, $16, $17)
             RETURNING *`,
            [
                schoolId,
                title.trim(),
                author?.trim() || null,
                isbn?.trim() || null,
                publisher?.trim() || null,
                edition?.trim() || null,
                publicationYear ? parseInt(publicationYear) : null,
                categoryId || null,
                language?.trim() || 'English',
                description?.trim() || null,
                coverImageUrl || null,
                copies,
                shelfLocation?.trim() || null,
                accessionNumberPrefix?.trim() || null,
                vendorId || null,
                purchasePrice ? parseFloat(purchasePrice) : null,
                purchaseDate || null
            ]
        );

        // Auto-create individual copy records
        if (book) {
            const prefix = accessionNumberPrefix?.trim() || 'LB';
            // Get the next accession number for this school
            const lastAccession = await queryOne<{ max_num: string }>(
                `SELECT MAX(CAST(REGEXP_REPLACE(accession_number, '[^0-9]', '', 'g') AS INTEGER)) as max_num
                 FROM library_book_copies WHERE school_id = $1`,
                [schoolId]
            );
            let nextNum = (lastAccession?.max_num ? parseInt(lastAccession.max_num) : 0) + 1;

            for (let i = 0; i < copies; i++) {
                const accNum = `${prefix}-${String(nextNum).padStart(5, '0')}`;
                await query(
                    `INSERT INTO library_book_copies (book_id, school_id, accession_number)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (school_id, accession_number) DO NOTHING`,
                    [book.id, schoolId, accNum]
                );
                nextNum++;
            }
        }

        return NextResponse.json({ book }, { status: 201 });
    } catch (error) {
        console.error('Error creating library book:', error);
        return NextResponse.json({ error: 'Failed to create book' }, { status: 500 });
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
        const {
            id, title, author, isbn, publisher, edition,
            publicationYear, categoryId, language, description,
            coverImageUrl, shelfLocation, accessionNumberPrefix,
            vendorId, purchasePrice, purchaseDate
        } = await request.json();

        if (!id || !title?.trim()) {
            return NextResponse.json({ error: 'ID and title are required' }, { status: 400 });
        }

        const existing = await queryOne<any>(
            `SELECT school_id FROM library_books WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        const book = await queryOne<any>(
            `UPDATE library_books SET
                title = $2, author = $3, isbn = $4, publisher = $5,
                edition = $6, publication_year = $7, category_id = $8,
                language = $9, description = $10, cover_image_url = $11,
                shelf_location = $12, accession_number_prefix = $13,
                vendor_id = $14, purchase_price = $15, purchase_date = $16,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [
                id,
                title.trim(),
                author?.trim() || null,
                isbn?.trim() || null,
                publisher?.trim() || null,
                edition?.trim() || null,
                publicationYear ? parseInt(publicationYear) : null,
                categoryId || null,
                language?.trim() || 'English',
                description?.trim() || null,
                coverImageUrl || null,
                shelfLocation?.trim() || null,
                accessionNumberPrefix?.trim() || null,
                vendorId || null,
                purchasePrice ? parseFloat(purchasePrice) : null,
                purchaseDate || null
            ]
        );

        return NextResponse.json({ book });
    } catch (error) {
        console.error('Error updating library book:', error);
        return NextResponse.json({ error: 'Failed to update book' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Book ID is required' }, { status: 400 });
    }

    try {
        const existing = await queryOne<any>(
            `SELECT school_id FROM library_books WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        // Check for active issues
        const activeIssues = await queryOne<{ count: string }>(
            `SELECT COUNT(*)::integer as count FROM library_transactions 
             WHERE book_id = $1 AND is_active = true AND returned_date IS NULL`,
            [id]
        );
        if (activeIssues && parseInt(activeIssues.count) > 0) {
            return NextResponse.json({
                error: `Cannot delete: ${activeIssues.count} copies are currently issued. Return them first.`
            }, { status: 400 });
        }

        // Soft delete the book
        await query(
            `UPDATE library_books SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [id]
        );
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting library book:', error);
        return NextResponse.json({ error: 'Failed to delete book' }, { status: 500 });
    }
}
