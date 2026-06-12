import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'accountant']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        let components = await query<any>(
            `SELECT * FROM salary_components WHERE school_id = $1 ORDER BY type ASC, name ASC`,
            [schoolId]
        );

        // Auto seed defaults if empty
        if (components.length === 0) {
            const defaults = [
                { name: 'Basic Pay', type: 'earning', is_percentage: false, percentage_of: null },
                { name: 'Dearness Allowance (DA)', type: 'earning', is_percentage: true, percentage_of: 'Basic Pay' },
                { name: 'House Rent Allowance (HRA)', type: 'earning', is_percentage: true, percentage_of: 'Basic Pay' },
                { name: 'Provident Fund (PF)', type: 'deduction', is_percentage: true, percentage_of: 'Basic Pay' },
                { name: 'Professional Tax (PT)', type: 'deduction', is_percentage: false, percentage_of: null }
            ];

            for (const d of defaults) {
                await query(
                    `INSERT INTO salary_components (school_id, name, type, is_percentage, percentage_of)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [schoolId, d.name, d.type, d.is_percentage, d.percentage_of]
                );
            }

            components = await query<any>(
                `SELECT * FROM salary_components WHERE school_id = $1 ORDER BY type ASC, name ASC`,
                [schoolId]
            );
        }

        return NextResponse.json({ components });
    } catch (error) {
        console.error('Error fetching salary components:', error);
        return NextResponse.json({ error: 'Failed to fetch salary components' }, { status: 500 });
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
        const { name, type, isPercentage, percentageOf } = await request.json();

        if (!name || !type) {
            return NextResponse.json({ error: 'Name and Type are required' }, { status: 400 });
        }

        // Duplicate check
        const duplicate = await queryOne<any>(
            `SELECT id FROM salary_components WHERE school_id = $1 AND name = $2`,
            [schoolId, name.trim()]
        );
        if (duplicate) {
            return NextResponse.json({ error: 'A component with this name already exists' }, { status: 400 });
        }

        const component = await queryOne<any>(
            `INSERT INTO salary_components (school_id, name, type, is_percentage, percentage_of)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [schoolId, name.trim(), type, !!isPercentage, percentageOf || null]
        );

        return NextResponse.json({ component }, { status: 201 });
    } catch (error) {
        console.error('Error creating salary component:', error);
        return NextResponse.json({ error: 'Failed to create component' }, { status: 500 });
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
        const { id, name, type, isPercentage, percentageOf } = await request.json();

        if (!id || !name || !type) {
            return NextResponse.json({ error: 'ID, Name and Type are required' }, { status: 400 });
        }

        // Verify ownership
        const existing = await queryOne<any>(
            `SELECT school_id FROM salary_components WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        // Duplicate check
        const duplicate = await queryOne<any>(
            `SELECT id FROM salary_components WHERE school_id = $1 AND name = $2 AND id != $3`,
            [schoolId, name.trim(), id]
        );
        if (duplicate) {
            return NextResponse.json({ error: 'Another component with this name already exists' }, { status: 400 });
        }

        const component = await queryOne<any>(
            `UPDATE salary_components SET
                name = $2,
                type = $3,
                is_percentage = $4,
                percentage_of = $5,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [id, name.trim(), type, !!isPercentage, percentageOf || null]
        );

        return NextResponse.json({ component });
    } catch (error) {
        console.error('Error updating salary component:', error);
        return NextResponse.json({ error: 'Failed to update component' }, { status: 500 });
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
        return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    try {
        // Verify ownership
        const existing = await queryOne<any>(
            `SELECT school_id FROM salary_components WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        await query(`DELETE FROM salary_components WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting salary component:', error);
        return NextResponse.json({ error: 'Failed to delete component' }, { status: 500 });
    }
}
