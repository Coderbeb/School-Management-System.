import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface ClassroomRow {
    id: string;
    name: string;
    code: string;
}

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const currentSession = await queryOne<{ id: string }>(
            `SELECT id FROM academic_sessions WHERE is_current = true LIMIT 1`
        );
        const sessionId = currentSession?.id;

        if (!sessionId) {
            return NextResponse.json({ departments: [] });
        }

        let classrooms: ClassroomRow[] = [];

        if (payload.role === 'super_admin') {
            // For super admin, return all active class sections
            classrooms = await query<ClassroomRow>(
                `SELECT cs.id, (c.name || ' - ' || s.name) as name, c.name as code
                 FROM class_sections cs
                 JOIN classes c ON c.id = cs.class_id
                 JOIN sections s ON s.id = cs.section_id
                 WHERE cs.session_id = $1
                 ORDER BY c.display_order ASC, s.name ASC`,
                [sessionId]
            );
        } else {
            // For teacher/other, return only assigned class sections
            classrooms = await query<ClassroomRow>(
                `SELECT DISTINCT cs.id, (c.name || ' - ' || s.name) as name, c.name as code
                 FROM teacher_assignments ta
                 JOIN class_sections cs ON cs.id = ta.class_section_id
                 JOIN classes c ON c.id = cs.class_id
                 JOIN sections s ON s.id = cs.section_id
                 WHERE ta.teacher_id = $1 AND ta.session_id = $2
                 ORDER BY c.name ASC, s.name ASC`,
                [payload.userId, sessionId]
            );
        }

        return NextResponse.json({
            departments: classrooms.map(c => ({
                id: c.id,
                name: c.name,
                code: c.code,
                deptType: 'regular',
                degreeType: 'academic'
            }))
        });
    } catch (error) {
        console.error('Get user departments error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
