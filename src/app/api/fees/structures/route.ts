import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/fees/structures — List fee structures for the school
 * POST /api/fees/structures — Create a new fee structure
 * PUT /api/fees/structures — Update a fee structure
 * DELETE /api/fees/structures?id=xxx — Delete a fee structure
 */

// GET: List fee structures
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        let sql = `
            SELECT fs.*,
                c.name as class_name
            FROM fee_structures fs
            LEFT JOIN classes c ON fs.class_id = c.id
            WHERE 1=1
        `;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) {
            sql += ` AND fs.school_id = $${idx++}`;
            params.push(schoolId);
        }

        sql += ` ORDER BY c.display_order ASC, fs.name ASC`;
        const structures = await query<any>(sql, params);
        return NextResponse.json({ structures });
    } catch (error) {
        console.error('Error fetching fee structures:', error);
        return NextResponse.json({ error: 'Failed to fetch fee structures' }, { status: 500 });
    }
}

// POST: Create a fee structure
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { name, classId, sessionId, amount, dueDate, description, feeType,
                frequency, lateFeePerDay, gracePeriodDays, lateFeeEnabled, concessionAllowed } = await request.json();

        if (!name || !amount) {
            return NextResponse.json({ error: 'Name and amount are required' }, { status: 400 });
        }

        const structure = await queryOne<any>(
            `INSERT INTO fee_structures (name, class_id, session_id, amount, due_date, description, fee_type, school_id,
                frequency, late_fee_per_day, grace_period_days, late_fee_enabled, concession_allowed)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
            [name, classId || null, sessionId || null, amount, dueDate || null, description || null, feeType || 'tuition', schoolId,
             frequency || 'one_time', lateFeePerDay || 0, gracePeriodDays || 0, lateFeeEnabled || false, concessionAllowed !== false]
        );

        return NextResponse.json({ structure }, { status: 201 });
    } catch (error) {
        console.error('Error creating fee structure:', error);
        return NextResponse.json({ error: 'Failed to create fee structure' }, { status: 500 });
    }
}

// PUT: Update a fee structure
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    try {
        const { id, name, classId, amount, dueDate, description, feeType, isActive,
                frequency, lateFeePerDay, gracePeriodDays, lateFeeEnabled, concessionAllowed } = await request.json();
        if (!id) return NextResponse.json({ error: 'Fee structure ID required' }, { status: 400 });

        const updated = await queryOne<any>(
            `UPDATE fee_structures SET
                name = COALESCE($2, name),
                class_id = COALESCE($3, class_id),
                amount = COALESCE($4, amount),
                due_date = COALESCE($5, due_date),
                description = COALESCE($6, description),
                fee_type = COALESCE($7, fee_type),
                is_active = COALESCE($8, is_active),
                frequency = COALESCE($9, frequency),
                late_fee_per_day = COALESCE($10, late_fee_per_day),
                grace_period_days = COALESCE($11, grace_period_days),
                late_fee_enabled = COALESCE($12, late_fee_enabled),
                concession_allowed = COALESCE($13, concession_allowed),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 RETURNING *`,
            [id, name, classId, amount, dueDate, description, feeType, isActive,
             frequency, lateFeePerDay, gracePeriodDays, lateFeeEnabled, concessionAllowed]
        );

        return NextResponse.json({ structure: updated });
    } catch (error) {
        console.error('Error updating fee structure:', error);
        return NextResponse.json({ error: 'Failed to update fee structure' }, { status: 500 });
    }
}

// DELETE
export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    try {
        // Check if any payments exist
        const payments = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM fee_payments WHERE fee_structure_id = $1`, [id]
        );
        if (payments && parseInt(payments.count) > 0) {
            return NextResponse.json({ error: 'Cannot delete: payments exist for this fee structure' }, { status: 400 });
        }

        await query(`DELETE FROM fee_structures WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting fee structure:', error);
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
