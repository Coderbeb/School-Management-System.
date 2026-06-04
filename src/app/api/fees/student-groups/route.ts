import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/fees/student-groups — V3: Bulk-optimized (NO N+1 queries)
 * POST /api/fees/student-groups — Assign students to fee groups (supports bulk + class-range)
 * PUT /api/fees/student-groups — Sync a single student's fee groups
 * DELETE /api/fees/student-groups — Remove a student's fee group assignment
 */

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');
    const sessionId = searchParams.get('sessionId');
    const unassignedOnly = searchParams.get('unassignedOnly') === 'true';

    if (!sessionId) {
        return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    try {
        // ── QUERY 1: All enrolled students ──
        let studentsSql = `
            SELECT s.id as student_id, s.first_name, s.last_name, s.admission_number,
                c.name as class_name, c.id as class_id, cs.id as class_section_id,
                sec.name as section_name
            FROM students s
            JOIN student_enrollments se ON se.student_id = s.id AND se.session_id = $1 AND se.status = 'active'
            JOIN class_sections cs ON se.class_section_id = cs.id
            JOIN classes c ON cs.class_id = c.id
            LEFT JOIN sections sec ON cs.section_id = sec.id
            WHERE s.school_id = $2
        `;
        const params: unknown[] = [sessionId, schoolId];
        let idx = 3;

        if (classId) {
            studentsSql += ` AND cs.class_id = $${idx++}`;
            params.push(classId);
        }

        studentsSql += ` ORDER BY c.display_order ASC, s.first_name ASC`;
        const students = await query<any>(studentsSql, params);

        if (students.length === 0) {
            return NextResponse.json({ assignments: [], summary: { total: 0, assigned: 0, unassigned: 0, estimatedMonthly: 0, estimatedYearly: 0 } });
        }

        const studentIds = students.map(s => s.student_id);

        // ── QUERY 2: ALL group assignments for ALL students in ONE query ──
        const allAssignments = await query<any>(
            `SELECT sfg.student_id, sfg.id as assignment_id,
                    fg.id as fee_group_id, fg.name as fee_group_name,
                    fg.apply_to, fg.is_default, fg.is_active
             FROM student_fee_groups sfg
             JOIN fee_groups fg ON sfg.fee_group_id = fg.id
             WHERE sfg.student_id = ANY($1::uuid[]) AND sfg.session_id = $2
             ORDER BY fg.display_order ASC, fg.name ASC`,
            [studentIds, sessionId]
        );

        // ── QUERY 3: ALL fee head amounts for ALL assigned groups in ONE query ──
        const assignedGroupIds = [...new Set(allAssignments.map(a => a.fee_group_id))];
        let allHeads: any[] = [];
        if (assignedGroupIds.length > 0) {
            allHeads = await query<any>(
                `SELECT fgh.fee_group_id, fgh.amount, fgh.frequency, fh.name as head_name
                 FROM fee_group_heads fgh
                 JOIN fee_heads fh ON fgh.fee_head_id = fh.id
                 WHERE fgh.fee_group_id = ANY($1::uuid[])`,
                [assignedGroupIds]
            );
        }

        // ── Build lookup maps in JS (fast) ──
        const assignmentsByStudent = new Map<string, any[]>();
        for (const a of allAssignments) {
            if (!assignmentsByStudent.has(a.student_id)) assignmentsByStudent.set(a.student_id, []);
            assignmentsByStudent.get(a.student_id)!.push(a);
        }

        const headsByGroup = new Map<string, any[]>();
        for (const h of allHeads) {
            if (!headsByGroup.has(h.fee_group_id)) headsByGroup.set(h.fee_group_id, []);
            headsByGroup.get(h.fee_group_id)!.push(h);
        }

        // Helper to calc yearly from frequency
        const yearlyMultiplier = (freq: string) => {
            switch (freq) {
                case 'monthly': return 12;
                case 'quarterly': return 4;
                case 'half_yearly': return 2;
                case 'yearly': return 1;
                case 'one_time': return 1;
                default: return 1;
            }
        };

        // ── Assemble results ──
        let totalAssigned = 0;
        let totalEstMonthly = 0;
        let totalEstYearly = 0;

        const results = students.map(student => {
            const groups = assignmentsByStudent.get(student.student_id) || [];
            let estimatedMonthly = 0;
            let estimatedYearly = 0;
            const groupDetails: any[] = [];

            for (const g of groups) {
                const heads = headsByGroup.get(g.fee_group_id) || [];
                let groupMonthly = 0;
                let groupYearly = 0;
                const headBreakdown: any[] = [];

                for (const h of heads) {
                    const amt = parseFloat(h.amount || '0');
                    if (h.frequency === 'monthly') groupMonthly += amt;
                    groupYearly += amt * yearlyMultiplier(h.frequency);
                    headBreakdown.push({ name: h.head_name, amount: amt, frequency: h.frequency });
                }

                groupDetails.push({
                    fee_group_id: g.fee_group_id,
                    fee_group_name: g.fee_group_name,
                    assignment_id: g.assignment_id,
                    monthly: groupMonthly,
                    yearly: groupYearly,
                    heads: headBreakdown
                });

                estimatedMonthly += groupMonthly;
                estimatedYearly += groupYearly;
            }

            if (groups.length > 0) totalAssigned++;
            totalEstMonthly += estimatedMonthly;
            totalEstYearly += estimatedYearly;

            return {
                ...student,
                assigned_groups: groupDetails,
                estimated_monthly: estimatedMonthly,
                estimated_yearly: estimatedYearly
            };
        });

        // Apply unassigned filter if requested
        const filtered = unassignedOnly ? results.filter(s => s.assigned_groups.length === 0) : results;

        return NextResponse.json({
            assignments: filtered,
            summary: {
                total: students.length,
                assigned: totalAssigned,
                unassigned: students.length - totalAssigned,
                estimatedMonthly: totalEstMonthly,
                estimatedYearly: totalEstYearly
            }
        });
    } catch (error) {
        console.error('Error fetching student fee groups:', error);
        return NextResponse.json({ error: 'Failed to fetch student fee group assignments' }, { status: 500 });
    }
}

// POST: Assign students to fee groups (bulk + class-range)
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { studentIds, classIds, feeGroupId, sessionId, action } = await request.json();

        if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        if (!feeGroupId) return NextResponse.json({ error: 'feeGroupId is required' }, { status: 400 });

        // Resolve student IDs from direct list or class IDs
        let resolvedStudentIds: string[] = [];

        if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
            resolvedStudentIds = studentIds;
        } else if (classIds && Array.isArray(classIds) && classIds.length > 0) {
            const students = await query<any>(
                `SELECT DISTINCT s.id
                 FROM students s
                 JOIN student_enrollments se ON se.student_id = s.id AND se.session_id = $1 AND se.status = 'active'
                 JOIN class_sections cs ON se.class_section_id = cs.id
                 WHERE cs.class_id = ANY($2::uuid[]) AND s.school_id = $3`,
                [sessionId, classIds, schoolId]
            );
            resolvedStudentIds = students.map((s: any) => s.id);
        } else {
            return NextResponse.json({ error: 'Either studentIds or classIds array is required' }, { status: 400 });
        }

        if (resolvedStudentIds.length === 0) {
            return NextResponse.json({ message: 'No students found', assigned: 0 });
        }

        // Handle remove action
        if (action === 'remove') {
            await query(
                `DELETE FROM student_fee_groups WHERE student_id = ANY($1::uuid[]) AND fee_group_id = $2 AND session_id = $3`,
                [resolvedStudentIds, feeGroupId, sessionId]
            );
            return NextResponse.json({ success: true, removed: resolvedStudentIds.length });
        }

        // Assign (upsert)
        await query(
            `INSERT INTO student_fee_groups (student_id, fee_group_id, session_id)
             SELECT unnest($1::uuid[]), $2, $3
             ON CONFLICT (student_id, fee_group_id, session_id) DO NOTHING`,
            [resolvedStudentIds, feeGroupId, sessionId]
        );

        return NextResponse.json({ success: true, assigned: resolvedStudentIds.length });
    } catch (error) {
        console.error('Error assigning student groups:', error);
        return NextResponse.json({ error: 'Failed to assign groups' }, { status: 500 });
    }
}

// DELETE: Unassign a student from a fee group
export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const feeGroupId = searchParams.get('feeGroupId');
    const sessionId = searchParams.get('sessionId');

    if (!studentId || !feeGroupId || !sessionId) {
        return NextResponse.json({ error: 'studentId, feeGroupId, and sessionId required' }, { status: 400 });
    }

    try {
        await query(
            `DELETE FROM student_fee_groups WHERE student_id = $1 AND fee_group_id = $2 AND session_id = $3`,
            [studentId, feeGroupId, sessionId]
        );
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error unassigning group:', error);
        return NextResponse.json({ error: 'Failed to unassign group' }, { status: 500 });
    }
}

// PUT: Sync a student's fee groups (replace all)
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
    if (auth.error) return auth.error;

    try {
        const body = await request.json();

        // ── Mode 1: Copy from previous session ──
        if (body.copyFromSessionId && body.targetSessionId) {
            const schoolId = resolveSchoolId(auth.user, request);
            // Get all assignments from previous session for students enrolled in target session
            const copied = await query<any>(
                `INSERT INTO student_fee_groups (student_id, fee_group_id, session_id)
                 SELECT sfg.student_id, sfg.fee_group_id, $2
                 FROM student_fee_groups sfg
                 JOIN student_enrollments se ON se.student_id = sfg.student_id
                     AND se.session_id = $2 AND se.status = 'active'
                 JOIN students s ON s.id = sfg.student_id AND s.school_id = $3
                 WHERE sfg.session_id = $1
                 ON CONFLICT (student_id, fee_group_id, session_id) DO NOTHING`,
                [body.copyFromSessionId, body.targetSessionId, schoolId]
            );
            return NextResponse.json({ success: true, message: 'Assignments copied from previous session' });
        }

        // ── Mode 2: Sync single student's groups ──
        const { studentId, feeGroupIds, sessionId } = body;

        if (!studentId || !sessionId || !Array.isArray(feeGroupIds)) {
            return NextResponse.json({ error: 'studentId, feeGroupIds (array), and sessionId required' }, { status: 400 });
        }

        // Remove all existing
        await query(
            `DELETE FROM student_fee_groups WHERE student_id = $1 AND session_id = $2`,
            [studentId, sessionId]
        );

        // Insert new bulk
        if (feeGroupIds.length > 0) {
            await query(
                `INSERT INTO student_fee_groups (student_id, fee_group_id, session_id)
                 SELECT $1, unnest($2::uuid[]), $3`,
                [studentId, feeGroupIds, sessionId]
            );
        }

        return NextResponse.json({ success: true, assigned: feeGroupIds.length });
    } catch (error) {
        console.error('Error syncing student groups:', error);
        return NextResponse.json({ error: 'Failed to sync student groups' }, { status: 500 });
    }
}
