import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface StudentSubjectRow {
    id: string;
    student_id: string;
    student_roll_number: string;
    student_first_name: string;
    student_last_name: string;
    student_department_id: string;
    student_current_semester: number;
    subject_id: string;
    subject_code: string;
    subject_name: string;
    academic_year: string;
    enrolled_at: string;
}

// GET - List student-subject enrollments
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
        const studentId = searchParams.get('studentId');
        const subjectId = searchParams.get('subjectId');
        const academicYear = searchParams.get('academicYear');

        let queryStr = `
            SELECT ss.*, 
                   st.roll_number as student_roll_number,
                   st.first_name as student_first_name, st.last_name as student_last_name,
                   st.department_id as student_department_id,
                   st.current_semester as student_current_semester,
                   s.code as subject_code, s.name as subject_name
            FROM student_subjects ss
            JOIN students st ON st.id = ss.student_id
            JOIN subjects s ON s.id = ss.subject_id
            WHERE 1=1
        `;
        const params: string[] = [];

        if (studentId) {
            params.push(studentId);
            queryStr += ` AND ss.student_id = $${params.length}`;
        }

        if (subjectId) {
            params.push(subjectId);
            queryStr += ` AND ss.subject_id = $${params.length}`;
        }

        if (academicYear) {
            params.push(academicYear);
            queryStr += ` AND ss.academic_year = $${params.length}`;
        }

        queryStr += ' ORDER BY st.roll_number ASC';

        const enrollments = await query<StudentSubjectRow>(queryStr, params);

        return NextResponse.json({
            enrollments: enrollments.map(e => ({
                id: e.id,
                studentId: e.student_id,
                studentRollNumber: e.student_roll_number,
                studentName: `${e.student_first_name} ${e.student_last_name}`,
                studentDepartmentId: e.student_department_id,
                studentCurrentSemester: e.student_current_semester,
                subjectId: e.subject_id,
                subjectCode: e.subject_code,
                subjectName: e.subject_name,
                academicYear: e.academic_year,
                enrolledAt: e.enrolled_at
            }))
        });
    } catch (error) {
        console.error('Get student-subjects error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST - Enroll student in subject(s)
export async function POST(request: NextRequest) {
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

        // Only super_admin and hod can enroll students
        if (!['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { studentId, subjectIds, academicYear, sync } = await request.json();

        if (!studentId || !subjectIds || !academicYear) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // If sync is true, remove existing enrollments for this student/year first
        if (sync === true) {
            await query(
                'DELETE FROM student_subjects WHERE student_id = $1 AND academic_year = $2',
                [studentId, academicYear]
            );
        }

        // Handle single or multiple subjects
        const subjects = Array.isArray(subjectIds) ? subjectIds : [subjectIds];
        let enrolledCount = 0;

        for (const subjectId of subjects) {
            try {
                await query(
                    `INSERT INTO student_subjects (student_id, subject_id, academic_year)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (student_id, subject_id, academic_year) DO NOTHING`,
                    [studentId, subjectId, academicYear]
                );
                enrolledCount++;
            } catch {
                // Skip duplicates
            }
        }

        return NextResponse.json({
            message: sync ? `Synced student subjects (${enrolledCount} total)` : `Enrolled student in ${enrolledCount} subject(s)`,
            enrolledCount
        }, { status: 201 });
    } catch (error) {
        console.error('Enroll student error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE - Remove student enrollment
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

        if (!['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Enrollment ID required' }, { status: 400 });
        }

        await query('DELETE FROM student_subjects WHERE id = $1', [id]);

        return NextResponse.json({ message: 'Enrollment removed successfully' });
    } catch (error) {
        console.error('Delete enrollment error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
