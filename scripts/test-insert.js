const { Pool } = require('pg');
const Papa = require('papaparse');
const bcrypt = require('bcrypt');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const DB = 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres';
const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });

// Simulate database helper
async function queryOne(text, params) {
    const res = await pool.query(text, params);
    return res.rows[0] || null;
}

const csvData = `First Name,Last Name,Email,Roll No,Class,Section
Jane,Doe,jane.doe@school.com,1,Class 10,A
Mark,Twain,mark.twain@school.com,2,Class 9,B
Lisa,Simpson,lisa.simpson@school.com,3,Class 10,General`;

async function test() {
    try {
        const parsed = Papa.parse(csvData, {
            header: true,
            skipEmptyLines: true
        });

        const currentSession = await queryOne(
            `SELECT id, name FROM academic_sessions WHERE is_current = true LIMIT 1`
        );
        if (!currentSession) {
            console.log('No current active session found!');
            return;
        }

        let studentsCreated = 0;
        let enrollmentsCreated = 0;
        const missingClassrooms = new Set();
        const defaultPasswordHash = await bcrypt.hash('Test@1234', 10);

        for (const row of parsed.data) {
            const firstName = row['First Name']?.trim();
            const lastName = row['Last Name']?.trim() || '';
            const email = row['Email']?.trim()?.toLowerCase();
            const rollNoStr = row['Roll No']?.trim();
            const className = row['Class']?.trim();
            const sectionName = row['Section']?.trim() || 'General';

            console.log(`Processing Row: "${firstName}" | "${email}"`);

            if (!firstName || !email || !rollNoStr || !className) {
                console.log('  -> SKIPPED: missing mandatory fields');
                continue;
            }

            const rollNumber = parseInt(rollNoStr);
            if (isNaN(rollNumber)) {
                console.log('  -> SKIPPED: rollNumber is NaN');
                continue;
            }

            // 1. Find classroom
            const classroom = await queryOne(
                `SELECT cs.id
                 FROM class_sections cs
                 JOIN classes c ON cs.class_id = c.id
                 JOIN sections s ON cs.section_id = s.id
                 WHERE cs.session_id = $1 AND LOWER(c.name) = LOWER($2) AND LOWER(s.name) = LOWER($3)`,
                [currentSession.id, className, sectionName]
            );

            if (!classroom) {
                missingClassrooms.add(`${className} - ${sectionName}`);
                console.log(`  -> SKIPPED: classroom not found for "${className} - ${sectionName}"`);
                continue;
            }

            try {
                // 2. Find or create student user account
                let userRecord = await queryOne(
                    `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
                    [email]
                );

                if (!userRecord) {
                    userRecord = await queryOne(
                        `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active)
                         VALUES ($1, $2, $3, $4, 'student', true)
                         RETURNING id`,
                        [email, defaultPasswordHash, firstName, lastName]
                    );
                    console.log('  -> User Account Created:', userRecord.id);
                } else {
                    console.log('  -> User Account Already Exists:', userRecord.id);
                }

                const userId = userRecord.id;

                // 3. Find or create student profile record
                let studentRecord = await queryOne(
                    `SELECT id FROM students WHERE user_id = $1`,
                    [userId]
                );

                if (!studentRecord) {
                    const admissionNum = `ADM-${currentSession.name.replace(/\s+/g, '')}-${rollNumber}-${Math.floor(1000 + Math.random() * 9000)}`;

                    studentRecord = await queryOne(
                        `INSERT INTO students (
                            first_name, last_name, email, admission_number, is_active, user_id
                         ) VALUES ($1, $2, $3, $4, true, $5)
                         RETURNING id`,
                        [firstName, lastName, email, admissionNum, userId]
                    );
                    studentsCreated++;
                    console.log('  -> Student Profile Created:', studentRecord.id);
                } else {
                    console.log('  -> Student Profile Already Exists:', studentRecord.id);
                }

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
                    console.log('  -> Classroom Enrollment Done:', enrollment.id);
                }
            } catch (err) {
                console.error(`  -> ERROR for row ${firstName}:`, err.message);
            }
        }

        console.log('\n=== Summary ===');
        console.log(`Created Students: ${studentsCreated}`);
        console.log(`Created Enrollments: ${enrollmentsCreated}`);
        console.log(`Missing Classrooms:`, Array.from(missingClassrooms));
    } catch (e) {
        console.error('Error running test:', e);
    } finally {
        pool.end();
    }
}

test();
