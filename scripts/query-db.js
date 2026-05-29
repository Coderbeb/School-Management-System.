const { Pool } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const DB = 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres';
const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });

async function run() {
    const client = await pool.connect();
    try {
        console.log('=== Academic Sessions ===');
        const sessions = await client.query('SELECT id, name, is_current FROM academic_sessions');
        console.log(sessions.rows);

        console.log('\n=== Classrooms (Class Sections) ===');
        const classrooms = await client.query(`
            SELECT cs.id, c.name as class_name, s.name as section_name, cs.session_id
            FROM class_sections cs
            JOIN classes c ON cs.class_id = c.id
            JOIN sections s ON cs.section_id = s.id
        `);
        console.log(classrooms.rows);

        console.log('\n=== Total Students ===');
        const students = await client.query('SELECT count(*) FROM students');
        console.log(students.rows);

        console.log('\n=== Student Enrollments ===');
        const enrollments = await client.query('SELECT count(*) FROM student_enrollments');
        console.log(enrollments.rows);
    } catch (e) {
        console.error('Error querying DB:', e);
    } finally {
        client.release();
        pool.end();
    }
}

run();
