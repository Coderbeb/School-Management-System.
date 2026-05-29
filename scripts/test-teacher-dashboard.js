const { Client } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const DB = 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres';

async function main() {
    const client = new Client({ connectionString: DB, ssl: { rejectUnauthorized: false } });
    await client.connect();

    const teacherEmail = 'john@school.com';
    const teacherRes = await client.query("SELECT * FROM users WHERE email = $1", [teacherEmail]);
    const teacher = teacherRes.rows[0];
    console.log("Teacher User Profile:", teacher);

    if (!teacher) {
        console.error("Teacher user not found!");
        await client.end();
        return;
    }

    const schoolId = teacher.school_id;
    console.log("School ID:", schoolId);

    // Run the query from /api/manage/teacher-assignments
    const sql = `
        SELECT ta.*,
               u.first_name || ' ' || u.last_name as teacher_name,
               c.name || ' - ' || s.name as class_section_name,
               sub.name as subject_name, sub.code as subject_code
        FROM teacher_assignments ta
        JOIN users u ON ta.teacher_id = u.id
        JOIN class_sections cs ON ta.class_section_id = cs.id
        JOIN classes c ON cs.class_id = c.id
        JOIN sections s ON cs.section_id = s.id
        JOIN subjects sub ON ta.subject_id = sub.id
        WHERE ta.teacher_id = $1 AND u.school_id = $2
    `;

    const res = await client.query(sql, [teacher.id, schoolId]);
    console.log("\nAssignments returned by GET:", res.rows);

    await client.end();
}

main().catch(console.error);
