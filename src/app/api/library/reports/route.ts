import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get('type') || 'overview';

    try {
        if (reportType === 'overview') {
            // Dashboard stats
            const stats = await queryOne<any>(`
                SELECT
                    (SELECT COUNT(*)::integer FROM library_books WHERE school_id = $1 AND is_active = true) as total_books,
                    (SELECT COALESCE(SUM(total_copies), 0)::integer FROM library_books WHERE school_id = $1 AND is_active = true) as total_copies,
                    (SELECT COALESCE(SUM(available_copies), 0)::integer FROM library_books WHERE school_id = $1 AND is_active = true) as available_copies,
                    (SELECT COUNT(*)::integer FROM library_transactions WHERE school_id = $1 AND is_active = true AND returned_date IS NULL) as active_issues,
                    (SELECT COUNT(*)::integer FROM library_transactions WHERE school_id = $1 AND is_active = true AND returned_date IS NULL AND due_date < CURRENT_DATE) as overdue_books,
                    (SELECT COUNT(*)::integer FROM library_reservations WHERE school_id = $1 AND status = 'active') as active_reservations,
                    (SELECT COALESCE(SUM(amount), 0) FROM library_fines WHERE school_id = $1 AND status = 'pending') as pending_fines,
                    (SELECT COALESCE(SUM(paid_amount), 0) FROM library_fines WHERE school_id = $1 AND status = 'paid') as collected_fines,
                    (SELECT COUNT(DISTINCT student_id)::integer FROM library_transactions WHERE school_id = $1) as total_members,
                    (SELECT COUNT(*)::integer FROM library_categories WHERE school_id = $1 AND is_active = true) as total_categories
            `, [schoolId]);

            return NextResponse.json({ stats });

        } else if (reportType === 'popular') {
            // Most borrowed books
            const popular = await query<any>(`
                SELECT lb.id, lb.title, lb.author, lb.isbn, lb.cover_image_url,
                    COUNT(lt.id)::integer as borrow_count,
                    lb.available_copies, lb.total_copies
                FROM library_transactions lt
                JOIN library_books lb ON lt.book_id = lb.id
                WHERE lt.school_id = $1
                GROUP BY lb.id, lb.title, lb.author, lb.isbn, lb.cover_image_url, lb.available_copies, lb.total_copies
                ORDER BY borrow_count DESC
                LIMIT 20
            `, [schoolId]);

            return NextResponse.json({ popular });

        } else if (reportType === 'overdue') {
            // Overdue books list
            const overdue = await query<any>(`
                SELECT lt.id, lt.due_date, lt.issued_date, lt.renewed_count,
                    (CURRENT_DATE - lt.due_date) as overdue_days,
                    lb.title as book_title, lb.author,
                    bc.accession_number,
                    s.first_name || ' ' || s.last_name as student_name,
                    s.admission_number, s.guardian_phone,
                    ls.fine_per_day,
                    ((CURRENT_DATE - lt.due_date) * ls.fine_per_day) as estimated_fine
                FROM library_transactions lt
                JOIN library_books lb ON lt.book_id = lb.id
                JOIN library_book_copies bc ON lt.copy_id = bc.id
                JOIN students s ON lt.student_id = s.id
                JOIN library_settings ls ON ls.school_id = lt.school_id
                WHERE lt.school_id = $1 AND lt.is_active = true AND lt.returned_date IS NULL AND lt.due_date < CURRENT_DATE
                ORDER BY overdue_days DESC
            `, [schoolId]);

            return NextResponse.json({ overdue });

        } else if (reportType === 'category-wise') {
            // Books by category
            const categories = await query<any>(`
                SELECT lc.name as category_name,
                    COUNT(lb.id)::integer as book_count,
                    COALESCE(SUM(lb.total_copies), 0)::integer as total_copies,
                    COALESCE(SUM(lb.available_copies), 0)::integer as available_copies
                FROM library_categories lc
                LEFT JOIN library_books lb ON lb.category_id = lc.id AND lb.is_active = true
                WHERE lc.school_id = $1 AND lc.is_active = true
                GROUP BY lc.name, lc.display_order
                ORDER BY lc.display_order ASC
            `, [schoolId]);

            return NextResponse.json({ categories });

        } else if (reportType === 'student-activity') {
            // Top readers
            const readers = await query<any>(`
                SELECT s.id, s.first_name || ' ' || s.last_name as student_name,
                    s.admission_number,
                    COUNT(lt.id)::integer as books_borrowed,
                    COUNT(CASE WHEN lt.is_active = true AND lt.returned_date IS NULL THEN 1 END)::integer as currently_issued,
                    MAX(lt.issued_date) as last_borrow_date
                FROM library_transactions lt
                JOIN students s ON lt.student_id = s.id
                WHERE lt.school_id = $1
                GROUP BY s.id, s.first_name, s.last_name, s.admission_number
                ORDER BY books_borrowed DESC
                LIMIT 30
            `, [schoolId]);

            return NextResponse.json({ readers });

        } else if (reportType === 'circulation-trend') {
            // Monthly circulation for last 12 months
            const trend = await query<any>(`
                SELECT
                    TO_CHAR(issued_date, 'YYYY-MM') as month,
                    COUNT(*)::integer as issues,
                    COUNT(CASE WHEN returned_date IS NOT NULL THEN 1 END)::integer as returns
                FROM library_transactions
                WHERE school_id = $1 AND issued_date >= CURRENT_DATE - INTERVAL '12 months'
                GROUP BY TO_CHAR(issued_date, 'YYYY-MM')
                ORDER BY month ASC
            `, [schoolId]);

            return NextResponse.json({ trend });
        }

        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    } catch (error) {
        console.error('Error generating library report:', error);
        return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
}
