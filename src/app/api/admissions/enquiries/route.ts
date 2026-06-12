import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId, schoolFilter } from '@/lib/auth';

// GET /api/admissions/enquiries — List all enquiries
export async function GET(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin', 'teacher']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const sessionId = url.searchParams.get('sessionId');
    const classId = url.searchParams.get('classId');

    const sf = schoolFilter(schoolId, 'e', 1);
    let paramIdx = sf.nextIndex;
    const params: unknown[] = [...sf.params];

    let statusClause = '';
    if (status) {
        statusClause = ` AND e.status = $${paramIdx}`;
        params.push(status);
        paramIdx++;
    }
    let sessionClause = '';
    if (sessionId) {
        sessionClause = ` AND e.session_id = $${paramIdx}`;
        params.push(sessionId);
        paramIdx++;
    }
    let classClause = '';
    if (classId) {
        classClause = ` AND e.class_id = $${paramIdx}`;
        params.push(classId);
        paramIdx++;
    }

    const enquiries = await query(
        `SELECT e.*, 
            c.name as class_name,
            s.name as session_name,
            u.first_name || ' ' || u.last_name as assigned_to_name
         FROM admission_enquiries e
         LEFT JOIN classes c ON c.id = e.class_id
         LEFT JOIN academic_sessions s ON s.id = e.session_id
         LEFT JOIN users u ON u.id = e.assigned_to
         WHERE 1=1 ${sf.clause} ${statusClause} ${sessionClause} ${classClause}
         ORDER BY e.created_at DESC`,
        params
    );

    // Stats
    const allSf = schoolFilter(schoolId, 'e', 1);
    const stats = await query(
        `SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE e.status = 'new') as new_count,
            COUNT(*) FILTER (WHERE e.status = 'contacted') as contacted_count,
            COUNT(*) FILTER (WHERE e.status = 'follow_up') as follow_up_count,
            COUNT(*) FILTER (WHERE e.status = 'converted') as converted_count,
            COUNT(*) FILTER (WHERE e.status = 'closed') as closed_count
         FROM admission_enquiries e
         WHERE 1=1 ${allSf.clause}`,
        allSf.params
    );

    return NextResponse.json({ enquiries, stats: stats[0] || {} });
}

// POST /api/admissions/enquiries — Create a new enquiry
export async function POST(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin', 'teacher']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    if (!schoolId) {
        return NextResponse.json({ error: 'School context required' }, { status: 400 });
    }

    const body = await request.json();
    const {
        studentName, guardianName, guardianPhone, guardianEmail,
        classId, sessionId, dateOfBirth, gender, previousSchool,
        source, notes, followUpDate, assignedTo
    } = body;

    if (!studentName || !guardianName || !guardianPhone || !classId || !sessionId) {
        return NextResponse.json(
            { error: 'Student name, guardian name, phone, class, and session are required' },
            { status: 400 }
        );
    }

    const result = await query(
        `INSERT INTO admission_enquiries 
            (school_id, session_id, student_name, guardian_name, guardian_phone, guardian_email,
             class_id, date_of_birth, gender, previous_school, source, notes, follow_up_date, 
             assigned_to, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [schoolId, sessionId, studentName, guardianName, guardianPhone, guardianEmail || null,
         classId, dateOfBirth || null, gender || null, previousSchool || null,
         source || 'walk_in', notes || null, followUpDate || null,
         assignedTo || null, user.userId]
    );

    return NextResponse.json({ enquiry: result[0] }, { status: 201 });
}

// PUT /api/admissions/enquiries — Update enquiry status/details
export async function PUT(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin', 'teacher']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const body = await request.json();
    const { id, status, notes, followUpDate, assignedTo } = body;

    if (!id) {
        return NextResponse.json({ error: 'Enquiry ID required' }, { status: 400 });
    }

    const sf = schoolFilter(schoolId, '', 6);
    const result = await query(
        `UPDATE admission_enquiries 
         SET status = COALESCE($1, status),
             notes = COALESCE($2, notes),
             follow_up_date = COALESCE($3, follow_up_date),
             assigned_to = COALESCE($4, assigned_to),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 ${sf.clause}
         RETURNING *`,
        [status || null, notes || null, followUpDate || null, assignedTo || null, id, ...sf.params]
    );

    if (!result.length) {
        return NextResponse.json({ error: 'Enquiry not found' }, { status: 404 });
    }

    return NextResponse.json({ enquiry: result[0] });
}
