import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'student') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month'); // YYYY-MM format

        // Find the student record linked to this user
        const studentRes = await pool.query(
            'SELECT id FROM students WHERE user_id = $1 AND is_active = true LIMIT 1',
            [payload.userId]
        );

        if (studentRes.rows.length === 0) {
            return NextResponse.json({ records: [] });
        }

        const studentId = studentRes.rows[0].id;

        let dateFilter = '';
        const params: any[] = [studentId];

        if (month) {
            const [year, mon] = month.split('-');
            dateFilter = ` AND EXTRACT(YEAR FROM ar.date) = $2 AND EXTRACT(MONTH FROM ar.date) = $3`;
            params.push(parseInt(year), parseInt(mon));
        }

        const result = await pool.query(
            `SELECT ar.date, ar.status, ar.period_number, ar.remarks,
                    COALESCE(s.name, 'General') as subject_name
             FROM attendance_records ar
             LEFT JOIN subjects s ON ar.subject_id = s.id
             WHERE ar.student_id = $1 ${dateFilter}
             ORDER BY ar.date DESC, ar.period_number ASC`,
            params
        );

        return NextResponse.json({ records: result.rows });
    } catch (error) {
        console.error('Student attendance error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
