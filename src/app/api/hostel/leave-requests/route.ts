import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher', 'student']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const studentId = searchParams.get('studentId');

    try {
        let sql = `
            SELECT lr.*,
                s.name as student_name, s.admission_number,
                c.name as class_name, cs.name as section_name,
                u.first_name || ' ' || u.last_name as approved_by_name
             FROM hostel_leave_requests lr
             JOIN students s ON lr.student_id = s.id
             LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.status = 'active'
             LEFT JOIN class_sections cs ON se.class_section_id = cs.id
             LEFT JOIN classes c ON cs.class_id = c.id
             LEFT JOIN users u ON lr.approved_by = u.id
             WHERE lr.school_id = $1`;
        const params: unknown[] = [schoolId];
        let idx = 2;

        // Students can only see their own leave requests
        if (auth.user.role === 'student') {
            sql += ` AND lr.student_id = $${idx++}`;
            params.push(auth.user.studentId || studentId);
        } else if (studentId) {
            sql += ` AND lr.student_id = $${idx++}`;
            params.push(studentId);
        }

        if (status) {
            sql += ` AND lr.status = $${idx++}`;
            params.push(status);
        }

        sql += ` ORDER BY lr.created_at DESC`;
        const leaves = await query<any>(sql, params);

        return NextResponse.json({ leaves });
    } catch (error) {
        console.error('Error fetching leave requests:', error);
        return NextResponse.json({ error: 'Failed to fetch leave requests' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher', 'student']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { studentId, leaveType, fromDate, toDate, reason, guardianPhone } = await request.json();

        const actualStudentId = auth.user.role === 'student' ? (auth.user.studentId || studentId) : studentId;

        if (!actualStudentId || !fromDate || !toDate || !reason) {
            return NextResponse.json({ error: 'Student, dates, and reason are required' }, { status: 400 });
        }

        // Verify student has active hostel allocation
        const allocation = await queryOne<any>(
            `SELECT id FROM hostel_allocations WHERE school_id = $1 AND student_id = $2 AND status = 'active'`,
            [schoolId, actualStudentId]
        );
        if (!allocation) {
            return NextResponse.json({ error: 'Student does not have an active hostel allocation' }, { status: 400 });
        }

        const leave = await queryOne<any>(
            `INSERT INTO hostel_leave_requests (school_id, student_id, leave_type, from_date, to_date, reason, guardian_phone)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                schoolId,
                actualStudentId,
                leaveType || 'home_visit',
                fromDate,
                toDate,
                reason.trim(),
                guardianPhone ? guardianPhone.trim() : null
            ]
        );

        return NextResponse.json({ leave }, { status: 201 });
    } catch (error) {
        console.error('Error creating leave request:', error);
        return NextResponse.json({ error: 'Failed to create leave request' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    // Approve or reject leave request
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { id, status, remarks } = await request.json();

        if (!id || !status) {
            return NextResponse.json({ error: 'Leave ID and status are required' }, { status: 400 });
        }

        if (!['approved', 'rejected'].includes(status)) {
            return NextResponse.json({ error: 'Status must be approved or rejected' }, { status: 400 });
        }

        // Verify ownership
        const existing = await queryOne<any>(
            `SELECT school_id, status as current_status FROM hostel_leave_requests WHERE id = $1`,
            [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        if (existing.current_status !== 'pending') {
            return NextResponse.json({ error: 'Leave request has already been processed' }, { status: 400 });
        }

        const leave = await queryOne<any>(
            `UPDATE hostel_leave_requests SET
                status = $2,
                approved_by = $3,
                approved_at = CURRENT_TIMESTAMP,
                remarks = $4
             WHERE id = $1
             RETURNING *`,
            [id, status, auth.user.id, remarks ? remarks.trim() : null]
        );

        return NextResponse.json({ leave });
    } catch (error) {
        console.error('Error updating leave request:', error);
        return NextResponse.json({ error: 'Failed to update leave request' }, { status: 500 });
    }
}
