import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// GET: Attendance stats — by class or school-wide for today/date range
export async function GET(request: NextRequest) {
    try {
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const sessionId = searchParams.get('sessionId');
        const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
        const classSectionId = searchParams.get('classSectionId');

        // School-wide today's summary
        const todayStats = await query(
            `SELECT
                COUNT(*) FILTER (WHERE ar.status = 'present') as present,
                COUNT(*) FILTER (WHERE ar.status = 'absent') as absent,
                COUNT(*) FILTER (WHERE ar.status = 'late') as late,
                COUNT(*) as total
             FROM attendance_records ar
             WHERE ar.date = $1
             ${sessionId ? 'AND ar.session_id = $2' : ''}
             ${classSectionId ? `AND ar.class_section_id = $${sessionId ? 3 : 2}` : ''}`,
            [date, ...(sessionId ? [sessionId] : []), ...(classSectionId ? [classSectionId] : [])]
        );

        // Per-class breakdown for today
        const classStats = await query(
            `SELECT
                c.name || ' - ' || s.name as class_name,
                cs.id as class_section_id,
                COUNT(DISTINCT se.student_id) as total_students,
                COUNT(DISTINCT ar.student_id) FILTER (WHERE ar.status = 'present') as present,
                COUNT(DISTINCT ar.student_id) FILTER (WHERE ar.status = 'absent') as absent
             FROM class_sections cs
             JOIN classes c ON cs.class_id = c.id
             JOIN sections s ON cs.section_id = s.id
             LEFT JOIN student_enrollments se ON se.class_section_id = cs.id AND se.status = 'active'
             LEFT JOIN attendance_records ar ON ar.class_section_id = cs.id AND ar.date = $1
             WHERE 1=1
             ${sessionId ? 'AND cs.session_id = $2' : ''}
             GROUP BY cs.id, c.name, s.name, c.display_order
             ORDER BY c.display_order, s.name`,
            [date, ...(sessionId ? [sessionId] : [])]
        );

        return NextResponse.json({ today: todayStats[0], classes: classStats, date });
    } catch (error) {
        console.error('GET attendance stats error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
