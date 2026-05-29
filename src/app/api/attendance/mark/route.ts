import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET: Fetch students enrolled in a class-section for attendance marking
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const classSectionId = searchParams.get('classSectionId');
        const sessionId = searchParams.get('sessionId');
        const subjectId = searchParams.get('subjectId');

        if (!classSectionId) {
            return NextResponse.json({ error: 'classSectionId is required' }, { status: 400 });
        }

        // 1. Get class-section info (with school isolation check)
        const csInfo = await query<{
            class_section_name: string;
            subject_name: string | null;
            subject_code: string | null;
        }>(
            `SELECT 
                (c.name || ' - ' || sec.name) as class_section_name,
                sub.name as subject_name,
                sub.code as subject_code
             FROM class_sections cs
             JOIN classes c ON cs.class_id = c.id
             JOIN sections sec ON cs.section_id = sec.id
             LEFT JOIN subjects sub ON sub.id = $2::uuid
             WHERE cs.id = $1 AND ($3::uuid IS NULL OR cs.school_id = $3::uuid)`,
            [classSectionId, subjectId || '00000000-0000-0000-0000-000000000000', schoolId]
        );

        if (csInfo.length === 0) {
            return NextResponse.json({ error: 'Class section not found or access denied' }, { status: 404 });
        }

        const classSectionName = csInfo[0]?.class_section_name || 'Unknown';
        const subjectName = csInfo[0]?.subject_name || '';
        const subjectCode = csInfo[0]?.subject_code || '';

        // 2. Verify teacher is assigned to this class-section (RBAC)
        if (auth.user.role === 'teacher') {
            let assignmentCheck;
            if (subjectId) {
                assignmentCheck = await query(
                    `SELECT 1 FROM teacher_assignments 
                     WHERE teacher_id = $1 AND class_section_id = $2 AND subject_id = $3`,
                    [auth.user.userId, classSectionId, subjectId]
                );
            } else {
                assignmentCheck = await query(
                    `SELECT 1 FROM teacher_assignments 
                     WHERE teacher_id = $1 AND class_section_id = $2`,
                    [auth.user.userId, classSectionId]
                );
            }
            if (assignmentCheck.length === 0) {
                return NextResponse.json({ error: 'You are not assigned to this class' }, { status: 403 });
            }
        }

        // 3. Fetch enrolled students (with school isolation check)
        let studentSql = `
            SELECT 
                s.id, se.id as enrollment_id, 
                se.roll_number, s.first_name, s.last_name,
                s.admission_number
            FROM student_enrollments se
            JOIN students s ON se.student_id = s.id
            JOIN class_sections cs ON se.class_section_id = cs.id
            WHERE se.class_section_id = $1
              AND se.status = 'active'
              AND s.is_active = true
              AND ($2::uuid IS NULL OR cs.school_id = $2::uuid)
        `;
        const params: unknown[] = [classSectionId, schoolId];
        
        if (sessionId) {
            params.push(sessionId);
            studentSql += ` AND se.session_id = $${params.length}`;
        }

        studentSql += ` ORDER BY se.roll_number ASC NULLS LAST, s.first_name ASC`;

        const students = await query(studentSql, params);

        return NextResponse.json({
            students,
            classSectionName,
            subjectName,
            subjectCode,
            total: students.length,
        });
    } catch (error) {
        console.error('GET mark attendance error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
