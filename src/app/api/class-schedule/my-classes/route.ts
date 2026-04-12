import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// GET - Fetch all classes assigned to the logged-in teacher for a date
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const payload = verifyToken(authHeader.split(' ')[1]);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');

        if (!date) {
            return NextResponse.json({ error: 'date required' }, { status: 400 });
        }

        const classes = await query<{
            id: string;
            department_id: string;
            department_name: string;
            department_code: string;
            semester: number;
            slot_number: number;
            subject_id: string;
            subject_name: string;
            subject_code: string;
            paper_code: string | null;
            start_time: string;
            end_time: string;
        }>(
            `SELECT 
                dca.id,
                dca.department_id,
                d.name as department_name,
                d.code as department_code,
                dca.semester,
                dca.slot_number,
                dca.subject_id,
                s.name as subject_name,
                s.code as subject_code,
                s.paper_code,
                cts.start_time::text,
                cts.end_time::text
             FROM daily_class_assignments dca
             JOIN departments d ON dca.department_id = d.id
             JOIN subjects s ON dca.subject_id = s.id
             LEFT JOIN class_time_slots cts 
                ON cts.department_id = dca.department_id AND cts.slot_number = dca.slot_number
             WHERE dca.teacher_id = $1 AND dca.date = $2
             ORDER BY cts.start_time NULLS LAST, dca.slot_number`,
            [payload.userId, date]
        );

        return NextResponse.json({ classes });
    } catch (error) {
        console.error('Get my classes error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
