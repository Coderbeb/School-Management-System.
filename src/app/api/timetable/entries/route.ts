import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const classSectionId = searchParams.get('classSectionId');
    const teacherId = searchParams.get('teacherId');

    try {
        let sql = `
            SELECT te.*,
                tp.start_time, tp.end_time, tp.label, tp.is_break, tp.period_number,
                sub.name as subject_name, sub.code as subject_code,
                c.name as class_name, cs.name as section_name,
                u.first_name || ' ' || u.last_name as teacher_name
            FROM timetable_entries te
            JOIN timetable_periods tp ON te.period_id = tp.id
            JOIN subjects sub ON te.subject_id = sub.id
            JOIN class_sections cs ON te.class_section_id = cs.id
            JOIN classes c ON cs.class_id = c.id
            LEFT JOIN users u ON te.teacher_id = u.id
            WHERE te.school_id = $1
        `;
        const params: unknown[] = [schoolId];
        let idx = 2;

        if (classSectionId) {
            sql += ` AND te.class_section_id = $${idx++}`;
            params.push(classSectionId);
        }

        if (teacherId) {
            sql += ` AND te.teacher_id = $${idx++}`;
            params.push(teacherId);
        }

        sql += ` ORDER BY te.day_of_week ASC, tp.period_number ASC`;
        const entries = await query<any>(sql, params);

        return NextResponse.json({ entries });
    } catch (error) {
        console.error('Error fetching timetable entries:', error);
        return NextResponse.json({ error: 'Failed to fetch timetable entries' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { classSectionId, entries } = await request.json();

        if (!classSectionId || !Array.isArray(entries)) {
            return NextResponse.json({ error: 'classSectionId and entries array are required' }, { status: 400 });
        }

        // 1. Validate clashes for all incoming entries
        const clashes: string[] = [];
        for (const entry of entries) {
            const { dayOfWeek, periodId, subjectId, teacherId } = entry;

            if (!dayOfWeek || !periodId || !subjectId) {
                continue; // Skip invalid entries
            }

            if (teacherId) {
                // Check if this teacher is assigned to another class section during the same period and day
                const clash = await queryOne<any>(
                    `SELECT te.*, cs.name as section_name, c.name as class_name, tp.label as period_label,
                        u.first_name || ' ' || u.last_name as teacher_name
                     FROM timetable_entries te
                     JOIN class_sections cs ON te.class_section_id = cs.id
                     JOIN classes c ON cs.class_id = c.id
                     JOIN timetable_periods tp ON te.period_id = tp.id
                     JOIN users u ON te.teacher_id = u.id
                     WHERE te.school_id = $1
                       AND te.day_of_week = $2
                       AND te.period_id = $3
                       AND te.teacher_id = $4
                       AND te.class_section_id != $5`,
                    [schoolId, dayOfWeek, periodId, teacherId, classSectionId]
                );

                if (clash) {
                    const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                    clashes.push(
                        `Clash: ${clash.teacher_name} is already teaching ${clash.class_name} ${clash.section_name} during ${clash.period_label} on ${days[dayOfWeek]}.`
                    );
                }
            }
        }

        if (clashes.length > 0) {
            return NextResponse.json({ error: 'Timetable clash detected', clashes }, { status: 400 });
        }

        // 2. Clear existing entries for this section
        await query(
            `DELETE FROM timetable_entries WHERE class_section_id = $1 AND school_id = $2`,
            [classSectionId, schoolId]
        );

        // 3. Insert new entries
        for (const entry of entries) {
            const { dayOfWeek, periodId, subjectId, teacherId } = entry;

            if (!dayOfWeek || !periodId || !subjectId) {
                continue;
            }

            await query(
                `INSERT INTO timetable_entries (school_id, day_of_week, period_id, class_section_id, subject_id, teacher_id)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [schoolId, dayOfWeek, periodId, classSectionId, subjectId, teacherId || null]
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error saving timetable entries:', error);
        return NextResponse.json({ error: 'Failed to save timetable entries' }, { status: 500 });
    }
}
