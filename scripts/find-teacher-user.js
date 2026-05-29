const { Client } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const DB = 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres';

async function main() {
    const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
    await client.connect();

    const res = await client.query("SELECT * FROM users WHERE email = 'teacher@school.com'");
    console.log("=== User teacher@school.com ===");
    console.log(res.rows);

    await client.end();
}

main().catch(console.error);
