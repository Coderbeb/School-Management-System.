const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://postgres:mahto@localhost:5432/college_attendance'
});

async function addColumn() {
    try {
        await pool.query('ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT');
        console.log('✅ Description column added successfully');
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

addColumn();
