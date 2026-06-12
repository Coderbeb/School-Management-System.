import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId, schoolFilter } from '@/lib/auth';

// GET /api/manage/student-categories — List categories
export async function GET(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const sf = schoolFilter(schoolId, 'sc', 1);

    const categories = await query(
        `SELECT sc.*,
            (SELECT COUNT(*) FROM students s WHERE s.category_id = sc.id) as student_count
         FROM student_categories sc
         WHERE 1=1 ${sf.clause}
         ORDER BY sc.display_order, sc.name`,
        sf.params
    );

    return NextResponse.json({ categories });
}

// POST /api/manage/student-categories — Create a category
export async function POST(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    if (!schoolId) {
        return NextResponse.json({ error: 'School context required' }, { status: 400 });
    }

    const body = await request.json();
    const { name, description, feeDiscountPercentage, displayOrder } = body;

    if (!name) {
        return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const result = await query(
        `INSERT INTO student_categories (school_id, name, description, fee_discount_percentage, display_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [schoolId, name, description || null, feeDiscountPercentage || 0, displayOrder || 0]
    );

    return NextResponse.json({ category: result[0] }, { status: 201 });
}

// PUT /api/manage/student-categories — Update a category
export async function PUT(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const body = await request.json();
    const { id, name, description, feeDiscountPercentage, isActive, displayOrder } = body;

    if (!id) return NextResponse.json({ error: 'Category ID required' }, { status: 400 });

    const sf = schoolFilter(schoolId, '', 8);
    const result = await query(
        `UPDATE student_categories 
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             fee_discount_percentage = COALESCE($3, fee_discount_percentage),
             is_active = COALESCE($4, is_active),
             display_order = COALESCE($5, display_order)
         WHERE id = $6 ${sf.clause}
         RETURNING *`,
        [name || null, description, feeDiscountPercentage, 
         isActive !== undefined ? isActive : null, 
         displayOrder !== undefined ? displayOrder : null, 
         id, ...sf.params]
    );

    if (!result.length) return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    return NextResponse.json({ category: result[0] });
}

// DELETE /api/manage/student-categories — Delete a category
export async function DELETE(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'Category ID required' }, { status: 400 });

    const sf = schoolFilter(schoolId, '', 2);
    const result = await query(
        `DELETE FROM student_categories WHERE id = $1 ${sf.clause} RETURNING id`,
        [id, ...sf.params]
    );

    if (!result.length) return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    return NextResponse.json({ deleted: true });
}
