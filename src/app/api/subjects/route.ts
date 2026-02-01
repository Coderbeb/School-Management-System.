import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface SubjectRow {
    id: string;
    code: string;
    name: string;
    degree_type: string;
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
        const degreeType = searchParams.get('degreeType');
        const semester = searchParams.get('semester');

        const { role, departmentId } = payload;

        let queryStr = `
            SELECT s.* 
            FROM subjects s
            WHERE 1=1
        `;
        const params: (string | number)[] = [];

        // HOD: filter by their department's degree_type
        if (role === 'hod' && departmentId) {
            // Get HOD's department degree_type
            const deptResult = await query<{ degree_type: string }>(
                'SELECT degree_type FROM departments WHERE id = $1',
                [departmentId]
            );
            if (deptResult.length > 0) {
                params.push(deptResult[0].degree_type);
                queryStr += ` AND s.degree_type = $${params.length}`;
            }
        }

        // Filter by degree type if provided (overrides HOD filter if super_admin)
        if (degreeType && role === 'super_admin') {
            params.push(degreeType);
            queryStr += ` AND s.degree_type = $${params.length}`;
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
                degreeType: s.degree_type,
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

        const { code, name, degreeType, degreeTypes, semesters, semester, credits } = await request.json();

        // Support both single semester (legacy) and multi-semesters
        const semesterList: number[] = semesters || (semester ? [parseInt(semester)] : []);

        // Support both single degreeType (legacy) and multi-degreeTypes
        const degreeTypeList: string[] = degreeTypes || (degreeType ? [degreeType] : []);

        if (!code || !name || semesterList.length === 0 || degreeTypeList.length === 0) {
            return NextResponse.json({ error: 'Code, name, degree type(s), and at least one semester are required' }, { status: 400 });
        }

        // Validate degree types
        const validDegreeTypes = ['ba', 'bsc', 'bcom', 'it', 'bba', 'mcom'];
        for (const dt of degreeTypeList) {
            if (!validDegreeTypes.includes(dt)) {
                return NextResponse.json({ error: `Invalid degree type: ${dt}` }, { status: 400 });
            }
        }

        // Create entries for each semester and degree type combination
        const createdIds: string[] = [];
        for (const dt of degreeTypeList) {
            for (const sem of semesterList) {
                // Check if this combination already exists
                const existing = await query<{ id: string }>(
                    'SELECT id FROM subjects WHERE code = $1 AND degree_type = $2 AND semester = $3',
                    [code, dt, sem]
                );

                if (existing.length === 0) {
                    const result = await query<{ id: string }>(
                        `INSERT INTO subjects (code, name, degree_type, semester, credits)
                         VALUES ($1, $2, $3, $4, $5)
                         RETURNING id`,
                        [code, name, dt, sem, credits || 3]
                    );
                    createdIds.push(result[0].id);
                }
            }
        }

        return NextResponse.json({
            message: `Subject created for ${createdIds.length} semester/degree-type combination(s)`,
            ids: createdIds,
            count: createdIds.length
        }, { status: 201 });
    } catch (error) {
        console.error('Create subject error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT - Update subject (supports semester sync and degree type changes)
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

        const { id, code, name, semesters, semester, credits, oldCode, oldDegreeType, newDegreeType, degreeType } = await request.json();

        if (!id && !oldCode) {
            return NextResponse.json({ error: 'Subject ID or code required' }, { status: 400 });
        }

        // If semesters array is provided, do a sync operation
        if (semesters && Array.isArray(semesters) && semesters.length > 0) {
            // Determine old and new degree types
            const sourceDegreeType = oldDegreeType || degreeType;
            const targetDegreeType = newDegreeType || degreeType || sourceDegreeType;

            // Get the source degree_type from the reference subject if not provided
            let refDegreeType = sourceDegreeType;
            if (!refDegreeType && id) {
                const refSubject = await query<{ degree_type: string, code: string }>(
                    'SELECT degree_type, code FROM subjects WHERE id = $1',
                    [id]
                );
                if (refSubject.length > 0) {
                    refDegreeType = refSubject[0].degree_type;
                }
            }

            if (!refDegreeType) {
                return NextResponse.json({ error: 'Could not determine degree type' }, { status: 400 });
            }

            const subjectCode = code || oldCode;
            const degreeTypeChanged = targetDegreeType && targetDegreeType !== refDegreeType;

            // Get existing semesters for this subject code + source degree_type
            const existingEntries = await query<{ id: string, semester: number }>(
                'SELECT id, semester FROM subjects WHERE code = $1 AND degree_type = $2',
                [oldCode || subjectCode, refDegreeType]
            );
            const existingSemesters = existingEntries.map(e => e.semester);

            if (degreeTypeChanged) {
                // Degree type is changing - need to delete old entries and create new ones
                // First check if any have attendance records
                for (const entry of existingEntries) {
                    const attendanceCheck = await query<{ count: string }>(
                        'SELECT COUNT(*) as count FROM attendance_records WHERE subject_id = $1',
                        [entry.id]
                    );
                    if (parseInt(attendanceCheck[0].count) > 0) {
                        return NextResponse.json({
                            error: 'Cannot change degree type: subject has attendance records. Delete attendance first.'
                        }, { status: 400 });
                    }
                }

                // Delete old entries
                for (const entry of existingEntries) {
                    await query('DELETE FROM teacher_subjects WHERE subject_id = $1', [entry.id]);
                    await query('DELETE FROM student_subjects WHERE subject_id = $1', [entry.id]);
                    await query('DELETE FROM subjects WHERE id = $1', [entry.id]);
                }

                // Create new entries with new degree type
                const createdIds: string[] = [];
                for (const sem of semesters) {
                    const result = await query<{ id: string }>(
                        `INSERT INTO subjects (code, name, degree_type, semester, credits)
                         VALUES ($1, $2, $3, $4, $5)
                         RETURNING id`,
                        [subjectCode, name, targetDegreeType, sem, credits || 3]
                    );
                    createdIds.push(result[0].id);
                }

                return NextResponse.json({
                    message: 'Subject degree type updated successfully',
                    degreeTypeChanged: true,
                    newDegreeType: targetDegreeType,
                    count: createdIds.length
                });
            }

            // Degree type not changing - just sync semesters
            const codeChanged = oldCode && code && oldCode !== code;

            // If code changed, first update all existing entries to new code
            if (codeChanged) {
                // Check for unique constraint - make sure new code doesn't already exist
                const existingWithNewCode = await query<{ id: string }>(
                    'SELECT id FROM subjects WHERE code = $1 AND degree_type = $2',
                    [code, refDegreeType]
                );
                if (existingWithNewCode.length > 0) {
                    return NextResponse.json({
                        error: `Subject with code "${code}" already exists for this degree type`
                    }, { status: 400 });
                }

                // Update all existing entries with new code
                for (const entry of existingEntries) {
                    await query(
                        `UPDATE subjects SET code = $1, name = $2, credits = $3, updated_at = CURRENT_TIMESTAMP 
                         WHERE id = $4`,
                        [code, name, credits || 3, entry.id]
                    );
                }
            }

            // Use the final code for new entries
            const finalCode = code || oldCode;

            // Semesters to add (for entries that don't already exist)
            const semestersToAdd = semesters.filter((s: number) => !existingSemesters.includes(s));

            // Semesters to remove  
            const semestersToRemove = existingSemesters.filter(s => !semesters.includes(s));

            // Add new semester entries
            for (const sem of semestersToAdd) {
                await query(
                    `INSERT INTO subjects (code, name, degree_type, semester, credits)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [finalCode, name, refDegreeType, sem, credits || 3]
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

            // Update common fields for all remaining entries (if code didn't change - already updated above)
            if (!codeChanged) {
                const remainingSemesters = semesters.filter((s: number) => existingSemesters.includes(s));
                for (const sem of remainingSemesters) {
                    const entry = existingEntries.find(e => e.semester === sem);
                    if (entry) {
                        await query(
                            `UPDATE subjects SET code = $1, name = $2, credits = $3, updated_at = CURRENT_TIMESTAMP 
                             WHERE id = $4`,
                            [finalCode, name, credits || 3, entry.id]
                        );
                    }
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
        const degreeType = searchParams.get('degreeType');

        // Support deleting by code+degreeType (all semesters) or by single id
        let subjectIds: string[] = [];

        if (code && degreeType) {
            // Delete all semester entries for this subject
            const entries = await query<{ id: string }>(
                'SELECT id FROM subjects WHERE code = $1 AND degree_type = $2',
                [code, degreeType]
            );
            subjectIds = entries.map(e => e.id);
        } else if (id) {
            subjectIds = [id];
        } else {
            return NextResponse.json({ error: 'Subject ID or code+degreeType required' }, { status: 400 });
        }

        if (subjectIds.length === 0) {
            return NextResponse.json({ error: 'No subjects found' }, { status: 404 });
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
