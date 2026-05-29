import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken, hashPassword } from '@/lib/auth';
import Papa from 'papaparse';

interface StudentCSVRow {
    'First Name': string;
    'Last Name'?: string;
    'Email': string;
    'Roll No': string;
    'Class': string;
    'Section'?: string;
    'Gender'?: string;
    'Date of Birth'?: string;
    'Blood Group'?: string;
    'Address'?: string;
    'Guardian Name'?: string;
    'Guardian Relation'?: string;
    'Guardian Phone'?: string;
    'Guardian Email'?: string;
    'Alt Phone Number'?: string;
    'Admission Number'?: string;
    'Admission Date'?: string;
}

export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { csvData } = await request.json();
        if (!csvData) return NextResponse.json({ error: 'CSV data is required' }, { status: 400 });

        const parsed = Papa.parse<StudentCSVRow>(csvData, {
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

        const currentSession = await queryOne<{ id: string; name: string }>(
            `SELECT id, name FROM academic_sessions WHERE is_current = true AND school_id = $1 LIMIT 1`,
            [schoolId]
        );
        if (!currentSession) {
            return NextResponse.json({ error: 'No active academic session found for your school.' }, { status: 400 });
        }

        let studentsCreated = 0;
        let enrollmentsCreated = 0;
        const missingClassrooms = new Set<string>();

        // Default password hash for newly created students: Test@1234
        const defaultPasswordHash = await hashPassword('Test@1234');

        for (const row of parsed.data) {
            const firstName = row['First Name']?.trim();
            const lastName = row['Last Name']?.trim() || '';
            const email = row['Email']?.trim()?.toLowerCase();
            const rollNoStr = row['Roll No']?.trim();
            const className = row['Class']?.trim();
            const sectionName = row['Section']?.trim() || 'General';

            // Additional details
            const gender = row['Gender']?.trim()?.toLowerCase() || null;
            const dob = row['Date of Birth']?.trim() || null;
            const bloodGroup = row['Blood Group']?.trim() || null;
            const address = row['Address']?.trim() || null;
            const guardianName = row['Guardian Name']?.trim() || null;
            const guardianRelation = row['Guardian Relation']?.trim() || 'Father';
            const guardianPhone = row['Guardian Phone']?.trim() || null;
            const guardianEmail = row['Guardian Email']?.trim() || null;
            const guardianPhoneAlt = row['Alt Phone Number']?.trim() || null;
            const admissionNumber = row['Admission Number']?.trim() || null;
            const admissionDate = row['Admission Date']?.trim() || null;

            if (!firstName || !email || !rollNoStr || !className) continue;

            const rollNumber = parseInt(rollNoStr);
            if (isNaN(rollNumber)) continue;

            // Validate gender constraint
            let validatedGender: 'male' | 'female' | 'other' | null = null;
            if (gender && ['male', 'female', 'other'].includes(gender)) {
                validatedGender = gender as 'male' | 'female' | 'other';
            }

            // 1. Find classroom (scope by school_id)
            const classroom = await queryOne<{ id: string }>(
                `SELECT cs.id
                 FROM class_sections cs
                 JOIN classes c ON cs.class_id = c.id
                 JOIN sections s ON cs.section_id = s.id
                 WHERE cs.session_id = $1 AND cs.school_id = $4 AND LOWER(c.name) = LOWER($2) AND LOWER(s.name) = LOWER($3)`,
                [currentSession.id, className, sectionName, schoolId]
            );

            if (!classroom) {
                missingClassrooms.add(`${className} - ${sectionName}`);
                continue;
            }

            // 2. Find or create student user account
            let userRecord = await queryOne<{ id: string }>(
                `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND school_id = $2`,
                [email, schoolId]
            );

            if (!userRecord) {
                userRecord = await queryOne<{ id: string }>(
                    `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, school_id)
                     VALUES ($1, $2, $3, $4, 'student', true, $5)
                     RETURNING id`,
                    [email, defaultPasswordHash, firstName, lastName, schoolId]
                );
            } else {
                await query(
                    `UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3 AND school_id = $4`,
                    [firstName, lastName, userRecord.id, schoolId]
                );
            }

            if (!userRecord) continue;
            const userId = userRecord.id;

            // 3. Find or create student profile record
            let studentRecord = await queryOne<{ id: string }>(
                `SELECT id FROM students WHERE user_id = $1 AND school_id = $2`,
                [userId, schoolId]
            );

            const admissionNum = admissionNumber || `ADM-${currentSession.name.replace(/\s+/g, '')}-${rollNumber}-${Math.floor(1000 + Math.random() * 9000)}`;

            if (!studentRecord) {
                studentRecord = await queryOne<{ id: string }>(
                    `INSERT INTO students (
                        first_name, last_name, admission_number, is_active, user_id, school_id,
                        gender, date_of_birth, blood_group, address, guardian_name,
                        guardian_relation, guardian_phone, guardian_email, guardian_phone_alt, admission_date
                     ) VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                     RETURNING id`,
                    [
                        firstName, lastName, admissionNum, userId, schoolId,
                        validatedGender, dob ? new Date(dob) : null, bloodGroup, address, guardianName,
                        guardianRelation, guardianPhone, guardianEmail, guardianPhoneAlt,
                        admissionDate ? new Date(admissionDate) : new Date()
                    ]
                );
                studentsCreated++;
            } else {
                await query(
                    `UPDATE students
                     SET first_name = $1, last_name = $2,
                         gender = COALESCE($3, gender),
                         date_of_birth = COALESCE($4, date_of_birth),
                         blood_group = COALESCE($5, blood_group),
                         address = COALESCE($6, address),
                         guardian_name = COALESCE($7, guardian_name),
                         guardian_relation = COALESCE($8, guardian_relation),
                         guardian_phone = COALESCE($9, guardian_phone),
                         guardian_email = COALESCE($10, guardian_email),
                         guardian_phone_alt = COALESCE($11, guardian_phone_alt),
                         admission_date = COALESCE($12, admission_date),
                         admission_number = COALESCE($13, admission_number)
                     WHERE id = $14 AND school_id = $15`,
                    [
                        firstName, lastName,
                        validatedGender, dob ? new Date(dob) : null, bloodGroup, address, guardianName,
                        guardianRelation, guardianPhone, guardianEmail, guardianPhoneAlt,
                        admissionDate ? new Date(admissionDate) : null,
                        admissionNumber,
                        studentRecord.id,
                        schoolId
                    ]
                );
            }

            if (!studentRecord) continue;
            const studentId = studentRecord.id;

            // 4. Enroll student in the classroom
            const enrollment = await queryOne(
                `INSERT INTO student_enrollments (student_id, class_section_id, session_id, roll_number, status)
                 VALUES ($1, $2, $3, $4, 'active')
                 ON CONFLICT (student_id, session_id) DO UPDATE
                 SET class_section_id = EXCLUDED.class_section_id, roll_number = EXCLUDED.roll_number
                 RETURNING id`,
                [studentId, classroom.id, currentSession.id, rollNumber]
            );

            if (enrollment) {
                enrollmentsCreated++;
            }
        }

        return NextResponse.json({
            success: true,
            summary: {
                studentsCreated,
                enrollmentsCreated,
                missingClassrooms: Array.from(missingClassrooms)
            }
        });
    } catch (error: any) {
        console.error('Bulk import students error:', error);
        return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
    }
}
