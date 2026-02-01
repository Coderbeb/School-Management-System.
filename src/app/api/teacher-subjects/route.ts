import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface TeacherSubjectRow {
    id: string;
    teacher_id: string;
    teacher_first_name: string;
    teacher_last_name: string;
    subject_id: string;
    subject_code: string;
    subject_name: string;
    academic_year: string;
    created_at: string;
}

// GET - List teacher-subject assignments
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
        const teacherId = searchParams.get('teacherId');
        const subjectId = searchParams.get('subjectId');
        const academicYear = searchParams.get('academicYear');

        let queryStr = `
            SELECT ts.*, 
                   u.first_name as teacher_first_name, u.last_name as teacher_last_name,
                   s.code as subject_code, s.name as subject_name, s.semester as subject_semester,
                   s.degree_type
            FROM teacher_subjects ts
            JOIN users u ON u.id = ts.teacher_id
            JOIN subjects s ON s.id = ts.subject_id
            WHERE 1=1
        `;
        const params: string[] = [];

        if (teacherId) {
            params.push(teacherId);
            queryStr += ` AND ts.teacher_id = $${params.length}`;
        }

        if (subjectId) {
            params.push(subjectId);
            queryStr += ` AND ts.subject_id = $${params.length}`;
        }

        if (academicYear) {
            params.push(academicYear);
            queryStr += ` AND ts.academic_year = $${params.length}`;
        }

        queryStr += ' ORDER BY ts.created_at DESC';

        const assignments = await query<TeacherSubjectRow & { subject_semester: number; degree_type: string }>(queryStr, params);

        return NextResponse.json({
            assignments: assignments.map(a => ({
                id: a.id,
                teacherId: a.teacher_id,
                teacherName: `${a.teacher_first_name} ${a.teacher_last_name}`,
                subjectId: a.subject_id,
                subjectCode: a.subject_code,
                subjectName: a.subject_name,
                subjectSemester: a.subject_semester,
                academicYear: a.academic_year,
                degreeType: a.degree_type,
                createdAt: a.created_at
            }))
        });
    } catch (error) {
        console.error('Get teacher-subjects error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST - Assign teacher to subject(s)
// Supports: single subjectId OR subjectCode+departmentId (assigns all semesters)
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

        // Only super_admin and hod can assign teachers
        if (!['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { teacherId, subjectId, subjectCode, degreeType, academicYear } = await request.json();

        if (!teacherId || !academicYear) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // If subjectCode + departmentId provided, get all subject IDs for that code
        let subjectIds: string[] = [];

        if (subjectCode && degreeType) {
            const subjects = await query<{ id: string }>(
                'SELECT id FROM subjects WHERE code = $1 AND degree_type = $2',
                [subjectCode, degreeType]
            );
            subjectIds = subjects.map(s => s.id);
        } else if (subjectId) {
            subjectIds = [subjectId];
        } else {
            return NextResponse.json({ error: 'Subject ID or code+degreeType required' }, { status: 400 });
        }

        if (subjectIds.length === 0) {
            return NextResponse.json({ error: 'No subjects found' }, { status: 404 });
        }

        // Assign teacher to all subject IDs
        let assignedCount = 0;
        for (const sId of subjectIds) {
            const result = await query<{ id: string }>(
                `INSERT INTO teacher_subjects (teacher_id, subject_id, academic_year)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (teacher_id, subject_id, academic_year) DO NOTHING
                 RETURNING id`,
                [teacherId, sId, academicYear]
            );
            if (result.length > 0) assignedCount++;
        }

        return NextResponse.json({
            message: `Teacher assigned to ${assignedCount} semester(s) successfully`,
            assignedCount
        }, { status: 201 });
    } catch (error) {
        console.error('Assign teacher error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE - Remove teacher-subject assignment
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
            return NextResponse.json({ error: 'Assignment ID required' }, { status: 400 });
        }

        await query('DELETE FROM teacher_subjects WHERE id = $1', [id]);

        return NextResponse.json({ message: 'Assignment removed successfully' });
    } catch (error) {
        console.error('Delete assignment error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
