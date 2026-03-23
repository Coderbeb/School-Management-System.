import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface StudentDetail {
    id: string;
    student_id: string;
    roll_number: string;
    first_name: string;
    last_name: string;
    email: string;
    department_name: string;
    current_semester: number;
}

interface SubjectStats {
    subject_id: string;
    subject_name: string;
    subject_code: string;
    total_classes: string;
    attended: string;
    attendance_pct: string;
}

interface MonthlyStats {
    month: string;
    total_classes: string;
    attended: string;
    attendance_pct: string;
}

interface DailyRecord {
    date: string;
    subject_code: string;
    subject_name: string;
    lecture_number: number;
    status: string;
}

// GET - Get detailed stats for a specific student
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id: studentId } = await params;
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        // Get student basic info
        const studentInfo = await query<StudentDetail>(
            `SELECT s.id, s.student_id, s.roll_number, s.first_name, s.last_name, s.email, 
                    s.current_semester, d.name as department_name
             FROM students s
             LEFT JOIN departments d ON d.id = s.department_id
             WHERE s.id = $1`,
            [studentId]
        );

        if (studentInfo.length === 0) {
            return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

        // Build date filter clause
        let dateFilter = '';
        const dateParams: string[] = [];
        if (startDate && endDate) {
            dateFilter = ` AND ar.date >= $2 AND ar.date <= $3`;
            dateParams.push(startDate, endDate);
        } else if (startDate) {
            dateFilter = ` AND ar.date >= $2`;
            dateParams.push(startDate);
        } else if (endDate) {
            dateFilter = ` AND ar.date <= $2`;
            dateParams.push(endDate);
        }

        // Role-based filtering (Teachers only see their subjects)
        let teacherSubjectFilter = '1=1';
        let subjectJoinClause = '';
        
        const { role, userId } = payload;
        if (role === 'teacher') {
            // Find or add userId to params for the filter query
            // Note: We need a reliable index. Since param order matters for $1, $2 etc,
            // we must append userId if not present, but be careful with existing dateParams logic.
            // The queries below use specific param indices. We will inject userId into the params array used by query.
            
            // To be safe, we'll append userId to the existing arrays and use dynamic index
            // For subjectStats query: params are [studentId, ...dateParams]
            // We adding userId to the end => index is 1 + dateParams.length + 1
            const uIdIndex = 1 + dateParams.length + 1;
            
            // STRICT ISOLATION: Filter by who marked the attendance
            teacherSubjectFilter = `ar.teacher_id = $${uIdIndex}`;
            
            // Keep subject join to ensure they only see subjects they are assigned to
            subjectJoinClause = `JOIN teacher_subjects ts ON ts.subject_id = s.id AND ts.teacher_id = $${uIdIndex}`;
        }

        // Get subject-wise stats with date filter
        const subjectStatsParams = [studentId, ...dateParams];
        if (role === 'teacher') {
            subjectStatsParams.push(userId);
        }

        const subjectStats = await query<SubjectStats>(
            `SELECT 
                s.id as subject_id,
                s.name as subject_name,
                s.code as subject_code,
                COUNT(ar.id) as total_classes,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as attended,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as attendance_pct
             FROM student_subjects ss
             JOIN subjects s ON s.id = ss.subject_id
             ${subjectJoinClause}
             LEFT JOIN attendance_records ar ON ar.subject_id = s.id AND ar.student_id = $1 ${dateFilter}
             WHERE ss.student_id = $1
             GROUP BY s.id, s.name, s.code
             ORDER BY s.name`,
            subjectStatsParams
        );

        // Get monthly stats with date filter
        let monthlyQuery = `SELECT 
                TO_CHAR(ar.date, 'YYYY-MM') as month,
                COUNT(ar.id) as total_classes,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as attended,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as attendance_pct
             FROM attendance_records ar
             WHERE ar.student_id = $1`;
        
        if (role === 'teacher') {
            monthlyQuery += ` AND ${teacherSubjectFilter}`;
        }

        if (startDate && endDate) {
            monthlyQuery += ` AND ar.date >= $2 AND ar.date <= $3`;
        } else if (startDate) {
            monthlyQuery += ` AND ar.date >= $2`;
        } else if (endDate) {
            monthlyQuery += ` AND ar.date <= $2`;
        } else {
            monthlyQuery += ` AND ar.date >= CURRENT_DATE - INTERVAL '6 months'`;
        }
        monthlyQuery += ` GROUP BY TO_CHAR(ar.date, 'YYYY-MM') ORDER BY month DESC`;

        const otherStatsParams = [studentId, ...dateParams];
        if (role === 'teacher') {
            otherStatsParams.push(userId);
        }

        const monthlyStats = await query<MonthlyStats>(monthlyQuery, otherStatsParams);

        // Overall summary with date filter
        let overallQuery = `SELECT 
                COUNT(ar.id) as total_classes,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as attended,
                COALESCE(
                    ROUND(
                        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::numeric * 100 / 
                        NULLIF(COUNT(ar.id), 0),
                        1
                    ),
                    0
                ) as attendance_pct
             FROM attendance_records ar
             WHERE ar.student_id = $1 ${dateFilter}`;

        if (role === 'teacher') {
            overallQuery += ` AND ${teacherSubjectFilter}`;
        }

        const overallStats = await query<{ total_classes: string; attended: string; attendance_pct: string }>(
            overallQuery,
            otherStatsParams
        );



        const student = studentInfo[0];
        const overall = overallStats[0] || { total_classes: '0', attended: '0', attendance_pct: '0' };

        return NextResponse.json({
            student: {
                id: student.id,
                studentId: student.student_id,
                rollNumber: student.roll_number,
                name: `${student.first_name} ${student.last_name}`,
                email: student.email || 'N/A',
                department: student.department_name || 'N/A',
                semester: student.current_semester
            },
            summary: {
                totalClasses: parseInt(overall.total_classes) || 0,
                attended: parseInt(overall.attended) || 0,
                attendancePercentage: Math.round(parseFloat(overall.attendance_pct) || 0)
            },
            subjects: subjectStats.map(s => ({
                id: s.subject_id,
                name: s.subject_name,
                code: s.subject_code,
                totalClasses: parseInt(s.total_classes) || 0,
                attended: parseInt(s.attended) || 0,
                attendance: Math.round(parseFloat(s.attendance_pct) || 0)
            })),
            monthlyTrend: monthlyStats.map(m => ({
                month: m.month,
                totalClasses: parseInt(m.total_classes) || 0,
                attended: parseInt(m.attended) || 0,
                attendance: Math.round(parseFloat(m.attendance_pct) || 0)
            })),

            // Include the date range in response for reference
            dateRange: startDate && endDate ? { startDate, endDate } : null
        });
    } catch (error) {
        console.error('Student detail error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
