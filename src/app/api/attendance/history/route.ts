import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// GET - Get last 5 attendance records for students
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

        console.log(`[History API Debug] studentIds count: ${studentIds ? studentIds.split(',').length : 0}`);
        console.log(`[History API Debug] subjectId received: '${subjectId}' (type: ${typeof subjectId})`);

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

        // Get last 5 attendance records for each student (filtered by teacher for teachers)
        const queryStr = `
            SELECT student_id, status, date
            FROM (
                SELECT 
                    student_id, 
                    status,
                    date,
                    ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY date DESC, lecture_number DESC) as rn
                FROM attendance_records
                WHERE student_id = ANY($1)
                ${subjectId ? 'AND subject_id = $2' : ''}
                AND teacher_id = $${subjectId ? '3' : '2'}
            ) sub
            WHERE rn <= 5
            ORDER BY student_id, date DESC
        `;

        const params = subjectId ? [studentIdArray, subjectId, payload.userId] : [studentIdArray, payload.userId];
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
