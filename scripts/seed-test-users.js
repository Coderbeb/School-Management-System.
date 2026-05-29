const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const pool = new Pool({
    connectionString: 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const hash = await bcrypt.hash('Test@1234', 10);
    console.log('Password hash generated...');

    // Create / update test accountant
    await pool.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
         VALUES ('Test', 'Accountant', 'accountant@school.com', $1, 'accountant', true)
         ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'accountant', is_active = true`,
        [hash]
    );
    console.log('✅ Accountant: accountant@school.com / Test@1234');

    // Create / update test teacher
    await pool.query(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
         VALUES ('Test', 'Teacher', 'teacher@school.com', $1, 'teacher', true)
         ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'teacher', is_active = true`,
        [hash]
    );
    console.log('✅ Teacher: teacher@school.com / Test@1234');

    // Update super admin password
    await pool.query(`UPDATE users SET password_hash = $1 WHERE email = 'admin@ysm.edu'`, [hash]);
    console.log('✅ Super Admin: admin@ysm.edu / Test@1234');

    // Update all existing teachers to new password
    await pool.query(`UPDATE users SET password_hash = $1 WHERE role = 'teacher'`, [hash]);
    console.log('✅ All existing teachers updated to Test@1234');

    pool.end();
}

run().catch(e => { console.error('Error:', e.message); pool.end(); });
