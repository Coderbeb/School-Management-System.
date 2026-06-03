import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, pool } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId, hashPassword } from '@/lib/auth';

// GET: List students — filter by sessionId, classSectionId, or search query (scoped by school)
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const sessionId = searchParams.get('sessionId');
        const classSectionId = searchParams.get('classSectionId');
        const search = searchParams.get('search');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = (page - 1) * limit;

        let sql = `
            SELECT
                s.id, s.admission_number, s.first_name, s.last_name,
                s.date_of_birth, s.gender, s.guardian_name, s.guardian_phone,
                s.guardian_email, s.is_active, s.created_at,
                se.roll_number, se.status as enrollment_status,
                (c.name || ' - ' || sec.name) as class_section_name,
                cs.id as class_section_id
            FROM students s
            LEFT JOIN student_enrollments se ON se.student_id = s.id
            LEFT JOIN class_sections cs ON se.class_section_id = cs.id
            LEFT JOIN classes c ON cs.class_id = c.id
            LEFT JOIN sections sec ON cs.section_id = sec.id
            WHERE 1=1
        `;
        const params: unknown[] = [];
        let paramIdx = 1;

        // School isolation
        if (schoolId) {
            sql += ` AND s.school_id = $${paramIdx++}`;
            params.push(schoolId);
        }

        if (sessionId) {
            sql += ` AND se.session_id = $${paramIdx++}`;
            params.push(sessionId);
        }
        if (classSectionId) {
            sql += ` AND se.class_section_id = $${paramIdx++}`;
            params.push(classSectionId);
        }
        if (search) {
            sql += ` AND (s.first_name ILIKE $${paramIdx} OR s.last_name ILIKE $${paramIdx} OR s.admission_number ILIKE $${paramIdx} OR s.guardian_phone ILIKE $${paramIdx})`;
            params.push(`%${search}%`);
            paramIdx++;
        }

        const countSql = sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM');
        const totalResult = await query<{ count: string }>(countSql, params);
        const total = parseInt(totalResult[0]?.count || '0');

        sql += ` ORDER BY c.display_order ASC, se.roll_number ASC, s.first_name ASC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
        params.push(limit, offset);

        const students = await query(sql, params);

        return NextResponse.json({ students, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        console.error('GET students error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST: Admit a new student
export async function POST(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const body = await request.json();
        const {
            firstName, lastName, email, password, dateOfBirth, gender, bloodGroup, address, photoUrl,
            guardianName, guardianRelation, guardianPhone, guardianEmail, guardianPhoneAlt,
            admissionNumber, admissionDate,
            // Enrollment details
            classSectionId, sessionId, rollNumber
        } = body;

        if (!firstName || !lastName || !guardianPhone) {
            return NextResponse.json({ error: 'First name, last name, and guardian phone are required' }, { status: 400 });
        }
        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        // Check subscription limit
        const studentCount = await queryOne<{ count: string }>(
            `SELECT COUNT(*) as count FROM students WHERE school_id = $1 AND is_active = true`,
            [schoolId]
        );
        const schoolInfo = await queryOne<{ max_students: number }>(
            `SELECT max_students FROM schools WHERE id = $1`,
            [schoolId]
        );
        if (schoolInfo && studentCount && parseInt(studentCount.count) >= schoolInfo.max_students) {
            return NextResponse.json({
                error: `Student limit reached (${schoolInfo.max_students}). Please upgrade your subscription to add more students.`
            }, { status: 403 });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            let userId = null;
            if (email) {
                const trimmedEmail = email.trim().toLowerCase();
                const existingUserRes = await client.query<{ id: string }>(
                    `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
                    [trimmedEmail]
                );
                const existingUser = existingUserRes.rows[0];
                if (existingUser) {
                    await client.query('ROLLBACK');
                    client.release();
                    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
                }

                const plainPassword = password || 'Test@1234';
                const passHash = await hashPassword(plainPassword);

                const newUserRes = await client.query<{ id: string }>(
                    `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, school_id)
                     VALUES ($1, $2, $3, $4, 'student', true, $5)
                     RETURNING id`,
                    [trimmedEmail, passHash, firstName, lastName, schoolId]
                );
                const newUser = newUserRes.rows[0];
                if (newUser) {
                    userId = newUser.id;
                }
            }

            // Create student record
            const studentRes = await client.query<{ id: string }>(
                `INSERT INTO students (
                    user_id, first_name, last_name, date_of_birth, gender, blood_group, address, photo_url,
                    guardian_name, guardian_relation, guardian_phone, guardian_email, guardian_phone_alt,
                    admission_number, admission_date, is_active, school_id
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true,$16)
                RETURNING id`,
                [userId, firstName, lastName, dateOfBirth || null, gender || null, bloodGroup || null,
                 address || null, photoUrl || null, guardianName || null, guardianRelation || null,
                 guardianPhone, guardianEmail || null, guardianPhoneAlt || null,
                 admissionNumber || null, admissionDate || new Date().toISOString().split('T')[0], schoolId]
            );
            const student = studentRes.rows[0];

            if (!student) {
                await client.query('ROLLBACK');
                client.release();
                return NextResponse.json({ error: 'Failed to create student' }, { status: 500 });
            }

            // If class section and session provided, create enrollment
            if (classSectionId && sessionId) {
                await client.query(
                    `INSERT INTO student_enrollments (student_id, class_section_id, session_id, roll_number)
                     VALUES ($1, $2, $3, $4)`,
                    [student.id, classSectionId, sessionId, rollNumber || null]
                );
            }

            await client.query('COMMIT');
            client.release();
            return NextResponse.json({ student }, { status: 201 });
        } catch (txError) {
            await client.query('ROLLBACK');
            client.release();
            throw txError;
        }
    } catch (error: any) {
        console.error('POST student error:', error);
        if (error?.code === '23505') return NextResponse.json({ error: 'Admission number already exists' }, { status: 409 });
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT: Update student profile
export async function PUT(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const body = await request.json();
        const { id, firstName, lastName, dateOfBirth, gender, bloodGroup, address,
                guardianName, guardianRelation, guardianPhone, guardianEmail, guardianPhoneAlt, isActive } = body;

        if (!id) return NextResponse.json({ error: 'Student ID required' }, { status: 400 });

        let sql = `UPDATE students SET
                first_name = COALESCE($2, first_name),
                last_name = COALESCE($3, last_name),
                date_of_birth = COALESCE($4, date_of_birth),
                gender = COALESCE($5, gender),
                blood_group = COALESCE($6, blood_group),
                address = COALESCE($7, address),
                guardian_name = COALESCE($8, guardian_name),
                guardian_relation = COALESCE($9, guardian_relation),
                guardian_phone = COALESCE($10, guardian_phone),
                guardian_email = COALESCE($11, guardian_email),
                guardian_phone_alt = COALESCE($12, guardian_phone_alt),
                is_active = COALESCE($13, is_active),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`;
        const params: unknown[] = [id, firstName, lastName, dateOfBirth, gender, bloodGroup, address,
              guardianName, guardianRelation, guardianPhone, guardianEmail, guardianPhoneAlt, isActive];

        if (schoolId) {
            sql += ` AND school_id = $14`;
            params.push(schoolId);
        }

        sql += ` RETURNING id, first_name, last_name`;
        const student = await queryOne(sql, params);

        if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        return NextResponse.json({ student });
    } catch (error) {
        console.error('PUT student error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
