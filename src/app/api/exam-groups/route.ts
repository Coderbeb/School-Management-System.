import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET: List exam groups for the current school + session
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { searchParams } = new URL(request.url);
        const sessionId = searchParams.get('sessionId');
        const groupId = searchParams.get('id');

        // Fetch a single group with its members
        if (groupId) {
            const group = await queryOne<any>(
                `SELECT eg.*, s.name as session_name
                 FROM exam_groups eg
                 JOIN academic_sessions s ON eg.session_id = s.id
                 WHERE eg.id = $1${schoolId ? ' AND eg.school_id = $2' : ''}`,
                schoolId ? [groupId, schoolId] : [groupId]
            );

            if (!group) {
                return NextResponse.json({ error: 'Exam group not found' }, { status: 404 });
            }

            // Get members (exams in this group) with their details
            const members = await query<any>(
                `SELECT egm.*, e.name as exam_name, e.exam_category, e.start_date, e.end_date,
                        e.is_entry_open, e.is_published, e.is_locked, e.generates_report_card,
                        e.is_teacher_test,
                        (SELECT COUNT(*) FROM exam_subjects es WHERE es.exam_id = e.id) as subject_count,
                        (SELECT COUNT(*) FROM marks_submissions ms WHERE ms.exam_id = e.id AND ms.status IN ('submitted','locked')) as submitted_count
                 FROM exam_group_members egm
                 JOIN exams e ON egm.exam_id = e.id
                 WHERE egm.exam_group_id = $1
                 ORDER BY egm.display_order ASC, e.start_date ASC`,
                [groupId]
            );

            return NextResponse.json({ group, members });
        }

        // List all groups
        let sql = `
            SELECT eg.*,
                   s.name as session_name,
                   (SELECT COUNT(*) FROM exam_group_members egm WHERE egm.exam_group_id = eg.id) as exam_count,
                   (SELECT COALESCE(SUM(egm.weightage), 0) FROM exam_group_members egm WHERE egm.exam_group_id = eg.id) as total_weightage
            FROM exam_groups eg
            JOIN academic_sessions s ON eg.session_id = s.id
            WHERE eg.is_active = true
        `;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) {
            sql += ` AND eg.school_id = $${idx++}`;
            params.push(schoolId);
        }

        if (sessionId) {
            sql += ` AND eg.session_id = $${idx++}`;
            params.push(sessionId);
        }

        sql += ` ORDER BY eg.display_order ASC, eg.name ASC`;

        const groups = await query(sql, params);
        return NextResponse.json({ groups });
    } catch (error) {
        console.error('Error fetching exam groups:', error);
        return NextResponse.json({ error: 'Failed to fetch exam groups' }, { status: 500 });
    }
}

// POST: Create exam group OR add member to group
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const body = await request.json();
        const { action = 'create_group' } = body;

        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        // ACTION: Create a new exam group
        if (action === 'create_group') {
            const { name, sessionId, description, aggregationMethod = 'weighted_sum', bestOfCount, generatesReportCard = true } = body;

            if (!name || !sessionId) {
                return NextResponse.json({ error: 'Group name and session are required' }, { status: 400 });
            }

            // Get next display order
            const maxOrder = await queryOne<{ max: number }>(
                `SELECT COALESCE(MAX(display_order), 0) as max FROM exam_groups WHERE school_id = $1 AND session_id = $2`,
                [schoolId, sessionId]
            );

            const result = await queryOne(
                `INSERT INTO exam_groups (school_id, session_id, name, description, aggregation_method, best_of_count, generates_report_card, display_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                [schoolId, sessionId, name, description || null, aggregationMethod, bestOfCount || null, generatesReportCard, (maxOrder?.max || 0) + 1]
            );

            return NextResponse.json({ group: result }, { status: 201 });
        }

        // ACTION: Add an exam to a group
        if (action === 'add_member') {
            const { examGroupId, examId, weightage = 100 } = body;

            if (!examGroupId || !examId) {
                return NextResponse.json({ error: 'examGroupId and examId are required' }, { status: 400 });
            }

            // Verify group belongs to this school
            const group = await queryOne<any>(
                `SELECT id FROM exam_groups WHERE id = $1 AND school_id = $2`,
                [examGroupId, schoolId]
            );
            if (!group) {
                return NextResponse.json({ error: 'Exam group not found' }, { status: 404 });
            }

            // Get next display order in the group
            const maxOrder = await queryOne<{ max: number }>(
                `SELECT COALESCE(MAX(display_order), 0) as max FROM exam_group_members WHERE exam_group_id = $1`,
                [examGroupId]
            );

            const result = await queryOne(
                `INSERT INTO exam_group_members (exam_group_id, exam_id, weightage, display_order)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (exam_group_id, exam_id) DO UPDATE SET weightage = $3
                 RETURNING *`,
                [examGroupId, examId, weightage, (maxOrder?.max || 0) + 1]
            );

            return NextResponse.json({ member: result }, { status: 201 });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: unknown) {
        console.error('Error creating exam group:', error);
        const msg = error instanceof Error ? error.message : 'Failed to create';
        if (msg.includes('unique') || msg.includes('duplicate')) {
            return NextResponse.json({ error: 'This group name already exists or exam is already in the group' }, { status: 409 });
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// PUT: Update exam group or member
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const body = await request.json();
        const { action = 'update_group' } = body;

        if (action === 'update_group') {
            const { id, name, description, aggregationMethod, bestOfCount, generatesReportCard, displayOrder } = body;

            if (!id) {
                return NextResponse.json({ error: 'Group ID is required' }, { status: 400 });
            }

            const result = await queryOne(
                `UPDATE exam_groups SET
                    name = COALESCE($2, name),
                    description = COALESCE($3, description),
                    aggregation_method = COALESCE($4, aggregation_method),
                    best_of_count = COALESCE($5, best_of_count),
                    generates_report_card = COALESCE($6, generates_report_card),
                    display_order = COALESCE($7, display_order),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1${schoolId ? ' AND school_id = $8' : ''}
                 RETURNING *`,
                schoolId
                    ? [id, name, description, aggregationMethod, bestOfCount, generatesReportCard, displayOrder, schoolId]
                    : [id, name, description, aggregationMethod, bestOfCount, generatesReportCard, displayOrder]
            );

            if (!result) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
            return NextResponse.json({ group: result });
        }

        if (action === 'update_member') {
            const { memberId, weightage, displayOrder } = body;

            if (!memberId) {
                return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
            }

            const result = await queryOne(
                `UPDATE exam_group_members SET
                    weightage = COALESCE($2, weightage),
                    display_order = COALESCE($3, display_order)
                 WHERE id = $1
                 RETURNING *`,
                [memberId, weightage, displayOrder]
            );

            if (!result) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
            return NextResponse.json({ member: result });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('Error updating exam group:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}

// DELETE: Delete exam group or remove member
export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { searchParams } = new URL(request.url);
        const groupId = searchParams.get('groupId');
        const memberId = searchParams.get('memberId');

        if (memberId) {
            // Remove an exam from a group
            await query(`DELETE FROM exam_group_members WHERE id = $1`, [memberId]);
            return NextResponse.json({ success: true });
        }

        if (groupId) {
            // Soft-delete the group
            let sql = `UPDATE exam_groups SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`;
            const params: unknown[] = [groupId];
            if (schoolId) {
                sql += ` AND school_id = $2`;
                params.push(schoolId);
            }
            await query(sql, params);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'groupId or memberId is required' }, { status: 400 });
    } catch (error) {
        console.error('Error deleting exam group:', error);
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
