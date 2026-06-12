import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const studentId = searchParams.get('studentId');
    const todayOnly = searchParams.get('todayOnly');

    try {
        let sql = `
            SELECT hv.*,
                s.name as student_name, s.admission_number,
                c.name as class_name, cs.name as section_name,
                h.name as hostel_name, hr.room_number
             FROM hostel_visitors hv
             JOIN students s ON hv.student_id = s.id
             LEFT JOIN hostel_allocations ha ON ha.student_id = s.id AND ha.school_id = hv.school_id AND ha.status = 'active'
             LEFT JOIN hostel_rooms hr ON ha.room_id = hr.id
             LEFT JOIN hostels h ON hr.hostel_id = h.id
             LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.status = 'active'
             LEFT JOIN class_sections cs ON se.class_section_id = cs.id
             LEFT JOIN classes c ON cs.class_id = c.id
             WHERE hv.school_id = $1`;
        const params: unknown[] = [schoolId];
        let idx = 2;

        if (todayOnly === 'true') {
            sql += ` AND hv.check_in::date = CURRENT_DATE`;
        } else if (date) {
            sql += ` AND hv.check_in::date = $${idx++}`;
            params.push(date);
        }

        if (studentId) {
            sql += ` AND hv.student_id = $${idx++}`;
            params.push(studentId);
        }

        sql += ` ORDER BY hv.check_out IS NULL DESC, hv.check_in DESC`;
        const visitors = await query<any>(sql, params);

        return NextResponse.json({ visitors });
    } catch (error) {
        console.error('Error fetching visitors:', error);
        return NextResponse.json({ error: 'Failed to fetch visitors' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { studentId, visitorName, visitorRelation, visitorPhone, purpose, remarks } = await request.json();

        if (!studentId || !visitorName) {
            return NextResponse.json({ error: 'Student and Visitor name are required' }, { status: 400 });
        }

        const visitor = await queryOne<any>(
            `INSERT INTO hostel_visitors (school_id, student_id, visitor_name, visitor_relation, visitor_phone, purpose, approved_by, remarks)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                schoolId,
                studentId,
                visitorName.trim(),
                visitorRelation || 'other',
                visitorPhone ? visitorPhone.trim() : null,
                purpose ? purpose.trim() : null,
                auth.user.id,
                remarks ? remarks.trim() : null
            ]
        );

        return NextResponse.json({ visitor }, { status: 201 });
    } catch (error) {
        console.error('Error recording visitor:', error);
        return NextResponse.json({ error: 'Failed to record visitor' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    // Check-out visitor
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { id, remarks } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Visitor record ID is required' }, { status: 400 });
        }

        // Verify ownership
        const existing = await queryOne<any>(
            `SELECT school_id, check_out FROM hostel_visitors WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        if (existing.check_out) {
            return NextResponse.json({ error: 'Visitor has already checked out' }, { status: 400 });
        }

        const visitor = await queryOne<any>(
            `UPDATE hostel_visitors SET
                check_out = CURRENT_TIMESTAMP,
                remarks = COALESCE($2, remarks)
             WHERE id = $1
             RETURNING *`,
            [id, remarks ? remarks.trim() : null]
        );

        return NextResponse.json({ visitor });
    } catch (error) {
        console.error('Error checking out visitor:', error);
        return NextResponse.json({ error: 'Failed to check out visitor' }, { status: 500 });
    }
}
