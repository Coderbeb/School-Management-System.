import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';

// GET: List all co-scholastic areas
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request);
    if (auth.error) return auth.error;

    try {
        const result = await query<any>(
            `SELECT * FROM co_scholastic_areas WHERE is_active = true ORDER BY display_order ASC`
        );
        return NextResponse.json({ areas: result });
    } catch (error) {
        console.error('Error fetching co-scholastic areas:', error);
        return NextResponse.json({ error: 'Failed to fetch areas' }, { status: 500 });
    }
}

// POST: Create a new co-scholastic area
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    try {
        const body = await request.json();
        const { name, description } = body;

        if (!name) {
            return NextResponse.json({ error: 'Area name is required' }, { status: 400 });
        }

        const maxOrder = await queryOne<{ max: number }>(`SELECT COALESCE(MAX(display_order), 0) as max FROM co_scholastic_areas`);
        const nextOrder = (maxOrder?.max || 0) + 1;

        const result = await queryOne(
            `INSERT INTO co_scholastic_areas (name, description, display_order)
             VALUES ($1, $2, $3) RETURNING *`,
            [name, description || null, nextOrder]
        );

        return NextResponse.json({ area: result }, { status: 201 });
    } catch (error: unknown) {
        console.error('Error creating co-scholastic area:', error);
        const msg = error instanceof Error ? error.message : 'Failed to create';
        if (msg.includes('unique') || msg.includes('duplicate')) {
            return NextResponse.json({ error: 'An area with this name already exists' }, { status: 409 });
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// PUT: Update a co-scholastic area
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    try {
        const body = await request.json();
        const { id, name, description } = body;

        if (!id || !name) {
            return NextResponse.json({ error: 'ID and name are required' }, { status: 400 });
        }

        const result = await queryOne(
            `UPDATE co_scholastic_areas SET name = $2, description = $3 WHERE id = $1 RETURNING *`,
            [id, name, description || null]
        );

        if (!result) return NextResponse.json({ error: 'Area not found' }, { status: 404 });
        return NextResponse.json({ area: result });
    } catch (error) {
        console.error('Error updating co-scholastic area:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}

// DELETE: Soft-delete a co-scholastic area
export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Area ID is required' }, { status: 400 });

        await query(`UPDATE co_scholastic_areas SET is_active = false WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting co-scholastic area:', error);
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
