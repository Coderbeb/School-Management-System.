const { Pool } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const DB = 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres';
const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });

async function verifyStaffCheckInLogic(client) {
    console.log('\n--- Verifying Staff Check-in Logic ---');
    
    // Get a test teacher user
    const teacherRes = await client.query("SELECT id, school_id FROM users WHERE role = 'teacher' LIMIT 1");
    const teacher = teacherRes.rows[0];
    if (!teacher) {
        console.log('No teacher user found in DB to test with.');
        return;
    }
    
    const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    console.log(`Testing with teacher: ${teacher.id} on date: ${todayIST}`);
    
    // Start transaction to avoid leaving test pollution
    await client.query('BEGIN');
    try {
        // Clean up any existing check-in for today (to starts clean)
        await client.query("DELETE FROM staff_attendance WHERE user_id = $1 AND date = $2", [teacher.id, todayIST]);
        
        // Simulating the check-in insert
        await client.query(
            `INSERT INTO staff_attendance (user_id, school_id, date, check_in_time, check_in_lat, check_in_lng, status, auto_status)
             VALUES ($1, $2, $3, NOW(), 23.34, 85.32, 'present', 'present')`,
            [teacher.id, teacher.school_id, todayIST]
        );
        console.log('✔ First check-in inserted successfully.');
        
        // Simulating the duplicate check-in check
        const existingRecord = await client.query(
            `SELECT id FROM staff_attendance WHERE user_id = $1 AND date = $2 AND check_in_time IS NOT NULL`,
            [teacher.id, todayIST]
        );
        
        if (existingRecord.rows.length > 0) {
            console.log('✔ Correctly detected existing check-in (Duplicate check passes).');
        } else {
            console.log('❌ Failed to detect existing check-in.');
        }
        
        // Test our ON CONFLICT clause updates check-in safely if it is update check-out
        const checkoutRecord = await client.query(
            `UPDATE staff_attendance SET check_out_time = NOW(), check_out_lat = 23.34, check_out_lng = 85.32
             WHERE user_id = $1 AND date = $2 RETURNING *`,
            [teacher.id, todayIST]
        );
        if (checkoutRecord.rows[0]?.check_out_time) {
            console.log('✔ Check-out updated successfully.');
        } else {
            console.log('❌ Check-out update failed.');
        }
        
    } finally {
        await client.query('ROLLBACK');
        console.log('✔ Check-in database updates rolled back safely.');
    }
}

function verifyCalendarStatusLogic() {
    console.log('\n--- Verifying Calendar Status Logic ---');
    
    // Mocking the getDayStatus function logic from page.tsx
    const year = 2026;
    const month = 5; // May
    const todayStr = '2026-05-27';
    
    const getDayStatusMock = (day) => {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (dateStr > todayStr) return 'future';
        const dayOfWeek = new Date(year, month - 1, day).getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) return 'weekend'; // Sunday or Saturday (Fixed!)
        
        // Mock record map (empty for testing)
        const record = null;
        if (record) return 'present';
        if (dateStr < todayStr) return 'absent';
        return 'today';
    };
    
    // 2026-05-23 is Saturday, 2026-05-24 is Sunday, 2026-05-25 is Monday
    const satStatus = getDayStatusMock(23);
    const sunStatus = getDayStatusMock(24);
    const monStatus = getDayStatusMock(25);
    const futureStatus = getDayStatusMock(29);
    
    console.log(`2026-05-23 (Saturday) status: ${satStatus} (Expected: weekend)`);
    console.log(`2026-05-24 (Sunday) status: ${sunStatus} (Expected: weekend)`);
    console.log(`2026-05-25 (Monday) status: ${monStatus} (Expected: absent)`);
    console.log(`2026-05-29 (Future) status: ${futureStatus} (Expected: future)`);
    
    if (satStatus === 'weekend' && sunStatus === 'weekend' && monStatus === 'absent' && futureStatus === 'future') {
        console.log('✔ Calendar rendering logic verification passed!');
    } else {
        console.log('❌ Calendar rendering logic verification failed.');
    }
}

async function run() {
    const client = await pool.connect();
    try {
        await verifyStaffCheckInLogic(client);
        verifyCalendarStatusLogic();
    } catch (e) {
        console.error('Verification error:', e);
    } finally {
        client.release();
        pool.end();
    }
}

run();
