import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { parseStudentId } from '@/lib/parseStudentId';

export async function POST(req: Request) {
    const client = await pool.connect();
    try {
        const body = await req.json();
        const { students } = body;

        if (!Array.isArray(students) || students.length === 0) {
            return NextResponse.json({ error: 'No student data provided' }, { status: 400 });
        }

        if (students.length > 500) {
            return NextResponse.json({ error: 'Maximum 500 students per import' }, { status: 400 });
        }

        const results = {
            success: 0,
            failed: 0,
            errors: [] as { row: number, name: string, error: string }[]
        };

        // Cache departments for validation
        const deptResult = await client.query(
            'SELECT id, code, dept_type, degree_type FROM departments'
        );
        const departmentMap = new Map(deptResult.rows.map((d: any) => [d.code.toUpperCase(), { id: d.id, degreeType: d.degree_type }]));

        // Cache ALL subjects with their semesters
        const subjectResult = await client.query(
            `SELECT s.id, s.code, s.name, s.degree_type,
                    COALESCE(array_agg(ss.semester ORDER BY ss.semester), ARRAY[]::integer[]) as semesters
             FROM subjects s
             LEFT JOIN subject_semesters ss ON ss.subject_id = s.id
             GROUP BY s.id, s.code, s.name, s.degree_type`
        );
        const allSubjects = subjectResult.rows;

        // Get current academic year
        const academicYear = '2025-2026';

        // Batch: Fetch all existing student_ids and emails in one query
        const allStudentIds = students
            .filter((s: any) => s.student_id)
            .map((s: any) => s.student_id.toUpperCase());
        const allEmails = students
            .filter((s: any) => s.email)
            .map((s: any) => s.email);

        const existingResult = await client.query(
            `SELECT student_id, email FROM students 
             WHERE student_id = ANY($1) OR (email = ANY($2) AND email IS NOT NULL AND email != '')`,
            [allStudentIds, allEmails]
        );
        const existingStudentIds = new Set(existingResult.rows.map((r: any) => r.student_id?.toUpperCase()));
        const existingEmails = new Set(existingResult.rows.map((r: any) => r.email?.toLowerCase()).filter(Boolean));

        // Use a single transaction for all inserts
        await client.query('BEGIN');

        // Collect subject enrollments for batch insert at the end
        const enrollmentBatch: { studentId: string; subjectId: string }[] = [];

        // Process each student
        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            const rowNum = i + 1;

            try {
                // 1. Basic Validation
                if (!student.student_id || !student.first_name) {
                    throw new Error('Missing required fields (Student ID, First Name)');
                }

                // 2. Parse Student ID to auto-detect fields
                const parsed = parseStudentId(student.student_id);
                if (!parsed.isValid) {
                    throw new Error(`Invalid Student ID format: ${parsed.error}`);
                }

                // 3. Find department based on parsed info
                let deptId: string | undefined;
                let degreeType: string | undefined;

                if (parsed.courseType === 'vocational') {
                    if (parsed.prefix === 'BBA') {
                        deptId = departmentMap.get('BBA')?.id;
                        degreeType = departmentMap.get('BBA')?.degreeType;
                    } else {
                        deptId = departmentMap.get('IT')?.id;
                        degreeType = departmentMap.get('IT')?.degreeType;
                    }
                } else if (parsed.courseType === 'regular' && parsed.deptCode) {
                    deptId = departmentMap.get(parsed.deptCode.toUpperCase())?.id;
                    degreeType = departmentMap.get(parsed.deptCode.toUpperCase())?.degreeType;
                } else if (parsed.courseType === 'pg' && parsed.deptCode) {
                    deptId = departmentMap.get(parsed.deptCode.toUpperCase())?.id;
                    degreeType = departmentMap.get(parsed.deptCode.toUpperCase())?.degreeType;
                }

                if (student.department_code) {
                    const overrideDept = departmentMap.get(student.department_code.toUpperCase());
                    if (overrideDept) {
                        deptId = overrideDept.id;
                        degreeType = overrideDept.degreeType;
                    }
                }

                if (!deptId) {
                    throw new Error(`Could not find department for: ${parsed.deptCode || student.department_code || 'unknown'}`);
                }

                // 4. Check for Duplicates using pre-fetched sets (no DB query!)
                const sid = student.student_id.toUpperCase();
                const email = student.email?.toLowerCase();
                if (existingStudentIds.has(sid)) {
                    throw new Error(`Duplicate Student ID (${student.student_id})`);
                }
                if (email && existingEmails.has(email)) {
                    throw new Error(`Duplicate Email (${student.email})`);
                }

                // 5. Determine final values
                const finalRollNumber = student.roll_number ? parseInt(student.roll_number) : (parsed.rollNumber || 0);
                const finalSemester = student.semester ? parseInt(student.semester) : (parsed.semester || 1);

                // 6. Insert Student (single query on same connection)
                const newStudentId = uuidv4();
                await client.query(
                    `INSERT INTO students (
                        id, student_id, roll_number, roll_number_old,
                        first_name, last_name, email, department_id, current_semester, batch_year
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [
                        newStudentId, sid, finalRollNumber, finalRollNumber.toString(),
                        student.first_name, student.last_name || '', student.email || null,
                        deptId, finalSemester, parsed.admissionYear || new Date().getFullYear()
                    ]
                );

                // Mark as existing to prevent duplicates within the batch
                existingStudentIds.add(sid);
                if (email) existingEmails.add(email);

                // 7. Collect subject enrollments (don't insert yet — batch later)
                const subjectInputs: { value: string; isCrossDegree: boolean }[] = [];

                if (student.subject_codes) {
                    student.subject_codes.split(',').map((s: string) => s.trim()).filter(Boolean).forEach((code: string) => {
                        subjectInputs.push({ value: code, isCrossDegree: false });
                    });
                }

                const crossDegreeFields = ['minor', 'mdc', 'vac', 'aec', 'ge1', 'ge2', 'generic1', 'generic2'];
                ['core1', 'core2', 'major_subject', 'major', 'minor', 'mdc', 'vac', 'aec', 'aecc',
                    'ge1', 'ge2', 'generic1', 'generic2'].forEach(col => {
                        if (student[col] && typeof student[col] === 'string' && student[col].trim()) {
                            const isCrossDegree = crossDegreeFields.includes(col);
                            subjectInputs.push({ value: student[col].trim(), isCrossDegree });
                        }
                    });

                if (parsed.courseType === 'vocational' && parsed.geSubjects) {
                    const hasGeneric1 = student.generic1 || student.ge1;
                    const hasGeneric2 = student.generic2 || student.ge2;
                    if (!hasGeneric1 && parsed.geSubjects.ge1) {
                        subjectInputs.push({ value: parsed.geSubjects.ge1, isCrossDegree: true });
                    }
                    if (!hasGeneric2 && parsed.geSubjects.ge2) {
                        subjectInputs.push({ value: parsed.geSubjects.ge2, isCrossDegree: true });
                    }
                }

                if (subjectInputs.length > 0) {
                    const departmentSubjects = allSubjects.filter((s: any) =>
                        s.degree_type === degreeType && s.semesters.includes(finalSemester)
                    );
                    const allSemesterSubjects = allSubjects.filter((s: any) =>
                        s.semesters.includes(finalSemester)
                    );

                    for (const input of subjectInputs) {
                        const inputUpper = input.value.toUpperCase();
                        const searchPool = input.isCrossDegree ? allSemesterSubjects : departmentSubjects;

                        const matchedSubject = searchPool.find((s: any) =>
                            s.code.toUpperCase() === inputUpper ||
                            s.name.toUpperCase() === inputUpper ||
                            s.name.toUpperCase().includes(inputUpper) ||
                            inputUpper.includes(s.name.toUpperCase())
                        );

                        if (matchedSubject) {
                            enrollmentBatch.push({ studentId: newStudentId, subjectId: matchedSubject.id });
                        }
                    }
                }

                results.success++;

            } catch (err: any) {
                results.failed++;
                results.errors.push({
                    row: rowNum,
                    name: `${student.first_name || 'Unknown'} ${student.last_name || ''}`.trim(),
                    error: err.message
                });
            }
        }

        // Batch insert all subject enrollments in chunks of 100
        if (enrollmentBatch.length > 0) {
            const CHUNK_SIZE = 100;
            for (let i = 0; i < enrollmentBatch.length; i += CHUNK_SIZE) {
                const chunk = enrollmentBatch.slice(i, i + CHUNK_SIZE);
                const values: string[] = [];
                const params: string[] = [];
                chunk.forEach((e, idx) => {
                    const offset = idx * 3;
                    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
                    params.push(e.studentId, e.subjectId, academicYear);
                });
                await client.query(
                    `INSERT INTO student_subjects (student_id, subject_id, academic_year)
                     VALUES ${values.join(', ')}
                     ON CONFLICT (student_id, subject_id, academic_year) DO NOTHING`,
                    params
                );
            }
        }

        await client.query('COMMIT');
        return NextResponse.json(results);

    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('Import Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    } finally {
        client.release();
    }
}
