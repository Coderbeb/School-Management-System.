import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// Default categories seeded when a school first accesses library settings
const DEFAULT_CATEGORIES = [
    { name: 'Fiction', description: 'Novels, short stories, and literary fiction', order: 1 },
    { name: 'Non-Fiction', description: 'Biographies, essays, and factual works', order: 2 },
    { name: 'Science', description: 'Physics, chemistry, biology, and earth sciences', order: 3 },
    { name: 'Mathematics', description: 'Arithmetic, algebra, geometry, and calculus', order: 4 },
    { name: 'History', description: 'World history, Indian history, and civilizations', order: 5 },
    { name: 'Geography', description: 'Maps, atlases, and geographical studies', order: 6 },
    { name: 'English Literature', description: 'Poetry, drama, and prose in English', order: 7 },
    { name: 'Hindi Literature', description: 'Hindi sahitya, kavita, and gadya', order: 8 },
    { name: 'Social Studies', description: 'Civics, economics, and political science', order: 9 },
    { name: 'Computer Science', description: 'Programming, IT, and digital literacy', order: 10 },
    { name: 'General Knowledge', description: 'Encyclopedias, quiz books, and reference', order: 11 },
    { name: 'Comics & Graphic Novels', description: 'Illustrated stories and graphic novels', order: 12 },
    { name: 'Reference', description: 'Dictionaries, thesaurus, and reference books', order: 13 },
    { name: 'Magazines & Periodicals', description: 'Journals, magazines, and newspapers', order: 14 },
    { name: 'Other', description: 'Uncategorized books', order: 99 },
];

/**
 * Auto-seed library settings and default categories for a school on first access
 */
async function ensureLibrarySettings(schoolId: string) {
    const existing = await queryOne<any>(
        `SELECT id FROM library_settings WHERE school_id = $1`, [schoolId]
    );
    if (!existing) {
        await query(
            `INSERT INTO library_settings (school_id) VALUES ($1) ON CONFLICT (school_id) DO NOTHING`,
            [schoolId]
        );
        // Seed default categories
        for (const cat of DEFAULT_CATEGORIES) {
            await query(
                `INSERT INTO library_categories (school_id, name, description, display_order)
                 VALUES ($1, $2, $3, $4) ON CONFLICT (school_id, name) DO NOTHING`,
                [schoolId, cat.name, cat.description, cat.order]
            );
        }
    }
}

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        await ensureLibrarySettings(schoolId);
        const settings = await queryOne<any>(
            `SELECT * FROM library_settings WHERE school_id = $1`, [schoolId]
        );
        return NextResponse.json({ settings });
    } catch (error) {
        console.error('Error fetching library settings:', error);
        return NextResponse.json({ error: 'Failed to fetch library settings' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const {
            maxBooksPerStudent, loanDurationDays, maxRenewals,
            finePerDay, fineCurrency, allowStudentRenewal,
            allowStudentReservation, overdueAlertDaysBefore, isbnAutoFetch
        } = body;

        await ensureLibrarySettings(schoolId);

        const settings = await queryOne<any>(
            `UPDATE library_settings SET
                max_books_per_student = COALESCE($2, max_books_per_student),
                loan_duration_days = COALESCE($3, loan_duration_days),
                max_renewals = COALESCE($4, max_renewals),
                fine_per_day = COALESCE($5, fine_per_day),
                fine_currency = COALESCE($6, fine_currency),
                allow_student_renewal = COALESCE($7, allow_student_renewal),
                allow_student_reservation = COALESCE($8, allow_student_reservation),
                overdue_alert_days_before = COALESCE($9, overdue_alert_days_before),
                isbn_auto_fetch = COALESCE($10, isbn_auto_fetch),
                updated_at = CURRENT_TIMESTAMP
             WHERE school_id = $1
             RETURNING *`,
            [
                schoolId,
                maxBooksPerStudent ?? null,
                loanDurationDays ?? null,
                maxRenewals ?? null,
                finePerDay ?? null,
                fineCurrency ?? null,
                allowStudentRenewal ?? null,
                allowStudentReservation ?? null,
                overdueAlertDaysBefore ?? null,
                isbnAutoFetch ?? null,
            ]
        );

        return NextResponse.json({ settings });
    } catch (error) {
        console.error('Error updating library settings:', error);
        return NextResponse.json({ error: 'Failed to update library settings' }, { status: 500 });
    }
}
