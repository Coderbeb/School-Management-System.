import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface AttendanceRecord {
    date: string;
    total_students: string;
    present: string;
    absent: string;
    late: string;
}

// GET - Daily attendance report
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

        const { role, departmentId: userDeptId, userId } = payload;

        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
        const subjectId = searchParams.get('subjectId');
        const departmentId = searchParams.get('departmentId');
        const semester = searchParams.get('semester');

        // Build role-based filter
        const filters: string[] = [];
        const params: (string | number)[] = [date];

        // Role-based restrictions
        if (role === 'hod' && userDeptId) {
            // HOD: filter by their department (students.department_id)
            filters.push(`ar.student_id IN (
                SELECT id FROM students WHERE department_id = $${params.length + 1}
            )`);
            params.push(userDeptId);
        } else if (role === 'teacher') {
            // Teacher: filter by students in their assigned subjects
            filters.push(`ar.student_id IN (
                SELECT ss.student_id FROM student_subjects ss
                JOIN teacher_subjects ts ON ss.subject_id = ts.subject_id
                WHERE ts.teacher_id = $${params.length + 1}
            )`);
            params.push(userId);
        } else if (role === 'super_admin' && departmentId) {
            // Super admin with department filter (students.department_id)
            filters.push(`ar.student_id IN (
                SELECT id FROM students WHERE department_id = $${params.length + 1}
            )`);
            params.push(departmentId);
        }

        // Semester filter (applies to all roles)
        if (semester) {
            filters.push(`ar.student_id IN (
                SELECT id FROM students WHERE current_semester = $${params.length + 1}
            )`);
            params.push(parseInt(semester));
        }

        // Subject filter
        if (subjectId) {
            params.push(subjectId);
            filters.push(`ar.subject_id = $${params.length}`);
        }

        const filterClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

        const queryStr = `
            SELECT 
                ar.date::text as date,
                COUNT(DISTINCT ar.student_id) as total_students,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present,
                COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent,
                COUNT(CASE WHEN ar.status = 'late' THEN 1 END) as late
            FROM attendance_records ar
            WHERE ar.date = $1
            ${filterClause}
            GROUP BY ar.date 
            ORDER BY ar.date DESC
        `;

        const records = await query<AttendanceRecord>(queryStr, params);

        const formattedRecords = records.map(r => ({
            date: r.date,
            totalStudents: parseInt(r.total_students) || 0,
            present: parseInt(r.present) || 0,
            absent: parseInt(r.absent) || 0,
            late: parseInt(r.late) || 0,
            attendancePercentage: parseInt(r.total_students) > 0
                ? Math.round((parseInt(r.present) / parseInt(r.total_students)) * 100)
                : 0
        }));

        return NextResponse.json({ records: formattedRecords });
    } catch (error) {
        console.error('Daily report error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
