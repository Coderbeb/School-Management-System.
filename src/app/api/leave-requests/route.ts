import { NextRequest, NextResponse } from 'next/server';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

interface LeaveRequestRow {
    id: string;
    user_id: string;
    school_id: string;
    leave_type: string;
    from_date: string;
    to_date: string;
    reason: string;
    status: string;
    reviewed_by: string | null;
    review_remarks: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
    first_name?: string;
    last_name?: string;
    reviewer_first_name?: string;
    reviewer_last_name?: string;
}

// POST: Submit a leave request
export async function POST(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'teacher', 'accountant', 'student']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        const body = await request.json();
        const leaveType = body.leaveType || body.leave_type;
        const fromDate = body.fromDate || body.from_date;
        const toDate = body.toDate || body.to_date;
        const reason = body.reason;

        if (!leaveType || !fromDate || !toDate || !reason?.trim()) {
            return NextResponse.json({ error: 'leaveType, fromDate, toDate, and reason are required' }, { status: 400 });
        }

        if (fromDate > toDate) {
            return NextResponse.json({ error: 'fromDate must be on or before toDate' }, { status: 400 });
        }

        // Check for overlapping approved/pending requests
        const overlap = await query<{ id: string }>(
            `SELECT id FROM leave_requests
             WHERE user_id = $1 AND status != 'rejected'
               AND from_date <= $3 AND to_date >= $2`,
            [auth.user.userId, fromDate, toDate]
        );

        if (overlap.length > 0) {
            return NextResponse.json({ error: 'You already have a leave request for this period' }, { status: 400 });
        }

        const leaveRequest = await queryOne<LeaveRequestRow>(
            `INSERT INTO leave_requests (user_id, school_id, leave_type, from_date, to_date, reason)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [auth.user.userId, schoolId, leaveType, fromDate, toDate, reason.trim()]
        );

        return NextResponse.json({ request: leaveRequest }, { status: 201 });
    } catch (error) {
        console.error('POST leave-requests error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// GET: Fetch leave requests
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const userId = searchParams.get('userId');

        let sql = `SELECT lr.*,
                       u.first_name, u.last_name, u.role,
                       r.first_name as reviewer_first_name, r.last_name as reviewer_last_name
                   FROM leave_requests lr
                   JOIN users u ON lr.user_id = u.id
                   LEFT JOIN users r ON lr.reviewed_by = r.id
                   WHERE 1=1`;
        const params: unknown[] = [];
        let idx = 1;

        // School filter
        if (schoolId) {
            sql += ` AND lr.school_id = $${idx++}`;
            params.push(schoolId);
        }

        // Role-based access: teachers/students see only their own
        if (auth.user.role === 'teacher' || auth.user.role === 'accountant' || auth.user.role === 'student') {
            sql += ` AND lr.user_id = $${idx++}`;
            params.push(auth.user.userId);
        } else if (userId) {
            // Admin/developer can filter by specific user
            sql += ` AND lr.user_id = $${idx++}`;
            params.push(userId);
        }

        // Status filter
        if (status) {
            sql += ` AND lr.status = $${idx++}`;
            params.push(status);
        }

        sql += ` ORDER BY lr.created_at DESC`;

        const requests = await query<LeaveRequestRow>(sql, params);

        // Apply roleFilter client-side (role comes from JOIN on users, not from leave_requests)
        const roleFilter = searchParams.get('roleFilter');
        const filtered = roleFilter
            ? requests.filter((r: any) => r.role === roleFilter)
            : requests;

        return NextResponse.json({
            requests: filtered.map((r: any) => ({
                ...r,
                reviewed_by_name: r.reviewer_first_name ? `${r.reviewer_first_name} ${r.reviewer_last_name}` : null,
            }))
        });
    } catch (error) {
        console.error('GET leave-requests error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT: Approve or Reject a leave request
export async function PUT(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        const { requestId, action, remarks } = await request.json();

        if (!requestId || !action) {
            return NextResponse.json({ error: 'requestId and action are required' }, { status: 400 });
        }
        if (action !== 'approved' && action !== 'rejected') {
            return NextResponse.json({ error: 'action must be approved or rejected' }, { status: 400 });
        }

        // Update the leave request
        const updated = await queryOne<LeaveRequestRow>(
            `UPDATE leave_requests SET
                 status = $1,
                 reviewed_by = $2,
                 review_remarks = $3,
                 reviewed_at = NOW(),
                 updated_at = NOW()
             WHERE id = $4 AND school_id = $5
             RETURNING *`,
            [action, auth.user.userId, remarks || null, requestId, schoolId]
        );

        if (!updated) {
            return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });
        }

        // If approved, upsert attendance records for each day of the leave range
        // Only for staff — students don't have staff_attendance records
        if (action === 'approved') {
            // Check role of the leave requester
            const requester = await queryOne<{ role: string }>(
                `SELECT role FROM users WHERE id = $1`, [updated.user_id]
            );

            if (requester && requester.role !== 'student') {
                const start = new Date(updated.from_date);
                const end = new Date(updated.to_date);

                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    const dateStr = d.toISOString().split('T')[0];
                    await queryOne(
                        `INSERT INTO staff_attendance (user_id, school_id, date, status, auto_status, remarks)
                         VALUES ($1, $2, $3, 'on_leave', 'on_leave', 'Approved leave')
                         ON CONFLICT (user_id, date) DO UPDATE SET
                             status = 'on_leave',
                             auto_status = 'on_leave',
                             remarks = 'Approved leave'`,
                        [updated.user_id, schoolId, dateStr]
                    );
                }
            }
        }

        return NextResponse.json({ request: updated });
    } catch (error) {
        console.error('PUT leave-requests error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
