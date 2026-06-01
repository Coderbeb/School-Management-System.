import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken, hashPassword } from '@/lib/auth';

interface TeacherRow {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    school_id: string | null;
}

interface AssignmentInfo {
    id: string;
    class_name: string;
    section_name: string;
    subject_name: string;
    subject_code: string;
    is_class_teacher: boolean;
}

// GET - List teachers (school-model compatible)
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // Query teachers with their class-section assignments
        const queryText = `
            SELECT 
                u.id, u.email, u.first_name, u.last_name, u.role, u.school_id, u.phone,
                u.is_active, u.created_at, u.updated_at,
                (
                    SELECT COALESCE(json_agg(json_build_object(
                        'id', ta.id,
                        'class_name', c.name,
                        'section_name', sec.name,
                        'subject_name', sub.name,
                        'subject_code', sub.code,
                        'is_class_teacher', ta.is_class_teacher
                    )), '[]'::json)
                    FROM teacher_assignments ta
                    JOIN class_sections cs ON ta.class_section_id = cs.id
                    JOIN classes c ON cs.class_id = c.id
                    JOIN sections sec ON cs.section_id = sec.id
                    JOIN subjects sub ON ta.subject_id = sub.id
                    WHERE ta.teacher_id = u.id
                ) as assignments
            FROM users u
            WHERE u.role = 'teacher'
            ORDER BY u.first_name, u.last_name
        `;

        const teachers = await query<TeacherRow & { assignments: AssignmentInfo[] }>(queryText);

        return NextResponse.json({ teachers });
    } catch (error) {
        console.error('Get teachers error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST - Create teacher
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || (payload.role !== 'super_admin' && payload.role !== 'developer')) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { firstName, lastName, email, phone, role, password, schoolId } = await request.json();

        if (!firstName || !lastName || !email) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Use custom password if provided, otherwise default
        const defaultPassword = password || 'Welcome@123';
        const passwordHash = await hashPassword(defaultPassword);

        const teachers = await query<TeacherRow>(
            `INSERT INTO users (first_name, last_name, email, phone, password_hash, role, school_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [firstName, lastName, email, phone || null, passwordHash, role || 'teacher', schoolId || null]
        );

        const newTeacher = teachers[0];

        return NextResponse.json({
            teacher: newTeacher,
            temporaryPassword: defaultPassword,
        }, { status: 201 });
    } catch (error: unknown) {
        console.error('Create teacher error:', error);
        if ((error as { code?: string }).code === '23505') {
            return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE - Remove teacher
export async function DELETE(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // Only super_admin can delete
        if (payload.role !== 'super_admin' && payload.role !== 'developer') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Teacher ID required' }, { status: 400 });
        }

        // Clean up related records (school-model tables)
        await query('DELETE FROM teacher_assignments WHERE teacher_id = $1', [id]);
        await query('DELETE FROM marks_submissions WHERE teacher_id = $1', [id]);

        // Clean up legacy tables if they exist
        try { await query('DELETE FROM teacher_subjects WHERE teacher_id = $1', [id]); } catch { /* table may not exist */ }
        try { await query('DELETE FROM user_departments WHERE user_id = $1', [id]); } catch { /* table may not exist */ }

        // Unlink teacher from attendance records (preserve history)
        try { await query('UPDATE attendance_records SET teacher_id = NULL WHERE teacher_id = $1', [id]); } catch { /* ok */ }

        // Unlink from audit logs if any
        try { await query('UPDATE audit_logs SET user_id = NULL WHERE user_id = $1', [id]); } catch { /* table may not exist */ }

        await query('DELETE FROM users WHERE id = $1', [id]);

        return NextResponse.json({ message: 'Teacher deleted successfully' });
    } catch (error) {
        console.error('Delete teacher error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT - Update teacher
export async function PUT(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        if (payload.role !== 'super_admin' && payload.role !== 'developer') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { id, firstName, lastName, email, phone, role, password } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Teacher ID required' }, { status: 400 });
        }

        const updateFields: string[] = [];
        const params: (string | boolean)[] = [id];
        let paramCount = 1;

        if (firstName) { updateFields.push(`first_name = $${++paramCount}`); params.push(firstName); }
        if (lastName) { updateFields.push(`last_name = $${++paramCount}`); params.push(lastName); }
        if (email) { updateFields.push(`email = $${++paramCount}`); params.push(email); }
        if (phone !== undefined) { updateFields.push(`phone = $${++paramCount}`); params.push(phone); }
        if (role) { updateFields.push(`role = $${++paramCount}`); params.push(role); }
        if (password) {
            const passwordHash = await hashPassword(password);
            updateFields.push(`password_hash = $${++paramCount}`);
            params.push(passwordHash);
        }

        if (updateFields.length > 0) {
            await query(
                `UPDATE users SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                params
            );
        }

        return NextResponse.json({ message: 'Teacher updated successfully' });
    } catch (error) {
        console.error('Update teacher error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
