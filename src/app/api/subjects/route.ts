import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface SubjectRow {
    id: string;
    code: string;
    name: string;
    subject_type: string;
    department_id: string;
    department_name: string;
    department_code: string;
    semester: number;
    credits: number;
    created_at: string;
}

// GET - List all subjects
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const departmentId = searchParams.get('departmentId');
        const semester = searchParams.get('semester');

        let queryStr = `
            SELECT s.*, 
                   d.name as department_name, d.code as department_code
            FROM subjects s
            LEFT JOIN departments d ON d.id = s.department_id
            WHERE 1=1
        `;
        const params: (string | number)[] = [];

        // HODs can only see subjects from their department
        if (payload.role === 'hod' && payload.departmentId) {
            params.push(payload.departmentId);
            queryStr += ` AND s.department_id = $${params.length}`;
        }

        if (departmentId) {
            params.push(departmentId);
            queryStr += ` AND s.department_id = $${params.length}`;
        }

        if (semester) {
            params.push(parseInt(semester));
            queryStr += ` AND s.semester = $${params.length}`;
        }

        queryStr += ' ORDER BY s.code ASC';

        const subjects = await query<SubjectRow>(queryStr, params);

        return NextResponse.json({
            subjects: subjects.map(s => ({
                id: s.id,
                code: s.code,
                name: s.name,
                subjectType: s.subject_type,
                departmentId: s.department_id,
                departmentName: s.department_name,
                departmentCode: s.department_code,
                semester: s.semester,
                credits: s.credits,
                createdAt: s.created_at
            }))
        });
    } catch (error) {
        console.error('Get subjects error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST - Create new subject (supports multiple semesters)
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // Only super_admin and hod can create subjects
        if (!['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { code, name, subjectType, departmentId, semesters, semester, credits } = await request.json();

        // Support both single semester (legacy) and multi-semesters
        const semesterList: number[] = semesters || (semester ? [parseInt(semester)] : []);

        if (!code || !name || !subjectType || semesterList.length === 0 || !departmentId) {
            return NextResponse.json({ error: 'Code, name, subject type, department, and at least one semester are required' }, { status: 400 });
        }

        // Verify department exists
        const deptCheck = await query<{ id: string }>('SELECT id FROM departments WHERE id = $1', [departmentId]);
        if (deptCheck.length === 0) {
            return NextResponse.json({ error: 'Invalid department' }, { status: 400 });
        }

        // Create entries for each semester
        const createdIds: string[] = [];
        for (const sem of semesterList) {
            // Check if this combination already exists
            const existing = await query<{ id: string }>(
                'SELECT id FROM subjects WHERE code = $1 AND department_id = $2 AND semester = $3',
                [code, departmentId, sem]
            );

            if (existing.length === 0) {
                const result = await query<{ id: string }>(
                    `INSERT INTO subjects (code, name, subject_type, department_id, semester, credits)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     RETURNING id`,
                    [code, name, subjectType, departmentId, sem, credits || 3]
                );
                createdIds.push(result[0].id);
            }
        }

        return NextResponse.json({
            message: `Subject created for ${createdIds.length} semester(s)`,
            ids: createdIds,
            count: createdIds.length
        }, { status: 201 });
    } catch (error) {
        console.error('Create subject error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT - Update subject (supports semester sync for grouped subjects)
export async function PUT(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        if (!['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { id, code, name, subjectType, semesters, semester, credits, oldCode, departmentId } = await request.json();

        if (!id && !oldCode) {
            return NextResponse.json({ error: 'Subject ID or code required' }, { status: 400 });
        }

        // If semesters array is provided, do a sync operation
        if (semesters && Array.isArray(semesters) && semesters.length > 0) {
            // Get the department_id from the reference subject
            let refDepartmentId = departmentId;
            if (!refDepartmentId && id) {
                const refSubject = await query<{ department_id: string, code: string }>(
                    'SELECT department_id, code FROM subjects WHERE id = $1',
                    [id]
                );
                if (refSubject.length > 0) {
                    refDepartmentId = refSubject[0].department_id;
                }
            }

            if (!refDepartmentId) {
                return NextResponse.json({ error: 'Could not determine department' }, { status: 400 });
            }

            const subjectCode = code || oldCode;

            // Get existing semesters for this subject code + department
            const existingEntries = await query<{ id: string, semester: number }>(
                'SELECT id, semester FROM subjects WHERE code = $1 AND department_id = $2',
                [oldCode || subjectCode, refDepartmentId]
            );
            const existingSemesters = existingEntries.map(e => e.semester);

            // Semesters to add
            const semestersToAdd = semesters.filter((s: number) => !existingSemesters.includes(s));

            // Semesters to remove  
            const semestersToRemove = existingSemesters.filter(s => !semesters.includes(s));

            // Add new semester entries
            for (const sem of semestersToAdd) {
                await query(
                    `INSERT INTO subjects (code, name, subject_type, department_id, semester, credits)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [subjectCode, name, subjectType, refDepartmentId, sem, credits || 3]
                );
            }

            // Remove unchecked semesters (only if no attendance records)
            for (const sem of semestersToRemove) {
                const entry = existingEntries.find(e => e.semester === sem);
                if (entry) {
                    // Check for attendance records
                    const attendanceCheck = await query<{ count: string }>(
                        'SELECT COUNT(*) as count FROM attendance_records WHERE subject_id = $1',
                        [entry.id]
                    );

                    if (parseInt(attendanceCheck[0].count) === 0) {
                        await query('DELETE FROM teacher_subjects WHERE subject_id = $1', [entry.id]);
                        await query('DELETE FROM student_subjects WHERE subject_id = $1', [entry.id]);
                        await query('DELETE FROM subjects WHERE id = $1', [entry.id]);
                    }
                }
            }

            // Update common fields for all remaining entries
            const remainingSemesters = semesters.filter((s: number) => existingSemesters.includes(s));
            for (const sem of remainingSemesters) {
                const entry = existingEntries.find(e => e.semester === sem);
                if (entry) {
                    await query(
                        `UPDATE subjects SET code = $1, name = $2, subject_type = $3, credits = $4, updated_at = CURRENT_TIMESTAMP 
                         WHERE id = $5`,
                        [subjectCode, name, subjectType, credits || 3, entry.id]
                    );
                }
            }

            return NextResponse.json({
                message: 'Subject updated successfully',
                added: semestersToAdd.length,
                removed: semestersToRemove.length
            });
        }

        // Legacy single-update mode
        if (!id) {
            return NextResponse.json({ error: 'Subject ID required' }, { status: 400 });
        }

        const updateFields: string[] = [];
        const params: (string | number)[] = [id];
        let paramCount = 1;

        if (code) { updateFields.push(`code = $${++paramCount}`); params.push(code); }
        if (name) { updateFields.push(`name = $${++paramCount}`); params.push(name); }
        if (subjectType) { updateFields.push(`subject_type = $${++paramCount}`); params.push(subjectType); }
        if (semester) { updateFields.push(`semester = $${++paramCount}`); params.push(parseInt(semester)); }
        if (credits) { updateFields.push(`credits = $${++paramCount}`); params.push(parseInt(credits)); }

        if (updateFields.length === 0) {
            return NextResponse.json({ message: 'No fields to update' });
        }

        await query(
            `UPDATE subjects SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            params
        );

        return NextResponse.json({ message: 'Subject updated successfully' });
    } catch (error) {
        console.error('Update subject error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE - Delete subject (supports deleting all semester entries for a grouped subject)
export async function DELETE(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // Only super_admin and hod can delete subjects
        if (!['super_admin', 'hod'].includes(payload.role)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const code = searchParams.get('code');
        const departmentId = searchParams.get('departmentId');

        // Support deleting by code+departmentId (all semesters) or by single id
        let subjectIds: string[] = [];

        if (code && departmentId) {
            // Delete all semester entries for this subject
            const entries = await query<{ id: string }>(
                'SELECT id FROM subjects WHERE code = $1 AND department_id = $2',
                [code, departmentId]
            );
            subjectIds = entries.map(e => e.id);
        } else if (id) {
            subjectIds = [id];
        } else {
            return NextResponse.json({ error: 'Subject ID or code+departmentId required' }, { status: 400 });
        }

        if (subjectIds.length === 0) {
            return NextResponse.json({ error: 'No subjects found' }, { status: 404 });
        }

        // For HOD, verify all subjects belong to their department
        if (payload.role === 'hod' && payload.departmentId) {
            for (const subId of subjectIds) {
                const subjectCheck = await query<{ department_id: string }>(
                    'SELECT department_id FROM subjects WHERE id = $1',
                    [subId]
                );

                if (subjectCheck.length === 0) {
                    return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
                }

                if (subjectCheck[0].department_id !== payload.departmentId) {
                    return NextResponse.json({ error: 'Access denied - subject not in your department' }, { status: 403 });
                }
            }
        }

        // Check for related attendance records for all subjects
        for (const subId of subjectIds) {
            const attendanceCheck = await query<{ count: string }>(
                'SELECT COUNT(*) as count FROM attendance_records WHERE subject_id = $1',
                [subId]
            );

            if (parseInt(attendanceCheck[0].count) > 0) {
                return NextResponse.json({
                    error: 'Cannot delete subject with attendance records. Please delete attendance records first.'
                }, { status: 400 });
            }
        }

        // Delete all entries
        for (const subId of subjectIds) {
            await query('DELETE FROM teacher_subjects WHERE subject_id = $1', [subId]);
            await query('DELETE FROM student_subjects WHERE subject_id = $1', [subId]);
            await query('DELETE FROM subjects WHERE id = $1', [subId]);
        }

        return NextResponse.json({
            message: `Subject deleted successfully (${subjectIds.length} semester entries)`,
            deletedCount: subjectIds.length
        });
    } catch (error) {
        console.error('Delete subject error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
