import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken, hashPassword } from '@/lib/auth';

interface RouteContext {
    params: Promise<{
        id: string;
    }>;
}

// GET: Fetch detailed student profile + attendance stats
export async function GET(request: NextRequest, { params }: RouteContext) {
    try {
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

        const { id: studentId } = await params;

        // 1. Fetch student info and current enrollment
        const studentInfo = await queryOne(
            `SELECT
                s.*,
                u.email,
                se.roll_number,
                se.status as enrollment_status,
                cs.id as class_section_id,
                c.id as class_id,
                c.name as class_name,
                sec.id as section_id,
                sec.name as section_name,
                se.session_id,
                asess.name as session_name
             FROM students s
             LEFT JOIN users u ON s.user_id = u.id
             LEFT JOIN student_enrollments se ON se.student_id = s.id
             LEFT JOIN class_sections cs ON se.class_section_id = cs.id
             LEFT JOIN classes c ON cs.class_id = c.id
             LEFT JOIN sections sec ON cs.section_id = sec.id
             LEFT JOIN academic_sessions asess ON se.session_id = asess.id
             WHERE s.id = $1
             ORDER BY asess.is_current DESC NULLS LAST, se.enrolled_at DESC LIMIT 1`,
            [studentId]
        );

        if (!studentInfo) {
            return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

        // 2. Fetch student's attendance stats for the current/latest session
        const attendanceStats = await queryOne<{ total: string; present: string; absent: string; late: string; excused: string }>(
            `SELECT
                COUNT(*) as total,
                COUNT(CASE WHEN status = 'present' THEN 1 END) as present,
                COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent,
                COUNT(CASE WHEN status = 'late' THEN 1 END) as late,
                COUNT(CASE WHEN status = 'excused' THEN 1 END) as excused
             FROM attendance_records
             WHERE student_id = $1`,
            [studentId]
        );

        // 3. Fetch recent attendance logs
        const attendanceLogs = await query(
            `SELECT ar.date, ar.status, ar.remarks, sub.name as subject_name, sub.code as subject_code
             FROM attendance_records ar
             LEFT JOIN subjects sub ON ar.subject_id = sub.id
             WHERE ar.student_id = $1
             ORDER BY ar.date DESC, ar.recorded_at DESC LIMIT 30`,
            [studentId]
        );

        return NextResponse.json({
            student: studentInfo,
            stats: {
                total: parseInt(attendanceStats?.total || '0'),
                present: parseInt(attendanceStats?.present || '0'),
                absent: parseInt(attendanceStats?.absent || '0'),
                late: parseInt(attendanceStats?.late || '0'),
                excused: parseInt(attendanceStats?.excused || '0'),
            },
            logs: attendanceLogs
        });
    } catch (error) {
        console.error('GET student profile error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT: Full edit student profile, enrollment class, and roll number
export async function PUT(request: NextRequest, { params }: RouteContext) {
    try {
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { id: studentId } = await params;
        const body = await request.json();

        const {
            firstName, lastName, email, password, dateOfBirth, gender, bloodGroup, address, photoUrl,
            guardianName, guardianRelation, guardianPhone, guardianEmail, guardianPhoneAlt,
            admissionNumber, admissionDate, isActive,
            classSectionId, sessionId, rollNumber
        } = body;

        const currentStudent = await queryOne<{ user_id: string | null; school_id: string }>(
            `SELECT user_id, school_id FROM students WHERE id = $1`, [studentId]
        );
        if (!currentStudent) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

        let userId = currentStudent.user_id;

        if (email) {
            const trimmedEmail = email.trim().toLowerCase();
            const existingUser = await queryOne<{ id: string }>(
                `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> COALESCE($2, '00000000-0000-0000-0000-000000000000'::uuid)`,
                [trimmedEmail, userId]
            );
            if (existingUser) {
                return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
            }

            if (userId) {
                await query(
                    `UPDATE users SET email = $1, first_name = $2, last_name = $3, is_active = $4 WHERE id = $5`,
                    [trimmedEmail, firstName, lastName, isActive, userId]
                );

                if (password) {
                    const passHash = await hashPassword(password);
                    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passHash, userId]);
                }
            } else {
                const passHash = await hashPassword(password || 'Test@1234');
                const newUser = await queryOne<{ id: string }>(
                    `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, school_id)
                     VALUES ($1, $2, $3, $4, 'student', $5, $6)
                     RETURNING id`,
                    [trimmedEmail, passHash, firstName, lastName, isActive, currentStudent.school_id]
                );
                if (newUser) {
                    userId = newUser.id;
                    await query(`UPDATE students SET user_id = $1 WHERE id = $2`, [userId, studentId]);
                }
            }
        }

        // 1. Update Student Table
        const student = await queryOne(
            `UPDATE students SET
                user_id = $17,
                first_name = $2,
                last_name = $3,
                date_of_birth = $4,
                gender = $5,
                blood_group = $6,
                address = $7,
                photo_url = COALESCE($8, photo_url),
                guardian_name = $9,
                guardian_relation = $10,
                guardian_phone = $11,
                guardian_email = $12,
                guardian_phone_alt = $13,
                admission_number = $14,
                admission_date = $15,
                is_active = $16,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [
                studentId, firstName, lastName, dateOfBirth || null, gender || null, bloodGroup || null,
                address || null, photoUrl || null, guardianName || null, guardianRelation || null,
                guardianPhone, guardianEmail || null, guardianPhoneAlt || null,
                admissionNumber || null, admissionDate || null, isActive, userId
            ]
        );

        if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

        // 2. Update/Insert Enrollment
        if (classSectionId && sessionId) {
            await query(
                `INSERT INTO student_enrollments (student_id, class_section_id, session_id, roll_number)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (student_id, session_id)
                 DO UPDATE SET class_section_id = $2, roll_number = $4`,
                [studentId, classSectionId, sessionId, rollNumber || null]
            );
        }

        return NextResponse.json({ success: true, student });
    } catch (error) {
        console.error('PUT student profile error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
