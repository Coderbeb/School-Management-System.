import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/fees/heads — List fee heads for the school
 * POST /api/fees/heads — Create a new fee head
 * PUT /api/fees/heads — Update a fee head
 * DELETE /api/fees/heads?id=xxx — Delete a fee head
 */

// GET: List fee heads
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        let sql = `SELECT * FROM fee_heads WHERE 1=1`;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) {
            sql += ` AND school_id = $${idx++}`;
            params.push(schoolId);
        }

        sql += ` ORDER BY name ASC`;
        const heads = await query<any>(sql, params);
        return NextResponse.json({ heads });
    } catch (error) {
        console.error('Error fetching fee heads:', error);
        return NextResponse.json({ error: 'Failed to fetch fee heads' }, { status: 500 });
    }
}

// POST: Create a fee head
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { name, category, isTaxable, taxRate, hsnCode } = await request.json();

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        // Check duplicate name
        const duplicate = await queryOne<any>(
            `SELECT id FROM fee_heads WHERE school_id = $1 AND name = $2`,
            [schoolId, name]
        );
        if (duplicate) {
            return NextResponse.json({ error: 'A fee head with this name already exists' }, { status: 400 });
        }

        const head = await queryOne<any>(
            `INSERT INTO fee_heads (school_id, name, category, is_taxable, tax_rate, hsn_code)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [schoolId, name, category || 'academic', isTaxable || false, taxRate || 0, hsnCode || null]
        );

        return NextResponse.json({ head }, { status: 201 });
    } catch (error) {
        console.error('Error creating fee head:', error);
        return NextResponse.json({ error: 'Failed to create fee head' }, { status: 500 });
    }
}

// PUT: Update a fee head
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { id, name, category, isTaxable, taxRate, hsnCode } = await request.json();
        if (!id) return NextResponse.json({ error: 'Fee head ID required' }, { status: 400 });

        // Verify ownership if not developer
        if (schoolId) {
            const check = await queryOne<any>(
                `SELECT school_id FROM fee_heads WHERE id = $1`, [id]
            );
            if (!check || check.school_id !== schoolId) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        // Check duplicate name
        if (name && schoolId) {
            const duplicate = await queryOne<any>(
                `SELECT id FROM fee_heads WHERE school_id = $1 AND name = $2 AND id != $3`,
                [schoolId, name, id]
            );
            if (duplicate) {
                return NextResponse.json({ error: 'Another fee head with this name already exists' }, { status: 400 });
            }
        }

        const updated = await queryOne<any>(
            `UPDATE fee_heads SET
                name = COALESCE($2, name),
                category = COALESCE($3, category),
                is_taxable = COALESCE($4, is_taxable),
                tax_rate = COALESCE($5, tax_rate),
                hsn_code = COALESCE($6, hsn_code),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 RETURNING *`,
            [id, name, category, isTaxable, taxRate, hsnCode]
        );

        return NextResponse.json({ head: updated });
    } catch (error) {
        console.error('Error updating fee head:', error);
        return NextResponse.json({ error: 'Failed to update fee head' }, { status: 500 });
    }
}

// DELETE: Delete a fee head
export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    try {
        // Verify ownership if not developer
        if (schoolId) {
            const check = await queryOne<any>(
                `SELECT school_id FROM fee_heads WHERE id = $1`, [id]
            );
            if (!check || check.school_id !== schoolId) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        // Check if referenced in fee_group_heads
        const refGroups = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM fee_group_heads WHERE fee_head_id = $1`, [id]
        );
        if (refGroups && parseInt(refGroups.count) > 0) {
            return NextResponse.json({ error: 'Cannot delete: referenced in one or more fee groups' }, { status: 400 });
        }

        // Check if referenced in invoice_items
        const refInvoices = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM invoice_items WHERE fee_head_id = $1`, [id]
        );
        if (refInvoices && parseInt(refInvoices.count) > 0) {
            return NextResponse.json({ error: 'Cannot delete: referenced in one or more student invoices' }, { status: 400 });
        }

        await query(`DELETE FROM fee_heads WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting fee head:', error);
        return NextResponse.json({ error: 'Failed to delete fee head' }, { status: 500 });
    }
}
