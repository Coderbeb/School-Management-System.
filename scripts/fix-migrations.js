const { Pool } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const pool = new Pool({
    connectionString: 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        // Check what tables exist
        const tables = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
        console.log('Existing tables:', tables.rows.map(r=>r.tablename).join(', '));

        // Remove the 007 migration record so it re-runs
        await client.query(`DELETE FROM _migrations WHERE name IN ('007_sms_school_model','008_sms_attendance')`);
        console.log('Cleared migration records for 007 and 008');
    } finally {
        client.release();
        pool.end();
    }
}
run().catch(e => { console.error(e.message); pool.end(); });
