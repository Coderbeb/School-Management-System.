const { Client } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const DB = 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres';

async function main() {
    const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
    await client.connect();

    const res = await client.query("SELECT id, email, role, first_name, last_name, school_id FROM users");
    console.log("=== All Users ===");
    console.log(res.rows);

    await client.end();
}

main().catch(console.error);
