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
    const sessionId = searchParams.get('sessionId');

    try {
        let sql = `SELECT h.*,
                (SELECT COUNT(*)::integer FROM hostel_rooms hr WHERE hr.hostel_id = h.id) as room_count,
                (
                    SELECT COUNT(*)::integer 
                    FROM hostel_allocations ha 
                    JOIN hostel_rooms hr ON ha.room_id = hr.id 
                    WHERE hr.hostel_id = h.id AND ha.status = 'active'
                ) as student_count,
                (
                    SELECT COALESCE(SUM(hr2.capacity), 0)::integer 
                    FROM hostel_rooms hr2 
                    WHERE hr2.hostel_id = h.id AND hr2.is_active = true
                ) as total_bed_capacity
             FROM hostels h
             WHERE h.school_id = $1`;
        const params: unknown[] = [schoolId];
        let idx = 2;

        if (sessionId) {
            sql += ` AND h.session_id = $${idx++}`;
            params.push(sessionId);
        }

        sql += ` ORDER BY h.name ASC`;
        const buildings = await query<any>(sql, params);
        return NextResponse.json({ buildings });
    } catch (error) {
        console.error('Error fetching hostels:', error);
        return NextResponse.json({ error: 'Failed to fetch hostels' }, { status: 500 });
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
        const {
            name, type, wardenName, wardenPhone, totalCapacity,
            address, assistantWardenName, assistantWardenPhone,
            messType, messCharge, sessionId, isActive
        } = await request.json();

        if (!name || !type) {
            return NextResponse.json({ error: 'Name and Type are required' }, { status: 400 });
        }

        // Duplicate check
        const duplicate = await queryOne<any>(
            `SELECT id FROM hostels WHERE school_id = $1 AND name = $2`,
            [schoolId, name.trim()]
        );
        if (duplicate) {
            return NextResponse.json({ error: 'A hostel building with this name already exists' }, { status: 400 });
        }

        const building = await queryOne<any>(
            `INSERT INTO hostels (
                school_id, name, type, warden_name, warden_phone, total_capacity,
                address, assistant_warden_name, assistant_warden_phone,
                mess_type, mess_charge, session_id, is_active
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [
                schoolId,
                name.trim(),
                type,
                wardenName ? wardenName.trim() : null,
                wardenPhone ? wardenPhone.trim() : null,
                totalCapacity ? parseInt(totalCapacity) : 0,
                address ? address.trim() : null,
                assistantWardenName ? assistantWardenName.trim() : null,
                assistantWardenPhone ? assistantWardenPhone.trim() : null,
                messType || 'none',
                messCharge ? parseFloat(messCharge) : 0,
                sessionId || null,
                isActive !== undefined ? isActive : true
            ]
        );

        return NextResponse.json({ building }, { status: 201 });
    } catch (error) {
        console.error('Error creating hostel:', error);
        return NextResponse.json({ error: 'Failed to create hostel' }, { status: 500 });
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
        const {
            id, name, type, wardenName, wardenPhone, totalCapacity,
            address, assistantWardenName, assistantWardenPhone,
            messType, messCharge, sessionId, isActive
        } = await request.json();

        if (!id || !name || !type) {
            return NextResponse.json({ error: 'ID, Name and Type are required' }, { status: 400 });
        }

        // Verify ownership
        const existing = await queryOne<any>(
            `SELECT school_id FROM hostels WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        // Duplicate check
        const duplicate = await queryOne<any>(
            `SELECT id FROM hostels WHERE school_id = $1 AND name = $2 AND id != $3`,
            [schoolId, name.trim(), id]
        );
        if (duplicate) {
            return NextResponse.json({ error: 'Another hostel building with this name already exists' }, { status: 400 });
        }

        const building = await queryOne<any>(
            `UPDATE hostels SET
                name = $2,
                type = $3,
                warden_name = $4,
                warden_phone = $5,
                total_capacity = $6,
                address = $7,
                assistant_warden_name = $8,
                assistant_warden_phone = $9,
                mess_type = $10,
                mess_charge = $11,
                session_id = $12,
                is_active = $13,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [
                id,
                name.trim(),
                type,
                wardenName ? wardenName.trim() : null,
                wardenPhone ? wardenPhone.trim() : null,
                totalCapacity ? parseInt(totalCapacity) : 0,
                address ? address.trim() : null,
                assistantWardenName ? assistantWardenName.trim() : null,
                assistantWardenPhone ? assistantWardenPhone.trim() : null,
                messType || 'none',
                messCharge ? parseFloat(messCharge) : 0,
                sessionId || null,
                isActive !== undefined ? isActive : true
            ]
        );

        return NextResponse.json({ building });
    } catch (error) {
        console.error('Error updating hostel:', error);
        return NextResponse.json({ error: 'Failed to update hostel' }, { status: 500 });
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
        return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    try {
        // Verify ownership
        const existing = await queryOne<any>(
            `SELECT school_id FROM hostels WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        // Check active allocations
        const activeAlloc = await queryOne<{ count: string }>(
            `SELECT COUNT(*)::integer as count 
             FROM hostel_allocations ha 
             JOIN hostel_rooms hr ON ha.room_id = hr.id 
             WHERE hr.hostel_id = $1 AND ha.status = 'active'`,
            [id]
        );

        if (activeAlloc && parseInt(activeAlloc.count) > 0) {
            return NextResponse.json({
                error: 'Cannot delete building: Active allocations exist for students inside this hostel.'
            }, { status: 400 });
        }

        await query(`DELETE FROM hostels WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting hostel:', error);
        return NextResponse.json({ error: 'Failed to delete hostel' }, { status: 500 });
    }
}
