import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// GET - Get last 5 distinct DAYS of attendance for students
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
        const studentIds = searchParams.get('studentIds'); // comma-separated
        const subjectId = searchParams.get('subjectId');
        const currentDate = searchParams.get('currentDate'); // exclude this date from history (show only previous days)



        if (!studentIds) {
            return NextResponse.json({ error: 'studentIds required' }, { status: 400 });
        }

        if (!subjectId) {
            return NextResponse.json({ error: 'subjectId required for specific subject history' }, { status: 400 });
        }

        const studentIdArray = studentIds.split(',').filter(id => id.trim());

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

        let subjectFilter = '';
        if (subjectId) {
            subjectFilter = `AND subject_id = $${paramIndex}`;
            params.push(subjectId);
            paramIndex++;
        }

        const teacherFilter = `AND teacher_id = $${paramIndex}`;
        params.push(payload.userId);
        paramIndex++;

        let dateExcludeFilter = '';
        if (currentDate) {
            dateExcludeFilter = `AND date < $${paramIndex}::date`;
            params.push(currentDate);
            paramIndex++;
        }

        const queryStr = `
            SELECT student_id, date,
                   CASE WHEN COUNT(CASE WHEN status = 'absent' THEN 1 END) > 0 THEN 'absent' ELSE 'present' END as status
            FROM (
                SELECT 
                    student_id, 
                    status,
                    date,
                    DENSE_RANK() OVER (PARTITION BY student_id ORDER BY date DESC) as day_rank
                FROM attendance_records
                WHERE student_id = ANY($1)
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
