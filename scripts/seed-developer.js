/**
 * Creates the Developer (Platform Admin) account
 * This is the master account that sits above all school admins
 */
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const pool = new Pool({
    connectionString: 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const hash = await bcrypt.hash('Dev@2026', 10);
    console.log('Creating Developer account...');

    await pool.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
         VALUES ('Platform', 'Developer', 'developer@ysm.edu', $1, 'developer', true)
         ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'developer', is_active = true`,
        [hash]
    );
    console.log('✅ Developer: developer@ysm.edu / Dev@2026');
    console.log('');
    console.log('This account has full platform control.');
    console.log('Login at: /login → redirects to /developer/dashboard');

    pool.end();
}

run().catch(e => { console.error('Error:', e.message); pool.end(); });
