import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId, schoolFilter } from '@/lib/auth';

// GET /api/promotions/preview — Preview which students will be promoted
export async function GET(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const url = new URL(request.url);
    const fromSessionId = url.searchParams.get('fromSessionId');
    const fromClassSectionId = url.searchParams.get('fromClassSectionId');

    if (!fromSessionId) {
        return NextResponse.json({ error: 'fromSessionId is required' }, { status: 400 });
    }

    const sf = schoolFilter(schoolId, 's', 3);
    let classClause = '';
    const params: unknown[] = [fromSessionId, ...(fromClassSectionId ? [fromClassSectionId] : []), ...sf.params];

    if (fromClassSectionId) {
        classClause = ` AND e.class_section_id = $2`;
    }

    const students = await query(
        `SELECT 
            s.id as student_id, s.name as student_name, s.admission_number, s.photo_url, s.status,
            e.class_section_id, e.roll_number,
            c.name as class_name, cs.name as section_name,
            c.id as class_id
         FROM students s
         JOIN student_enrollments e ON e.student_id = s.id AND e.session_id = $1
         JOIN class_sections cs ON cs.id = e.class_section_id
         JOIN classes c ON c.id = cs.class_id
         WHERE e.status = 'active' ${classClause} ${sf.clause}
         ORDER BY c.display_order, cs.name, e.roll_number, s.name`,
        params
    );

    // Get next class mapping (e.g., Class 1 → Class 2)
    const classMappings = await query(
        `SELECT c.id, c.name, c.display_order,
            (SELECT c2.id FROM classes c2 WHERE c2.school_id = c.school_id AND c2.display_order = c.display_order + 1 LIMIT 1) as next_class_id,
            (SELECT c2.name FROM classes c2 WHERE c2.school_id = c.school_id AND c2.display_order = c.display_order + 1 LIMIT 1) as next_class_name
         FROM classes c
         WHERE c.school_id = $1
         ORDER BY c.display_order`,
        [schoolId]
    );

    // Get available sections for target session
    const toSessionId = url.searchParams.get('toSessionId');
    let targetSections: unknown[] = [];
    if (toSessionId) {
        targetSections = await query(
            `SELECT cs.id, cs.name as section_name, c.name as class_name, c.id as class_id
             FROM class_sections cs
             JOIN classes c ON c.id = cs.class_id
             WHERE cs.session_id = $1 AND cs.is_active = true AND c.school_id = $2
             ORDER BY c.display_order, cs.name`,
            [toSessionId, schoolId]
        );
    }

    return NextResponse.json({ students, classMappings, targetSections });
}
