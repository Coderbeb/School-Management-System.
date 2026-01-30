import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { parseStudentId } from '@/lib/parseStudentId';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { students } = body;

        if (!Array.isArray(students) || students.length === 0) {
            return NextResponse.json({ error: 'No student data provided' }, { status: 400 });
        }

        const results = {
            success: 0,
            failed: 0,
            errors: [] as { row: number, name: string, error: string }[]
        };

        // Cache departments for validation
        const deptRes: any = await query('SELECT id, code, dept_type FROM departments', []);
        const departments = deptRes.rows as { id: string; code: string; dept_type: string }[];
        const departmentMap = new Map(departments.map((d: any) => [d.code.toUpperCase(), d.id]));

        // Process each student
        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            const rowNum = i + 1; // 1-based index for user feedback

            try {
                // 1. Basic Validation - only student_id and first_name are required
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

                if (parsed.courseType === 'vocational') {
                    // Vocational students go to IT or BBA department
                    if (parsed.prefix === 'BBA') {
                        deptId = departmentMap.get('BBA');
                    } else {
                        deptId = departmentMap.get('IT');
                    }
                } else if (parsed.courseType === 'regular' && parsed.deptCode) {
                    // Regular students - match dept code
                    deptId = departmentMap.get(parsed.deptCode.toUpperCase());
                } else if (parsed.courseType === 'pg' && parsed.deptCode) {
                    deptId = departmentMap.get(parsed.deptCode.toUpperCase());
                }

                // Allow override: if department_code is provided, use it instead
                if (student.department_code) {
                    const overrideDept = departmentMap.get(student.department_code.toUpperCase());
                    if (overrideDept) deptId = overrideDept;
                }

                if (!deptId) {
                    throw new Error(`Could not find department for: ${parsed.deptCode || student.department_code || 'unknown'}`);
                }

                // 4. Check for Duplicates (Student ID or Email)
                const existingCheck: any = await query(
                    'SELECT id FROM students WHERE student_id = $1 OR (email = $2 AND email IS NOT NULL AND email != \'\')',
                    [student.student_id.toUpperCase(), student.email || null]
                );

                if (existingCheck.rows.length > 0) {
                    throw new Error(`Duplicate Student ID (${student.student_id}) or Email`);
                }

                // 5. Determine final values (use overrides if provided, else auto-detected)
                const finalRollNumber = student.roll_number ? parseInt(student.roll_number) : (parsed.rollNumber || 0);
                const finalSemester = student.semester ? parseInt(student.semester) : (parsed.semester || 1);

                // 6. Insert Student
                await query(
                    `INSERT INTO students (
                        id, 
                        student_id,
                        roll_number, 
                        roll_number_old,
                        first_name, 
                        last_name, 
                        email, 
                        department_id, 
                        current_semester, 
                        batch_year
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [
                        uuidv4(),
                        student.student_id.toUpperCase(),
                        finalRollNumber,
                        finalRollNumber.toString(),
                        student.first_name,
                        student.last_name || '',
                        student.email || null,
                        deptId,
                        finalSemester,
                        parsed.admissionYear || new Date().getFullYear()
                    ]
                );

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

        return NextResponse.json(results);

    } catch (error: any) {
        console.error('Import Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

