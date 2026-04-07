import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface StudentData {
    id: string;
    student_id: string;
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
        const subjectIdsParam = searchParams.get('subjectIds'); // allows comma-separated string
        const departmentId = searchParams.get('departmentId');
        const semester = searchParams.get('semester');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        // Build filters
        const filters: string[] = [];
        const params: (string | number)[] = [];

        // Role-based restrictions
        if (role === 'hod') {
            if (departmentId) {
                params.push(departmentId);
                params.push(userId);
                filters.push(`s.department_id = $${params.length - 1} AND s.department_id IN (
                    SELECT department_id FROM users WHERE id = $${params.length}
                    UNION SELECT department_id FROM user_departments WHERE user_id = $${params.length}
                )`);
            } else {
                params.push(userId);
                filters.push(`s.department_id IN (
                    SELECT department_id FROM users WHERE id = $${params.length}
                    UNION SELECT department_id FROM user_departments WHERE user_id = $${params.length}
                )`);
            }
        } else if (role === 'teacher') {
            // Teacher: Only show students who are enrolled in subjects this teacher teaches
            params.push(userId);
            const teacherParamIdx = params.length;
            filters.push(`s.id IN (
                SELECT ss.student_id FROM student_subjects ss
                JOIN teacher_subjects ts ON ts.subject_id = ss.subject_id
                WHERE ts.teacher_id = $${teacherParamIdx}
            )`);
            if (departmentId) {
                params.push(departmentId);
                filters.push(`s.department_id = $${params.length}`);
            }
        } else if (role === 'super_admin' && departmentId) {
            params.push(departmentId);
            filters.push(`s.department_id = $${params.length}`);
        }

        if (semester) {
            params.push(parseInt(semester));
            filters.push(`s.current_semester = $${params.length}`);
        }

        // Subject filter
        if (subjectIdsParam) {
            const subjectIds = subjectIdsParam.split(',').filter(id => id.trim() !== '');
            if (subjectIds.length > 0) {
                const placeholders = subjectIds.map(id => {
                    params.push(id);
                    return `$${params.length}`;
                }).join(', ');
                filters.push(`ar.subject_id IN (${placeholders})`);
            }
        }

        // Date filter
        if (startDate) {
            params.push(startDate);
            filters.push(`ar.date >= $${params.length}`);
        }
        if (endDate) {
            params.push(endDate);
            filters.push(`ar.date <= $${params.length}`);
        }

        const filterClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

        // For teachers, we also need to filter the COUNTs to only their subjects/records
        let teacherSubjectFilter = '1=1';
        if (role === 'teacher' && !subjectIdsParam) {
            // finding the param index for userId
            let uIdIndex = params.indexOf(userId);
            if (uIdIndex === -1) {
                params.push(userId);
                uIdIndex = params.length - 1;
            }
            // OLD: Filter by subject assignment
            // teacherSubjectFilter = `ar.subject_id IN (SELECT subject_id FROM teacher_subjects WHERE teacher_id = $${uIdIndex + 1})`;

            // NEW: Filter by who marked the attendance
            teacherSubjectFilter = `ar.teacher_id = $${uIdIndex + 1}`;
        }

        const queryStr = `
            SELECT 
                s.id,
                s.student_id,
                s.roll_number,
                s.first_name,
                s.last_name,
                d.name as department_name,
                s.current_semester,
                COUNT(ar.id) as total_lectures,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as attended
            FROM students s
            LEFT JOIN departments d ON d.id = s.department_id
            LEFT JOIN attendance_records ar ON ar.student_id = s.id AND (${teacherSubjectFilter})
            WHERE 1=1
            ${filterClause}
            GROUP BY s.id, s.student_id, s.roll_number, s.first_name, s.last_name, d.name, s.current_semester
            ORDER BY s.roll_number ASC
        `;

        const students = await query<StudentData>(queryStr, params);

        const formattedStudents = students.map(s => ({
            id: s.id,
            studentId: s.student_id,
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
