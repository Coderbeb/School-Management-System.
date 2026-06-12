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
    const status = searchParams.get('status'); // active, fulfilled, expired, cancelled

    try {
        let sql = `SELECT lr.*,
                    lb.title as book_title, lb.author as book_author,
                    lb.cover_image_url, lb.available_copies,
                    s.first_name || ' ' || s.last_name as student_name,
                    s.admission_number
                 FROM library_reservations lr
                 JOIN library_books lb ON lr.book_id = lb.id
                 JOIN students s ON lr.student_id = s.id
                 WHERE lr.school_id = $1`;
        const params: unknown[] = [schoolId];
        let idx = 2;

        if (status) {
            sql += ` AND lr.status = $${idx++}`;
            params.push(status);
        }

        sql += ` ORDER BY lr.reserved_date DESC`;

        const reservations = await query<any>(sql, params);
        return NextResponse.json({ reservations });
    } catch (error) {
        console.error('Error fetching reservations:', error);
        return NextResponse.json({ error: 'Failed to fetch reservations' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher', 'student']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { bookId, studentId: bodyStudentId } = await request.json();

        if (!bookId) {
            return NextResponse.json({ error: 'Book ID is required' }, { status: 400 });
        }

        // For student role, resolve their student ID from user record
        let studentId = bodyStudentId;
        if (auth.user.role === 'student') {
            const studentRecord = await queryOne<any>(
                `SELECT id FROM students WHERE user_id = $1`, [auth.user.userId]
            );
            if (!studentRecord) {
                return NextResponse.json({ error: 'Student record not found' }, { status: 404 });
            }
            studentId = studentRecord.id;
        }

        if (!studentId) {
            return NextResponse.json({ error: 'Student ID is required' }, { status: 400 });
        }

        // Check if student reservation is allowed
        const settings = await queryOne<any>(
            `SELECT * FROM library_settings WHERE school_id = $1`, [schoolId]
        );
        if (auth.user.role === 'student' && settings && !settings.allow_student_reservation) {
            return NextResponse.json({ error: 'Student reservations are not enabled for your school' }, { status: 403 });
        }

        // Check if student already has an active reservation for this book
        const existing = await queryOne<any>(
            `SELECT id FROM library_reservations
             WHERE book_id = $1 AND student_id = $2 AND status = 'active'`,
            [bookId, studentId]
        );
        if (existing) {
            return NextResponse.json({ error: 'You already have an active reservation for this book' }, { status: 400 });
        }

        // Check if student already has this book issued
        const alreadyIssued = await queryOne<any>(
            `SELECT id FROM library_transactions
             WHERE book_id = $1 AND student_id = $2 AND is_active = true AND returned_date IS NULL`,
            [bookId, studentId]
        );
        if (alreadyIssued) {
            return NextResponse.json({ error: 'You already have this book issued' }, { status: 400 });
        }

        // Set expiry to 7 days from now
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 7);

        const reservation = await queryOne<any>(
            `INSERT INTO library_reservations (school_id, book_id, student_id, expiry_date)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [schoolId, bookId, studentId, expiryDate.toISOString()]
        );

        return NextResponse.json({ reservation }, { status: 201 });
    } catch (error) {
        console.error('Error creating reservation:', error);
        return NextResponse.json({ error: 'Failed to create reservation' }, { status: 500 });
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
        const { reservationId, action } = await request.json();
        // action: 'cancel' | 'fulfill'

        if (!reservationId || !action) {
            return NextResponse.json({ error: 'Reservation ID and action are required' }, { status: 400 });
        }

        const reservation = await queryOne<any>(
            `SELECT * FROM library_reservations WHERE id = $1 AND school_id = $2`,
            [reservationId, schoolId]
        );

        if (!reservation) {
            return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
        }

        // Students can only cancel their own reservations
        if (auth.user.role === 'student') {
            const studentRecord = await queryOne<any>(
                `SELECT id FROM students WHERE user_id = $1`, [auth.user.userId]
            );
            if (!studentRecord || studentRecord.id !== reservation.student_id) {
                return NextResponse.json({ error: 'You can only manage your own reservations' }, { status: 403 });
            }
            if (action !== 'cancel') {
                return NextResponse.json({ error: 'Students can only cancel reservations' }, { status: 403 });
            }
        }

        if (action === 'cancel') {
            await query(
                `UPDATE library_reservations SET status = 'cancelled' WHERE id = $1`,
                [reservationId]
            );
            return NextResponse.json({ success: true, message: 'Reservation cancelled' });
        } else if (action === 'fulfill') {
            await query(
                `UPDATE library_reservations SET status = 'fulfilled' WHERE id = $1`,
                [reservationId]
            );
            return NextResponse.json({ success: true, message: 'Reservation fulfilled' });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Error updating reservation:', error);
        return NextResponse.json({ error: 'Failed to update reservation' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        // Expire all old reservations for this school
        const result = await query<any>(
            `UPDATE library_reservations SET status = 'expired'
             WHERE school_id = $1 AND status = 'active' AND expiry_date < CURRENT_TIMESTAMP
             RETURNING id`,
            [schoolId]
        );

        return NextResponse.json({
            success: true,
            expiredCount: result.length,
            message: `${result.length} expired reservations cleaned up`,
        });
    } catch (error) {
        console.error('Error cleaning up reservations:', error);
        return NextResponse.json({ error: 'Failed to clean up reservations' }, { status: 500 });
    }
}
