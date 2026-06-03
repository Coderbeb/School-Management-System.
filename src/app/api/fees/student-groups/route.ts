import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/fees/student-groups — Get student fee group assignments (multi-group per student)
 * POST /api/fees/student-groups — Assign students to fee groups (supports bulk + class-range)
 * DELETE /api/fees/student-groups — Remove a student's fee group assignment
 */

// GET: Fetch student fee group assignments with ALL groups per student
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
        return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    try {
        // Get all enrolled students with their class info
        let studentsSql = `
            SELECT s.id as student_id, s.first_name, s.last_name, s.admission_number,
                c.name as class_name, c.id as class_id, cs.id as class_section_id
            FROM students s
            JOIN student_enrollments se ON se.student_id = s.id AND se.session_id = $1 AND se.status = 'active'
            JOIN class_sections cs ON se.class_section_id = cs.id
            JOIN classes c ON cs.class_id = c.id
            WHERE 1=1
        `;
        const params: unknown[] = [sessionId];
        let idx = 2;

        if (schoolId) {
            studentsSql += ` AND s.school_id = $${idx++}`;
            params.push(schoolId);
        }

        if (classId) {
            studentsSql += ` AND cs.class_id = $${idx++}`;
            params.push(classId);
        }

        studentsSql += ` ORDER BY c.display_order ASC, s.first_name ASC`;
        const students = await query<any>(studentsSql, params);

        // For each student, fetch ALL assigned fee groups
        for (const student of students) {
            const groupsSql = `
                SELECT fg.id as fee_group_id, fg.name as fee_group_name, 
                       fg.apply_to, fg.is_default, fg.is_active,
                       sfg.id as assignment_id
                FROM student_fee_groups sfg
                JOIN fee_groups fg ON sfg.fee_group_id = fg.id
                WHERE sfg.student_id = $1 AND sfg.session_id = $2
                ORDER BY fg.display_order ASC, fg.name ASC
            `;
            student.assigned_groups = await query<any>(groupsSql, [student.student_id, sessionId]);

            // Calculate estimated total from all assigned groups
            if (student.assigned_groups.length > 0) {
                const groupIds = student.assigned_groups.map((g: any) => g.fee_group_id);
                const totalSql = `
                    SELECT COALESCE(SUM(fgh.amount), 0) as monthly_total
                    FROM fee_group_heads fgh
                    WHERE fgh.fee_group_id = ANY($1::uuid[])
                    AND fgh.frequency = 'monthly'
                `;
                const totalResult = await queryOne<any>(totalSql, [groupIds]);
                student.estimated_monthly = parseFloat(totalResult?.monthly_total || '0');

                // Also get yearly total (sum all frequencies normalized)
                const allHeadsSql = `
                    SELECT fgh.amount, fgh.frequency
                    FROM fee_group_heads fgh
                    WHERE fgh.fee_group_id = ANY($1::uuid[])
                `;
                const allHeads = await query<any>(allHeadsSql, [groupIds]);
                let yearlyTotal = 0;
                for (const h of allHeads) {
                    const amt = parseFloat(h.amount || '0');
                    switch (h.frequency) {
                        case 'monthly': yearlyTotal += amt * 12; break;
                        case 'quarterly': yearlyTotal += amt * 4; break;
                        case 'half_yearly': yearlyTotal += amt * 2; break;
                        case 'yearly': yearlyTotal += amt; break;
                        case 'one_time': yearlyTotal += amt; break;
                        default: yearlyTotal += amt;
                    }
                }
                student.estimated_yearly = yearlyTotal;
            } else {
                student.estimated_monthly = 0;
                student.estimated_yearly = 0;
            }
        }

        return NextResponse.json({ assignments: students });
    } catch (error) {
        console.error('Error fetching student fee groups:', error);
        return NextResponse.json({ error: 'Failed to fetch student fee group assignments' }, { status: 500 });
    }
}

// POST: Assign students to fee groups
// Supports: single student, bulk students, bulk by class IDs
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { studentIds, classIds, feeGroupId, sessionId, action } = await request.json();

        if (!sessionId) {
            return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }

        if (!feeGroupId) {
            return NextResponse.json({ error: 'feeGroupId is required' }, { status: 400 });
        }

        // Resolve student IDs — either from direct list or from class IDs
        let resolvedStudentIds: string[] = [];

        if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
            resolvedStudentIds = studentIds;
        } else if (classIds && Array.isArray(classIds) && classIds.length > 0) {
            // Bulk assign by class range — find all students enrolled in these classes
            let bulkSql = `
                SELECT DISTINCT s.id
                FROM students s
                JOIN student_enrollments se ON se.student_id = s.id AND se.session_id = $1 AND se.status = 'active'
                JOIN class_sections cs ON se.class_section_id = cs.id
                WHERE cs.class_id = ANY($2::uuid[])
            `;
            const bulkParams: unknown[] = [sessionId, classIds];
            if (schoolId) {
                bulkSql += ` AND s.school_id = $3`;
                bulkParams.push(schoolId);
            }
            const students = await query<any>(bulkSql, bulkParams);
            resolvedStudentIds = students.map((s: any) => s.id);
        } else {
            return NextResponse.json({ error: 'Either studentIds or classIds array is required' }, { status: 400 });
        }

        if (resolvedStudentIds.length === 0) {
            return NextResponse.json({ message: 'No students found matching the criteria', assigned: 0 });
        }

        // Handle action: 'remove' to unassign, default is 'assign'
        if (action === 'remove') {
            for (const studentId of resolvedStudentIds) {
                await query(
                    `DELETE FROM student_fee_groups WHERE student_id = $1 AND fee_group_id = $2 AND session_id = $3`,
                    [studentId, feeGroupId, sessionId]
                );
            }
            return NextResponse.json({ success: true, removed: resolvedStudentIds.length });
        }

        // Default: assign (upsert — skip if already assigned)
        let assignedCount = 0;
        for (const studentId of resolvedStudentIds) {
            const result = await query(
                `INSERT INTO student_fee_groups (student_id, fee_group_id, session_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (student_id, fee_group_id, session_id) DO NOTHING`,
                [studentId, feeGroupId, sessionId]
            );
            assignedCount++;
        }

        return NextResponse.json({ success: true, assigned: assignedCount });
    } catch (error) {
        console.error('Error assigning student groups:', error);
        return NextResponse.json({ error: 'Failed to assign groups' }, { status: 500 });
    }
}

// DELETE: Unassign a student from a fee group
export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
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

// PUT: Bulk update a single student's fee groups (sync)
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    try {
        const { studentId, feeGroupIds, sessionId } = await request.json();

        if (!studentId || !sessionId || !Array.isArray(feeGroupIds)) {
            return NextResponse.json({ error: 'studentId, feeGroupIds (array), and sessionId required' }, { status: 400 });
        }

        // Remove all existing
        await query(
            `DELETE FROM student_fee_groups WHERE student_id = $1 AND session_id = $2`,
            [studentId, sessionId]
        );

        // Insert new ones
        let assignedCount = 0;
        for (const feeGroupId of feeGroupIds) {
            await query(
                `INSERT INTO student_fee_groups (student_id, fee_group_id, session_id)
                 VALUES ($1, $2, $3)`,
                [studentId, feeGroupId, sessionId]
            );
            assignedCount++;
        }

        return NextResponse.json({ success: true, assigned: assignedCount });
    } catch (error) {
        console.error('Error syncing student groups:', error);
        return NextResponse.json({ error: 'Failed to sync student groups' }, { status: 500 });
    }
}
