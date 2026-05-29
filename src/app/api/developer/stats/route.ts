import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = verifyToken(authHeader.substring(7));
    if (!user || user.role !== 'developer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    try {
        const [users, students, teachers, classes, subjects, exams, marks, sessions, published, schoolsCount] = await Promise.all([
            queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM users WHERE is_active = true`),
            queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM students`),
            queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM users WHERE role = 'teacher' AND is_active = true`),
            queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM classes`),
            queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM subjects`),
            queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM exams`),
            queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM marks_records`),
            query<{ id: string; name: string; is_current: boolean }>(`SELECT id, name, is_current FROM academic_sessions ORDER BY is_current DESC, start_date DESC LIMIT 1`),
            queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM exams WHERE is_published = true`),
            queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM schools WHERE is_active = true`),
        ]);

        const activeSession = sessions.length > 0 ? sessions[0].name : null;

        // Pending submissions (submitted but not locked)
        const pending = await queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM marks_submissions WHERE status = 'submitted'`);

        return NextResponse.json({
            stats: {
                totalUsers: parseInt(users?.count || '0'),
                totalStudents: parseInt(students?.count || '0'),
                totalTeachers: parseInt(teachers?.count || '0'),
                totalClasses: parseInt(classes?.count || '0'),
                totalSubjects: parseInt(subjects?.count || '0'),
                totalExams: parseInt(exams?.count || '0'),
                totalMarksRecords: parseInt(marks?.count || '0'),
                totalSessions: sessions.length,
                activeSession,
                pendingSubmissions: parseInt(pending?.count || '0'),
                publishedExams: parseInt(published?.count || '0'),
                totalSchools: parseInt(schoolsCount?.count || '0'),
            }
        });
    } catch (error) {
        console.error('Error fetching developer stats:', error);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
