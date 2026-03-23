import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface DepartmentInfo {
    id: string;
    name: string;
    code: string;
    degree_type: string;
}

interface SemesterStats {
    semester: string;
    total_students: string;
    avg_attendance: string;
}

interface SubjectStats {
    id: string;
    name: string;
    code: string;
    semester: string;
    total_students: string;
    avg_attendance: string;
}

interface StudentAlert {
    id: string;
    student_id: string;
    roll_number: string;
    name: string;
    semester: string;
    attendance_pct: string;
}

// GET - Department Overview Data
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

        const { role, departmentId: userDeptId } = payload;

        // Teachers cannot access department reports
        if (role === 'teacher') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }


        const searchParams = request.nextUrl.searchParams;
        const selectedDeptId = searchParams.get('departmentId') || userDeptId;
        const stream = searchParams.get('stream');

        if (!selectedDeptId) {
            return NextResponse.json({ error: 'Department ID required' }, { status: 400 });
        }

        // Setup stream filtering params
        let streamCondition = '';
        const params: string[] = [selectedDeptId];
        
        let subjectStreamCondition = '';
        const subjectParams: string[] = [selectedDeptId];

        if (stream && stream !== 'all') {
            params.push(`${stream}%`);
            streamCondition = `AND s.student_id ILIKE $${params.length}`;
            
            // subjectParams has degree_type at $2
            subjectParams.push(''); // placeholder for element 2
            subjectParams.push(`${stream}%`); // element 3
            subjectStreamCondition = `AND st.student_id ILIKE $3`;
        }

        // 1. Get department info including degree_type
        const deptInfo = await queryOne<DepartmentInfo>(
            `SELECT id, name, code, degree_type FROM departments WHERE id = $1`,
            [selectedDeptId]
        );

        if (!deptInfo) {
            return NextResponse.json({ error: 'Department not found' }, { status: 404 });
        }

        // 0. Get available streams for this department
        let availableStreams: string[] = [];
        if (deptInfo.code.toUpperCase() === 'IT') {
            availableStreams = ['BCA', 'BSCIT'];
        }

        // 2. Get semester-wise stats for students in this department
        const semesterStats = await query<SemesterStats>(
            `SELECT 
                s.current_semester::text as semester,
                COUNT(DISTINCT s.id) as total_students,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as avg_attendance
            FROM students s
            LEFT JOIN attendance_records ar ON ar.student_id = s.id
            WHERE s.department_id = $1 ${streamCondition}
            GROUP BY s.current_semester
            ORDER BY s.current_semester`,
            params
        );

        // 3. Get subject-wise stats using degree_type to link subjects
        const subjectStats = await query<SubjectStats>(
            `SELECT 
                sub.id,
                sub.name,
                sub.code,
                COALESCE(
                    (SELECT string_agg(ss2.semester::text, ', ' ORDER BY ss2.semester)
                     FROM subject_semesters ss2 WHERE ss2.subject_id = sub.id),
                    ''
                ) as semester,
                COUNT(DISTINCT ss.student_id) as total_students,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as avg_attendance
            FROM subjects sub
            LEFT JOIN student_subjects ss ON ss.subject_id = sub.id
            LEFT JOIN students st ON ss.student_id = st.id AND st.department_id = $1 ${subjectStreamCondition}
            LEFT JOIN attendance_records ar ON ar.subject_id = sub.id AND ar.student_id = st.id
            WHERE sub.degree_type = $2
            GROUP BY sub.id, sub.name, sub.code
            ORDER BY sub.code, sub.name`,
            (() => { subjectParams[1] = deptInfo.degree_type; return subjectParams; })()
        );

        // 4. Get critical students (<60% attendance)
        const criticalStudents = await query<StudentAlert>(
            `SELECT 
                s.id,
                s.student_id,
                s.roll_number::text as roll_number,
                CONCAT(s.first_name, ' ', s.last_name) as name,
                s.current_semester::text as semester,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as attendance_pct
            FROM students s
            LEFT JOIN attendance_records ar ON ar.student_id = s.id
            WHERE s.department_id = $1 ${streamCondition}
            GROUP BY s.id, s.student_id, s.roll_number, s.first_name, s.last_name, s.current_semester
            HAVING COUNT(ar.id) > 0 AND 
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) < 60
            ORDER BY attendance_pct ASC
            LIMIT 20`,
            params
        );

        // 5. Get warning students (60-75% attendance)
        const warningStudents = await query<StudentAlert>(
            `SELECT 
                s.id,
                s.student_id,
                s.roll_number::text as roll_number,
                CONCAT(s.first_name, ' ', s.last_name) as name,
                s.current_semester::text as semester,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as attendance_pct
            FROM students s
            LEFT JOIN attendance_records ar ON ar.student_id = s.id
            WHERE s.department_id = $1 ${streamCondition}
            GROUP BY s.id, s.student_id, s.roll_number, s.first_name, s.last_name, s.current_semester
            HAVING COUNT(ar.id) > 0 AND 
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) BETWEEN 60 AND 74.9
            ORDER BY attendance_pct ASC
            LIMIT 20`,
            params
        );

        // Calculate totals
        const totalStudents = semesterStats.reduce((acc, s) => acc + parseInt(s.total_students || '0'), 0);
        const totalSubjects = subjectStats.length;

        return NextResponse.json({
            department: {
                id: deptInfo.id,
                name: deptInfo.name,
                code: deptInfo.code,
                degreeType: deptInfo.degree_type,
            },
            availableStreams,
            overallStats: {
                totalStudents,
                totalSubjects,
                criticalCount: criticalStudents.length,
                warningCount: warningStudents.length,
            },
            semesterStats: semesterStats.map(s => ({
                semester: parseInt(s.semester),
                totalStudents: parseInt(s.total_students || '0'),
                avgAttendance: Math.round(parseFloat(s.avg_attendance || '0')),
            })),
            subjectStats: subjectStats.map(s => ({
                id: s.id,
                name: s.name,
                code: s.code,
                semester: s.semester,
                totalStudents: parseInt(s.total_students || '0'),
                avgAttendance: Math.round(parseFloat(s.avg_attendance || '0')),
            })),
            criticalStudents: criticalStudents.map(s => ({
                id: s.id,
                studentId: s.student_id,
                rollNumber: s.roll_number,
                name: s.name,
                semester: parseInt(s.semester),
                attendancePercentage: Math.round(parseFloat(s.attendance_pct || '0')),
            })),
            warningStudents: warningStudents.map(s => ({
                id: s.id,
                studentId: s.student_id,
                rollNumber: s.roll_number,
                name: s.name,
                semester: parseInt(s.semester),
                attendancePercentage: Math.round(parseFloat(s.attendance_pct || '0')),
            })),
        });
    } catch (error) {
        console.error('Department overview error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
