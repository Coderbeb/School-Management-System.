import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'accountant', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const hostelId = searchParams.get('hostelId');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    try {
        let sql = `
            SELECT ha.*,
                s.name as student_name, s.admission_number,
                hr.room_number, hr.floor, hr.room_type, hr.monthly_rent,
                h.name as hostel_name, h.id as hostel_id,
                c.name as class_name, cs.name as section_name
             FROM hostel_allocations ha
             JOIN students s ON ha.student_id = s.id
             JOIN hostel_rooms hr ON ha.room_id = hr.id
             JOIN hostels h ON hr.hostel_id = h.id
             LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.status = 'active'
             LEFT JOIN class_sections cs ON se.class_section_id = cs.id
             LEFT JOIN classes c ON cs.class_id = c.id
             WHERE ha.school_id = $1`;
        const params: unknown[] = [schoolId];
        let idx = 2;

        if (hostelId) {
            sql += ` AND h.id = $${idx++}`;
            params.push(hostelId);
        }

        if (status) {
            sql += ` AND ha.status = $${idx++}`;
            params.push(status);
        } else {
            // Default: show active first
            sql += ` AND ha.status = 'active'`;
        }

        if (search) {
            sql += ` AND (s.name ILIKE $${idx} OR s.admission_number ILIKE $${idx})`;
            params.push(`%${search}%`);
            idx++;
        }

        sql += ` ORDER BY ha.status ASC, h.name ASC, hr.room_number ASC, ha.from_date DESC`;
        const allocations = await query<any>(sql, params);
        return NextResponse.json({ allocations });
    } catch (error) {
        console.error('Error fetching allocations:', error);
        return NextResponse.json({ error: 'Failed to fetch allocations' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const body = await request.json();

        // Bulk allocation support
        if (Array.isArray(body.students)) {
            const results: any[] = [];
            const errors: string[] = [];

            for (const studentEntry of body.students) {
                const { studentId, roomId, bedNumber, fromDate, sessionId } = {
                    ...body, // inherit roomId, fromDate, sessionId from parent
                    ...studentEntry // override per-student
                };

                try {
                    // Check if student already has active allocation
                    const existing = await queryOne<any>(
                        `SELECT id FROM hostel_allocations 
                         WHERE school_id = $1 AND student_id = $2 AND status = 'active'`,
                        [schoolId, studentId]
                    );
                    if (existing) {
                        errors.push(`Student ${studentId} already has an active allocation`);
                        continue;
                    }

                    // Check room capacity
                    const room = await queryOne<any>(
                        `SELECT hr.capacity,
                            (SELECT COUNT(*)::integer FROM hostel_allocations WHERE room_id = hr.id AND status = 'active') as occupancy_count
                         FROM hostel_rooms hr 
                         WHERE hr.id = $1 AND hr.school_id = $2`,
                        [roomId, schoolId]
                    );

                    if (!room) { errors.push(`Room not found for student ${studentId}`); continue; }
                    if (room.occupancy_count >= room.capacity) { errors.push(`Room is full for student ${studentId}`); continue; }

                    const allocation = await queryOne<any>(
                        `INSERT INTO hostel_allocations (school_id, student_id, room_id, bed_number, from_date, session_id, status)
                         VALUES ($1, $2, $3, $4, $5, $6, 'active')
                         RETURNING *`,
                        [schoolId, studentId, roomId, bedNumber || null, fromDate || new Date().toISOString().split('T')[0], sessionId || null]
                    );
                    results.push(allocation);
                } catch (err: any) {
                    errors.push(`Failed for student ${studentId}: ${err.message}`);
                }
            }

            return NextResponse.json({ allocations: results, errors, totalSuccess: results.length, totalErrors: errors.length }, { status: 201 });
        }

        // Single allocation
        const { studentId, roomId, bedNumber, fromDate, sessionId, remarks, guardianConsent } = body;

        if (!studentId || !roomId) {
            return NextResponse.json({ error: 'Student and Room are required' }, { status: 400 });
        }

        // 1. Verify if student already has active allocation
        const existing = await queryOne<any>(
            `SELECT id FROM hostel_allocations 
             WHERE school_id = $1 AND student_id = $2 AND status = 'active'`,
            [schoolId, studentId]
        );
        if (existing) {
            return NextResponse.json({ error: 'Student already has an active hostel allocation' }, { status: 400 });
        }

        // 2. Verify if room is fully occupied
        const room = await queryOne<any>(
            `SELECT hr.capacity,
                (SELECT COUNT(*)::integer FROM hostel_allocations WHERE room_id = hr.id AND status = 'active') as occupancy_count
             FROM hostel_rooms hr 
             WHERE hr.id = $1 AND hr.school_id = $2`,
            [roomId, schoolId]
        );

        if (!room) {
            return NextResponse.json({ error: 'Room not found' }, { status: 404 });
        }

        if (room.occupancy_count >= room.capacity) {
            return NextResponse.json({ error: 'Selected room is fully occupied' }, { status: 400 });
        }

        // 3. Allocate student
        const allocation = await queryOne<any>(
            `INSERT INTO hostel_allocations (school_id, student_id, room_id, bed_number, from_date, session_id, remarks, guardian_consent, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
             RETURNING *`,
            [
                schoolId,
                studentId,
                roomId,
                bedNumber ? bedNumber.trim() : null,
                fromDate || new Date().toISOString().split('T')[0],
                sessionId || null,
                remarks ? remarks.trim() : null,
                guardianConsent || false
            ]
        );

        return NextResponse.json({ allocation }, { status: 201 });
    } catch (error) {
        console.error('Error creating allocation:', error);
        return NextResponse.json({ error: 'Failed to allocate hostel room' }, { status: 500 });
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
        const { id, toDate } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Allocation ID is required' }, { status: 400 });
        }

        // Verify ownership
        const existing = await queryOne<any>(
            `SELECT school_id FROM hostel_allocations WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        const allocation = await queryOne<any>(
            `UPDATE hostel_allocations SET
                status = 'vacated',
                to_date = $2,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [id, toDate || new Date().toISOString().split('T')[0]]
        );

        return NextResponse.json({ allocation });
    } catch (error) {
        console.error('Error vacating allocation:', error);
        return NextResponse.json({ error: 'Failed to vacate room' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    // Room swap: swap two students between rooms
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { allocationId1, allocationId2 } = await request.json();

        if (!allocationId1 || !allocationId2) {
            return NextResponse.json({ error: 'Both allocation IDs are required for swap' }, { status: 400 });
        }

        // Fetch both allocations
        const alloc1 = await queryOne<any>(
            `SELECT * FROM hostel_allocations WHERE id = $1 AND school_id = $2 AND status = 'active'`,
            [allocationId1, schoolId]
        );
        const alloc2 = await queryOne<any>(
            `SELECT * FROM hostel_allocations WHERE id = $1 AND school_id = $2 AND status = 'active'`,
            [allocationId2, schoolId]
        );

        if (!alloc1 || !alloc2) {
            return NextResponse.json({ error: 'One or both allocations not found or not active' }, { status: 404 });
        }

        // Swap rooms and bed numbers
        await query(
            `UPDATE hostel_allocations SET room_id = $2, bed_number = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [allocationId1, alloc2.room_id, alloc2.bed_number]
        );
        await query(
            `UPDATE hostel_allocations SET room_id = $2, bed_number = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [allocationId2, alloc1.room_id, alloc1.bed_number]
        );

        return NextResponse.json({ success: true, message: 'Room swap completed successfully' });
    } catch (error) {
        console.error('Error swapping rooms:', error);
        return NextResponse.json({ error: 'Failed to swap rooms' }, { status: 500 });
    }
}
