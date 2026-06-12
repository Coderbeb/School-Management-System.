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
    const roomId = searchParams.get('roomId');

    try {
        // If requesting a single room detail with occupants
        if (roomId) {
            const room = await queryOne<any>(
                `SELECT hr.*, h.name as hostel_name
                 FROM hostel_rooms hr
                 JOIN hostels h ON hr.hostel_id = h.id
                 WHERE hr.id = $1 AND hr.school_id = $2`,
                [roomId, schoolId]
            );
            if (!room) {
                return NextResponse.json({ error: 'Room not found' }, { status: 404 });
            }

            const occupants = await query<any>(
                `SELECT ha.id as allocation_id, ha.bed_number, ha.from_date, ha.status, ha.guardian_consent,
                        s.id as student_id, s.name as student_name, s.admission_number,
                        c.name as class_name, cs.name as section_name
                 FROM hostel_allocations ha
                 JOIN students s ON ha.student_id = s.id
                 LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.status = 'active'
                 LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                 LEFT JOIN classes c ON cs.class_id = c.id
                 WHERE ha.room_id = $1 AND ha.school_id = $2 AND ha.status = 'active'
                 ORDER BY ha.bed_number ASC, s.name ASC`,
                [roomId, schoolId]
            );

            return NextResponse.json({ room, occupants });
        }

        let sql = `
            SELECT hr.*, h.name as hostel_name,
                (SELECT COUNT(*)::integer FROM hostel_allocations ha WHERE ha.room_id = hr.id AND ha.status = 'active') as occupancy_count
            FROM hostel_rooms hr
            JOIN hostels h ON hr.hostel_id = h.id
            WHERE hr.school_id = $1
        `;
        const params: unknown[] = [schoolId];
        let idx = 2;

        if (hostelId) {
            sql += ` AND hr.hostel_id = $${idx++}`;
            params.push(hostelId);
        }

        sql += ` ORDER BY h.name ASC, hr.floor ASC, hr.room_number ASC`;
        const rooms = await query<any>(sql, params);

        return NextResponse.json({ rooms });
    } catch (error) {
        console.error('Error fetching rooms:', error);
        return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 });
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
        const { hostelId, roomNumber, floor, roomType, capacity, monthlyRent, amenities, remarks } = await request.json();

        if (!hostelId || !roomNumber || !roomType || !capacity) {
            return NextResponse.json({ error: 'Hostel, Room number, type, and capacity are required' }, { status: 400 });
        }

        // Duplicate check
        const duplicate = await queryOne<any>(
            `SELECT id FROM hostel_rooms WHERE hostel_id = $1 AND room_number = $2`,
            [hostelId, roomNumber.trim()]
        );
        if (duplicate) {
            return NextResponse.json({ error: 'A room with this number already exists in the selected hostel' }, { status: 400 });
        }

        const room = await queryOne<any>(
            `INSERT INTO hostel_rooms (school_id, hostel_id, room_number, floor, room_type, capacity, monthly_rent, amenities, remarks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                schoolId,
                hostelId,
                roomNumber.trim(),
                floor ? parseInt(floor) : 0,
                roomType,
                parseInt(capacity),
                monthlyRent ? parseFloat(monthlyRent) : 0,
                amenities ? amenities.trim() : null,
                remarks ? remarks.trim() : null
            ]
        );

        return NextResponse.json({ room }, { status: 201 });
    } catch (error) {
        console.error('Error creating room:', error);
        return NextResponse.json({ error: 'Failed to create room' }, { status: 500 });
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
        const { id, hostelId, roomNumber, floor, roomType, capacity, monthlyRent, isActive, amenities, remarks } = await request.json();

        if (!id || !hostelId || !roomNumber || !roomType || !capacity) {
            return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
        }

        // Verify ownership
        const existing = await queryOne<any>(
            `SELECT school_id FROM hostel_rooms WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        // Duplicate check
        const duplicate = await queryOne<any>(
            `SELECT id FROM hostel_rooms WHERE hostel_id = $1 AND room_number = $2 AND id != $3`,
            [hostelId, roomNumber.trim(), id]
        );
        if (duplicate) {
            return NextResponse.json({ error: 'Another room with this number already exists in the selected hostel' }, { status: 400 });
        }

        const room = await queryOne<any>(
            `UPDATE hostel_rooms SET
                hostel_id = $2,
                room_number = $3,
                floor = $4,
                room_type = $5,
                capacity = $6,
                monthly_rent = $7,
                is_active = $8,
                amenities = $9,
                remarks = $10,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [
                id,
                hostelId,
                roomNumber.trim(),
                floor ? parseInt(floor) : 0,
                roomType,
                parseInt(capacity),
                monthlyRent ? parseFloat(monthlyRent) : 0,
                isActive !== undefined ? isActive : true,
                amenities ? amenities.trim() : null,
                remarks ? remarks.trim() : null
            ]
        );

        return NextResponse.json({ room });
    } catch (error) {
        console.error('Error updating room:', error);
        return NextResponse.json({ error: 'Failed to update room' }, { status: 500 });
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
        return NextResponse.json({ error: 'Room ID is required' }, { status: 400 });
    }

    try {
        // Verify ownership
        const existing = await queryOne<any>(
            `SELECT school_id FROM hostel_rooms WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        // Check active allocations
        const activeAlloc = await queryOne<{ count: string }>(
            `SELECT COUNT(*)::integer as count 
             FROM hostel_allocations WHERE room_id = $1 AND status = 'active'`,
            [id]
        );
        if (activeAlloc && parseInt(activeAlloc.count) > 0) {
            return NextResponse.json({
                error: 'Cannot delete room: Students are currently allocated to this room. Vacate them first.'
            }, { status: 400 });
        }

        await query(`DELETE FROM hostel_rooms WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting room:', error);
        return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 });
    }
}
