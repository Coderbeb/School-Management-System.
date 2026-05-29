import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET: List all class-sections (classrooms) for a session (scoped by school via classes table)
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const sessionId = searchParams.get('sessionId');

        let sql = `
            SELECT cs.*, c.name as class_name, c.display_order, s.name as section_name,
                   a.name as session_name,
                   (c.name || ' - ' || s.name) as display_name
            FROM class_sections cs
            JOIN classes c ON cs.class_id = c.id
            JOIN sections s ON cs.section_id = s.id
            JOIN academic_sessions a ON cs.session_id = a.id
            WHERE 1=1
        `;
        const params: unknown[] = [];
        let idx = 1;

        // School isolation via the classes table
        if (schoolId) {
            sql += ` AND c.school_id = $${idx++}`;
            params.push(schoolId);
        }

        if (sessionId) {
            sql += ` AND cs.session_id = $${idx++}`;
            params.push(sessionId);
        }

        sql += ` ORDER BY c.display_order ASC, s.name ASC`;

        const classSections = await query(sql, params);
        return NextResponse.json({ classSections });
    } catch (error) {
        console.error('GET class-sections error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST: Create a new class-section (link class + section for a session)
export async function POST(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;

        const { classId, sectionId, sessionId, roomNumber, capacity } = await request.json();

        if (!classId || !sectionId || !sessionId) {
            return NextResponse.json({ error: 'Class, Section, and Session are required' }, { status: 400 });
        }

        const classSection = await queryOne(
            `INSERT INTO class_sections (class_id, section_id, session_id, room_number, capacity)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [classId, sectionId, sessionId, roomNumber || null, capacity || 40]
        );

        return NextResponse.json({ classSection }, { status: 201 });
    } catch (error: any) {
        console.error('POST class-section error:', error);
        if (error?.code === '23505') {
            return NextResponse.json({ error: 'This class-section already exists for the selected session' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE: Remove a class-section
export async function DELETE(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Class-Section ID is required' }, { status: 400 });
        }

        // Verify the class-section belongs to the user's school via class
        if (schoolId) {
            const exists = await queryOne(
                `SELECT cs.id FROM class_sections cs JOIN classes c ON cs.class_id = c.id WHERE cs.id = $1 AND c.school_id = $2`,
                [id, schoolId]
            );
            if (!exists) return NextResponse.json({ error: 'Class-Section not found' }, { status: 404 });
        }

        await query('DELETE FROM class_sections WHERE id = $1', [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('DELETE class-section error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
