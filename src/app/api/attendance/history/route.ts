import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET - Get last 5 distinct DAYS of attendance for students
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const studentIds = searchParams.get('studentIds'); // comma-separated
        const subjectId = searchParams.get('subjectId');
        const currentDate = searchParams.get('currentDate'); // exclude this date from history (show only previous days)

        if (!studentIds) {
            return NextResponse.json({ error: 'studentIds required' }, { status: 400 });
        }

        if (!subjectId) {
            return NextResponse.json({ error: 'subjectId required for specific subject history' }, { status: 400 });
        }

        const studentIdArray = studentIds.split(',').map(id => id.trim()).filter(Boolean);

        if (studentIdArray.length === 0) {
            return NextResponse.json({ history: {} });
        }

        // Get last 5 distinct DAYS of attendance for each student (not individual lectures)
        // Uses DENSE_RANK on date so multiple lectures on the same day count as 1 day.
        // Aggregates status per day: if ANY lecture that day is 'absent', day = 'absent'; else 'present'.
        // Excludes currentDate so only previous days are shown in the dots.
        let paramIndex = 1;
        const params: any[] = [studentIdArray];
        paramIndex++;

        // School ID at parameter $2
        params.push(schoolId);
        paramIndex++;

        let subjectFilter = '';
        if (subjectId) {
            subjectFilter = `AND ar.subject_id = $${paramIndex}`;
            params.push(subjectId);
            paramIndex++;
        }

        let teacherFilter = '';
        if (auth.user.role === 'teacher') {
            teacherFilter = `AND ar.teacher_id = $${paramIndex}`;
            params.push(auth.user.userId);
            paramIndex++;
        }

        let dateExcludeFilter = '';
        if (currentDate) {
            dateExcludeFilter = `AND ar.date < $${paramIndex}::date`;
            params.push(currentDate);
            paramIndex++;
        }

        const queryStr = `
            SELECT student_id, date,
                   CASE WHEN COUNT(CASE WHEN status = 'absent' THEN 1 END) > 0 THEN 'absent' ELSE 'present' END as status
            FROM (
                SELECT 
                    ar.student_id, 
                    ar.status,
                    ar.date,
                    DENSE_RANK() OVER (PARTITION BY ar.student_id ORDER BY ar.date DESC) as day_rank
                FROM attendance_records ar
                JOIN students s ON ar.student_id = s.id
                WHERE ar.student_id = ANY($1)
                  AND ($2::uuid IS NULL OR s.school_id = $2::uuid)
                ${subjectFilter}
                ${teacherFilter}
                ${dateExcludeFilter}
            ) sub
            WHERE day_rank <= 5
            GROUP BY student_id, date
            ORDER BY student_id, date DESC
        `;
        const records = await query(queryStr, params);

        // Group by student_id
        const history: Record<string, { status: string; date: string }[]> = {};

        for (const record of records as { student_id: string; status: string; date: string }[]) {
            if (!history[record.student_id]) {
                history[record.student_id] = [];
            }
            history[record.student_id].push({
                status: record.status,
                date: record.date
            });
        }

        return NextResponse.json({ history });
    } catch (error) {
        console.error('Get attendance history error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
