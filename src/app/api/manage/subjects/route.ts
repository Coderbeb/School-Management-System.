import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET: List all subjects, optionally filtered by classId and sessionId (scoped by school)
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const classId = searchParams.get('classId');
        const sessionId = searchParams.get('sessionId');

        // If classId and sessionId are provided, return subjects assigned to that class
        if (classId && sessionId) {
            let sql = `SELECT s.*, cs.id as class_subject_id, cs.is_elective
                 FROM subjects s
                 JOIN class_subjects cs ON s.id = cs.subject_id
                 WHERE cs.class_id = $1 AND cs.session_id = $2`;
            const params: unknown[] = [classId, sessionId];

            if (schoolId) {
                sql += ` AND s.school_id = $3`;
                params.push(schoolId);
            }

            sql += ` ORDER BY s.name ASC`;
            const subjects = await query(sql, params);
            return NextResponse.json({ subjects });
        }

        // Otherwise, return all subjects from master list
        let sql = `SELECT * FROM subjects WHERE 1=1`;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) {
            sql += ` AND school_id = $${idx++}`;
            params.push(schoolId);
        }

        sql += ` ORDER BY name ASC`;
        const subjects = await query(sql, params);
        return NextResponse.json({ subjects });
    } catch (error) {
        console.error('GET subjects error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST: Create a new subject in the master list
export async function POST(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { name, code, description } = await request.json();

        if (!name || !code) {
            return NextResponse.json({ error: 'Subject name and code are required' }, { status: 400 });
        }
        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        const subject = await queryOne(
            `INSERT INTO subjects (name, code, description, school_id)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [name, code.toUpperCase(), description || null, schoolId]
        );

        return NextResponse.json({ subject }, { status: 201 });
    } catch (error: any) {
        console.error('POST subject error:', error);
        if (error?.code === '23505') {
            return NextResponse.json({ error: 'A subject with this code already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT: Update a subject
export async function PUT(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { id, name, code, description, isActive } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Subject ID is required' }, { status: 400 });
        }

        let sql = `UPDATE subjects
             SET name = COALESCE($2, name),
                 code = COALESCE($3, code),
                 description = COALESCE($4, description),
                 is_active = COALESCE($5, is_active),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`;
        const params: unknown[] = [id, name, code?.toUpperCase(), description, isActive];

        if (schoolId) {
            sql += ` AND school_id = $6`;
            params.push(schoolId);
        }

        sql += ` RETURNING *`;
        const subject = await queryOne(sql, params);

        if (!subject) {
            return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
        }

        return NextResponse.json({ subject });
    } catch (error) {
        console.error('PUT subject error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE: Delete a subject
export async function DELETE(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Subject ID is required' }, { status: 400 });
        }

        let sql = 'DELETE FROM subjects WHERE id = $1';
        const params: unknown[] = [id];
        if (schoolId) {
            sql += ' AND school_id = $2';
            params.push(schoolId);
        }

        await query(sql, params);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('DELETE subject error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
