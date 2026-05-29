import { NextRequest, NextResponse } from 'next/server';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';
import { queryOne } from '@/lib/db';

interface SchoolGeoRow {
    geo_lat: string | null;
    geo_lng: string | null;
    geo_radius_meters: number | null;
    staff_entry_time: string | null;
    staff_grace_minutes: number | null;
    staff_exit_time: string | null;
}

// GET: Fetch staff attendance configuration
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        // First check if the columns exist (migration may not have run yet)
        try {
            const row = await queryOne<SchoolGeoRow>(
                `SELECT geo_lat, geo_lng, geo_radius_meters, staff_entry_time, staff_grace_minutes, staff_exit_time
                 FROM schools WHERE id = $1`,
                [schoolId]
            );

            if (!row) {
                return NextResponse.json({ error: 'School not found' }, { status: 404 });
            }

            // Transform DB column names to frontend-friendly names
            const settings = {
                latitude: row.geo_lat ? parseFloat(String(row.geo_lat)) : null,
                longitude: row.geo_lng ? parseFloat(String(row.geo_lng)) : null,
                geofence_radius: row.geo_radius_meters || 200,
                entry_time: row.staff_entry_time ? String(row.staff_entry_time).substring(0, 5) : '08:00',
                grace_period: row.staff_grace_minutes ?? 15,
                exit_time: row.staff_exit_time ? String(row.staff_exit_time).substring(0, 5) : '15:30',
            };

            return NextResponse.json({ settings });
        } catch (dbErr: unknown) {
            // If columns don't exist yet (migration hasn't run), return defaults
            const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
            if (errMsg.includes('column') && (errMsg.includes('does not exist') || errMsg.includes('geo_lat'))) {
                return NextResponse.json({
                    settings: {
                        latitude: null,
                        longitude: null,
                        geofence_radius: 200,
                        entry_time: '08:00',
                        grace_period: 15,
                        exit_time: '15:30',
                    }
                });
            }
            throw dbErr;
        }
    } catch (error) {
        console.error('GET staff-attendance settings error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT: Save staff attendance configuration
export async function PUT(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        const body = await request.json();

        // Accept both naming conventions from frontend
        const latitude = body.latitude;
        const longitude = body.longitude;
        const radius = body.geofence_radius || body.radius || 200;
        const entryTime = body.entry_time || body.entryTime || '08:00';
        const graceMinutes = body.grace_period ?? body.graceMinutes ?? 15;
        const exitTime = body.exit_time || body.exitTime || '15:30';

        if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
            return NextResponse.json({ error: 'Please capture school location first by clicking "Use My Current Location"' }, { status: 400 });
        }

        const updated = await queryOne<SchoolGeoRow>(
            `UPDATE schools SET
                 geo_lat = $1,
                 geo_lng = $2,
                 geo_radius_meters = $3,
                 staff_entry_time = $4,
                 staff_grace_minutes = $5,
                 staff_exit_time = $6,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $7
             RETURNING geo_lat, geo_lng, geo_radius_meters, staff_entry_time, staff_grace_minutes, staff_exit_time`,
            [latitude, longitude, radius, entryTime, graceMinutes, exitTime, schoolId]
        );

        if (!updated) {
            return NextResponse.json({ error: 'School not found' }, { status: 404 });
        }

        // Return in frontend-friendly format
        const settings = {
            latitude: updated.geo_lat ? parseFloat(String(updated.geo_lat)) : null,
            longitude: updated.geo_lng ? parseFloat(String(updated.geo_lng)) : null,
            geofence_radius: updated.geo_radius_meters || 200,
            entry_time: updated.staff_entry_time ? String(updated.staff_entry_time).substring(0, 5) : '08:00',
            grace_period: updated.staff_grace_minutes ?? 15,
            exit_time: updated.staff_exit_time ? String(updated.staff_exit_time).substring(0, 5) : '15:30',
        };

        return NextResponse.json({ settings, message: 'Staff attendance settings updated successfully!' });
    } catch (error) {
        console.error('PUT staff-attendance settings error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
