const { Client } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const DB = 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres';

async function main() {
    const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
    await client.connect();

    const res = await client.query("SELECT * FROM student_enrollments");
    console.log("=== Student Enrollments Raw ===");
    console.log(res.rows);

    const s = await client.query("SELECT * FROM students");
    console.log("\n=== Students Raw ===");
    console.log(s.rows);

    await client.end();
}

main().catch(console.error);
