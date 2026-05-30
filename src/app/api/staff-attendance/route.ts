import { NextRequest, NextResponse } from 'next/server';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

// Haversine formula: returns distance in meters between two lat/lng points
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

interface SchoolGeoSettings {
    geo_lat: number | null;
    geo_lng: number | null;
    geo_radius_meters: number;
    staff_entry_time: string;
    staff_grace_minutes: number;
    staff_exit_time: string;
}

interface StaffAttendanceRow {
    id: string;
    user_id: string;
    school_id: string;
    date: string;
    check_in_time: string | null;
    check_out_time: string | null;
    check_in_lat: number | null;
    check_in_lng: number | null;
    check_out_lat: number | null;
    check_out_lng: number | null;
    status: string;
    auto_status: string | null;
    remarks: string | null;
    created_at: string;
    first_name?: string;
    last_name?: string;
    working_hours?: number | null;
}

// POST: Check-in or Check-out
export async function POST(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'teacher', 'accountant']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        const { latitude, longitude, action } = await request.json();

        if (latitude === undefined || latitude === null || longitude === undefined || longitude === null || !action) {
            return NextResponse.json({ error: 'latitude, longitude, and action are required' }, { status: 400 });
        }
        if (action !== 'check_in' && action !== 'check_out') {
            return NextResponse.json({ error: 'action must be check_in or check_out' }, { status: 400 });
        }

        // Fetch school geo settings
        const school = await queryOne<SchoolGeoSettings>(
            `SELECT geo_lat, geo_lng, geo_radius_meters, staff_entry_time, staff_grace_minutes, staff_exit_time
             FROM schools WHERE id = $1`,
            [schoolId]
        );

        if (!school || school.geo_lat === null || school.geo_lng === null) {
            return NextResponse.json({ error: 'Staff attendance location not configured by admin' }, { status: 400 });
        }

        // Calculate distance from school
        const distance = haversineDistance(Number(latitude), Number(longitude), Number(school.geo_lat), Number(school.geo_lng));
        const radiusMeters = school.geo_radius_meters || 200;

        if (distance > radiusMeters) {
            return NextResponse.json({
                error: `You are too far from the school. Distance: ${Math.round(distance)}m, allowed: ${radiusMeters}m`,
                distance: Math.round(distance),
                allowed: radiusMeters,
            }, { status: 400 });
        }

        // IST date for today
        const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        // --- Holiday constraint: block attendance on Sundays and school holidays ---
        const todayDateObj = new Date(todayIST + 'T00:00:00+05:30');
        if (todayDateObj.getDay() === 0) {
            return NextResponse.json({ error: 'Attendance marking is disabled on Sundays.' }, { status: 400 });
        }
        const holidayRecord = await queryOne<{ id: string; name: string }>(
            `SELECT id, name FROM holidays WHERE school_id = $1 AND date = $2`,
            [schoolId, todayIST]
        );
        if (holidayRecord) {
            return NextResponse.json({ error: `Attendance marking is disabled today — ${holidayRecord.name}` }, { status: 400 });
        }
        // --- End holiday constraint ---

        if (action === 'check_in') {
            // Prevent duplicate check-in overwrite
            const existingRecord = await queryOne<StaffAttendanceRow>(
                `SELECT id FROM staff_attendance WHERE user_id = $1 AND date = $2 AND check_in_time IS NOT NULL`,
                [auth.user.userId, todayIST]
            );

            if (existingRecord) {
                return NextResponse.json({ error: 'Already checked in for today' }, { status: 400 });
            }

            // Determine auto_status based on current time vs entry_time + grace
            const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
            const [entryH, entryM] = school.staff_entry_time.split(':').map(Number);
            const graceMinutes = school.staff_grace_minutes || 15;

            const entryDeadline = new Date(nowIST);
            entryDeadline.setHours(entryH, entryM + graceMinutes, 0, 0);

            const autoStatus = nowIST <= entryDeadline ? 'present' : 'late';
            const status = autoStatus;

            const record = await queryOne<StaffAttendanceRow>(
                `INSERT INTO staff_attendance (user_id, school_id, date, check_in_time, check_in_lat, check_in_lng, status, auto_status)
                 VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)
                 ON CONFLICT (user_id, date) DO UPDATE SET
                     check_in_time = COALESCE(staff_attendance.check_in_time, EXCLUDED.check_in_time),
                     check_in_lat = COALESCE(staff_attendance.check_in_lat, EXCLUDED.check_in_lat),
                     check_in_lng = COALESCE(staff_attendance.check_in_lng, EXCLUDED.check_in_lng),
                     status = EXCLUDED.status,
                     auto_status = EXCLUDED.auto_status
                 RETURNING *`,
                [auth.user.userId, schoolId, todayIST, latitude, longitude, status, autoStatus]
            );

            return NextResponse.json({ record, message: `Checked in successfully (${autoStatus})` });
        } else {
            // check_out
            // Check if half_day: if current time is significantly before exit time
            const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
            const [exitH, exitM] = school.staff_exit_time.split(':').map(Number);

            const exitTime = new Date(nowIST);
            exitTime.setHours(exitH, exitM, 0, 0);

            // If leaving more than 1 hour before exit time, mark as half_day
            const earlyByMs = exitTime.getTime() - nowIST.getTime();
            const earlyByMinutes = earlyByMs / (1000 * 60);

            let statusUpdate = '';
            const params: unknown[] = [latitude, longitude, auth.user.userId, todayIST];

            if (earlyByMinutes > 60) {
                statusUpdate = `, status = 'half_day'`;
            }

            const record = await queryOne<StaffAttendanceRow>(
                `UPDATE staff_attendance SET
                     check_out_time = NOW(),
                     check_out_lat = $1,
                     check_out_lng = $2
                     ${statusUpdate}
                 WHERE user_id = $3 AND date = $4
                 RETURNING *`,
                params
            );

            if (!record) {
                return NextResponse.json({ error: 'No check-in record found for today' }, { status: 404 });
            }

            return NextResponse.json({ record, message: 'Checked out successfully' });
        }
    } catch (error) {
        console.error('POST staff-attendance error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// GET: Fetch staff attendance records
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const month = searchParams.get('month');   // YYYY-MM
        const date = searchParams.get('date');     // YYYY-MM-DD

        let sql = `SELECT sa.*,
                       u.first_name, u.last_name,
                       CASE WHEN sa.check_out_time IS NOT NULL AND sa.check_in_time IS NOT NULL
                            THEN ROUND(EXTRACT(EPOCH FROM (sa.check_out_time - sa.check_in_time))/3600, 2)
                            ELSE NULL
                       END as working_hours
                   FROM staff_attendance sa
                   JOIN users u ON sa.user_id = u.id
                   WHERE 1=1`;
        const params: unknown[] = [];
        let idx = 1;

        // School filter
        if (schoolId) {
            sql += ` AND sa.school_id = $${idx++}`;
            params.push(schoolId);
        }

        // Role-based access: teachers see only their own records
        if (auth.user.role === 'teacher' || auth.user.role === 'accountant') {
            sql += ` AND sa.user_id = $${idx++}`;
            params.push(auth.user.userId);
        } else if (userId) {
            // Admin can filter by specific user
            sql += ` AND sa.user_id = $${idx++}`;
            params.push(userId);
        }

        // Date filters
        if (date) {
            sql += ` AND sa.date = $${idx++}`;
            params.push(date);
        } else if (month) {
            sql += ` AND TO_CHAR(sa.date, 'YYYY-MM') = $${idx++}`;
            params.push(month);
        }

        sql += ` ORDER BY sa.date DESC, u.first_name ASC`;

        const records = await query<StaffAttendanceRow>(sql, params);
        return NextResponse.json({ records });
    } catch (error) {
        console.error('GET staff-attendance error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PATCH: Admin reset check-in or check-out for a specific record
export async function PATCH(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { recordId, resetType } = await request.json();

        if (!recordId || !resetType) {
            return NextResponse.json({ error: 'recordId and resetType are required' }, { status: 400 });
        }

        if (resetType !== 'check_in' && resetType !== 'check_out') {
            return NextResponse.json({ error: 'resetType must be check_in or check_out' }, { status: 400 });
        }

        // Verify the record belongs to this school
        const existing = await queryOne<StaffAttendanceRow>(
            `SELECT * FROM staff_attendance WHERE id = $1 AND school_id = $2`,
            [recordId, schoolId]
        );

        if (!existing) {
            return NextResponse.json({ error: 'Record not found' }, { status: 404 });
        }

        if (resetType === 'check_in') {
            // Reset check-in: clear check_in_time, check_in_lat, check_in_lng, and also check_out if exists
            const record = await queryOne<StaffAttendanceRow>(
                `UPDATE staff_attendance SET
                     check_in_time = NULL,
                     check_in_lat = NULL,
                     check_in_lng = NULL,
                     check_out_time = NULL,
                     check_out_lat = NULL,
                     check_out_lng = NULL,
                     status = 'absent',
                     auto_status = NULL,
                     remarks = COALESCE(remarks, '') || ' [Check-in reset by admin]'
                 WHERE id = $1
                 RETURNING *`,
                [recordId]
            );
            return NextResponse.json({ record, message: 'Check-in has been reset. Teacher can check in again.' });
        } else {
            // Reset check-out: clear check_out_time, check_out_lat, check_out_lng
            const record = await queryOne<StaffAttendanceRow>(
                `UPDATE staff_attendance SET
                     check_out_time = NULL,
                     check_out_lat = NULL,
                     check_out_lng = NULL,
                     status = COALESCE(auto_status, status),
                     remarks = COALESCE(remarks, '') || ' [Check-out reset by admin]'
                 WHERE id = $1
                 RETURNING *`,
                [recordId]
            );
            return NextResponse.json({ record, message: 'Check-out has been reset. Teacher can check out again.' });
        }
    } catch (error) {
        console.error('PATCH staff-attendance error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
