const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log("Connecting...");
        const client = await pool.connect();
        console.log("Connected!");

        const fsRes = await client.query(`
            SELECT * FROM fee_structures LIMIT 5
        `);
        console.log("Fee Structures:", fsRes.rows);

        const columnsRes = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'fee_structures'
        `);
        console.log("Columns of fee_structures:", columnsRes.rows);
        
        client.release();
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

run();
