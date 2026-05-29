import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';

// GET: List all grading scales with their grade definitions
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request);
    if (auth.error) return auth.error;

    try {
        const scales = await query<any>(
            `SELECT * FROM grading_scales ORDER BY is_default DESC, name ASC`
        );

        // Fetch grade definitions for each scale
        const scalesWithGrades = await Promise.all(
            scales.map(async (scale: any) => {
                const grades = await query<any>(
                    `SELECT * FROM grade_definitions 
                     WHERE grading_scale_id = $1 
                     ORDER BY display_order ASC`,
                    [scale.id]
                );
                return { ...scale, grades };
            })
        );

        return NextResponse.json({ gradingScales: scalesWithGrades });
    } catch (error) {
        console.error('Error fetching grading scales:', error);
        return NextResponse.json({ error: 'Failed to fetch grading scales' }, { status: 500 });
    }
}

// POST: Create a new grading scale with grade definitions
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    try {
        const body = await request.json();
        const { name, description, isDefault, grades } = body;

        if (!name || !grades || !Array.isArray(grades) || grades.length === 0) {
            return NextResponse.json(
                { error: 'Name and at least one grade definition are required' },
                { status: 400 }
            );
        }

        // If setting as default, unset existing default
        if (isDefault) {
            await query(`UPDATE grading_scales SET is_default = false WHERE is_default = true`);
        }

        // Create the scale
        const scale = await queryOne<any>(
            `INSERT INTO grading_scales (name, description, is_default)
             VALUES ($1, $2, $3) RETURNING *`,
            [name, description || null, isDefault || false]
        );

        if (!scale) {
            return NextResponse.json({ error: 'Failed to create grading scale' }, { status: 500 });
        }

        // Insert grade definitions
        for (const grade of grades) {
            await query(
                `INSERT INTO grade_definitions (grading_scale_id, grade_name, min_percentage, max_percentage, grade_point, description, display_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [scale.id, grade.gradeName, grade.minPercentage, grade.maxPercentage, grade.gradePoint || 0, grade.description || null, grade.displayOrder || 0]
            );
        }

        return NextResponse.json({ gradingScale: scale }, { status: 201 });
    } catch (error) {
        console.error('Error creating grading scale:', error);
        return NextResponse.json({ error: 'Failed to create grading scale' }, { status: 500 });
    }
}

// PUT: Update a grading scale and its grade definitions
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    try {
        const body = await request.json();
        const { id, name, description, isDefault, grades } = body;

        if (!id) {
            return NextResponse.json({ error: 'Grading scale ID is required' }, { status: 400 });
        }

        if (isDefault) {
            await query(`UPDATE grading_scales SET is_default = false WHERE is_default = true`);
        }

        const scale = await queryOne<any>(
            `UPDATE grading_scales SET
                name = COALESCE($2, name),
                description = COALESCE($3, description),
                is_default = COALESCE($4, is_default),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 RETURNING *`,
            [id, name, description, isDefault]
        );

        if (!scale) {
            return NextResponse.json({ error: 'Grading scale not found' }, { status: 404 });
        }

        // Replace grade definitions if provided
        if (grades && Array.isArray(grades)) {
            await query(`DELETE FROM grade_definitions WHERE grading_scale_id = $1`, [id]);
            for (const grade of grades) {
                await query(
                    `INSERT INTO grade_definitions (grading_scale_id, grade_name, min_percentage, max_percentage, grade_point, description, display_order)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [id, grade.gradeName, grade.minPercentage, grade.maxPercentage, grade.gradePoint || 0, grade.description || null, grade.displayOrder || 0]
                );
            }
        }

        return NextResponse.json({ gradingScale: scale });
    } catch (error) {
        console.error('Error updating grading scale:', error);
        return NextResponse.json({ error: 'Failed to update grading scale' }, { status: 500 });
    }
}

// DELETE: Delete a grading scale
export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Grading scale ID is required' }, { status: 400 });
        }

        // Check if any exams use this scale
        const inUse = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM exams WHERE grading_scale_id = $1`,
            [id]
        );

        if (inUse && parseInt(inUse.count) > 0) {
            return NextResponse.json(
                { error: 'Cannot delete a grading scale that is in use by exams' },
                { status: 400 }
            );
        }

        await query('DELETE FROM grading_scales WHERE id = $1', [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting grading scale:', error);
        return NextResponse.json({ error: 'Failed to delete grading scale' }, { status: 500 });
    }
}
