import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Daily Library Overdue Processor (Cron Job)
 * 
 * Runs daily to:
 * 1. Calculate fines for overdue books
 * 2. Expire old reservations
 * 3. Log alerts for notification system
 * 
 * Trigger: Call this endpoint via cron scheduler (e.g., Vercel Cron, external service)
 * Auth: Uses CRON_SECRET to prevent unauthorized access
 */
export async function GET(request: NextRequest) {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = {
        overdueProcessed: 0,
        finesCreated: 0,
        finesUpdated: 0,
        reservationsExpired: 0,
        dueSoonAlerts: 0,
        errors: [] as string[],
    };

    try {
        // 1. PROCESS OVERDUE BOOKS — Create/update fines
        const overdueTransactions = await query<any>(`
            SELECT lt.id, lt.school_id, lt.student_id, lt.book_id, lt.due_date, lt.copy_id,
                   ls.fine_per_day,
                   lb.title as book_title,
                   s.first_name || ' ' || s.last_name as student_name,
                   (CURRENT_DATE - lt.due_date) as overdue_days
            FROM library_transactions lt
            JOIN library_settings ls ON ls.school_id = lt.school_id
            JOIN library_books lb ON lt.book_id = lb.id
            JOIN students s ON lt.student_id = s.id
            WHERE lt.is_active = true
              AND lt.returned_date IS NULL
              AND lt.due_date < CURRENT_DATE
        `);

        for (const txn of overdueTransactions) {
            try {
                const fineAmount = txn.overdue_days * parseFloat(txn.fine_per_day || '1');

                // Check if fine already exists for this transaction
                const existingFine = await query<any>(
                    `SELECT id, amount FROM library_fines WHERE transaction_id = $1 AND status IN ('pending', 'partial')`,
                    [txn.id]
                );

                if (existingFine.length > 0) {
                    // Update existing fine amount
                    await query(
                        `UPDATE library_fines SET amount = $2, updated_at = CURRENT_TIMESTAMP
                         WHERE transaction_id = $1 AND status IN ('pending', 'partial')`,
                        [txn.id, fineAmount]
                    );
                    results.finesUpdated++;
                } else {
                    // Create new fine
                    await query(
                        `INSERT INTO library_fines (school_id, transaction_id, student_id, amount)
                         VALUES ($1, $2, $3, $4)`,
                        [txn.school_id, txn.id, txn.student_id, fineAmount]
                    );
                    results.finesCreated++;
                }

                // Update fine amount on the transaction
                await query(
                    `UPDATE library_transactions SET fine_amount = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                    [txn.id, fineAmount]
                );

                results.overdueProcessed++;
            } catch (err: any) {
                results.errors.push(`Fine processing failed for txn ${txn.id}: ${err.message}`);
            }
        }

        // 2. EXPIRE OLD RESERVATIONS
        const expiredReservations = await query<any>(`
            UPDATE library_reservations
            SET status = 'expired'
            WHERE status = 'active' AND expiry_date < CURRENT_TIMESTAMP
            RETURNING id
        `);
        results.reservationsExpired = expiredReservations.length;

        // 3. COUNT DUE-SOON BOOKS (for logging/monitoring)
        const dueSoon = await query<any>(`
            SELECT COUNT(*)::integer as count
            FROM library_transactions lt
            JOIN library_settings ls ON ls.school_id = lt.school_id
            WHERE lt.is_active = true
              AND lt.returned_date IS NULL
              AND lt.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (ls.overdue_alert_days_before || ' days')::interval
        `);
        results.dueSoonAlerts = dueSoon[0]?.count || 0;

        console.log(`[Library Cron] Processed: ${results.overdueProcessed} overdue, ${results.finesCreated} new fines, ${results.reservationsExpired} expired reservations`);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            results,
        });
    } catch (error: any) {
        console.error('[Library Cron] Error:', error);
        return NextResponse.json({
            success: false,
            error: error.message,
            results,
        }, { status: 500 });
    }
}
