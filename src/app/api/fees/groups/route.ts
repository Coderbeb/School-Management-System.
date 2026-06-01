import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/fees/groups — List fee groups for the school (with details of heads)
 * POST /api/fees/groups — Create a new fee group with its heads
 * PUT /api/fees/groups — Update a fee group and its heads
 * DELETE /api/fees/groups?id=xxx — Delete a fee group
 */

// GET: List fee groups
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        let sql = `SELECT fg.*, 
            (SELECT COUNT(*) FROM student_fee_groups sfg WHERE sfg.fee_group_id = fg.id)::integer as assigned_students
            FROM fee_groups fg WHERE 1=1`;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) {
            sql += ` AND fg.school_id = $${idx++}`;
            params.push(schoolId);
        }

        sql += ` ORDER BY fg.display_order ASC, fg.name ASC`;
        const groups = await query<any>(sql, params);

        // Fetch associated heads for each group
        for (const group of groups) {
            const headsSql = `
                SELECT fgh.*, fh.name as head_name, fh.category as head_category, fh.is_taxable, fh.tax_rate
                FROM fee_group_heads fgh
                JOIN fee_heads fh ON fgh.fee_head_id = fh.id
                WHERE fgh.fee_group_id = $1
                ORDER BY fh.name ASC
            `;
            group.heads = await query<any>(headsSql, [group.id]);
            
            // Parse target_class_ids from Postgres array format
            if (group.target_class_ids && typeof group.target_class_ids === 'string') {
                group.target_class_ids = group.target_class_ids.replace(/[{}]/g, '').split(',').filter(Boolean);
            }
        }

        return NextResponse.json({ groups });
    } catch (error) {
        console.error('Error fetching fee groups:', error);
        return NextResponse.json({ error: 'Failed to fetch fee groups' }, { status: 500 });
    }
}

// POST: Create a fee group
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { name, description, heads, targetClassIds, isDefault, applyTo, displayOrder, isActive } = await request.json();

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        // Check duplicate name
        const duplicate = await queryOne<any>(
            `SELECT id FROM fee_groups WHERE school_id = $1 AND name = $2`,
            [schoolId, name]
        );
        if (duplicate) {
            return NextResponse.json({ error: 'A fee group with this name already exists' }, { status: 400 });
        }

        // Validate target_class_ids if apply_to is specific_classes
        const finalApplyTo = applyTo || 'individual';
        const finalTargetClassIds = targetClassIds || [];
        
        if (finalApplyTo === 'specific_classes' && finalTargetClassIds.length === 0) {
            return NextResponse.json({ error: 'At least one target class must be selected when scope is "Specific Classes"' }, { status: 400 });
        }

        // Validate that target class IDs belong to this school
        if (finalTargetClassIds.length > 0 && schoolId) {
            const validClasses = await query<any>(
                `SELECT id FROM classes WHERE school_id = $1 AND id = ANY($2::uuid[])`,
                [schoolId, finalTargetClassIds]
            );
            if (validClasses.length !== finalTargetClassIds.length) {
                return NextResponse.json({ error: 'One or more selected classes are invalid' }, { status: 400 });
            }
        }

        // Insert group
        const group = await queryOne<any>(
            `INSERT INTO fee_groups (school_id, name, description, target_class_ids, is_default, apply_to, display_order, is_active)
             VALUES ($1, $2, $3, $4::uuid[], $5, $6, $7, $8) RETURNING *`,
            [
                schoolId, name, description || null,
                finalTargetClassIds.length > 0 ? finalTargetClassIds : '{}',
                isDefault || false,
                finalApplyTo,
                displayOrder || 0,
                isActive !== undefined ? isActive : true
            ]
        );

        // Insert group heads
        if (heads && Array.isArray(heads)) {
            for (const h of heads) {
                if (h.feeHeadId && h.amount !== undefined) {
                    await query(
                        `INSERT INTO fee_group_heads (fee_group_id, fee_head_id, amount, frequency)
                         VALUES ($1, $2, $3, $4)`,
                        [group.id, h.feeHeadId, parseFloat(h.amount), h.frequency || 'monthly']
                    );
                }
            }
        }

        // Fetch complete group to return
        const groupHeads = await query<any>(
            `SELECT fgh.*, fh.name as head_name, fh.category as head_category, fh.is_taxable, fh.tax_rate
             FROM fee_group_heads fgh
             JOIN fee_heads fh ON fgh.fee_head_id = fh.id
             WHERE fgh.fee_group_id = $1`,
            [group.id]
        );
        group.heads = groupHeads;

        return NextResponse.json({ group }, { status: 201 });
    } catch (error) {
        console.error('Error creating fee group:', error);
        return NextResponse.json({ error: 'Failed to create fee group' }, { status: 500 });
    }
}

// PUT: Update a fee group
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { id, name, description, heads, targetClassIds, isDefault, applyTo, displayOrder, isActive } = await request.json();
        if (!id) return NextResponse.json({ error: 'Fee group ID required' }, { status: 400 });

        // Verify ownership if not developer
        if (schoolId) {
            const check = await queryOne<any>(
                `SELECT school_id FROM fee_groups WHERE id = $1`, [id]
            );
            if (!check || check.school_id !== schoolId) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        // Check duplicate name
        if (name && schoolId) {
            const duplicate = await queryOne<any>(
                `SELECT id FROM fee_groups WHERE school_id = $1 AND name = $2 AND id != $3`,
                [schoolId, name, id]
            );
            if (duplicate) {
                return NextResponse.json({ error: 'Another fee group with this name already exists' }, { status: 400 });
            }
        }

        // Validate target class IDs
        const finalApplyTo = applyTo || undefined;
        const finalTargetClassIds = targetClassIds || undefined;

        if (finalApplyTo === 'specific_classes' && finalTargetClassIds && finalTargetClassIds.length === 0) {
            return NextResponse.json({ error: 'At least one target class must be selected when scope is "Specific Classes"' }, { status: 400 });
        }

        if (finalTargetClassIds && finalTargetClassIds.length > 0 && schoolId) {
            const validClasses = await query<any>(
                `SELECT id FROM classes WHERE school_id = $1 AND id = ANY($2::uuid[])`,
                [schoolId, finalTargetClassIds]
            );
            if (validClasses.length !== finalTargetClassIds.length) {
                return NextResponse.json({ error: 'One or more selected classes are invalid' }, { status: 400 });
            }
        }

        // Update group details
        const updated = await queryOne<any>(
            `UPDATE fee_groups SET
                name = COALESCE($2, name),
                description = COALESCE($3, description),
                target_class_ids = COALESCE($4::uuid[], target_class_ids),
                is_default = COALESCE($5, is_default),
                apply_to = COALESCE($6, apply_to),
                display_order = COALESCE($7, display_order),
                is_active = COALESCE($8, is_active),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 RETURNING *`,
            [
                id, name, description,
                finalTargetClassIds ? (finalTargetClassIds.length > 0 ? finalTargetClassIds : '{}') : null,
                isDefault, finalApplyTo, displayOrder, isActive
            ]
        );

        // Update group heads list (replace existing ones)
        if (heads && Array.isArray(heads)) {
            // Delete old heads
            await query(`DELETE FROM fee_group_heads WHERE fee_group_id = $1`, [id]);
            // Insert new ones
            for (const h of heads) {
                if (h.feeHeadId && h.amount !== undefined) {
                    await query(
                        `INSERT INTO fee_group_heads (fee_group_id, fee_head_id, amount, frequency)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (fee_group_id, fee_head_id) DO UPDATE SET
                            amount = EXCLUDED.amount,
                            frequency = EXCLUDED.frequency`,
                        [id, h.feeHeadId, parseFloat(h.amount), h.frequency || 'monthly']
                    );
                }
            }
        }

        // Fetch complete updated group to return
        const groupHeads = await query<any>(
            `SELECT fgh.*, fh.name as head_name, fh.category as head_category, fh.is_taxable, fh.tax_rate
             FROM fee_group_heads fgh
             JOIN fee_heads fh ON fgh.fee_head_id = fh.id
             WHERE fgh.fee_group_id = $1`,
            [id]
        );
        updated.heads = groupHeads;

        return NextResponse.json({ group: updated });
    } catch (error) {
        console.error('Error updating fee group:', error);
        return NextResponse.json({ error: 'Failed to update fee group' }, { status: 500 });
    }
}

// DELETE: Delete a fee group
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
                `SELECT school_id FROM fee_groups WHERE id = $1`, [id]
            );
            if (!check || check.school_id !== schoolId) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        // Check if assigned to any student
        const refStudents = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM student_fee_groups WHERE fee_group_id = $1`, [id]
        );
        if (refStudents && parseInt(refStudents.count) > 0) {
            return NextResponse.json({ error: 'Cannot delete: assigned to one or more students' }, { status: 400 });
        }

        await query(`DELETE FROM fee_groups WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting fee group:', error);
        return NextResponse.json({ error: 'Failed to delete fee group' }, { status: 500 });
    }
}
