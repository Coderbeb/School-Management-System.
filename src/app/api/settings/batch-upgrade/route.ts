import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        
        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const deptType = searchParams.get('deptType') || 'regular';

        // Get saved configurations for the specific department type
        const settingKey = `batch_mapping_${deptType}`;
        const rows = await query<{ value: any }>(
            `SELECT value FROM application_settings WHERE key = $1`,
            [settingKey]
        );

        let mappings = {};
        if (rows.length > 0) {
            mappings = rows[0].value;
        } else {
            // Fallback to legacy check if no explicit setting exists yet
            const legacyRows = await query<{ current_semester: number, batch_year: number }>(
                `SELECT current_semester, MODE() WITHIN GROUP (ORDER BY batch_year) as batch_year
                 FROM students 
                 WHERE department_id IN (SELECT id FROM departments WHERE dept_type = $1)
                 GROUP BY current_semester
                 ORDER BY current_semester`,
                [deptType]
            );
            const legacyMappings: Record<number, number> = {};
            legacyRows.forEach(row => {
                legacyMappings[row.current_semester] = row.batch_year;
            });
            mappings = legacyMappings;
        }

        return NextResponse.json({ mappings });

    } catch (error) {
        console.error('Fetch batch mappings error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        
        // Ensure only super_admin can perform this action
        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const body = await request.json();
        const { deptType, mappings, fullConfig } = body;

        // Validation
        if (!deptType || !['regular', 'vocational', 'pg'].includes(deptType)) {
            return NextResponse.json({ error: 'Invalid department type' }, { status: 400 });
        }

        // We will execute student upgrades only for valid (non-empty) mappings
        let totalUpdated = 0;

        if (Array.isArray(mappings) && mappings.length > 0) {
            for (const mapping of mappings) {
                const { semester, batchYear } = mapping;
                
                if (typeof semester !== 'number' || typeof batchYear !== 'number') {
                    continue; // Skip invalid mappings
                }

                // Update students belonging to the specific department type and batch year
                const result = await query(
                    `UPDATE students 
                     SET current_semester = $1, updated_at = CURRENT_TIMESTAMP
                     WHERE batch_year = $2 
                     AND department_id IN (SELECT id FROM departments WHERE dept_type = $3)
                     RETURNING id`,
                    [semester, batchYear, deptType]
                );

                totalUpdated += result.length;
            }
        }
        
        // Save the full configuration (including null for intentionally empty semesters)
        // This lets the UI know which semesters are active vs intentionally disabled
        const settingKey = `batch_mapping_${deptType}`;
        
        // Use fullConfig if provided (includes nulls for empty semesters),
        // otherwise fall back to building from valid mappings only
        let mappingObject: Record<string, number | null>;
        if (fullConfig && typeof fullConfig === 'object') {
            mappingObject = fullConfig;
        } else {
            mappingObject = {};
            if (Array.isArray(mappings)) {
                for (const m of mappings) {
                    mappingObject[m.semester.toString()] = m.batchYear;
                }
            }
        }

        await query(
            `INSERT INTO application_settings (key, value, updated_at) 
             VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP) 
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
            [settingKey, JSON.stringify(mappingObject)]
        );

        return NextResponse.json({ 
            message: 'Batch upgrade successful',
            updatedCount: totalUpdated
        });

    } catch (error) {
        console.error('Batch upgrade error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
