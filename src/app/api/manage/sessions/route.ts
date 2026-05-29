import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET: List all academic sessions (scoped by school)
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        let sql = `SELECT * FROM academic_sessions WHERE 1=1`;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) {
            sql += ` AND school_id = $${idx++}`;
            params.push(schoolId);
        }

        sql += ` ORDER BY start_date DESC`;
        const sessions = await query(sql, params);
        return NextResponse.json({ sessions });
    } catch (error) {
        console.error('GET sessions error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST: Create a new academic session
export async function POST(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { name, startDate, endDate, isCurrent } = await request.json();

        if (!name || !startDate || !endDate) {
            return NextResponse.json({ error: 'Name, start date, and end date are required' }, { status: 400 });
        }

        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        // If setting this session as current, unset all others for THIS school first
        if (isCurrent) {
            await query(`UPDATE academic_sessions SET is_current = false WHERE is_current = true AND school_id = $1`, [schoolId]);
        }

        const session = await queryOne(
            `INSERT INTO academic_sessions (name, start_date, end_date, is_current, school_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [name, startDate, endDate, isCurrent || false, schoolId]
        );

        return NextResponse.json({ session }, { status: 201 });
    } catch (error: any) {
        console.error('POST session error:', error);
        if (error?.code === '23505') {
            return NextResponse.json({ error: 'A session with this name already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT: Update an academic session
export async function PUT(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { id, name, startDate, endDate, isCurrent } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
        }

        // If setting this session as current, unset all others for THIS school first
        if (isCurrent && schoolId) {
            await query(`UPDATE academic_sessions SET is_current = false WHERE is_current = true AND id != $1 AND school_id = $2`, [id, schoolId]);
        } else if (isCurrent) {
            await query(`UPDATE academic_sessions SET is_current = false WHERE is_current = true AND id != $1`, [id]);
        }

        let sql = `UPDATE academic_sessions
             SET name = COALESCE($2, name),
                 start_date = COALESCE($3, start_date),
                 end_date = COALESCE($4, end_date),
                 is_current = COALESCE($5, is_current),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`;
        const params: unknown[] = [id, name, startDate, endDate, isCurrent];

        if (schoolId) {
            sql += ` AND school_id = $6`;
            params.push(schoolId);
        }

        sql += ` RETURNING *`;
        const session = await queryOne(sql, params);

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        return NextResponse.json({ session });
    } catch (error) {
        console.error('PUT session error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
