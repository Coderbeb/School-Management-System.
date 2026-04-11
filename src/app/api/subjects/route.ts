import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface SubjectRow {
    id: string;
    code: string;
    name: string;
    degree_type: string;
    paper_code: string | null;
    credits: number;
    created_at: string;
    semesters: number[] | null;
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
        const degreeType = searchParams.get('degreeType');
        const semester = searchParams.get('semester');
        const reqDepartmentId = searchParams.get('departmentId');

        let filterDegreeType = degreeType;
        if (reqDepartmentId) {
             const deptResult = await query<{ degree_type: string }>(
                 'SELECT degree_type FROM departments WHERE id = $1',
                 [reqDepartmentId]
             );
             if (deptResult.length > 0 && deptResult[0].degree_type) {
                 filterDegreeType = deptResult[0].degree_type;
             }
        }

        const { role, departmentId } = payload;

        let queryStr = `
            SELECT s.id, s.code, s.paper_code, s.name, s.degree_type, s.credits, s.created_at,
                   COALESCE(
                       (SELECT array_agg(ss.semester ORDER BY ss.semester)
                        FROM subject_semesters ss WHERE ss.subject_id = s.id),
                       ARRAY[]::integer[]
                   ) as semesters
            FROM subjects s
            WHERE 1=1
        `;
        const params: (string | number)[] = [];

        // HOD: filter by their departments' degree_types
        if (role === 'hod') {
            let deptQuery = `
                SELECT d.degree_type 
                FROM departments d 
                JOIN user_departments ud ON d.id = ud.department_id 
                WHERE ud.user_id = $1
            `;
            const deptParams: any[] = [payload.userId];
            
            if (payload.departmentId) {
                deptQuery += ` UNION SELECT degree_type FROM departments WHERE id = $2`;
                deptParams.push(payload.departmentId);
            }
            
            const deptResult = await query<{ degree_type: string }>(deptQuery, deptParams);
            const degreeTypes = [...new Set(deptResult.map(d => d.degree_type))].filter(Boolean);
            
            if (degreeTypes.length > 0) {
                const placeholders = degreeTypes.map((_, i) => `$${params.length + i + 1}`).join(',');
                queryStr += ` AND s.degree_type IN (${placeholders})`;
                params.push(...degreeTypes);
            } else {
                // Return no subjects if they have no degree types assigned somehow
                queryStr += ` AND 1=0`;
            }
        }

        // Filter by specific degree type if resolved
        if (filterDegreeType) {
            params.push(filterDegreeType);
            queryStr += ` AND s.degree_type = $${params.length}`;
        }

        // Teacher: only show assigned subjects
        if (role === 'teacher') {
            const teacherId = payload.userId;

            const teacherSubjects = await query<{ subject_id: string }>(
                'SELECT subject_id FROM teacher_subjects WHERE teacher_id = $1',
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

        // Filter by semester (subjects that include this semester)
        if (semester) {
            params.push(parseInt(semester));
            queryStr += ` AND EXISTS (SELECT 1 FROM subject_semesters ss WHERE ss.subject_id = s.id AND ss.semester = $${params.length})`;
        }

        queryStr += ' ORDER BY s.code ASC';

        const subjects = await query<SubjectRow>(queryStr, params);

        return NextResponse.json({
            subjects: subjects.map(s => ({
                id: s.id,
                code: s.code,
                paperCode: s.paper_code || '',
                name: s.name,
                degreeType: s.degree_type,
                semesters: s.semesters || [],
                credits: s.credits,
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
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        if (!['super_admin', 'hod'].includes(payload.role)) {
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
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        if (!['super_admin', 'hod'].includes(payload.role)) {
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
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        if (!['super_admin', 'hod'].includes(payload.role)) {
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
        await query('DELETE FROM teacher_subjects WHERE subject_id = $1', [subjectId]);
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
