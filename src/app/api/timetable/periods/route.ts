import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        // Fetch templates
        let templates = await query<any>(
            `SELECT * FROM timetable_day_templates WHERE school_id = $1 ORDER BY name ASC`,
            [schoolId]
        );

        // Auto-seed default template if none exist
        if (templates.length === 0) {
            const defaultTemplate = await queryOne<any>(
                `INSERT INTO timetable_day_templates (school_id, name)
                 VALUES ($1, 'Regular Day') RETURNING *`,
                [schoolId]
            );

            // Default period timings
            const defaultPeriods = [
                { num: 1, start: '08:00', end: '08:45', isBreak: false, label: 'Period 1' },
                { num: 2, start: '08:45', end: '09:30', isBreak: false, label: 'Period 2' },
                { num: 3, start: '09:30', end: '10:15', isBreak: false, label: 'Period 3' },
                { num: 4, start: '10:15', end: '10:45', isBreak: true, label: 'Short Break' },
                { num: 5, start: '10:45', end: '11:30', isBreak: false, label: 'Period 4' },
                { num: 6, start: '11:30', end: '12:15', isBreak: false, label: 'Period 5' },
                { num: 7, start: '12:15', end: '12:45', isBreak: true, label: 'Lunch Break' },
                { num: 8, start: '12:45', end: '13:30', isBreak: false, label: 'Period 6' },
                { num: 9, start: '13:30', end: '14:15', isBreak: false, label: 'Period 7' }
            ];

            for (const p of defaultPeriods) {
                await query(
                    `INSERT INTO timetable_periods (school_id, day_template_id, period_number, start_time, end_time, is_break, label)
                     VALUES ($1, $2, $3, $4::time, $5::time, $6, $7)`,
                    [schoolId, defaultTemplate.id, p.num, p.start, p.end, p.isBreak, p.label]
                );
            }

            // Refetch
            templates = await query<any>(
                `SELECT * FROM timetable_day_templates WHERE school_id = $1 ORDER BY name ASC`,
                [schoolId]
            );
        }

        // Fetch periods for each template
        for (const t of templates) {
            t.periods = await query<any>(
                `SELECT id, period_number, start_time, end_time, is_break, label 
                 FROM timetable_periods 
                 WHERE day_template_id = $1 AND school_id = $2
                 ORDER BY period_number ASC`,
                [t.id, schoolId]
            );
        }

        return NextResponse.json({ templates });
    } catch (error) {
        console.error('Error fetching timetable periods:', error);
        return NextResponse.json({ error: 'Failed to fetch period configurations' }, { status: 500 });
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
        const { templateId, templateName, periods } = await request.json();

        if (!templateName) {
            return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
        }

        let currentTemplateId = templateId;

        // 1. Create or verify template
        if (!currentTemplateId) {
            const duplicate = await queryOne<any>(
                `SELECT id FROM timetable_day_templates WHERE school_id = $1 AND name = $2`,
                [schoolId, templateName.trim()]
            );
            if (duplicate) {
                return NextResponse.json({ error: 'A day template with this name already exists' }, { status: 400 });
            }

            const newTpl = await queryOne<any>(
                `INSERT INTO timetable_day_templates (school_id, name)
                 VALUES ($1, $2) RETURNING *`,
                [schoolId, templateName.trim()]
            );
            currentTemplateId = newTpl.id;
        } else {
            // Verify ownership
            const existing = await queryOne<any>(
                `SELECT school_id FROM timetable_day_templates WHERE id = $1`, [currentTemplateId]
            );
            if (!existing || existing.school_id !== schoolId) {
                return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
            }

            // Update template name
            await query(
                `UPDATE timetable_day_templates SET name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [currentTemplateId, templateName.trim()]
            );
        }

        // 2. Manage periods sync
        if (periods && Array.isArray(periods)) {
            const dbPeriods = await query<any>(
                `SELECT id, label FROM timetable_periods WHERE day_template_id = $1 AND school_id = $2`,
                [currentTemplateId, schoolId]
            );

            const incomingIds = periods.map(p => p.id).filter(Boolean);
            const periodsToDelete = dbPeriods.filter(dbP => !incomingIds.includes(dbP.id));

            // Check if any deleted periods have entries
            for (const pToDelete of periodsToDelete) {
                const assigned = await queryOne<{ count: string }>(
                    `SELECT COUNT(*) as count FROM timetable_entries WHERE period_id = $1`,
                    [pToDelete.id]
                );
                if (assigned && parseInt(assigned.count) > 0) {
                    return NextResponse.json({
                        error: `Cannot delete period "${pToDelete.label || 'Period'}" because timetable entries are assigned to it.`
                    }, { status: 400 });
                }
            }

            // Delete obsolete periods
            for (const pToDelete of periodsToDelete) {
                await query(`DELETE FROM timetable_periods WHERE id = $1`, [pToDelete.id]);
            }

            // Save/Update periods
            for (let i = 0; i < periods.length; i++) {
                const p = periods[i];
                if (p.id) {
                    await query(
                        `UPDATE timetable_periods SET
                            period_number = $1,
                            start_time = $2::time,
                            end_time = $3::time,
                            is_break = $4,
                            label = $5,
                            updated_at = CURRENT_TIMESTAMP
                         WHERE id = $6 AND school_id = $7`,
                        [
                            i + 1,
                            p.startTime,
                            p.endTime,
                            p.isBreak || false,
                            p.label || `Period ${i + 1}`,
                            p.id,
                            schoolId
                        ]
                    );
                } else {
                    await query(
                        `INSERT INTO timetable_periods (school_id, day_template_id, period_number, start_time, end_time, is_break, label)
                         VALUES ($1, $2, $3, $4::time, $5::time, $6, $7)`,
                        [
                            schoolId,
                            currentTemplateId,
                            i + 1,
                            p.startTime,
                            p.endTime,
                            p.isBreak || false,
                            p.label || `Period ${i + 1}`
                        ]
                    );
                }
            }
        }

        const template = await queryOne<any>(
            `SELECT * FROM timetable_day_templates WHERE id = $1`, [currentTemplateId]
        );
        template.periods = await query<any>(
            `SELECT * FROM timetable_periods WHERE day_template_id = $1 ORDER BY period_number ASC`,
            [currentTemplateId]
        );

        return NextResponse.json({ template });
    } catch (error) {
        console.error('Error saving timetable periods:', error);
        return NextResponse.json({ error: 'Failed to save period configurations' }, { status: 500 });
    }
}
