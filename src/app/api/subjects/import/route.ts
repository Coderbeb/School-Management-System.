import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(req: Request) {
    const client = await pool.connect();
    try {
        const body = await req.json();
        const { subjects } = body;

        if (!Array.isArray(subjects) || subjects.length === 0) {
            return NextResponse.json({ error: 'No subject data provided' }, { status: 400 });
        }

        if (subjects.length > 500) {
            return NextResponse.json({ error: 'Maximum 500 subjects per import' }, { status: 400 });
        }

        const results = {
            success: 0,
            failed: 0,
            errors: [] as { row: number; name: string; error: string }[]
        };

        const validDegreeTypes = ['ba', 'bsc', 'bcom', 'bca', 'it', 'bba', 'mcom'];

        // Pre-fetch existing subjects (code + degree_type)
        const existingResult = await client.query(
            'SELECT id, code, degree_type FROM subjects'
        );
        const existingMap = new Map<string, string>();
        for (const r of existingResult.rows) {
            existingMap.set(`${r.code}|${r.degree_type}`, r.id);
        }

        // Pre-fetch existing semester mappings
        const existingSemResult = await client.query(
            'SELECT subject_id, semester FROM subject_semesters'
        );
        const existingSemSet = new Set<string>();
        for (const r of existingSemResult.rows) {
            existingSemSet.add(`${r.subject_id}|${r.semester}`);
        }

        await client.query('BEGIN');

        // Collect batches
        const subjectInsertBatch: { code: string; paperCode: string | null; name: string; dt: string; credits: number }[] = [];
        const semesterInsertBatch: { subjectKey: string; sem: number }[] = [];
        // Track which subjects need semester additions (for existing subjects)
        const existingSubjectSemesters: { subjectId: string; sem: number }[] = [];

        for (let i = 0; i < subjects.length; i++) {
            const subject = subjects[i];
            const rowNum = i + 1;

            try {
                if (!subject.code || !subject.name || !subject.degree_type) {
                    throw new Error('Missing required fields (code, name, degree_type)');
                }

                const code = subject.code.trim().toUpperCase();
                const paperCode = subject.paper_code?.trim() || subject.paperCode?.trim() || subject['paper code']?.trim() || null;
                const name = subject.name.trim();
                const credits = subject.credits ? parseInt(subject.credits) : 3;

                // Parse degree_types
                const degreeTypes = subject.degree_type
                    .toString()
                    .split(',')
                    .map((dt: string) => dt.trim().toLowerCase())
                    .filter(Boolean);

                for (const dt of degreeTypes) {
                    if (!validDegreeTypes.includes(dt)) {
                        throw new Error(`Invalid degree type: "${dt}". Valid types: ${validDegreeTypes.join(', ')}`);
                    }
                }

                // Parse semesters
                const semesterStr = subject.semesters?.toString() || subject.semester?.toString() || '1';
                const semesters = semesterStr
                    .split(',')
                    .map((s: string) => parseInt(s.trim()))
                    .filter((s: number) => !isNaN(s) && s >= 1 && s <= 8);

                if (semesters.length === 0) {
                    throw new Error('No valid semesters provided (must be 1-8)');
                }

                let createdAnything = false;

                for (const dt of degreeTypes) {
                    const subjectKey = `${code}|${dt}`;
                    const existingId = existingMap.get(subjectKey);

                    if (existingId) {
                        // Subject exists — just add new semesters
                        for (const sem of semesters) {
                            const semKey = `${existingId}|${sem}`;
                            if (!existingSemSet.has(semKey)) {
                                existingSubjectSemesters.push({ subjectId: existingId, sem });
                                existingSemSet.add(semKey);
                                createdAnything = true;
                            }
                        }
                    } else {
                        // New subject
                        subjectInsertBatch.push({ code, paperCode, name, dt, credits });
                        existingMap.set(subjectKey, `pending_${subjectKey}`);
                        for (const sem of semesters) {
                            semesterInsertBatch.push({ subjectKey, sem });
                        }
                        createdAnything = true;
                    }
                }

                if (!createdAnything) {
                    throw new Error('All semester/degree-type combinations already exist');
                }

                results.success++;

            } catch (err: any) {
                results.failed++;
                results.errors.push({
                    row: rowNum,
                    name: `${subject.code || 'Unknown'} - ${subject.name || 'Unknown'}`,
                    error: err.message
                });
            }
        }

        // Batch INSERT new subjects
        const newSubjectIds = new Map<string, string>();
        if (subjectInsertBatch.length > 0) {
            const CHUNK_SIZE = 100;
            for (let i = 0; i < subjectInsertBatch.length; i += CHUNK_SIZE) {
                const chunk = subjectInsertBatch.slice(i, i + CHUNK_SIZE);
                const values: string[] = [];
                const params: (string | number | null)[] = [];
                chunk.forEach((s, idx) => {
                    const offset = idx * 5;
                    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
                    params.push(s.code, s.paperCode, s.name, s.dt, s.credits);
                });
                const result = await client.query(
                    `INSERT INTO subjects (code, paper_code, name, degree_type, credits)
                     VALUES ${values.join(', ')}
                     ON CONFLICT (code, degree_type) DO UPDATE SET name = EXCLUDED.name, paper_code = coalesce(EXCLUDED.paper_code, subjects.paper_code)
                     RETURNING id, code, degree_type`,
                    params
                );
                for (const row of result.rows) {
                    newSubjectIds.set(`${row.code}|${row.degree_type}`, row.id);
                }
            }
        }

        // Batch INSERT semesters for new subjects
        if (semesterInsertBatch.length > 0) {
            const CHUNK_SIZE = 200;
            for (let i = 0; i < semesterInsertBatch.length; i += CHUNK_SIZE) {
                const chunk = semesterInsertBatch.slice(i, i + CHUNK_SIZE);
                const values: string[] = [];
                const params: (string | number)[] = [];
                chunk.forEach((s, idx) => {
                    const subjectId = newSubjectIds.get(s.subjectKey);
                    if (subjectId) {
                        const offset = params.length;
                        values.push(`($${offset + 1}, $${offset + 2})`);
                        params.push(subjectId, s.sem);
                    }
                });
                if (values.length > 0) {
                    await client.query(
                        `INSERT INTO subject_semesters (subject_id, semester)
                         VALUES ${values.join(', ')}
                         ON CONFLICT (subject_id, semester) DO NOTHING`,
                        params
                    );
                }
            }
        }

        // Insert semesters for existing subjects
        if (existingSubjectSemesters.length > 0) {
            const CHUNK_SIZE = 200;
            for (let i = 0; i < existingSubjectSemesters.length; i += CHUNK_SIZE) {
                const chunk = existingSubjectSemesters.slice(i, i + CHUNK_SIZE);
                const values: string[] = [];
                const params: (string | number)[] = [];
                chunk.forEach((s, idx) => {
                    const offset = params.length;
                    values.push(`($${offset + 1}, $${offset + 2})`);
                    params.push(s.subjectId, s.sem);
                });
                await client.query(
                    `INSERT INTO subject_semesters (subject_id, semester)
                     VALUES ${values.join(', ')}
                     ON CONFLICT (subject_id, semester) DO NOTHING`,
                    params
                );
            }
        }

        await client.query('COMMIT');
        return NextResponse.json(results);

    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('Subject Import Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    } finally {
        client.release();
    }
}
