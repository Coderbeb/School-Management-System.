import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface SubjectRow {
    id: string;
    code: string;
    name: string;
    description: string | null;
    is_active: boolean;
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
        const { role } = payload;

        const classSectionId = searchParams.get('classSectionId');
        const classId = searchParams.get('classId');

        let queryStr = `
            SELECT s.id, s.code, s.name, s.description, s.is_active, s.created_at
            FROM subjects s
            WHERE s.is_active = true
        `;
        const params: (string | number)[] = [];

        // Filter by classSectionId → find subjects via teacher_assignments
        if (classSectionId) {
            params.push(classSectionId);
            queryStr = `
                SELECT DISTINCT s.id, s.code, s.name, s.description, s.is_active, s.created_at
                FROM subjects s
                JOIN teacher_assignments ta ON s.id = ta.subject_id
                WHERE s.is_active = true AND ta.class_section_id = $${params.length}
            `;
        } else if (classId) {
            params.push(classId);
            queryStr = `
                SELECT DISTINCT s.id, s.code, s.name, s.description, s.is_active, s.created_at
                FROM subjects s
                JOIN teacher_assignments ta ON s.id = ta.subject_id
                JOIN class_sections cs ON ta.class_section_id = cs.id
                WHERE s.is_active = true AND cs.class_id = $${params.length}
            `;
        }

        // Teacher: only show assigned subjects
        if (role === 'teacher') {
            const teacherId = payload.userId;

            const teacherSubjects = await query<{ subject_id: string }>(
                'SELECT DISTINCT subject_id FROM teacher_assignments WHERE teacher_id = $1 AND subject_id IS NOT NULL',
                [teacherId]
            );

            if (teacherSubjects.length === 0) {
                return NextResponse.json({ subjects: [] });
            }

            const subjectIds = teacherSubjects.map(ts => ts.subject_id);
            const placeholders = subjectIds.map((_, i) => `$${params.length + i + 1}`).join(',');
            queryStr += ` AND s.id IN (${placeholders})`;
            params.push(...subjectIds);
        }



        queryStr += ' ORDER BY s.code ASC';

        const subjects = await query<SubjectRow>(queryStr, params);

        return NextResponse.json({
            subjects: subjects.map(s => ({
                id: s.id,
                code: s.code,
                name: s.name,
                description: s.description || '',
                isActive: s.is_active,
                createdAt: s.created_at
            }))
        });
    } catch (error) {
        console.error('Get subjects error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST - Create new subject
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const body = await request.json();
        const code = body.code?.trim();
        const paperCode = body.paperCode?.trim() || null;
        const name = body.name?.trim();
        const degreeType = body.degreeType;
        const degreeTypes = body.degreeTypes;
        const semesters = body.semesters;
        const semester = body.semester;
        const credits = body.credits;

        // Support both single and multi-semesters
        const semesterList: number[] = semesters || (semester ? [parseInt(semester)] : []);
        // Support both single and multi degreeTypes
        const degreeTypeList: string[] = degreeTypes || (degreeType ? [degreeType] : []);

        if (!code || !name || semesterList.length === 0 || degreeTypeList.length === 0) {
            return NextResponse.json({ error: 'Code, name, degree type(s), and at least one semester are required' }, { status: 400 });
        }

        if (code.length > 20 || name.length > 100) {
            return NextResponse.json({ error: 'Code must be under 20 characters, name under 100' }, { status: 400 });
        }

        const validDegreeTypes = ['ba', 'bsc', 'bcom', 'bca', 'it', 'bba', 'mcom'];
        for (const dt of degreeTypeList) {
            if (!validDegreeTypes.includes(dt)) {
                return NextResponse.json({ error: `Invalid degree type: ${dt}` }, { status: 400 });
            }
        }

        const createdIds: string[] = [];
        for (const dt of degreeTypeList) {
            // Check if subject with this code+degree_type already exists
            const existing = await query<{ id: string }>(
                'SELECT id FROM subjects WHERE code = $1 AND degree_type = $2',
                [code, dt]
            );

            let subjectId: string;
            if (existing.length > 0) {
                // Subject exists, just add new semesters
                subjectId = existing[0].id;
                // Update name/credits/paperCode if changed
                await query(
                    'UPDATE subjects SET name = $1, paper_code = $2, credits = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
                    [name, paperCode, credits || 3, subjectId]
                );
            } else {
                // Create new subject
                const result = await query<{ id: string }>(
                    `INSERT INTO subjects (code, paper_code, name, degree_type, credits)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING id`,
                    [code, paperCode, name, dt, credits || 3]
                );
                subjectId = result[0].id;
            }

            // Add semester entries
            for (const sem of semesterList) {
                await query(
                    `INSERT INTO subject_semesters (subject_id, semester)
                     VALUES ($1, $2)
                     ON CONFLICT (subject_id, semester) DO NOTHING`,
                    [subjectId, sem]
                );
            }

            createdIds.push(subjectId);
        }

        return NextResponse.json({
            message: `Subject created for ${createdIds.length} degree type(s)`,
            ids: createdIds,
            count: createdIds.length
        }, { status: 201 });
    } catch (error) {
        console.error('Create subject error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT - Update subject
export async function PUT(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { id, code, paperCode, name, semesters, credits, oldCode, oldDegreeType, newDegreeType, degreeType } = await request.json();

        if (!id && !oldCode) {
            return NextResponse.json({ error: 'Subject ID or code required' }, { status: 400 });
        }

        // Determine the subject to update
        let subjectId = id;
        const sourceDegreeType = oldDegreeType || degreeType;

        if (!subjectId && oldCode && sourceDegreeType) {
            const found = await query<{ id: string }>(
                'SELECT id FROM subjects WHERE code = $1 AND degree_type = $2',
                [oldCode, sourceDegreeType]
            );
            if (found.length > 0) {
                subjectId = found[0].id;
            } else {
                return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
            }
        }

        if (!subjectId) {
            return NextResponse.json({ error: 'Could not identify subject' }, { status: 400 });
        }

        // Get current subject info
        const currentSubject = await query<{ id: string; code: string; degree_type: string }>(
            'SELECT id, code, degree_type FROM subjects WHERE id = $1',
            [subjectId]
        );
        if (currentSubject.length === 0) {
            return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
        }

        const targetDegreeType = newDegreeType || degreeType || currentSubject[0].degree_type;
        const degreeTypeChanged = targetDegreeType !== currentSubject[0].degree_type;

        // Handle degree type change
        if (degreeTypeChanged) {
            // Check for attendance records
            const attendanceCheck = await query<{ count: string }>(
                'SELECT COUNT(*) as count FROM attendance_records WHERE subject_id = $1',
                [subjectId]
            );
            if (parseInt(attendanceCheck[0].count) > 0) {
                return NextResponse.json({
                    error: 'Cannot change degree type: subject has attendance records. Delete attendance first.'
                }, { status: 400 });
            }

            // Check if target code+degree_type already exists
            const finalCode = code || currentSubject[0].code;
            const existingTarget = await query<{ id: string }>(
                'SELECT id FROM subjects WHERE code = $1 AND degree_type = $2 AND id != $3',
                [finalCode, targetDegreeType, subjectId]
            );
            if (existingTarget.length > 0) {
                return NextResponse.json({
                    error: `Subject with code "${finalCode}" already exists for degree type "${targetDegreeType}"`
                }, { status: 400 });
            }
        }

        // Handle code change — check unique constraint
        if (code && code !== currentSubject[0].code) {
            const existingCode = await query<{ id: string }>(
                'SELECT id FROM subjects WHERE code = $1 AND degree_type = $2 AND id != $3',
                [code, targetDegreeType, subjectId]
            );
            if (existingCode.length > 0) {
                return NextResponse.json({
                    error: `Subject with code "${code}" already exists for this degree type`
                }, { status: 400 });
            }
        }

        // Update subject fields
        const updateFields: string[] = [];
        const params: (string | number)[] = [subjectId];
        let paramCount = 1;

        if (code) { updateFields.push(`code = $${++paramCount}`); params.push(code); }
        if (paperCode !== undefined) { updateFields.push(`paper_code = $${++paramCount}`); params.push(paperCode?.trim() || null); }
        if (name) { updateFields.push(`name = $${++paramCount}`); params.push(name); }
        if (credits) { updateFields.push(`credits = $${++paramCount}`); params.push(parseInt(credits)); }
        if (degreeTypeChanged) { updateFields.push(`degree_type = $${++paramCount}`); params.push(targetDegreeType); }

        if (updateFields.length > 0) {
            await query(
                `UPDATE subjects SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                params
            );
        }

        // Sync semesters if provided
        if (semesters && Array.isArray(semesters) && semesters.length > 0) {
            // Get current semesters
            const currentSemesters = await query<{ semester: number }>(
                'SELECT semester FROM subject_semesters WHERE subject_id = $1',
                [subjectId]
            );
            const existingSemesters = currentSemesters.map(s => s.semester);

            // Add new semesters
            const semestersToAdd = semesters.filter((s: number) => !existingSemesters.includes(s));
            for (const sem of semestersToAdd) {
                await query(
                    'INSERT INTO subject_semesters (subject_id, semester) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [subjectId, sem]
                );
            }

            // Remove unchecked semesters
            const semestersToRemove = existingSemesters.filter(s => !semesters.includes(s));
            for (const sem of semestersToRemove) {
                await query(
                    'DELETE FROM subject_semesters WHERE subject_id = $1 AND semester = $2',
                    [subjectId, sem]
                );
            }
        }

        return NextResponse.json({
            message: 'Subject updated successfully',
            degreeTypeChanged
        });
    } catch (error) {
        console.error('Update subject error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE - Delete subject
export async function DELETE(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const code = searchParams.get('code');
        const degreeType = searchParams.get('degreeType');

        let subjectId: string | null = null;

        if (code && degreeType) {
            const found = await query<{ id: string }>(
                'SELECT id FROM subjects WHERE code = $1 AND degree_type = $2',
                [code, degreeType]
            );
            if (found.length > 0) subjectId = found[0].id;
        } else if (id) {
            subjectId = id;
        } else {
            return NextResponse.json({ error: 'Subject ID or code+degreeType required' }, { status: 400 });
        }

        if (!subjectId) {
            return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
        }

        // Check for attendance records
        const attendanceCheck = await query<{ count: string }>(
            'SELECT COUNT(*) as count FROM attendance_records WHERE subject_id = $1',
            [subjectId]
        );

        if (parseInt(attendanceCheck[0].count) > 0) {
            return NextResponse.json({
                error: 'Cannot delete subject with attendance records. Please delete attendance records first.'
            }, { status: 400 });
        }

        // Delete related data first, then subject (CASCADE handles subject_semesters)
        await query('DELETE FROM teacher_assignments WHERE subject_id = $1', [subjectId]);
        await query('DELETE FROM student_subjects WHERE subject_id = $1', [subjectId]);
        await query('DELETE FROM subjects WHERE id = $1', [subjectId]);

        return NextResponse.json({
            message: 'Subject deleted successfully'
        });
    } catch (error) {
        console.error('Delete subject error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
