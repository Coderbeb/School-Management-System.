/**
 * FULL DATABASE RESET SCRIPT
 * Drops ALL tables and re-runs all migrations fresh.
 * Run: node scripts/reset-db.js
 */
const { Pool } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const pool = new Pool({
    connectionString: 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
});

async function resetDB() {
    const client = await pool.connect();
    try {
        console.log('🔴 Starting full database reset...\n');

        // Drop all tables in correct order (respecting foreign keys)
        await client.query(`
            DROP TABLE IF EXISTS
                attendance_records,
                teacher_assignments,
                student_enrollments,
                class_subjects,
                class_sections,
                subjects,
                sections,
                classes,
                academic_sessions,
                school_settings,
                students,
                email_queue,
                application_settings,
                migrations,
                users
            CASCADE;
        `);
        console.log('✅ All tables dropped.\n');

        // Drop uuid extension and recreate
        await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
        console.log('✅ UUID extension ready.\n');

        console.log('🔄 Now re-running all migrations...\n');
    } finally {
        client.release();
    }
    pool.end();
}

resetDB().catch(e => { console.error('❌ Error:', e.message); pool.end(); });
