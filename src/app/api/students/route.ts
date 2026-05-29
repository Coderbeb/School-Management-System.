import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { parseStudentId } from '@/lib/parseStudentId';

export const dynamic = 'force-dynamic';

interface StudentRow {
    id: string;
    roll_number: number;
    first_name: string;
    last_name: string;
    email: string | null;
    current_semester: number;
    department_name?: string;
    department_code?: string;
    department_id?: string;
    student_id?: string;
    course_type?: string;
}

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

        const { searchParams } = new URL(request.url);
        let userId = searchParams.get('userId');
        const search = searchParams.get('search');

        // RBAC / Data Isolation:
        // A student can ONLY view their own profile.
        if (payload.role === 'student') {
            userId = payload.userId;
        }

        let sql = `
            SELECT s.id, s.first_name, s.last_name, s.admission_number, s.school_id, s.user_id,
                   u.email
            FROM students s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE 1=1
        `;
        const params: unknown[] = [];
        let idx = 1;

        if (payload.role !== 'developer' && payload.schoolId) {
            sql += ` AND s.school_id = $${idx++}`;
            params.push(payload.schoolId);
        }

        if (userId) {
            sql += ` AND s.user_id = $${idx++}`;
            params.push(userId);
        }

        if (search) {
            sql += ` AND (s.first_name ILIKE $${idx} OR s.last_name ILIKE $${idx} OR s.admission_number ILIKE $${idx})`;
            params.push(`%${search}%`);
            idx++;
        }

        sql += ` ORDER BY s.first_name ASC`;

        const students = await query<StudentRow>(sql, params);
        return NextResponse.json({ students });
    } catch (error) {
        console.error('Get students error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { studentId, rollNumber, firstName, lastName, email, semester, departmentId } = await request.json();

        if (!studentId || !rollNumber || !firstName || !departmentId) {
            return NextResponse.json({ error: 'Student ID, roll number, first name, and department are required' }, { status: 400 });
        }

        const parsed = parseStudentId(studentId);
        const batchYear = parsed.admissionYear || new Date().getFullYear();

        const students = await query<StudentRow>(
            `INSERT INTO students (roll_number, roll_number_old, first_name, last_name, email, current_semester, batch_year, department_id, student_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [parseInt(rollNumber), rollNumber.toString(), firstName, lastName || '', email || null, parseInt(semester) || 1, batchYear, departmentId, studentId]
        );

        return NextResponse.json({ student: students[0] }, { status: 201 });
    } catch (error: unknown) {
        console.error('Create student error:', error);
        if ((error as { code?: string }).code === '23505') {
            return NextResponse.json({ error: 'Roll number already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Student ID required' }, { status: 400 });
        }

        await query('DELETE FROM students WHERE id = $1', [id]);

        return NextResponse.json({ message: 'Student deleted successfully' });
    } catch (error) {
        console.error('Delete student error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { id, studentId, rollNumber, firstName, lastName, email, semester, departmentId } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Student ID required' }, { status: 400 });
        }

        const updateFields: string[] = [];
        const params: (string | number | boolean)[] = [id];
        let paramCount = 1;

        if (studentId) { updateFields.push(`student_id = $${++paramCount}`); params.push(studentId); }
        if (rollNumber) { updateFields.push(`roll_number = $${++paramCount}`); params.push(parseInt(rollNumber)); }
        if (firstName) { updateFields.push(`first_name = $${++paramCount}`); params.push(firstName); }
        if (lastName !== undefined) { updateFields.push(`last_name = $${++paramCount}`); params.push(lastName); }
        if (email) { updateFields.push(`email = $${++paramCount}`); params.push(email); }
        if (semester) { updateFields.push(`current_semester = $${++paramCount}`); params.push(parseInt(semester)); }
        if (departmentId) { updateFields.push(`department_id = $${++paramCount}`); params.push(departmentId); }

        if (updateFields.length === 0) {
            return NextResponse.json({ message: 'No fields to update' });
        }

        await query(
            `UPDATE students SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            params
        );

        return NextResponse.json({ message: 'Student updated successfully' });
    } catch (error) {
        console.error('Update student error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
