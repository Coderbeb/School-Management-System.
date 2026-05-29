import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET: List all classes (scoped by school)
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        let sql = `SELECT * FROM classes WHERE 1=1`;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) {
            sql += ` AND school_id = $${idx++}`;
            params.push(schoolId);
        }

        sql += ` ORDER BY display_order ASC, name ASC`;
        const classes = await query(sql, params);
        return NextResponse.json({ classes });
    } catch (error) {
        console.error('GET classes error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST: Create a new class
export async function POST(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { name, displayOrder } = await request.json();

        if (!name) {
            return NextResponse.json({ error: 'Class name is required' }, { status: 400 });
        }
        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        const newClass = await queryOne(
            `INSERT INTO classes (name, display_order, school_id)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [name, displayOrder || 0, schoolId]
        );

        return NextResponse.json({ class: newClass }, { status: 201 });
    } catch (error: any) {
        console.error('POST class error:', error);
        if (error?.code === '23505') {
            return NextResponse.json({ error: 'A class with this name already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT: Update a class
export async function PUT(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { id, name, displayOrder, isActive } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Class ID is required' }, { status: 400 });
        }

        let sql = `UPDATE classes
             SET name = COALESCE($2, name),
                 display_order = COALESCE($3, display_order),
                 is_active = COALESCE($4, is_active),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`;
        const params: unknown[] = [id, name, displayOrder, isActive];

        if (schoolId) {
            sql += ` AND school_id = $5`;
            params.push(schoolId);
        }

        sql += ` RETURNING *`;
        const updatedClass = await queryOne(sql, params);

        if (!updatedClass) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 });
        }

        return NextResponse.json({ class: updatedClass });
    } catch (error) {
        console.error('PUT class error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE: Delete a class
export async function DELETE(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Class ID is required' }, { status: 400 });
        }

        let sql = 'DELETE FROM classes WHERE id = $1';
        const params: unknown[] = [id];

        if (schoolId) {
            sql += ' AND school_id = $2';
            params.push(schoolId);
        }

        await query(sql, params);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('DELETE class error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
