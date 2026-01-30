import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface StudentData {
    id: string;
    roll_number: string;
    first_name: string;
    last_name: string;
    department_name: string;
    current_semester: number;
    total_lectures: string;
    attended: string;
}

// GET - Student-wise attendance report
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
        const subjectId = searchParams.get('subjectId');
        const departmentId = searchParams.get('departmentId');
        const semester = searchParams.get('semester');

        // Build filters
        const filters: string[] = [];
        const params: (string | number)[] = [];

        // Role-based restrictions
        if (role === 'hod' && userDeptId) {
            // HOD: filter by their department (students.department_id)
            params.push(userDeptId);
            filters.push(`s.department_id = $${params.length}`);
        } else if (role === 'teacher') {
            // Teacher: filter by students in their assigned subjects
            params.push(userId);
            filters.push(`s.id IN (
                SELECT ss.student_id FROM student_subjects ss
                JOIN teacher_subjects ts ON ss.subject_id = ts.subject_id
                WHERE ts.teacher_id = $${params.length}
            )`);
        } else if (role === 'super_admin' && departmentId) {
            // Super admin with department filter (students.department_id)
            params.push(departmentId);
            filters.push(`s.department_id = $${params.length}`);
        }

        // Semester filter (applies to all roles)
        if (semester) {
            params.push(parseInt(semester));
            filters.push(`s.current_semester = $${params.length}`);
        }

        // Subject filter
        if (subjectId) {
            params.push(subjectId);
            filters.push(`ar.subject_id = $${params.length}`);
        }

        const filterClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

        const queryStr = `
            SELECT 
                s.id,
                s.roll_number,
                s.first_name,
                s.last_name,
                d.name as department_name,
                s.current_semester,
                COUNT(ar.id) as total_lectures,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as attended
            FROM students s
            LEFT JOIN departments d ON d.id = s.department_id
            LEFT JOIN attendance_records ar ON ar.student_id = s.id
            WHERE 1=1
            ${filterClause}
            GROUP BY s.id, s.roll_number, s.first_name, s.last_name, d.name, s.current_semester
            ORDER BY s.roll_number ASC
        `;

        const students = await query<StudentData>(queryStr, params);

        const formattedStudents = students.map(s => ({
            id: s.id,
            rollNumber: s.roll_number,
            name: `${s.first_name} ${s.last_name}`,
            department: s.department_name || 'N/A',
            semester: s.current_semester,
            totalClasses: parseInt(s.total_lectures) || 0,
            attended: parseInt(s.attended) || 0,
            percentage: parseInt(s.total_lectures) > 0
                ? Math.round((parseInt(s.attended) / parseInt(s.total_lectures)) * 100)
                : 0
        }));

        return NextResponse.json({ students: formattedStudents });
    } catch (error) {
        console.error('Student report error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
