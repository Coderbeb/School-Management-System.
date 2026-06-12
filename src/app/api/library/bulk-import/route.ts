import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { books } = await request.json();

        if (!Array.isArray(books) || books.length === 0) {
            return NextResponse.json({ error: 'Valid books array is required' }, { status: 400 });
        }

        let importedCount = 0;
        let errors = [];

        // Fetch max accession number to avoid frequent queries
        const lastAccession = await queryOne<{ max_num: string }>(
            `SELECT MAX(CAST(REGEXP_REPLACE(accession_number, '[^0-9]', '', 'g') AS INTEGER)) as max_num
             FROM library_book_copies WHERE school_id = $1`,
            [schoolId]
        );
        let nextNum = (lastAccession?.max_num ? parseInt(lastAccession.max_num) : 0) + 1;

        for (let i = 0; i < books.length; i++) {
            const b = books[i];
            
            // Basic validation
            if (!b.title?.trim()) {
                errors.push(`Row ${i + 1}: Title is required`);
                continue;
            }

            const copies = parseInt(b.totalCopies || '1') || 1;
            const prefix = b.accessionPrefix?.trim() || 'LB';

            try {
                // Insert Master Book Record
                const book = await queryOne<any>(
                    `INSERT INTO library_books (
                        school_id, title, author, isbn, publisher, edition,
                        publication_year, category_id, language, description,
                        total_copies, available_copies, shelf_location, accession_number_prefix,
                        vendor_id, purchase_price, purchase_date
                    )
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12, $13, $14, $15, $16)
                     RETURNING id`,
                    [
                        schoolId,
                        b.title.trim(),
                        b.author?.trim() || null,
                        b.isbn?.trim() || null,
                        b.publisher?.trim() || null,
                        b.edition?.trim() || null,
                        b.publicationYear ? parseInt(b.publicationYear) : null,
                        b.categoryId || null,
                        b.language?.trim() || 'English',
                        b.description?.trim() || null,
                        copies,
                        b.shelfLocation?.trim() || null,
                        prefix,
                        b.vendorId || null,
                        b.purchasePrice ? parseFloat(b.purchasePrice) : null,
                        b.purchaseDate || null
                    ]
                );

                if (book) {
                    // Generate physical copies
                    for (let j = 0; j < copies; j++) {
                        const accNum = `${prefix}-${String(nextNum).padStart(5, '0')}`;
                        await query(
                            `INSERT INTO library_book_copies (book_id, school_id, accession_number)
                             VALUES ($1, $2, $3)`,
                            [book.id, schoolId, accNum]
                        );
                        nextNum++;
                    }
                    importedCount++;
                }
            } catch (err: any) {
                errors.push(`Row ${i + 1} (${b.title}): ${err.message}`);
            }
        }

        return NextResponse.json({
            success: true,
            importedCount,
            errors,
            message: `Successfully imported ${importedCount} books.`
        });

    } catch (error) {
        console.error('Error in bulk import:', error);
        return NextResponse.json({ error: 'Failed to process bulk import' }, { status: 500 });
    }
}
