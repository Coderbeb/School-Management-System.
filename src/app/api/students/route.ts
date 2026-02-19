import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

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

        let queryText = `SELECT s.*, d.name as department_name, d.code as department_code 
             FROM students s 
             LEFT JOIN departments d ON s.department_id = d.id`;
        const params: string[] = [];

        // HODs can only see their department's students
        if (payload.role === 'hod' && payload.departmentId) {
            queryText += ' WHERE s.department_id = $1';
            params.push(payload.departmentId);
        }

        queryText += ' ORDER BY s.roll_number ASC';

        const students = await query<StudentRow>(queryText, params);

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
        if (!payload || !['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { studentId, rollNumber, firstName, lastName, email, semester, departmentId } = await request.json();

        if (!studentId || !rollNumber || !firstName || !lastName || !departmentId) {
            return NextResponse.json({ error: 'Student ID, roll number, first name, last name, and department are required' }, { status: 400 });
        }

        const batchYear = new Date().getFullYear();

        const students = await query<StudentRow>(
            `INSERT INTO students (roll_number, roll_number_old, first_name, last_name, email, current_semester, batch_year, department_id, student_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [parseInt(rollNumber), rollNumber.toString(), firstName, lastName, email || null, parseInt(semester) || 1, batchYear, departmentId, studentId]
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

// DELETE - Remove student
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

        // Only super_admin and hod can delete
        if (!['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Student ID required' }, { status: 400 });
        }

        // Check if student belongs to HOD's department
        if (payload.role === 'hod') {
            const student = await query<{ department_id: string }>(
                'SELECT department_id FROM students WHERE id = $1',
                [id]
            );
            if (student.length === 0) {
                return NextResponse.json({ error: 'Student not found' }, { status: 404 });
            }
            if (student[0].department_id !== payload.departmentId) {
                return NextResponse.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        await query('DELETE FROM students WHERE id = $1', [id]);

        return NextResponse.json({ message: 'Student deleted successfully' });
    } catch (error) {
        console.error('Delete student error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT - Update student
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

        if (!['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { id, studentId, rollNumber, firstName, lastName, email, semester, departmentId } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Student ID required' }, { status: 400 });
        }

        // HOD can only edit students in their own department
        if (payload.role === 'hod') {
            const student = await query<{ department_id: string }>(
                'SELECT department_id FROM students WHERE id = $1',
                [id]
            );
            if (student.length === 0) {
                return NextResponse.json({ error: 'Student not found' }, { status: 404 });
            }
            if (student[0].department_id !== payload.departmentId) {
                return NextResponse.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        const updateFields: string[] = [];
        const params: (string | number | boolean)[] = [id];
        let paramCount = 1;

        if (studentId) { updateFields.push(`student_id = $${++paramCount}`); params.push(studentId); }
        if (rollNumber) { updateFields.push(`roll_number = $${++paramCount}`); params.push(parseInt(rollNumber)); }
        if (firstName) { updateFields.push(`first_name = $${++paramCount}`); params.push(firstName); }
        if (lastName) { updateFields.push(`last_name = $${++paramCount}`); params.push(lastName); }
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
