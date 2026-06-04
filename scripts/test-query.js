const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log("Connecting...");
        const client = await pool.connect();
        console.log("Connected!");

        const sessionId = 'db8a75af-1927-4896-83d4-027b7a7377f4';
        const schoolId = '5f1e4197-a40e-427b-b25a-13d78a14d998';
        const classId = '9a5c4d9f-0495-498c-9254-aa6630ab6e2e';

        let studentsSql = `
            SELECT s.id as student_id, s.first_name, s.last_name, s.admission_number,
                c.name as class_name, c.id as class_id, cs.id as class_section_id
            FROM students s
            JOIN student_enrollments se ON se.student_id = s.id AND se.session_id = $1 AND se.status = 'active'
            JOIN class_sections cs ON se.class_section_id = cs.id
            JOIN classes c ON cs.class_id = c.id
            WHERE 1=1
        `;
        const params = [sessionId];
        let idx = 2;

        if (schoolId) {
            studentsSql += ` AND s.school_id = $${idx++}`;
            params.push(schoolId);
        }

        if (classId) {
            studentsSql += ` AND cs.class_id = $${idx++}`;
            params.push(classId);
        }

        console.log("SQL:", studentsSql);
        console.log("Params:", params);

        const res = await client.query(studentsSql, params);
        console.log("Result rows count:", res.rows.length);
        console.log("Result rows:", res.rows);

        client.release();
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

run();
