import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import bcrypt from 'bcrypt';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { teachers } = body; // Array of teacher objects

        if (!teachers || !Array.isArray(teachers)) {
            return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
        }

        const stats = {
            success: 0,
            failed: 0,
            errors: [] as any[]
        };

        // Cache departments for validation
        const departments = await query<{ id: string; code: string }>('SELECT id, code FROM departments', []);
        const departmentMap = new Map(departments.map((d) => [d.code.toUpperCase(), d.id]));

        // Check duplicates within the batch itself
        const emailsInBatch = new Set();

        for (let i = 0; i < teachers.length; i++) {
            const teacher = teachers[i];
            const rowNum = i + 1;

            try {
                // 1. Validate Required Fields
                if (!teacher.email || !teacher.first_name || !teacher.last_name || !teacher.department_code || !teacher.role) {
                    throw new Error('Missing required fields (email, first_name, last_name, role, department_code)');
                }

                // Default password if not provided
                const rawPassword = teacher.password || 'Welcome@123';

                // Email validation
                const email = teacher.email.toLowerCase();
                if (emailsInBatch.has(email)) {
                    throw new Error(`Duplicate email in file: ${email}`);
                }
                emailsInBatch.add(email);

                // Department validation
                const deptId = departmentMap.get(teacher.department_code.toUpperCase());
                if (!deptId) {
                    throw new Error(`Invalid Department Code: ${teacher.department_code}`);
                }

                // Role validation
                const role = teacher.role.toLowerCase();
                if (role !== 'teacher' && role !== 'hod') {
                    throw new Error(`Invalid Role: ${teacher.role} (must be 'teacher' or 'hod')`);
                }

                // 2. Check for Duplicates in DB
                const existingCheck = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
                if (existingCheck.length > 0) {
                    throw new Error(`Email already exists: ${email}`);
                }

                // 3. Hash Password
                const hashedPassword = await bcrypt.hash(rawPassword, 10);

                // 4. Insert User
                await query(
                    `INSERT INTO users (
                        first_name, last_name, email, password_hash, role, department_id, additional_departments
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        teacher.first_name,
                        teacher.last_name,
                        email,
                        hashedPassword,
                        role,
                        deptId,
                        JSON.stringify([]) // Initial empty additional departments
                    ]
                );

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

        return NextResponse.json(stats);

    } catch (err) {
        console.error('Import error:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
