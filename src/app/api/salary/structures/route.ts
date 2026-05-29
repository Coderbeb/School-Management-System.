import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/salary/structures — List salary structures
 * POST /api/salary/structures — Create a salary structure
 * PUT /api/salary/structures — Update a salary structure
 * DELETE /api/salary/structures?id=xxx — Delete a salary structure
 */

// GET: List salary structures
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        let sql = `
            SELECT ss.*,
                u.first_name || ' ' || u.last_name as staff_name,
                u.email as staff_email,
                u.role as staff_role
            FROM salary_structures ss
            JOIN users u ON ss.user_id = u.id
            WHERE 1=1
        `;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) {
            sql += ` AND ss.school_id = $${idx++}`;
            params.push(schoolId);
        }

        sql += ` ORDER BY u.first_name ASC, u.last_name ASC`;
        const structures = await query<any>(sql, params);
        return NextResponse.json({ structures });
    } catch (error) {
        console.error('Error fetching salary structures:', error);
        return NextResponse.json({ error: 'Failed to fetch salary structures' }, { status: 500 });
    }
}

// POST: Create a salary structure
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { userId, roleTarget, designation, baseSalary, allowances, deductions, netSalary, effectiveFrom } = await request.json();

        if (!userId || baseSalary === undefined) {
            return NextResponse.json({ error: 'userId and baseSalary are required' }, { status: 400 });
        }

        const structure = await queryOne<any>(
            `INSERT INTO salary_structures (school_id, user_id, role_target, designation, base_salary, allowances, deductions, net_salary, effective_from)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [schoolId, userId, roleTarget || 'teacher', designation || null, baseSalary,
             JSON.stringify(allowances || {}), JSON.stringify(deductions || {}),
             netSalary || baseSalary, effectiveFrom || new Date().toISOString().split('T')[0]]
        );

        return NextResponse.json({ structure }, { status: 201 });
    } catch (error) {
        console.error('Error creating salary structure:', error);
        return NextResponse.json({ error: 'Failed to create salary structure' }, { status: 500 });
    }
}

// PUT: Update a salary structure
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    try {
        const { id, roleTarget, designation, baseSalary, allowances, deductions, netSalary, effectiveFrom, isActive } = await request.json();
        if (!id) return NextResponse.json({ error: 'Salary structure ID required' }, { status: 400 });

        const updated = await queryOne<any>(
            `UPDATE salary_structures SET
                role_target = COALESCE($2, role_target),
                designation = COALESCE($3, designation),
                base_salary = COALESCE($4, base_salary),
                allowances = COALESCE($5, allowances),
                deductions = COALESCE($6, deductions),
                net_salary = COALESCE($7, net_salary),
                effective_from = COALESCE($8, effective_from),
                is_active = COALESCE($9, is_active),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 RETURNING *`,
            [id, roleTarget, designation, baseSalary,
             allowances ? JSON.stringify(allowances) : null,
             deductions ? JSON.stringify(deductions) : null,
             netSalary, effectiveFrom, isActive]
        );

        return NextResponse.json({ structure: updated });
    } catch (error) {
        console.error('Error updating salary structure:', error);
        return NextResponse.json({ error: 'Failed to update salary structure' }, { status: 500 });
    }
}

// DELETE: Delete a salary structure
export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    try {
        // Check if any payments exist
        const payments = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM salary_payments WHERE salary_structure_id = $1`, [id]
        );
        if (payments && parseInt(payments.count) > 0) {
            return NextResponse.json({ error: 'Cannot delete: salary payments exist for this structure' }, { status: 400 });
        }

        await query(`DELETE FROM salary_structures WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting salary structure:', error);
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
