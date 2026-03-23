import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import bcrypt from 'bcrypt';

export async function POST(req: Request) {
    const client = await pool.connect();
    try {
        const body = await req.json();
        const { teachers } = body;

        if (!teachers || !Array.isArray(teachers)) {
            return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
        }

        if (teachers.length > 200) {
            return NextResponse.json({ error: 'Maximum 200 teachers per import' }, { status: 400 });
        }

        const stats = {
            success: 0,
            failed: 0,
            errors: [] as any[]
        };

        // Cache departments for validation
        const deptResult = await client.query('SELECT id, code, degree_type FROM departments');
        const departmentMap = new Map(deptResult.rows.map((d: any) => [d.code.toUpperCase(), { id: d.id, degreeType: d.degree_type }]));

        // Cache ALL subjects for assignment
        const subjectResult = await client.query('SELECT id, code, name, degree_type FROM subjects');
        const allSubjects = subjectResult.rows;

        // Batch: Pre-fetch all existing emails in one query
        const allEmails = teachers
            .filter((t: any) => t.email)
            .map((t: any) => t.email.toLowerCase());
        const existingEmailResult = await client.query(
            'SELECT email FROM users WHERE email = ANY($1)',
            [allEmails]
        );
        const existingEmails = new Set(existingEmailResult.rows.map((r: any) => r.email?.toLowerCase()));

        // Pre-hash ALL passwords in parallel (biggest bottleneck!)
        // bcrypt takes ~100ms per hash — doing 50 sequentially = 5s, parallel = ~200ms
        const passwordHashes = await Promise.all(
            teachers.map((t: any) => bcrypt.hash(t.password || 'Welcome@123', 10))
        );

        // Check duplicates within the batch
        const emailsInBatch = new Set<string>();

        // Single transaction
        await client.query('BEGIN');

        // Collect subject assignments for batch insert
        const subjectAssignments: { teacherId: string; subjectId: string; academicYear: string }[] = [];

        // Calculate academic year once
        const now = new Date();
        const currentYear = now.getFullYear();
        const academicYear = now.getMonth() >= 5 ? `${currentYear}-${currentYear + 1}` : `${currentYear - 1}-${currentYear}`;

        const validTeachersBatch: any[] = [];
        const teacherSubjectsMap = new Map<string, string[]>();

        for (let i = 0; i < teachers.length; i++) {
            const teacher = teachers[i];
            const rowNum = i + 1;

            try {
                // 1. Validate Required Fields
                if (!teacher.email || !teacher.first_name || !teacher.last_name || !teacher.department_code || !teacher.role) {
                    throw new Error('Missing required fields (email, first_name, last_name, role, department_code)');
                }

                // Email validation
                const email = teacher.email.toLowerCase();
                if (emailsInBatch.has(email)) {
                    throw new Error(`Duplicate email in file: ${email}`);
                }
                emailsInBatch.add(email);

                // Check against pre-fetched DB emails (no DB query!)
                if (existingEmails.has(email)) {
                    throw new Error(`Email already exists: ${email}`);
                }

                // Department validation
                const deptInfo = departmentMap.get(teacher.department_code.toUpperCase());
                if (!deptInfo) {
                    throw new Error(`Invalid Department Code: ${teacher.department_code}`);
                }
                const deptId = deptInfo.id;

                // Role validation
                const role = teacher.role.toLowerCase();
                if (role !== 'teacher' && role !== 'hod') {
                    throw new Error(`Invalid Role: ${teacher.role} (must be 'teacher' or 'hod')`);
                }

                // 2. Resolve target subject IDs in memory
                const resolvedSubjectIds: string[] = [];
                if (teacher.subject_codes) {
                    const subjectInputs = teacher.subject_codes.split(',').map((s: string) => s.trim()).filter(Boolean);
                    for (const input of subjectInputs) {
                        const inputUpper = input.toUpperCase();
                        const matchedSubjects = allSubjects.filter((s: any) =>
                            s.degree_type === deptInfo.degreeType && (
                                s.code.toUpperCase() === inputUpper ||
                                s.name.toUpperCase() === inputUpper ||
                                s.name.toUpperCase().includes(inputUpper) ||
                                inputUpper.includes(s.name.toUpperCase())
                            )
                        );
                        for (const matchedSubject of matchedSubjects) {
                            resolvedSubjectIds.push(matchedSubject.id);
                        }
                    }
                    if (resolvedSubjectIds.length > 0) {
                        teacherSubjectsMap.set(email, resolvedSubjectIds);
                    }
                }

                // 3. Buffer valid teacher for batch insert
                validTeachersBatch.push({
                    firstName: teacher.first_name,
                    lastName: teacher.last_name,
                    email: email,
                    passwordHash: passwordHashes[i],
                    role: role,
                    deptId: deptId
                });

                existingEmails.add(email);
                stats.success++;

            } catch (err: any) {
                stats.failed++;
                stats.errors.push({
                    row: rowNum,
                    name: `${teacher.first_name} ${teacher.last_name}`,
                    error: err.message
                });
            }
        }

        // Batch insert all valid users in chunks
        if (validTeachersBatch.length > 0) {
            const CHUNK_SIZE = 50; 
            for (let i = 0; i < validTeachersBatch.length; i += CHUNK_SIZE) {
                const chunk = validTeachersBatch.slice(i, i + CHUNK_SIZE);
                const values: string[] = [];
                const params: any[] = [];
                chunk.forEach((t, idx) => {
                    const offset = idx * 6;
                    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
                    params.push(t.firstName, t.lastName, t.email, t.passwordHash, t.role, t.deptId);
                });
                
                const insertResult = await client.query(
                    `INSERT INTO users (first_name, last_name, email, password_hash, role, department_id)
                     VALUES ${values.join(', ')} RETURNING id, email`,
                    params
                );

                // Collect assignments mapped to freshly generated User IDs
                for (const row of insertResult.rows) {
                    const newTeacherId = row.id;
                    const insertedEmail = row.email;
                    const resolvedIds = teacherSubjectsMap.get(insertedEmail);
                    if (resolvedIds) {
                        for (const subjectId of resolvedIds) {
                            subjectAssignments.push({
                                teacherId: newTeacherId,
                                subjectId: subjectId,
                                academicYear
                            });
                        }
                    }
                }
            }
        }

        // Batch insert all subject assignments in chunks
        if (subjectAssignments.length > 0) {
            const CHUNK_SIZE = 100;
            for (let i = 0; i < subjectAssignments.length; i += CHUNK_SIZE) {
                const chunk = subjectAssignments.slice(i, i + CHUNK_SIZE);
                const values: string[] = [];
                const params: string[] = [];
                chunk.forEach((a, idx) => {
                    const offset = idx * 3;
                    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
                    params.push(a.teacherId, a.subjectId, a.academicYear);
                });
                await client.query(
                    `INSERT INTO teacher_subjects (teacher_id, subject_id, academic_year)
                     VALUES ${values.join(', ')}
                     ON CONFLICT (teacher_id, subject_id, academic_year) DO NOTHING`,
                    params
                );
            }
        }

        await client.query('COMMIT');
        return NextResponse.json(stats);

    } catch (err) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('Import error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    } finally {
        client.release();
    }
}
