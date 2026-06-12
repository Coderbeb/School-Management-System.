import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher', 'student']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const categories = await query<any>(
            `SELECT * FROM library_categories WHERE school_id = $1 ORDER BY display_order ASC, name ASC`,
            [schoolId]
        );
        return NextResponse.json({ categories });
    } catch (error) {
        console.error('Error fetching library categories:', error);
        return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
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
        const { name, description, displayOrder } = await request.json();

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
        }

        const duplicate = await queryOne<any>(
            `SELECT id FROM library_categories WHERE school_id = $1 AND name = $2`,
            [schoolId, name.trim()]
        );
        if (duplicate) {
            return NextResponse.json({ error: 'A category with this name already exists' }, { status: 400 });
        }

        const category = await queryOne<any>(
            `INSERT INTO library_categories (school_id, name, description, display_order)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [schoolId, name.trim(), description?.trim() || null, displayOrder ?? 0]
        );

        return NextResponse.json({ category }, { status: 201 });
    } catch (error) {
        console.error('Error creating library category:', error);
        return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
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
        const { id, name, description, displayOrder, isActive } = await request.json();

        if (!id || !name?.trim()) {
            return NextResponse.json({ error: 'ID and name are required' }, { status: 400 });
        }

        // Verify ownership
        const existing = await queryOne<any>(
            `SELECT school_id FROM library_categories WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        // Duplicate check
        const duplicate = await queryOne<any>(
            `SELECT id FROM library_categories WHERE school_id = $1 AND name = $2 AND id != $3`,
            [schoolId, name.trim(), id]
        );
        if (duplicate) {
            return NextResponse.json({ error: 'Another category with this name already exists' }, { status: 400 });
        }

        const category = await queryOne<any>(
            `UPDATE library_categories SET
                name = $2, description = $3, display_order = $4, is_active = $5
             WHERE id = $1
             RETURNING *`,
            [id, name.trim(), description?.trim() || null, displayOrder ?? 0, isActive !== false]
        );

        return NextResponse.json({ category });
    } catch (error) {
        console.error('Error updating library category:', error);
        return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
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
        return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
    }

    try {
        const existing = await queryOne<any>(
            `SELECT school_id FROM library_categories WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        // Check if books use this category
        const bookCount = await queryOne<{ count: string }>(
            `SELECT COUNT(*)::integer as count FROM library_books WHERE category_id = $1`, [id]
        );
        if (bookCount && parseInt(bookCount.count) > 0) {
            return NextResponse.json({
                error: `Cannot delete: ${bookCount.count} books use this category. Reassign them first.`
            }, { status: 400 });
        }

        await query(`DELETE FROM library_categories WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting library category:', error);
        return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
    }
}
