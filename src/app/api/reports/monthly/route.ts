import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const { role, userId } = auth.user;
        const schoolId = resolveSchoolId(auth.user, request);
        const { searchParams } = new URL(request.url);

        const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
        const classSectionId = searchParams.get('classSectionId') || searchParams.get('departmentId'); // Map legacy parameter
        const subjectId = searchParams.get('subjectId');
        const [year, monthNum] = month.split('-');

        // Resolve active session
        let sessionSql = `SELECT id FROM academic_sessions WHERE is_current = true`;
        const sessionParams: unknown[] = [];
        if (schoolId) {
            sessionSql += ` AND school_id = $1`;
            sessionParams.push(schoolId);
        }
        sessionSql += ` LIMIT 1`;
        const currentSession = await queryOne<{ id: string }>(sessionSql, sessionParams);
        const sessionId = currentSession?.id;

        if (!sessionId) {
            return NextResponse.json({
                stats: { month, totalDays: 0, totalSessions: 0, totalPresent: 0, totalAbsent: 0, totalRecords: 0, averageAttendance: 0, highestAttendance: 0, lowestAttendance: 0 },
                dailyBreakdown: []
            });
        }

        const params: any[] = [parseInt(year), parseInt(monthNum), sessionId];
        const filters: string[] = [
            'EXTRACT(YEAR FROM ar.date) = $1',
            'EXTRACT(MONTH FROM ar.date) = $2',
            'ar.session_id = $3'
        ];

        if (classSectionId) {
            params.push(classSectionId);
            filters.push(`ar.class_section_id = $${params.length}`);
        }

        if (subjectId) {
            params.push(subjectId);
            filters.push(`ar.subject_id = $${params.length}`);
        }

        if (role === 'teacher') {
            params.push(userId);
            filters.push(`ar.class_section_id IN (
                SELECT class_section_id FROM teacher_assignments WHERE teacher_id = $${params.length} AND session_id = $3
            )`);
        }

        const filterClause = filters.length > 0 ? 'WHERE ' + filters.join(' AND ') : '';

        // 1. Overall Monthly Summary
        const summaryResult = await query<any>(
            `SELECT 
                COUNT(DISTINCT ar.date) as total_days,
                COUNT(DISTINCT ar.class_section_id || '-' || ar.date || '-' || COALESCE(ar.subject_id::text, 'general') || '-' || ar.period_number) as total_lectures,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present_count,
                COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent_count,
                COUNT(*) as total_count
            FROM attendance_records ar
            ${filterClause}`,
            params
        );

        // 2. Day-by-day Breakdown
        const dailyResult = await query<any>(
            `SELECT 
                ar.date::text as date,
                COUNT(*) as total_records,
                COUNT(CASE WHEN ar.status = 'present' THEN 1 END) as present_count,
                COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) as absent_count
            FROM attendance_records ar
            ${filterClause}
            GROUP BY ar.date
            ORDER BY ar.date ASC`,
            params
        );

        // Compute min/max percentages
        const percentages = dailyResult.map((d: any) => {
            const total = parseInt(d.total_records) || 0;
            const present = parseInt(d.present_count) || 0;
            return total > 0 ? Math.round((present / total) * 100) : 0;
        });

        const data = summaryResult[0] || {
            total_days: '0',
            total_lectures: '0',
            present_count: '0',
            absent_count: '0',
            total_count: '0'
        };

        const totalCount = parseInt(data.total_count) || 0;
        const presentCount = parseInt(data.present_count) || 0;
        const absentCount = parseInt(data.absent_count) || 0;
        const avgAttendance = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

        return NextResponse.json({
            stats: {
                month,
                totalDays: parseInt(data.total_days) || 0,
                totalSessions: parseInt(data.total_lectures) || 0,
                totalPresent: presentCount,
                totalAbsent: absentCount,
                totalRecords: totalCount,
                averageAttendance: avgAttendance,
                highestAttendance: percentages.length > 0 ? Math.max(...percentages) : 0,
                lowestAttendance: percentages.length > 0 ? Math.min(...percentages) : 0
            },
            dailyBreakdown: dailyResult.map((d: any) => {
                const total = parseInt(d.total_records) || 0;
                const present = parseInt(d.present_count) || 0;
                return {
                    date: d.date,
                    percentage: total > 0 ? Math.round((present / total) * 100) : 0
                };
            })
        });
    } catch (error) {
        console.error('Monthly report API error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
