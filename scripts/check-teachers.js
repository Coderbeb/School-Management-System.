const { Client } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const DB = 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres';

async function main() {
    const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
    await client.connect();
    
    // 1. Get all schools
    const schools = await client.query("SELECT id, name FROM schools");
    console.log("=== Schools ===");
    console.log(schools.rows);

    // 2. Get all teacher users
    const teachers = await client.query("SELECT id, email, role, first_name, last_name, school_id FROM users WHERE role = 'teacher'");
    console.log("\n=== Teacher Users ===");
    console.log(teachers.rows);

    // 3. Get all teacher assignments
    const assignments = await client.query(`
        SELECT ta.id, ta.teacher_id, u.email as teacher_email, ta.class_section_id, ta.subject_id, ta.session_id
        FROM teacher_assignments ta
        LEFT JOIN users u ON ta.teacher_id = u.id
    `);
    console.log("\n=== Teacher Assignments ===");
    console.log(assignments.rows);

    // 4. Get class sections mapping
    const cs = await client.query(`
        SELECT cs.id, c.name as class_name, s.name as section_name, cs.school_id
        FROM class_sections cs
        JOIN classes c ON cs.class_id = c.id
        JOIN sections s ON cs.section_id = s.id
    `);
    console.log("\n=== Class Sections ===");
    console.log(cs.rows);

    await client.end();
}

main().catch(console.error);
