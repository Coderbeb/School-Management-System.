import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'student') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        // Find the student record linked to this user
        const studentRes = await pool.query(
            'SELECT id FROM students WHERE user_id = $1 AND is_active = true LIMIT 1',
            [payload.userId]
        );

        if (studentRes.rows.length === 0) {
            return NextResponse.json({ subjects: [] });
        }

        const studentId = studentRes.rows[0].id;

        // Get subjects via enrollment → class_section → class_subjects → subjects
        // Also join teacher_assignments to get the teacher name
        const result = await pool.query(
            `SELECT DISTINCT s.name as subject_name, s.code as subject_code,
                    CONCAT(c.name, '-', sec.name) as class_section_name,
                    COALESCE(CONCAT(u.first_name, ' ', u.last_name), 'Not assigned') as teacher_name
             FROM student_enrollments se
             JOIN class_sections cs ON se.class_section_id = cs.id
             JOIN classes c ON cs.class_id = c.id
             JOIN sections sec ON cs.section_id = sec.id
             JOIN class_subjects csub ON csub.class_id = c.id AND csub.session_id = se.session_id
             JOIN subjects s ON csub.subject_id = s.id
             LEFT JOIN teacher_assignments ta ON ta.class_section_id = cs.id AND ta.subject_id = s.id AND ta.session_id = se.session_id
             LEFT JOIN users u ON ta.teacher_id = u.id
             WHERE se.student_id = $1 AND se.status = 'active'
             ORDER BY s.name`,
            [studentId]
        );

        return NextResponse.json({ subjects: result.rows });
    } catch (error) {
        console.error('Student subjects error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
