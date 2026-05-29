import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET: Get assignments for a teacher, or all assignments for a session (scoped by school)
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const teacherId = searchParams.get('teacherId');
        const sessionId = searchParams.get('sessionId');

        let sql = `
            SELECT ta.*,
                   u.first_name || ' ' || u.last_name as teacher_name,
                   c.name || ' - ' || s.name as class_section_name,
                   sub.name as subject_name, sub.code as subject_code
            FROM teacher_assignments ta
            JOIN users u ON ta.teacher_id = u.id
            JOIN class_sections cs ON ta.class_section_id = cs.id
            JOIN classes c ON cs.class_id = c.id
            JOIN sections s ON cs.section_id = s.id
            JOIN subjects sub ON ta.subject_id = sub.id
            WHERE 1=1
        `;
        const params: unknown[] = [];
        let idx = 1;

        // School isolation via users table
        if (schoolId) {
            sql += ` AND u.school_id = $${idx++}`;
            params.push(schoolId);
        }

        if (teacherId) { sql += ` AND ta.teacher_id = $${idx++}`; params.push(teacherId); }
        if (sessionId) { sql += ` AND ta.session_id = $${idx++}`; params.push(sessionId); }

        sql += ` ORDER BY c.display_order, s.name, sub.name`;
        const assignments = await query(sql, params);
        return NextResponse.json({ assignments });
    } catch (error) {
        console.error('GET assignments error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST: Assign teacher to a class-section + subject
export async function POST(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;

        const { teacherId, classSectionId, subjectId, sessionId, isClassTeacher } = await request.json();

        if (!teacherId || !classSectionId || !subjectId || !sessionId) {
            return NextResponse.json({ error: 'teacherId, classSectionId, subjectId, sessionId are required' }, { status: 400 });
        }

        const assignment = await queryOne(
            `INSERT INTO teacher_assignments (teacher_id, class_section_id, subject_id, session_id, is_class_teacher)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [teacherId, classSectionId, subjectId, sessionId, isClassTeacher || false]
        );

        return NextResponse.json({ assignment }, { status: 201 });
    } catch (error: any) {
        console.error('POST assignment error:', error);
        if (error?.code === '23505') return NextResponse.json({ error: 'This assignment already exists' }, { status: 409 });
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE: Remove a teacher assignment
export async function DELETE(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Assignment ID required' }, { status: 400 });

        await query('DELETE FROM teacher_assignments WHERE id = $1', [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('DELETE assignment error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
