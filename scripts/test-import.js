const { Pool } = require('pg');
const Papa = require('papaparse');
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

        console.log('Parsed Rows:', parsed.data);

        const currentSession = await queryOne(
            `SELECT id, name FROM academic_sessions WHERE is_current = true LIMIT 1`
        );
        if (!currentSession) {
            console.log('No current active session found!');
            return;
        }
        console.log('Current Session:', currentSession);

        for (const row of parsed.data) {
            const firstName = row['First Name']?.trim();
            const lastName = row['Last Name']?.trim() || '';
            const email = row['Email']?.trim()?.toLowerCase();
            const rollNoStr = row['Roll No']?.trim();
            const className = row['Class']?.trim();
            const sectionName = row['Section']?.trim() || 'General';

            console.log(`Checking Row: "${firstName}" | "${email}" | "${rollNoStr}" | "${className}" | "${sectionName}"`);

            if (!firstName || !email || !rollNoStr || !className) {
                console.log('  -> SKIPPED: missing mandatory fields!', {
                    firstName: !firstName,
                    email: !email,
                    rollNoStr: !rollNoStr,
                    className: !className
                });
                continue;
            }

            const rollNumber = parseInt(rollNoStr);
            if (isNaN(rollNumber)) {
                console.log('  -> SKIPPED: rollNumber is not a number!');
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
                console.log(`  -> SKIPPED: classroom not found for "${className} - ${sectionName}"`);
                continue;
            }

            console.log('  -> Classroom Found:', classroom.id);
        }
    } catch (e) {
        console.error('Error running test:', e);
    } finally {
        pool.end();
    }
}

test();
