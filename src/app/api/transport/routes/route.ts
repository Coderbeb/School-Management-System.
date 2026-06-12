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
        const routes = await query<any>(
            `SELECT tr.*, tv.vehicle_number, tv.driver_name, tv.driver_phone,
                (SELECT COUNT(*)::integer FROM transport_assignments ta WHERE ta.route_id = tr.id AND ta.status = 'active') as student_count
             FROM transport_routes tr
             LEFT JOIN transport_vehicles tv ON tr.vehicle_id = tv.id
             WHERE tr.school_id = $1
             ORDER BY tr.route_name ASC`,
            [schoolId]
        );

        // Fetch stops for each route
        for (const r of routes) {
            r.stops = await query<any>(
                `SELECT * FROM transport_stops 
                 WHERE route_id = $1 AND school_id = $2
                 ORDER BY sequence_order ASC`,
                [r.id, schoolId]
            );
        }

        return NextResponse.json({ routes });
    } catch (error) {
        console.error('Error fetching transport routes:', error);
        return NextResponse.json({ error: 'Failed to fetch routes' }, { status: 500 });
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
        const { routeName, vehicleId, stops } = await request.json();

        if (!routeName) {
            return NextResponse.json({ error: 'Route name is required' }, { status: 400 });
        }

        // Check duplicate route name
        const duplicate = await queryOne<any>(
            `SELECT id FROM transport_routes WHERE school_id = $1 AND route_name = $2`,
            [schoolId, routeName.trim()]
        );
        if (duplicate) {
            return NextResponse.json({ error: 'A route with this name already exists' }, { status: 400 });
        }

        // Insert route
        const route = await queryOne<any>(
            `INSERT INTO transport_routes (school_id, route_name, vehicle_id)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [schoolId, routeName.trim(), vehicleId || null]
        );

        // Insert stops if provided
        if (stops && Array.isArray(stops)) {
            for (let i = 0; i < stops.length; i++) {
                const s = stops[i];
                await query(
                    `INSERT INTO transport_stops (school_id, route_id, stop_name, pickup_time, drop_time, sequence_order, monthly_fare)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        schoolId,
                        route.id,
                        s.stopName.trim(),
                        s.pickupTime || null,
                        s.dropTime || null,
                        s.sequenceOrder !== undefined ? parseInt(s.sequenceOrder) : i + 1,
                        s.monthlyFare ? parseFloat(s.monthlyFare) : 0
                    ]
                );
            }
        }

        // Fetch completed route
        route.stops = await query<any>(
            `SELECT * FROM transport_stops WHERE route_id = $1 ORDER BY sequence_order ASC`,
            [route.id]
        );

        return NextResponse.json({ route }, { status: 201 });
    } catch (error) {
        console.error('Error creating route:', error);
        return NextResponse.json({ error: 'Failed to create route' }, { status: 500 });
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
        const { id, routeName, vehicleId, stops } = await request.json();

        if (!id || !routeName) {
            return NextResponse.json({ error: 'ID and route name are required' }, { status: 400 });
        }

        // Verify route belongs to school
        const existingRoute = await queryOne<any>(
            `SELECT school_id FROM transport_routes WHERE id = $1`, [id]
        );
        if (!existingRoute || existingRoute.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        // Check duplicate name
        const duplicate = await queryOne<any>(
            `SELECT id FROM transport_routes WHERE school_id = $1 AND route_name = $2 AND id != $3`,
            [schoolId, routeName.trim(), id]
        );
        if (duplicate) {
            return NextResponse.json({ error: 'Another route with this name already exists' }, { status: 400 });
        }

        // Update route details
        const route = await queryOne<any>(
            `UPDATE transport_routes SET
                route_name = $2,
                vehicle_id = $3,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [id, routeName.trim(), vehicleId || null]
        );

        if (stops && Array.isArray(stops)) {
            // Get existing stops from DB
            const dbStops = await query<any>(
                `SELECT id, stop_name FROM transport_stops WHERE route_id = $1 AND school_id = $2`,
                [id, schoolId]
            );

            const incomingIds = stops.map(s => s.id).filter(Boolean);
            const stopsToDelete = dbStops.filter(dbS => !incomingIds.includes(dbS.id));

            // Check if any stop to delete has assignments
            for (const sToDelete of stopsToDelete) {
                const assigned = await queryOne<{ count: string }>(
                    `SELECT COUNT(*) as count FROM transport_assignments WHERE stop_id = $1 AND status = 'active'`,
                    [sToDelete.id]
                );
                if (assigned && parseInt(assigned.count) > 0) {
                    return NextResponse.json({
                        error: `Cannot delete stop "${sToDelete.stop_name}" because students are currently assigned to it.`
                    }, { status: 400 });
                }
            }

            // Perform deletes
            for (const sToDelete of stopsToDelete) {
                await query(`DELETE FROM transport_stops WHERE id = $1`, [sToDelete.id]);
            }

            // Save/Update incoming stops
            for (let i = 0; i < stops.length; i++) {
                const s = stops[i];
                if (s.id) {
                    // Update
                    await query(
                        `UPDATE transport_stops SET
                            stop_name = $1,
                            pickup_time = $2,
                            drop_time = $3,
                            sequence_order = $4,
                            monthly_fare = $5,
                            updated_at = CURRENT_TIMESTAMP
                         WHERE id = $6 AND school_id = $7`,
                        [
                            s.stopName.trim(),
                            s.pickupTime || null,
                            s.dropTime || null,
                            s.sequenceOrder !== undefined ? parseInt(s.sequenceOrder) : i + 1,
                            s.monthlyFare ? parseFloat(s.monthlyFare) : 0,
                            s.id,
                            schoolId
                        ]
                    );
                } else {
                    // Insert
                    await query(
                        `INSERT INTO transport_stops (school_id, route_id, stop_name, pickup_time, drop_time, sequence_order, monthly_fare)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [
                            schoolId,
                            id,
                            s.stopName.trim(),
                            s.pickupTime || null,
                            s.dropTime || null,
                            s.sequenceOrder !== undefined ? parseInt(s.sequenceOrder) : i + 1,
                            s.monthlyFare ? parseFloat(s.monthlyFare) : 0
                        ]
                    );
                }
            }
        }

        // Fetch final stops
        route.stops = await query<any>(
            `SELECT * FROM transport_stops WHERE route_id = $1 ORDER BY sequence_order ASC`,
            [id]
        );

        return NextResponse.json({ route });
    } catch (error) {
        console.error('Error updating route:', error);
        return NextResponse.json({ error: 'Failed to update route' }, { status: 500 });
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
        const existingRoute = await queryOne<any>(
            `SELECT school_id FROM transport_routes WHERE id = $1`, [id]
        );
        if (!existingRoute || existingRoute.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        // Check if any student is assigned to this route
        const assigned = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM transport_assignments WHERE route_id = $1 AND status = 'active'`,
            [id]
        );
        if (assigned && parseInt(assigned.count) > 0) {
            return NextResponse.json({
                error: 'Cannot delete route as students are currently assigned to it.'
            }, { status: 400 });
        }

        // Delete stops then route
        await query(`DELETE FROM transport_stops WHERE route_id = $1`, [id]);
        await query(`DELETE FROM transport_routes WHERE id = $1`, [id]);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting route:', error);
        return NextResponse.json({ error: 'Failed to delete route' }, { status: 500 });
    }
}
