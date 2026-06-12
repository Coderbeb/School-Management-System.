import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const vehicles = await query<any>(
            `SELECT tv.*,
                (
                    SELECT COUNT(*)::integer 
                    FROM transport_assignments ta
                    JOIN transport_routes tr ON ta.route_id = tr.id
                    WHERE tr.vehicle_id = tv.id AND ta.status = 'active'
                ) as occupancy_count
             FROM transport_vehicles tv
             WHERE tv.school_id = $1
             ORDER BY tv.vehicle_number ASC`,
            [schoolId]
        );
        return NextResponse.json({ vehicles });
    } catch (error) {
        console.error('Error fetching transport vehicles:', error);
        return NextResponse.json({ error: 'Failed to fetch vehicles' }, { status: 500 });
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
        const { vehicleNumber, vehicleType, capacity, driverName, driverPhone, insuranceExpiry } = await request.json();

        if (!vehicleNumber || !vehicleType || !capacity) {
            return NextResponse.json({ error: 'Vehicle number, type, and capacity are required' }, { status: 400 });
        }

        // Duplicate check
        const duplicate = await queryOne<any>(
            `SELECT id FROM transport_vehicles WHERE school_id = $1 AND vehicle_number = $2`,
            [schoolId, vehicleNumber.trim()]
        );
        if (duplicate) {
            return NextResponse.json({ error: 'A vehicle with this number already exists' }, { status: 400 });
        }

        const vehicle = await queryOne<any>(
            `INSERT INTO transport_vehicles (school_id, vehicle_number, vehicle_type, capacity, driver_name, driver_phone, insurance_expiry)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                schoolId,
                vehicleNumber.trim(),
                vehicleType,
                parseInt(capacity),
                driverName ? driverName.trim() : null,
                driverPhone ? driverPhone.trim() : null,
                insuranceExpiry || null
            ]
        );

        return NextResponse.json({ vehicle }, { status: 201 });
    } catch (error) {
        console.error('Error creating vehicle:', error);
        return NextResponse.json({ error: 'Failed to create vehicle' }, { status: 500 });
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
        const { id, vehicleNumber, vehicleType, capacity, driverName, driverPhone, insuranceExpiry } = await request.json();

        if (!id || !vehicleNumber || !vehicleType || !capacity) {
            return NextResponse.json({ error: 'ID, vehicle number, type, and capacity are required' }, { status: 400 });
        }

        // Verify ownership
        const existing = await queryOne<any>(
            `SELECT school_id FROM transport_vehicles WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        // Duplicate check
        const duplicate = await queryOne<any>(
            `SELECT id FROM transport_vehicles WHERE school_id = $1 AND vehicle_number = $2 AND id != $3`,
            [schoolId, vehicleNumber.trim(), id]
        );
        if (duplicate) {
            return NextResponse.json({ error: 'Another vehicle with this number already exists' }, { status: 400 });
        }

        const vehicle = await queryOne<any>(
            `UPDATE transport_vehicles SET
                vehicle_number = $2,
                vehicle_type = $3,
                capacity = $4,
                driver_name = $5,
                driver_phone = $6,
                insurance_expiry = $7,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [
                id,
                vehicleNumber.trim(),
                vehicleType,
                parseInt(capacity),
                driverName ? driverName.trim() : null,
                driverPhone ? driverPhone.trim() : null,
                insuranceExpiry || null
            ]
        );

        return NextResponse.json({ vehicle });
    } catch (error) {
        console.error('Error updating vehicle:', error);
        return NextResponse.json({ error: 'Failed to update vehicle' }, { status: 500 });
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
            `SELECT school_id FROM transport_vehicles WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        // Delete vehicle
        await query(`DELETE FROM transport_vehicles WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting vehicle:', error);
        return NextResponse.json({ error: 'Failed to delete vehicle' }, { status: 500 });
    }
}
