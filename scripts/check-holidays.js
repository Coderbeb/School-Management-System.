const { Pool } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const DB = 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres';
const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });

async function run() {
    try {
        console.log('=== All Holidays ===');
        const res = await pool.query('SELECT * FROM holidays LIMIT 10');
        console.log(res.rows);
    } catch (e) {
        console.error('Error querying holidays:', e);
    } finally {
        pool.end();
    }
}

run();
