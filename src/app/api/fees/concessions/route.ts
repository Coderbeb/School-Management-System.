import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/fees/concessions — List concessions
 * POST /api/fees/concessions — Create a concession
 * PUT /api/fees/concessions — Update a concession
 * DELETE /api/fees/concessions?id=xxx — Delete a concession
 */

// GET: List concessions
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        let sql = `
            SELECT fc.*,
                st.first_name || ' ' || st.last_name as student_name,
                st.admission_number,
                fs.name as fee_name, fs.amount as fee_amount
            FROM fee_concessions fc
            JOIN students st ON fc.student_id = st.id
            LEFT JOIN fee_structures fs ON fc.fee_structure_id = fs.id
            WHERE 1=1
        `;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) {
            sql += ` AND fc.school_id = $${idx++}`;
            params.push(schoolId);
        }

        sql += ` ORDER BY st.first_name ASC, st.last_name ASC`;
        const concessions = await query<any>(sql, params);
        return NextResponse.json({ concessions });
    } catch (error) {
        console.error('Error fetching concessions:', error);
        return NextResponse.json({ error: 'Failed to fetch concessions' }, { status: 500 });
    }
}

// POST: Create a concession
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { studentId, feeStructureId, concessionType, value, reason } = await request.json();

        if (!studentId || value === undefined) {
            return NextResponse.json({ error: 'studentId and value are required' }, { status: 400 });
        }

        const concession = await queryOne<any>(
            `INSERT INTO fee_concessions (school_id, student_id, fee_structure_id, concession_type, value, reason, approved_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [schoolId, studentId, feeStructureId || null, concessionType || 'percentage',
             value, reason || null, auth.user.userId]
        );

        return NextResponse.json({ concession }, { status: 201 });
    } catch (error) {
        console.error('Error creating concession:', error);
        return NextResponse.json({ error: 'Failed to create concession' }, { status: 500 });
    }
}

// PUT: Update a concession
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin']);
    if (auth.error) return auth.error;

    try {
        const { id, concessionType, value, reason, isActive } = await request.json();
        if (!id) return NextResponse.json({ error: 'Concession ID required' }, { status: 400 });

        const updated = await queryOne<any>(
            `UPDATE fee_concessions SET
                concession_type = COALESCE($2, concession_type),
                value = COALESCE($3, value),
                reason = COALESCE($4, reason),
                is_active = COALESCE($5, is_active),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 RETURNING *`,
            [id, concessionType, value, reason, isActive]
        );

        return NextResponse.json({ concession: updated });
    } catch (error) {
        console.error('Error updating concession:', error);
        return NextResponse.json({ error: 'Failed to update concession' }, { status: 500 });
    }
}

// DELETE: Delete a concession
export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    try {
        await query(`DELETE FROM fee_concessions WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting concession:', error);
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
