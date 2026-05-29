import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET: List all sections (scoped by school)
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        let sql = `SELECT * FROM sections WHERE 1=1`;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) {
            sql += ` AND school_id = $${idx++}`;
            params.push(schoolId);
        }

        sql += ` ORDER BY name ASC`;
        const sections = await query(sql, params);
        return NextResponse.json({ sections });
    } catch (error) {
        console.error('GET sections error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST: Create a new section
export async function POST(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { name } = await request.json();

        if (!name) {
            return NextResponse.json({ error: 'Section name is required' }, { status: 400 });
        }
        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        const section = await queryOne(
            `INSERT INTO sections (name, school_id) VALUES ($1, $2) RETURNING *`,
            [name.toUpperCase(), schoolId]
        );

        return NextResponse.json({ section }, { status: 201 });
    } catch (error: any) {
        console.error('POST section error:', error);
        if (error?.code === '23505') {
            return NextResponse.json({ error: 'Section already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE: Delete a section
export async function DELETE(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Section ID is required' }, { status: 400 });
        }

        let sql = 'DELETE FROM sections WHERE id = $1';
        const params: unknown[] = [id];
        if (schoolId) {
            sql += ' AND school_id = $2';
            params.push(schoolId);
        }

        await query(sql, params);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('DELETE section error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
