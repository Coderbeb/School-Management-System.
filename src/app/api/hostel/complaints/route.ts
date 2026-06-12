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
    const priority = searchParams.get('priority');
    const complaintType = searchParams.get('type');
    const studentId = searchParams.get('studentId');

    try {
        let sql = `
            SELECT hc.*,
                s.name as student_name, s.admission_number,
                hr.room_number, h.name as hostel_name,
                u.first_name || ' ' || u.last_name as resolved_by_name
             FROM hostel_complaints hc
             LEFT JOIN students s ON hc.student_id = s.id
             LEFT JOIN hostel_rooms hr ON hc.room_id = hr.id
             LEFT JOIN hostels h ON hr.hostel_id = h.id
             LEFT JOIN users u ON hc.resolved_by = u.id
             WHERE hc.school_id = $1`;
        const params: unknown[] = [schoolId];
        let idx = 2;

        // Students can only see their own complaints
        if (auth.user.role === 'student') {
            sql += ` AND hc.student_id = $${idx++}`;
            params.push(auth.user.studentId || studentId);
        } else if (studentId) {
            sql += ` AND hc.student_id = $${idx++}`;
            params.push(studentId);
        }

        if (status) {
            sql += ` AND hc.status = $${idx++}`;
            params.push(status);
        }

        if (priority) {
            sql += ` AND hc.priority = $${idx++}`;
            params.push(priority);
        }

        if (complaintType) {
            sql += ` AND hc.complaint_type = $${idx++}`;
            params.push(complaintType);
        }

        sql += ` ORDER BY 
            CASE hc.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END ASC,
            CASE hc.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'resolved' THEN 3 WHEN 'closed' THEN 4 END ASC,
            hc.created_at DESC`;
        const complaints = await query<any>(sql, params);

        return NextResponse.json({ complaints });
    } catch (error) {
        console.error('Error fetching complaints:', error);
        return NextResponse.json({ error: 'Failed to fetch complaints' }, { status: 500 });
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
        const { studentId, roomId, complaintType, description, priority } = await request.json();

        if (!description) {
            return NextResponse.json({ error: 'Description is required' }, { status: 400 });
        }

        const actualStudentId = auth.user.role === 'student' ? (auth.user.studentId || studentId) : studentId;

        // If student is raising, auto-find their room
        let actualRoomId = roomId;
        if (actualStudentId && !actualRoomId) {
            const allocation = await queryOne<any>(
                `SELECT room_id FROM hostel_allocations WHERE school_id = $1 AND student_id = $2 AND status = 'active'`,
                [schoolId, actualStudentId]
            );
            if (allocation) {
                actualRoomId = allocation.room_id;
            }
        }

        const complaint = await queryOne<any>(
            `INSERT INTO hostel_complaints (school_id, student_id, room_id, complaint_type, description, priority)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                schoolId,
                actualStudentId || null,
                actualRoomId || null,
                complaintType || 'other',
                description.trim(),
                priority || 'medium'
            ]
        );

        return NextResponse.json({ complaint }, { status: 201 });
    } catch (error) {
        console.error('Error creating complaint:', error);
        return NextResponse.json({ error: 'Failed to create complaint' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { id, status, priority, resolutionNotes } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Complaint ID is required' }, { status: 400 });
        }

        // Verify ownership
        const existing = await queryOne<any>(
            `SELECT school_id FROM hostel_complaints WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        const updates: string[] = [];
        const params: unknown[] = [id];
        let idx = 2;

        if (status) {
            updates.push(`status = $${idx++}`);
            params.push(status);

            if (status === 'resolved' || status === 'closed') {
                updates.push(`resolved_by = $${idx++}`);
                params.push(auth.user.id);
                updates.push(`resolved_at = CURRENT_TIMESTAMP`);
            }
        }

        if (priority) {
            updates.push(`priority = $${idx++}`);
            params.push(priority);
        }

        if (resolutionNotes) {
            updates.push(`resolution_notes = $${idx++}`);
            params.push(resolutionNotes.trim());
        }

        if (updates.length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
        }

        const complaint = await queryOne<any>(
            `UPDATE hostel_complaints SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
            params
        );

        return NextResponse.json({ complaint });
    } catch (error) {
        console.error('Error updating complaint:', error);
        return NextResponse.json({ error: 'Failed to update complaint' }, { status: 500 });
    }
}
