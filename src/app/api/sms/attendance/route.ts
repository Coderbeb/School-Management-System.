import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// GET: Fetch attendance for a class-section on a date
export async function GET(request: NextRequest) {
    try {
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const classSectionId = searchParams.get('classSectionId');
        const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
        const subjectId = searchParams.get('subjectId');
        const periodNumber = searchParams.get('periodNumber') || '1';

        if (!classSectionId) return NextResponse.json({ error: 'classSectionId required' }, { status: 400 });

        // Get all enrolled students for this class-section
        const students = await query(
            `SELECT s.id, s.first_name, s.last_name, se.roll_number
             FROM students s
             JOIN student_enrollments se ON se.student_id = s.id
             WHERE se.class_section_id = $1 AND se.status = 'active'
             ORDER BY se.roll_number ASC, s.first_name ASC`,
            [classSectionId]
        );

        // Get existing attendance for this date/period
        const params: unknown[] = [classSectionId, date, periodNumber];
        let attSql = `SELECT student_id, status, remarks FROM attendance_records
                      WHERE class_section_id = $1 AND date = $2 AND period_number = $3`;
        if (subjectId) { attSql += ` AND subject_id = $4`; params.push(subjectId); }

        const existing = await query<{ student_id: string; status: string; remarks: string }>(attSql, params);
        const existingMap = Object.fromEntries(existing.map(r => [r.student_id, r]));

        // Get past 5 days attendance history
        const pastParams: unknown[] = [classSectionId, date, periodNumber];
        let pastSql = `SELECT student_id, date, status FROM attendance_records 
                       WHERE class_section_id = $1 AND date < $2 AND date >= ($2::date - interval '14 days') AND period_number = $3`;
        if (subjectId) { pastSql += ` AND subject_id = $4`; pastParams.push(subjectId); }
        pastSql += ` ORDER BY date DESC`;
        
        const pastRecords = await query<{ student_id: string; date: string; status: string }>(pastSql, pastParams);
        
        const historyMap: Record<string, {date: string, status: string}[]> = {};
        for (const r of pastRecords) {
            if (!historyMap[r.student_id]) historyMap[r.student_id] = [];
            // Only keep up to 5 most recent records
            if (historyMap[r.student_id].length < 5) {
                // Ensure date is formatted as YYYY-MM-DD
                const d = new Date(r.date);
                historyMap[r.student_id].push({ date: d.toISOString().split('T')[0], status: r.status });
            }
        }
        // Reverse so it reads oldest to newest (left to right)
        for (const k in historyMap) historyMap[k].reverse();

        // Merge: mark all students present by default if no record exists
        const attendance = (students as any[]).map((s: any) => ({
            studentId: s.id,
            firstName: s.first_name,
            lastName: s.last_name,
            rollNumber: s.roll_number,
            status: existingMap[s.id]?.status || 'absent',
            remarks: existingMap[s.id]?.remarks || '',
            isSubmitted: !!existingMap[s.id],
            history: historyMap[s.id] || []
        }));

        return NextResponse.json({ attendance, date, isSubmitted: existing.length > 0 });
    } catch (error) {
        console.error('GET attendance error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST: Submit/save attendance for a class
export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload || (payload.role !== 'teacher' && payload.role !== 'super_admin')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { classSectionId, subjectId, sessionId, date, periodNumber = 1, records } = await request.json();

        if (!classSectionId || !sessionId || !date || !records?.length) {
            return NextResponse.json({ error: 'classSectionId, sessionId, date, and records are required' }, { status: 400 });
        }

        // Upsert each record
        for (const rec of records) {
            await query(
                `INSERT INTO attendance_records
                    (student_id, class_section_id, subject_id, teacher_id, session_id, date, period_number, status, remarks)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (student_id, class_section_id, subject_id, date, period_number)
                 DO UPDATE SET status = $8, remarks = $9, recorded_at = CURRENT_TIMESTAMP`,
                [rec.studentId, classSectionId, subjectId || null, payload.userId,
                 sessionId, date, periodNumber, rec.status, rec.remarks || null]
            );
        }

        const absentCount = records.filter((r: any) => r.status === 'absent').length;
        return NextResponse.json({ success: true, total: records.length, absent: absentCount });
    } catch (error) {
        console.error('POST attendance error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
