const { Client } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const DB = 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres';

async function main() {
    const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
    await client.connect();

    // Get count of students in student_enrollments grouped by class_section_id
    const res = await client.query(`
        SELECT se.class_section_id, c.name as class_name, s.name as section_name, COUNT(*) as student_count
        FROM student_enrollments se
        JOIN class_sections cs ON se.class_section_id = cs.id
        JOIN classes c ON cs.class_id = c.id
        JOIN sections s ON cs.section_id = s.id
        GROUP BY se.class_section_id, c.name, s.name
    `);
    console.log("=== Student Enrollments ===");
    console.log(res.rows);

    await client.end();
}

main().catch(console.error);
