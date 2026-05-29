import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function POST(req: Request) {
    try {
        const token = req.headers.get('authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const { students, sessionId } = body;

        if (!Array.isArray(students) || students.length === 0) {
            return NextResponse.json({ error: 'No student data provided' }, { status: 400 });
        }

        if (students.length > 500) {
            return NextResponse.json({ error: 'Maximum 500 students per import' }, { status: 400 });
        }

        // 1. Resolve Academic Session
        let activeSessionId = sessionId;
        if (!activeSessionId) {
            const currentSession = await queryOne<{ id: string }>(
                `SELECT id FROM academic_sessions WHERE is_current = true LIMIT 1`
            );
            if (!currentSession) {
                return NextResponse.json({ error: 'No active academic session found. Create one first.' }, { status: 400 });
            }
            activeSessionId = currentSession.id;
        }

        // 2. Fetch all class_sections with their names for dynamic resolution
        const classSectionsList = await query<{ id: string; class_name: string; section_name: string }>(
            `SELECT cs.id, c.name as class_name, sec.name as section_name
             FROM class_sections cs
             JOIN classes c ON cs.class_id = c.id
             JOIN sections sec ON cs.section_id = sec.id
             WHERE cs.session_id = $1`,
            [activeSessionId]
        );

        // Map key format "classname-sectionname" -> class_section_id
        const classSectionMap = new Map<string, string>();
        classSectionsList.forEach(cs => {
            const key = `${cs.class_name.toLowerCase().trim()}-${cs.section_name.toLowerCase().trim()}`;
            classSectionMap.set(key, cs.id);
        });

        const results = {
            success: 0,
            failed: 0,
            errors: [] as { row: number; name: string; error: string }[]
        };

        // 3. Process each student insert/update
        for (let i = 0; i < students.length; i++) {
            const rowNum = i + 1;
            const s = students[i];

            try {
                // Name normalization
                let firstName = s.firstName || s.first_name || '';
                let lastName = s.lastName || s.last_name || '';
                if (s.name && !firstName) {
                    const parts = s.name.trim().split(/\s+/);
                    firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
                    lastName = parts.length > 1 ? parts[parts.length - 1] : '';
                }

                const guardianName = s.guardianName || s.guardian_name || '';
                const guardianPhone = s.guardianPhone || s.guardian_phone || '';
                const admissionNumber = s.admissionNumber || s.admission_number || '';
                
                if (!firstName || !guardianPhone) {
                    throw new Error('First name and guardian phone are required.');
                }

                // Resolve classroom section
                const className = s.class || s.className || s.class_name || '';
                const sectionName = s.section || s.sectionName || s.section_name || '';
                const classSectionKey = `${className.toLowerCase().trim()}-${sectionName.toLowerCase().trim()}`;
                const matchedClassSectionId = classSectionMap.get(classSectionKey);

                if (!matchedClassSectionId) {
                    throw new Error(`Classroom "${className} - ${sectionName}" not found for this academic session.`);
                }

                // Perform single insert
                const student = await queryOne<{ id: string }>(
                    `INSERT INTO students (
                        first_name, last_name, email, phone, date_of_birth, gender, blood_group, address,
                        admission_number, admission_date, guardian_name, guardian_relation, guardian_phone, guardian_email, is_active
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true)
                    ON CONFLICT (admission_number) DO UPDATE SET
                        first_name = EXCLUDED.first_name,
                        last_name = EXCLUDED.last_name,
                        email = EXCLUDED.email,
                        phone = EXCLUDED.phone,
                        guardian_name = EXCLUDED.guardian_name,
                        guardian_phone = EXCLUDED.guardian_phone,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING id`,
                    [
                        firstName,
                        lastName,
                        s.email || null,
                        s.phone || null,
                        s.dateOfBirth || s.date_of_birth || null,
                        s.gender ? s.gender.toLowerCase() : null,
                        s.bloodGroup || s.blood_group || null,
                        s.address || null,
                        admissionNumber || null,
                        s.admissionDate || s.admission_date || new Date().toISOString().split('T')[0],
                        guardianName || null,
                        s.guardianRelation || s.guardian_relation || 'Parent',
                        guardianPhone,
                        s.guardianEmail || s.guardian_email || null
                    ]
                );

                if (student) {
                    // Create/Update enrollment
                    const rollVal = s.rollNumber || s.roll_number;
                    const parsedRoll = rollVal ? parseInt(rollVal) : null;

                    await query(
                        `INSERT INTO student_enrollments (student_id, class_section_id, session_id, roll_number, status)
                         VALUES ($1, $2, $3, $4, 'active')
                         ON CONFLICT (student_id, session_id) 
                         DO UPDATE SET class_section_id = $2, roll_number = $4`,
                        [student.id, matchedClassSectionId, activeSessionId, parsedRoll]
                    );

                    results.success++;
                } else {
                    throw new Error('Failed to register student record.');
                }
            } catch (err: any) {
                results.failed++;
                results.errors.push({
                    row: rowNum,
                    name: `${s.firstName || s.name || 'Unknown'}`,
                    error: err.message || 'Validation error'
                });
            }
        }

        return NextResponse.json(results);
    } catch (error: any) {
        console.error('Import students API error:', error);
        return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
    }
}
