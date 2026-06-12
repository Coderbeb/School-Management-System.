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

    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get('routeId');
    const classId = searchParams.get('classId');
    const search = searchParams.get('search');

    try {
        let sql = `
            SELECT ta.*,
                s.name as student_name, s.admission_number,
                tr.route_name,
                ts.stop_name, ts.pickup_time, ts.drop_time,
                c.name as class_name, cs.name as section_name
            FROM transport_assignments ta
            JOIN students s ON ta.student_id = s.id
            JOIN transport_routes tr ON ta.route_id = tr.id
            JOIN transport_stops ts ON ta.stop_id = ts.id
            LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.status = 'active'
            LEFT JOIN class_sections cs ON se.class_section_id = cs.id
            LEFT JOIN classes c ON cs.class_id = c.id
            WHERE ta.school_id = $1
        `;
        const params: unknown[] = [schoolId];
        let idx = 2;

        if (routeId) {
            sql += ` AND ta.route_id = $${idx++}`;
            params.push(routeId);
        }

        if (classId) {
            sql += ` AND c.id = $${idx++}`;
            params.push(classId);
        }

        if (search) {
            sql += ` AND (s.name ILIKE $${idx} OR s.admission_number ILIKE $${idx})`;
            params.push(`%${search}%`);
            idx++;
        }

        sql += ` ORDER BY tr.route_name ASC, ts.sequence_order ASC, s.name ASC`;
        const assignments = await query<any>(sql, params);

        return NextResponse.json({ assignments });
    } catch (error) {
        console.error('Error fetching transport assignments:', error);
        return NextResponse.json({ error: 'Failed to fetch transport assignments' }, { status: 500 });
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
        const { studentId, routeId, stopId, monthlyFare, fromDate, toDate } = await request.json();

        if (!studentId || !routeId || !stopId) {
            return NextResponse.json({ error: 'Student, Route, and Stop are required' }, { status: 400 });
        }

        // Fetch stop details to get default fare if not provided
        const stop = await queryOne<any>(
            `SELECT monthly_fare FROM transport_stops WHERE id = $1 AND route_id = $2`,
            [stopId, routeId]
        );
        if (!stop) {
            return NextResponse.json({ error: 'Invalid Stop or Route selection' }, { status: 400 });
        }

        const finalFare = monthlyFare !== undefined ? parseFloat(monthlyFare) : parseFloat(stop.monthly_fare);

        const assignment = await queryOne<any>(
            `INSERT INTO transport_assignments (school_id, student_id, route_id, stop_id, from_date, to_date, monthly_fare, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
             ON CONFLICT (school_id, student_id) 
             DO UPDATE SET 
                route_id = EXCLUDED.route_id, 
                stop_id = EXCLUDED.stop_id, 
                from_date = EXCLUDED.from_date, 
                to_date = EXCLUDED.to_date, 
                monthly_fare = EXCLUDED.monthly_fare, 
                status = 'active', 
                updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [
                schoolId,
                studentId,
                routeId,
                stopId,
                fromDate || new Date().toISOString().split('T')[0],
                toDate || null,
                finalFare
            ]
        );

        return NextResponse.json({ assignment }, { status: 201 });
    } catch (error) {
        console.error('Error creating assignment:', error);
        return NextResponse.json({ error: 'Failed to assign transport' }, { status: 500 });
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
        const { id, studentId, routeId, stopId, monthlyFare, fromDate, toDate, status } = await request.json();

        if (!id || !studentId || !routeId || !stopId) {
            return NextResponse.json({ error: 'ID, Student, Route, and Stop are required' }, { status: 400 });
        }

        // Verify ownership
        const existing = await queryOne<any>(
            `SELECT school_id FROM transport_assignments WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        // Fetch stop details to get default fare if not provided
        const stop = await queryOne<any>(
            `SELECT monthly_fare FROM transport_stops WHERE id = $1 AND route_id = $2`,
            [stopId, routeId]
        );
        if (!stop) {
            return NextResponse.json({ error: 'Invalid Stop or Route selection' }, { status: 400 });
        }

        const finalFare = monthlyFare !== undefined ? parseFloat(monthlyFare) : parseFloat(stop.monthly_fare);

        const assignment = await queryOne<any>(
            `UPDATE transport_assignments SET
                student_id = $2,
                route_id = $3,
                stop_id = $4,
                from_date = $5,
                to_date = $6,
                monthly_fare = $7,
                status = $8,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [
                id,
                studentId,
                routeId,
                stopId,
                fromDate,
                toDate || null,
                finalFare,
                status || 'active'
            ]
        );

        return NextResponse.json({ assignment });
    } catch (error) {
        console.error('Error updating assignment:', error);
        return NextResponse.json({ error: 'Failed to update transport assignment' }, { status: 500 });
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
            `SELECT school_id FROM transport_assignments WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        await query(`DELETE FROM transport_assignments WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting assignment:', error);
        return NextResponse.json({ error: 'Failed to delete transport assignment' }, { status: 500 });
    }
}
