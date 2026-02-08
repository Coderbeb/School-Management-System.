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

interface DetailedRecord {
    student_id: string;
    roll_number: string;
    first_name: string;
    last_name: string;
    subject_code: string;
    subject_name: string;
    lecture_number: number;
    status: string;
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
        const detailed = searchParams.get('detailed') === 'true';

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
            // Teacher: only show records marked by THEM
            filters.push(`ar.teacher_id = $${params.length + 1}`);
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

        // Summary query
        const summaryQueryStr = `
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

        const records = await query<AttendanceRecord>(summaryQueryStr, params);

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

        // If detailed flag is set, also return individual student records
        let detailedRecords: any[] = [];
        if (detailed) {
            const detailQueryStr = `
                SELECT 
                    s.id as student_id,
                    s.roll_number,
                    s.first_name,
                    s.last_name,
                    sub.code as subject_code,
                    sub.name as subject_name,
                    ar.lecture_number,
                    ar.status
                FROM attendance_records ar
                JOIN students s ON s.id = ar.student_id
                JOIN subjects sub ON sub.id = ar.subject_id
                WHERE ar.date = $1
                ${filterClause}
                ORDER BY s.roll_number, sub.code, ar.lecture_number
            `;

            const details = await query<DetailedRecord>(detailQueryStr, params);
            
            detailedRecords = details.map(d => ({
                studentId: d.student_id,
                rollNumber: d.roll_number,
                studentName: `${d.first_name} ${d.last_name}`,
                subjectCode: d.subject_code,
                subjectName: d.subject_name,
                lectureNumber: d.lecture_number,
                status: d.status
            }));
        }

        return NextResponse.json({ 
            records: formattedRecords,
            ...(detailed && { detailedRecords })
        });
    } catch (error) {
        console.error('Daily report error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

