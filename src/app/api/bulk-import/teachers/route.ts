import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken, hashPassword } from '@/lib/auth';
import Papa from 'papaparse';

interface TeacherCSVRow {
    'First Name': string;
    'Last Name': string;
    'Email': string;
    'Subject Code': string;
    'Class': string;
    'Sections': string;
}

export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { csvData } = await request.json();
        if (!csvData) return NextResponse.json({ error: 'CSV data is required' }, { status: 400 });

        const parsed = Papa.parse<TeacherCSVRow>(csvData, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.replace(/^\uFEFF/, '').trim()
        });

        if (parsed.errors.length > 0) {
            return NextResponse.json({ error: 'Failed to parse CSV file', details: parsed.errors }, { status: 400 });
        }

        const schoolId = payload.schoolId;
        if (!schoolId) {
            return NextResponse.json({ error: 'School context is missing in token.' }, { status: 400 });
        }

        const currentSession = await queryOne<{ id: string }>(
            `SELECT id FROM academic_sessions WHERE is_current = true AND school_id = $1 LIMIT 1`,
            [schoolId]
        );
        if (!currentSession) {
            return NextResponse.json({ error: 'No active academic session found for your school.' }, { status: 400 });
        }

        let teachersCreated = 0;
        let assignmentsCreated = 0;
        const missingSubjects = new Set<string>();
        const missingClassrooms = new Set<string>();

        // Default password hash for newly created teachers: Test@1234
        const defaultPasswordHash = await hashPassword('Test@1234');

        for (const row of parsed.data) {
            const firstName = row['First Name']?.trim();
            const lastName = row['Last Name']?.trim() || '';
            const email = row['Email']?.trim()?.toLowerCase();
            const subjectCode = row['Subject Code']?.trim()?.toUpperCase();
            const className = row['Class']?.trim();
            const sectionsStr = row['Sections']?.trim() || '';

            if (!email || !subjectCode || !className || !firstName) continue;

            // 1. Find or create teacher user
            let teacher = await queryOne<{ id: string }>(
                `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND school_id = $2`,
                [email, schoolId]
            );

            if (!teacher) {
                teacher = await queryOne<{ id: string }>(
                    `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, school_id)
                     VALUES ($1, $2, $3, $4, 'teacher', true, $5)
                     RETURNING id`,
                    [email, defaultPasswordHash, firstName, lastName, schoolId]
                );
                teachersCreated++;
            }

            if (!teacher) continue;
            const teacherId = teacher.id;

            // 2. Find subject
            const subject = await queryOne<{ id: string }>(
                `SELECT id FROM subjects WHERE code = $1 AND school_id = $2 AND is_active = true`,
                [subjectCode, schoolId]
            );

            if (!subject) {
                missingSubjects.add(subjectCode);
                continue;
            }

            const subjectId = subject.id;

            // 3. Find base class
            const baseClass = await queryOne<{ id: string }>(
                `SELECT id FROM classes WHERE LOWER(name) = LOWER($1) AND school_id = $2`,
                [className, schoolId]
            );

            if (!baseClass) {
                missingClassrooms.add(`${className} (Class not found)`);
                continue;
            }

            // 4. Resolve sections (specific lists, ALL, or blank/General)
            let sectionsQuery = '';
            let params: any[] = [baseClass.id, currentSession.id, schoolId];

            if (sectionsStr.toUpperCase() === 'ALL') {
                sectionsQuery = `
                    SELECT cs.id, s.name as sec_name
                    FROM class_sections cs
                    JOIN sections s ON cs.section_id = s.id
                    WHERE cs.class_id = $1 AND cs.session_id = $2 AND cs.school_id = $3
                `;
            } else {
                const targetSections = sectionsStr
                    ? sectionsStr.split(',').map(s => s.trim()).filter(Boolean)
                    : ['General'];

                sectionsQuery = `
                    SELECT cs.id, s.name as sec_name
                    FROM class_sections cs
                    JOIN sections s ON cs.section_id = s.id
                    WHERE cs.class_id = $1 AND cs.session_id = $2 AND cs.school_id = $3 AND LOWER(s.name) = ANY($4)
                `;
                params.push(targetSections.map(s => s.toLowerCase()));
            }

            const matchedClassrooms = await query<{ id: string; sec_name: string }>(sectionsQuery, params);

            if (matchedClassrooms.length === 0) {
                missingClassrooms.add(`${className} - ${sectionsStr}`);
                continue;
            }

            // 5. Create assignments
            for (const classroom of matchedClassrooms) {
                const assignment = await queryOne(
                    `INSERT INTO teacher_assignments (teacher_id, class_section_id, subject_id, session_id, is_class_teacher)
                     VALUES ($1, $2, $3, $4, false)
                     ON CONFLICT (teacher_id, class_section_id, subject_id, session_id) DO NOTHING
                     RETURNING id`,
                    [teacherId, classroom.id, subjectId, currentSession.id]
                );
                if (assignment) {
                    assignmentsCreated++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            summary: {
                teachersCreated,
                assignmentsCreated,
                missingSubjects: Array.from(missingSubjects),
                missingClassrooms: Array.from(missingClassrooms)
            }
        });
    } catch (error: any) {
        console.error('Bulk import teachers error:', error);
        return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
    }
}
