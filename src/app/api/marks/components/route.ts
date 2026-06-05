import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET: List mark components (school-specific + global defaults)
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        // Show global components (school_id IS NULL) + this school's custom components
        let sql = `SELECT * FROM mark_components WHERE school_id IS NULL`;
        const params: unknown[] = [];

        if (schoolId) {
            sql += ` OR school_id = $1`;
            params.push(schoolId);
        }

        sql += ` ORDER BY display_order ASC`;

        const result = await query<any>(sql, params);
        return NextResponse.json({ components: result });
    } catch (error) {
        console.error('Error fetching mark components:', error);
        return NextResponse.json({ error: 'Failed to fetch mark components' }, { status: 500 });
    }
}

// POST: Create a school-specific mark component
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const body = await request.json();
        const { name, shortName } = body;

        if (!name || !shortName) {
            return NextResponse.json({ error: 'Name and short name are required' }, { status: 400 });
        }

        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        // Get next display order
        const maxOrder = await queryOne<{ max: number }>(
            `SELECT COALESCE(MAX(display_order), 0) as max FROM mark_components WHERE school_id = $1 OR school_id IS NULL`,
            [schoolId]
        );

        const result = await queryOne(
            `INSERT INTO mark_components (name, short_name, school_id, display_order)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [name, shortName, schoolId, (maxOrder?.max || 0) + 1]
        );

        return NextResponse.json({ component: result }, { status: 201 });
    } catch (error: unknown) {
        console.error('Error creating mark component:', error);
        const msg = error instanceof Error ? error.message : 'Failed to create';
        if (msg.includes('unique') || msg.includes('duplicate')) {
            return NextResponse.json({ error: 'A component with this name already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// DELETE: Delete a school-specific mark component (cannot delete global defaults)
export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Component ID is required' }, { status: 400 });
        }

        // Only allow deleting school-specific components (not global ones)
        const component = await queryOne<any>(
            `SELECT * FROM mark_components WHERE id = $1`,
            [id]
        );

        if (!component) {
            return NextResponse.json({ error: 'Component not found' }, { status: 404 });
        }

        if (!component.school_id) {
            return NextResponse.json({ error: 'Cannot delete global default components' }, { status: 403 });
        }

        if (schoolId && component.school_id !== schoolId) {
            return NextResponse.json({ error: 'Cannot delete components from another school' }, { status: 403 });
        }

        // Check if component is in use
        const inUse = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM exam_subject_components WHERE component_id = $1`,
            [id]
        );

        if (inUse && parseInt(inUse.count) > 0) {
            return NextResponse.json({ error: 'Cannot delete: this component is used in exam configurations' }, { status: 400 });
        }

        await query(`DELETE FROM mark_components WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting mark component:', error);
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
