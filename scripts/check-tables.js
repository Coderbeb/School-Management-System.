const { Pool } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const DB = 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres';
const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });

async function run() {
    const client = pool;
    try {
        console.log('=== Holidays Columns ===');
        const holidayCols = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'holidays'
        `);
        console.log(holidayCols.rows);

        console.log('\n=== Leave Requests Columns ===');
        const leaveCols = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'leave_requests'
        `);
        console.log(leaveCols.rows);

        console.log('\n=== Schools Table Columns ===');
        const schoolCols = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'schools'
        `);
        console.log(schoolCols.rows);

        console.log('\n=== First School Row ===');
        const schools = await client.query('SELECT * FROM schools LIMIT 1');
        console.log(schools.rows);

    } catch (e) {
        console.error('Error querying DB:', e);
    } finally {
        pool.end();
    }
}

run();
