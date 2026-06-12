import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId, schoolFilter } from '@/lib/auth';
import { randomUUID } from 'crypto';

// GET /api/promotions — List promotion history
export async function GET(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const studentId = url.searchParams.get('studentId');
    const batchId = url.searchParams.get('batchId');
    const listBatches = url.searchParams.get('listBatches');

    const sf = schoolFilter(schoolId, 'p', 1);
    let paramIdx = sf.nextIndex;
    const params: unknown[] = [...sf.params];

    // List unique promotion batches
    if (listBatches === 'true') {
        const batches = await query(
            `SELECT p.batch_id,
                MIN(p.promoted_at) as promoted_at,
                COUNT(*) as total_students,
                COUNT(*) FILTER (WHERE p.action = 'promoted') as promoted_count,
                COUNT(*) FILTER (WHERE p.action = 'retained') as retained_count,
                COUNT(*) FILTER (WHERE p.action = 'graduated') as graduated_count,
                COUNT(*) FILTER (WHERE p.action IN ('tc_issued','withdrawn','transferred_out')) as left_count,
                fs.name as from_session_name,
                ts.name as to_session_name,
                u.first_name || ' ' || u.last_name as promoted_by_name
             FROM student_promotions p
             LEFT JOIN academic_sessions fs ON fs.id = p.from_session_id
             LEFT JOIN academic_sessions ts ON ts.id = p.to_session_id
             LEFT JOIN users u ON u.id = p.promoted_by
             WHERE 1=1 ${sf.clause}
             GROUP BY p.batch_id, fs.name, ts.name, u.first_name, u.last_name
             ORDER BY MIN(p.promoted_at) DESC`,
            sf.params
        );
        return NextResponse.json({ batches });
    }

    let sessionClause = '';
    if (sessionId) {
        sessionClause = ` AND p.from_session_id = $${paramIdx}`;
        params.push(sessionId);
        paramIdx++;
    }
    let studentClause = '';
    if (studentId) {
        studentClause = ` AND p.student_id = $${paramIdx}`;
        params.push(studentId);
        paramIdx++;
    }
    let batchClause = '';
    if (batchId) {
        batchClause = ` AND p.batch_id = $${paramIdx}`;
        params.push(batchId);
        paramIdx++;
    }

    const promotions = await query(
        `SELECT p.*,
            s.name as student_name,
            s.admission_number,
            fc.name as from_class_name, fsec.name as from_section_name,
            tc.name as to_class_name, tsec.name as to_section_name,
            fs.name as from_session_name, ts.name as to_session_name,
            u.first_name || ' ' || u.last_name as promoted_by_name
         FROM student_promotions p
         LEFT JOIN students s ON s.id = p.student_id
         LEFT JOIN class_sections fcs ON fcs.id = p.from_class_section_id
         LEFT JOIN classes fc ON fc.id = fcs.class_id
         LEFT JOIN sections fsec ON fsec.id = fcs.section_id
         LEFT JOIN class_sections tcs ON tcs.id = p.to_class_section_id
         LEFT JOIN classes tc ON tc.id = tcs.class_id
         LEFT JOIN sections tsec ON tsec.id = tcs.section_id
         LEFT JOIN academic_sessions fs ON fs.id = p.from_session_id
         LEFT JOIN academic_sessions ts ON ts.id = p.to_session_id
         LEFT JOIN users u ON u.id = p.promoted_by
         WHERE 1=1 ${sf.clause} ${sessionClause} ${studentClause} ${batchClause}
         ORDER BY p.promoted_at DESC`,
        params
    );

    return NextResponse.json({ promotions });
}

// POST /api/promotions — Execute bulk promotion
export async function POST(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    if (!schoolId) {
        return NextResponse.json({ error: 'School context required' }, { status: 400 });
    }

    const body = await request.json();
    const { fromSessionId, toSessionId, promotions } = body;

    if (!fromSessionId || !toSessionId || !promotions?.length) {
        return NextResponse.json(
            { error: 'fromSessionId, toSessionId, and promotions array are required' },
            { status: 400 }
        );
    }

    // Get session names for history snapshots
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromSession = await queryOne<any>(`SELECT name FROM academic_sessions WHERE id = $1`, [fromSessionId]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toSession = await queryOne<any>(`SELECT name FROM academic_sessions WHERE id = $1`, [toSessionId]);

    const batchId = randomUUID();
    let promoted = 0;
    let retained = 0;
    let graduated = 0;
    const errors: string[] = [];

    for (const p of promotions) {
        const { studentId, fromClassSectionId, toClassSectionId, action = 'promoted', remarks = '' } = p;

        try {
            // Get class names for history snapshots
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fromInfo = await queryOne<any>(
                `SELECT c.name as class_name, sec.name as section_name
                 FROM class_sections cs
                 JOIN classes c ON c.id = cs.class_id
                 LEFT JOIN sections sec ON sec.id = cs.section_id
                 WHERE cs.id = $1`,
                [fromClassSectionId]
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let toInfo: any = null;
            if (toClassSectionId) {
                toInfo = await queryOne(
                    `SELECT c.name as class_name, sec.name as section_name
                     FROM class_sections cs
                     JOIN classes c ON c.id = cs.class_id
                     LEFT JOIN sections sec ON sec.id = cs.section_id
                     WHERE cs.id = $1`,
                    [toClassSectionId]
                );
            }

            const fromClass = fromInfo ? `${fromInfo.class_name} - ${fromInfo.section_name || ''}`.trim() : '';
            const toClass = toInfo ? `${toInfo.class_name} - ${toInfo.section_name || ''}`.trim() : '';

            // 1. Log the promotion
            await query(
                `INSERT INTO student_promotions
                    (school_id, student_id, from_class_section_id, to_class_section_id,
                     from_session_id, to_session_id, action, remarks, batch_id, promoted_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [schoolId, studentId, fromClassSectionId,
                 action === 'promoted' ? toClassSectionId : (action === 'retained' ? fromClassSectionId : null),
                 fromSessionId, toSessionId, action, remarks, batchId, user.userId]
            );

            // 2. Log to student_history (permanent)
            await query(
                `INSERT INTO student_history
                    (school_id, student_id, event_type, event_date, session_id,
                     from_class, to_class, from_session, to_session, details, recorded_by)
                 VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9, $10)`,
                [schoolId, studentId, action, toSessionId || fromSessionId,
                 fromClass, action === 'promoted' ? toClass : (action === 'retained' ? fromClass : null),
                 fromSession?.name || '', toSession?.name || '',
                 JSON.stringify({ remarks, batch_id: batchId }),
                 user.userId]
            );

            if (action === 'promoted' && toClassSectionId) {
                // Create new enrollment
                await query(
                    `INSERT INTO student_enrollments (student_id, class_section_id, session_id, status)
                     VALUES ($1, $2, $3, 'active')
                     ON CONFLICT (student_id, session_id) DO UPDATE
                     SET class_section_id = $2, status = 'active'`,
                    [studentId, toClassSectionId, toSessionId]
                );
                // Mark old enrollment as promoted
                await query(
                    `UPDATE student_enrollments SET status = 'promoted'
                     WHERE student_id = $1 AND session_id = $2`,
                    [studentId, fromSessionId]
                );
                promoted++;
            } else if (action === 'retained') {
                // Re-enroll in same class for next session
                await query(
                    `INSERT INTO student_enrollments (student_id, class_section_id, session_id, status)
                     VALUES ($1, $2, $3, 'active')
                     ON CONFLICT (student_id, session_id) DO UPDATE
                     SET class_section_id = $2, status = 'active'`,
                    [studentId, fromClassSectionId, toSessionId]
                );
                await query(
                    `UPDATE student_enrollments SET status = 'retained'
                     WHERE student_id = $1 AND session_id = $2`,
                    [studentId, fromSessionId]
                );
                retained++;
            } else if (action === 'graduated') {
                await query(
                    `UPDATE students SET status = 'graduated' WHERE id = $1 AND school_id = $2`,
                    [studentId, schoolId]
                );
                await query(
                    `UPDATE student_enrollments SET status = 'graduated'
                     WHERE student_id = $1 AND session_id = $2`,
                    [studentId, fromSessionId]
                );
                graduated++;
            } else if (['withdrawn', 'transferred_out', 'tc_issued'].includes(action)) {
                await query(
                    `UPDATE students SET status = $1, is_active = false WHERE id = $2 AND school_id = $3`,
                    [action === 'tc_issued' ? 'tc_issued' : 'inactive', studentId, schoolId]
                );
                await query(
                    `UPDATE student_enrollments SET status = $1
                     WHERE student_id = $2 AND session_id = $3`,
                    [action, studentId, fromSessionId]
                );
            }
        } catch (err) {
            errors.push(`Student ${studentId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }

    return NextResponse.json({
        success: true,
        batchId,
        summary: { total: promotions.length, promoted, retained, graduated, errors: errors.length },
        errors: errors.length > 0 ? errors : undefined
    }, { status: 201 });
}

// DELETE /api/promotions — Undo a promotion batch
export async function DELETE(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const url = new URL(request.url);
    const batchId = url.searchParams.get('batchId');

    if (!batchId) return NextResponse.json({ error: 'batchId required' }, { status: 400 });

    // Get all promotions in this batch
    const sf = schoolFilter(schoolId, 'p', 2);
    const promotions = await query(
        `SELECT * FROM student_promotions p WHERE p.batch_id = $1 ${sf.clause}`,
        [batchId, ...sf.params]
    ) as { student_id: string; action: string; from_session_id: string; to_session_id: string; from_class_section_id: string; to_class_section_id: string }[];

    if (!promotions.length) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

    let undone = 0;
    for (const p of promotions) {
        try {
            // Remove the new enrollment
            if (p.action === 'promoted' || p.action === 'retained') {
                await query(
                    `DELETE FROM student_enrollments WHERE student_id = $1 AND session_id = $2`,
                    [p.student_id, p.to_session_id]
                );
                // Restore old enrollment to active
                await query(
                    `UPDATE student_enrollments SET status = 'active'
                     WHERE student_id = $1 AND session_id = $2`,
                    [p.student_id, p.from_session_id]
                );
            } else if (['graduated', 'withdrawn', 'tc_issued'].includes(p.action)) {
                await query(
                    `UPDATE students SET status = 'active', is_active = true WHERE id = $1`,
                    [p.student_id]
                );
                await query(
                    `UPDATE student_enrollments SET status = 'active'
                     WHERE student_id = $1 AND session_id = $2`,
                    [p.student_id, p.from_session_id]
                );
            }
            undone++;
        } catch { /* continue */ }
    }

    // Delete the promotion records
    await query(`DELETE FROM student_promotions WHERE batch_id = $1 AND school_id = $2`, [batchId, schoolId]);

    // Log undo in history
    await query(
        `INSERT INTO student_history (school_id, student_id, event_type, event_date, details, recorded_by)
         SELECT $1, p.student_id, 'promotion_undone', CURRENT_DATE,
                jsonb_build_object('original_action', p.action, 'batch_id', $2),
                $3
         FROM student_promotions p WHERE p.batch_id = $2 AND p.school_id = $1`,
        [schoolId, batchId, user.userId]
    );

    return NextResponse.json({ success: true, undone, message: `${undone} promotions undone` });
}
