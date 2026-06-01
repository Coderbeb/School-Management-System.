import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * POST /api/fees/auto-assign — Auto-assign default fee groups to students
 * 
 * Scans all fee groups with is_default=true, matches by apply_to scope,
 * and creates student_fee_groups records for students missing them.
 * 
 * Body: { sessionId, preview?: boolean, studentId?: string }
 * - preview=true: returns what WOULD be assigned without doing it
 * - studentId: if provided, only process this single student (used on enrollment)
 */
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { sessionId, preview, studentId } = await request.json();

        if (!sessionId) {
            return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }

        // 1. Fetch all default fee groups for this school
        const defaultGroups = await query<any>(
            `SELECT id, name, apply_to, target_class_ids, is_active
             FROM fee_groups 
             WHERE school_id = $1 AND is_default = true AND is_active = true
             ORDER BY display_order ASC, name ASC`,
            [schoolId]
        );

        if (defaultGroups.length === 0) {
            return NextResponse.json({ 
                message: 'No default fee groups configured. Mark groups as "Auto-Assign" first.',
                assignments: [],
                totalAssigned: 0
            });
        }

        // 2. Fetch all enrolled students (or a single student)
        let studentsSql = `
            SELECT s.id as student_id, s.first_name, s.last_name, s.admission_number,
                   c.id as class_id, c.name as class_name
            FROM students s
            JOIN student_enrollments se ON se.student_id = s.id AND se.session_id = $1 AND se.status = 'active'
            JOIN class_sections cs ON se.class_section_id = cs.id
            JOIN classes c ON cs.class_id = c.id
            WHERE s.school_id = $2
        `;
        const studentsParams: unknown[] = [sessionId, schoolId];

        if (studentId) {
            studentsSql += ` AND s.id = $3`;
            studentsParams.push(studentId);
        }

        studentsSql += ` ORDER BY c.display_order ASC, s.first_name ASC`;
        const students = await query<any>(studentsSql, studentsParams);

        if (students.length === 0) {
            return NextResponse.json({
                message: 'No enrolled students found for this session.',
                assignments: [],
                totalAssigned: 0
            });
        }

        // 3. Fetch existing assignments to avoid duplicates
        const existingSql = `
            SELECT student_id, fee_group_id
            FROM student_fee_groups
            WHERE session_id = $1
        `;
        const existing = await query<any>(existingSql, [sessionId]);
        const existingSet = new Set(
            existing.map((e: any) => `${e.student_id}__${e.fee_group_id}`)
        );

        // 4. Calculate assignments
        const pendingAssignments: { studentId: string; studentName: string; className: string; groupId: string; groupName: string }[] = [];

        for (const student of students) {
            for (const group of defaultGroups) {
                // Check scope
                let shouldAssign = false;

                if (group.apply_to === 'all') {
                    shouldAssign = true;
                } else if (group.apply_to === 'specific_classes') {
                    // Parse target_class_ids
                    let targetIds: string[] = [];
                    if (Array.isArray(group.target_class_ids)) {
                        targetIds = group.target_class_ids;
                    } else if (typeof group.target_class_ids === 'string') {
                        targetIds = group.target_class_ids.replace(/[{}]/g, '').split(',').filter(Boolean);
                    }
                    shouldAssign = targetIds.includes(student.class_id);
                }
                // 'individual' scope groups are never auto-assigned

                if (!shouldAssign) continue;

                // Check if already assigned
                const key = `${student.student_id}__${group.id}`;
                if (existingSet.has(key)) continue;

                pendingAssignments.push({
                    studentId: student.student_id,
                    studentName: `${student.first_name} ${student.last_name}`,
                    className: student.class_name,
                    groupId: group.id,
                    groupName: group.name,
                });
            }
        }

        // 5. Preview mode — just return what would be assigned
        if (preview) {
            // Group by fee group for summary
            const groupSummary: Record<string, { groupName: string; count: number; classes: Set<string> }> = {};
            for (const a of pendingAssignments) {
                if (!groupSummary[a.groupId]) {
                    groupSummary[a.groupId] = { groupName: a.groupName, count: 0, classes: new Set() };
                }
                groupSummary[a.groupId].count++;
                groupSummary[a.groupId].classes.add(a.className);
            }

            const summary = Object.entries(groupSummary).map(([groupId, data]) => ({
                groupId,
                groupName: data.groupName,
                studentCount: data.count,
                classes: Array.from(data.classes),
            }));

            return NextResponse.json({
                preview: true,
                totalAssignments: pendingAssignments.length,
                totalStudents: new Set(pendingAssignments.map(a => a.studentId)).size,
                summary,
                assignments: pendingAssignments.slice(0, 100), // Limit detail list
            });
        }

        // 6. Execute assignments
        let assignedCount = 0;
        for (const a of pendingAssignments) {
            await query(
                `INSERT INTO student_fee_groups (student_id, fee_group_id, session_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (student_id, fee_group_id, session_id) DO NOTHING`,
                [a.studentId, a.groupId, sessionId]
            );
            assignedCount++;
        }

        return NextResponse.json({
            success: true,
            message: `Successfully assigned ${assignedCount} fee group(s) to students.`,
            totalAssigned: assignedCount,
            totalStudents: new Set(pendingAssignments.map(a => a.studentId)).size,
        });
    } catch (error) {
        console.error('Error auto-assigning fee groups:', error);
        return NextResponse.json({ error: 'Failed to auto-assign fee groups' }, { status: 500 });
    }
}
