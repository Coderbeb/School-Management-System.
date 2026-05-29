const { Client } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const DB = 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres';

async function main() {
    const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
    await client.connect();

    console.log("=== Latest 5 Students ===");
    const studentsRes = await client.query("SELECT id, user_id, first_name, last_name, admission_number, created_at, school_id FROM students ORDER BY created_at DESC LIMIT 5");
    console.log(studentsRes.rows);

    console.log("\n=== Latest 5 Users ===");
    const usersRes = await client.query("SELECT id, email, role, first_name, last_name, created_at, school_id FROM users ORDER BY created_at DESC LIMIT 5");
    console.log(usersRes.rows);

    console.log("\n=== Latest 5 Enrollments ===");
    const enrollmentsRes = await client.query("SELECT * FROM student_enrollments ORDER BY enrolled_at DESC LIMIT 5");
    console.log(enrollmentsRes.rows);

    await client.end();
}

main().catch(console.error);
