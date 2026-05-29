import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import Papa from 'papaparse';

interface ClassCSVRow {
    'Class Name': string;
    'Sections': string;
}

export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { csvData } = await request.json();
        if (!csvData) return NextResponse.json({ error: 'CSV data is required' }, { status: 400 });

        const parsed = Papa.parse<ClassCSVRow>(csvData, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.replace(/^\uFEFF/, '').trim()
        });

        if (parsed.errors.length > 0) {
            return NextResponse.json({ error: 'Failed to parse CSV file', details: parsed.errors }, { status: 400 });
        }

        const schoolId = payload.schoolId;
        if (!schoolId) {
            return NextResponse.json({ error: 'School context is missing in token.' }, { status: 400 });
        }

        // Get current academic session
        const currentSession = await queryOne<{ id: string }>(
            `SELECT id FROM academic_sessions WHERE is_current = true AND school_id = $1 LIMIT 1`,
            [schoolId]
        );

        if (!currentSession) {
            return NextResponse.json({ error: 'No active academic session found. Please create one first.' }, { status: 400 });
        }

        let classesCreated = 0;
        let sectionsCreated = 0;
        let classSectionsCreated = 0;

        for (const row of parsed.data) {
            const className = row['Class Name']?.trim();
            const sectionsStr = row['Sections']?.trim() || '';

            if (!className) continue;

            // 1. Insert class if not exists
            let classRecord = await queryOne<{ id: string }>(
                `INSERT INTO classes (name, display_order, school_id) 
                 VALUES ($1, COALESCE((SELECT MAX(display_order) FROM classes WHERE school_id = $2) + 1, 1), $2)
                 ON CONFLICT (name, school_id) DO UPDATE SET name = EXCLUDED.name
                 RETURNING id`,
                [className, schoolId]
            );
            if (!classRecord) {
                classRecord = await queryOne<{ id: string }>(`SELECT id FROM classes WHERE name = $1 AND school_id = $2`, [className, schoolId]);
            } else {
                classesCreated++;
            }

            if (!classRecord) continue;
            const classId = classRecord.id;

            // 2. Parse sections
            const sectionsList = sectionsStr
                ? sectionsStr.split(',').map(s => s.trim()).filter(Boolean)
                : ['General'];

            for (const secName of sectionsList) {
                // Insert section if not exists
                let secRecord = await queryOne<{ id: string }>(
                    `INSERT INTO sections (name, school_id)
                     VALUES ($1, $2)
                     ON CONFLICT (name, school_id) DO UPDATE SET name = EXCLUDED.name
                     RETURNING id`,
                    [secName, schoolId]
                );
                if (!secRecord) {
                    secRecord = await queryOne<{ id: string }>(`SELECT id FROM sections WHERE name = $1 AND school_id = $2`, [secName, schoolId]);
                } else {
                    sectionsCreated++;
                }

                if (!secRecord) continue;
                const sectionId = secRecord.id;

                // 3. Link class and section (Classroom) for current session
                const csRecord = await queryOne(
                    `INSERT INTO class_sections (class_id, section_id, session_id, is_active, school_id)
                     VALUES ($1, $2, $3, true, $4)
                     ON CONFLICT (class_id, section_id, session_id) DO NOTHING
                     RETURNING id`,
                    [classId, sectionId, currentSession.id, schoolId]
                );
                if (csRecord) {
                    classSectionsCreated++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            summary: {
                classesCreated,
                sectionsCreated,
                classSectionsCreated
            }
        });
    } catch (error: any) {
        console.error('Bulk import classes error:', error);
        return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
    }
}
