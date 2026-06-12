import { NextRequest, NextResponse } from 'next/server';
import { requireSchoolAuth } from '@/lib/auth';

/**
 * ISBN Lookup using Open Library API
 * Fetches book metadata (title, author, publisher, cover) from ISBN
 * No API key required — fully free and public
 */
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const isbn = searchParams.get('isbn');

    if (!isbn?.trim()) {
        return NextResponse.json({ error: 'ISBN is required' }, { status: 400 });
    }

    const cleanIsbn = isbn.replace(/[-\s]/g, '');

    try {
        // Try Open Library API
        const response = await fetch(
            `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`,
            { signal: AbortSignal.timeout(8000) }
        );

        if (!response.ok) {
            return NextResponse.json({ error: 'ISBN lookup service unavailable' }, { status: 502 });
        }

        const data = await response.json();
        const bookData = data[`ISBN:${cleanIsbn}`];

        if (!bookData) {
            return NextResponse.json({ error: 'No book found for this ISBN', found: false }, { status: 404 });
        }

        // Extract and normalize data
        const result = {
            found: true,
            title: bookData.title || '',
            author: bookData.authors?.map((a: any) => a.name).join(', ') || '',
            publisher: bookData.publishers?.map((p: any) => p.name).join(', ') || '',
            publicationYear: bookData.publish_date ? extractYear(bookData.publish_date) : null,
            coverImageUrl: bookData.cover?.medium || bookData.cover?.large || bookData.cover?.small || null,
            description: bookData.notes || bookData.excerpts?.[0]?.text || '',
            numberOfPages: bookData.number_of_pages || null,
            subjects: bookData.subjects?.map((s: any) => s.name).slice(0, 5) || [],
            isbn: cleanIsbn,
        };

        return NextResponse.json(result);
    } catch (error: any) {
        if (error.name === 'TimeoutError') {
            return NextResponse.json({ error: 'ISBN lookup timed out', found: false }, { status: 504 });
        }
        console.error('Error in ISBN lookup:', error);
        return NextResponse.json({ error: 'ISBN lookup failed', found: false }, { status: 500 });
    }
}

function extractYear(dateStr: string): number | null {
    const match = dateStr.match(/\b(19|20)\d{2}\b/);
    return match ? parseInt(match[0]) : null;
}
