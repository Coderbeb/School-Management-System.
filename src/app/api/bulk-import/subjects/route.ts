import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import Papa from 'papaparse';

interface SubjectCSVRow {
    'Subject Name': string;
    'Subject Code': string;
    'Classes': string;
}

export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { csvData } = await request.json();
        if (!csvData) return NextResponse.json({ error: 'CSV data is required' }, { status: 400 });

        const parsed = Papa.parse<SubjectCSVRow>(csvData, {
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

        const currentSession = await queryOne<{ id: string }>(
            `SELECT id FROM academic_sessions WHERE is_current = true AND school_id = $1 LIMIT 1`,
            [schoolId]
        );
        if (!currentSession) {
            return NextResponse.json({ error: 'No active academic session found for your school.' }, { status: 400 });
        }

        let subjectsCreated = 0;
        let subjectsMapped = 0;
        const missingClasses = new Set<string>();

        for (const row of parsed.data) {
            const subjectName = row['Subject Name']?.trim();
            const subjectCode = row['Subject Code']?.trim()?.toUpperCase();
            const classesStr = row['Classes']?.trim() || '';

            if (!subjectName || !subjectCode) continue;

            // 1. Create or fetch subject
            let subjectRecord = await queryOne<{ id: string }>(
                `INSERT INTO subjects (name, code, school_id, is_active)
                 VALUES ($1, $2, $3, true)
                 ON CONFLICT (code, school_id) DO UPDATE SET name = EXCLUDED.name
                 RETURNING id`,
                [subjectName, subjectCode, schoolId]
            );

            if (!subjectRecord) {
                subjectRecord = await queryOne<{ id: string }>(
                    `SELECT id FROM subjects WHERE code = $1 AND school_id = $2`,
                    [subjectCode, schoolId]
                );
            } else {
                subjectsCreated++;
            }

            if (!subjectRecord) continue;
            const subjectId = subjectRecord.id;

            // 2. Map to classes
            const classesList = classesStr.split(',').map(c => c.trim()).filter(Boolean);

            for (const className of classesList) {
                // Find class by name
                const classRecord = await queryOne<{ id: string }>(
                    `SELECT id FROM classes WHERE LOWER(name) = LOWER($1) AND school_id = $2`,
                    [className, schoolId]
                );

                if (!classRecord) {
                    missingClasses.add(className);
                    continue;
                }

                // Create class_subjects mapping
                const mapping = await queryOne(
                    `INSERT INTO class_subjects (class_id, subject_id, session_id, is_elective)
                     VALUES ($1, $2, $3, false)
                     ON CONFLICT (class_id, subject_id, session_id) DO NOTHING
                     RETURNING id`,
                    [classRecord.id, subjectId, currentSession.id]
                );
                if (mapping) {
                    subjectsMapped++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            summary: {
                subjectsCreated,
                subjectsMapped,
                missingClasses: Array.from(missingClasses)
            }
        });
    } catch (error: any) {
        console.error('Bulk import subjects error:', error);
        return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
    }
}
