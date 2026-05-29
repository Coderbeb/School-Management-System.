/**
 * HARD RESET — Drops EVERY table and rebuilds from scratch
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
    const client = await pool.connect();
    try {
        console.log('🔴 HARD RESET — dropping everything...');

        // Get all tables and drop them
        const tables = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`);
        if (tables.rows.length > 0) {
            const names = tables.rows.map(r => `"${r.tablename}"`).join(', ');
            await client.query(`DROP TABLE IF EXISTS ${names} CASCADE`);
            console.log(`✅ Dropped: ${tables.rows.map(r=>r.tablename).join(', ')}`);
        } else {
            console.log('No tables to drop.');
        }

        // Build schema from scratch
        console.log('\n🔨 Creating fresh schema...');

        await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

        // USERS
        await client.query(`
            CREATE TABLE users (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'teacher' CHECK (role IN ('super_admin','teacher','accountant','student')),
                phone VARCHAR(20),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ users');

        // STUDENTS
        await client.query(`
            CREATE TABLE students (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(20),
                date_of_birth DATE,
                gender VARCHAR(10) CHECK (gender IN ('male','female','other')),
                blood_group VARCHAR(5),
                address TEXT,
                photo_url TEXT,
                admission_number VARCHAR(50) UNIQUE,
                admission_date DATE DEFAULT CURRENT_DATE,
                guardian_name VARCHAR(150),
                guardian_relation VARCHAR(30),
                guardian_phone VARCHAR(20),
                guardian_email VARCHAR(255),
                guardian_phone_alt VARCHAR(20),
                user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ students');

        // ACADEMIC SESSIONS
        await client.query(`
            CREATE TABLE academic_sessions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(50) NOT NULL UNIQUE,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                is_current BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ academic_sessions');

        // CLASSES
        await client.query(`
            CREATE TABLE classes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(50) NOT NULL UNIQUE,
                display_order INTEGER NOT NULL DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ classes');

        // SECTIONS
        await client.query(`
            CREATE TABLE sections (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(10) NOT NULL UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ sections');

        // CLASS_SECTIONS
        await client.query(`
            CREATE TABLE class_sections (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                room_number VARCHAR(20),
                capacity INTEGER DEFAULT 40,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(class_id, section_id, session_id)
            );
            CREATE INDEX idx_class_sections_session ON class_sections(session_id);
        `);
        console.log('✅ class_sections');

        // SUBJECTS
        await client.query(`
            CREATE TABLE subjects (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(200) NOT NULL,
                code VARCHAR(20) NOT NULL UNIQUE,
                description TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ subjects');

        // CLASS_SUBJECTS
        await client.query(`
            CREATE TABLE class_subjects (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                is_elective BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(class_id, subject_id, session_id)
            );
        `);
        console.log('✅ class_subjects');

        // STUDENT_ENROLLMENTS
        await client.query(`
            CREATE TABLE student_enrollments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                class_section_id UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                roll_number INTEGER,
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','promoted','transferred','withdrawn')),
                enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, session_id)
            );
            CREATE INDEX idx_student_enrollments_session ON student_enrollments(session_id);
            CREATE INDEX idx_student_enrollments_class ON student_enrollments(class_section_id);
        `);
        console.log('✅ student_enrollments');

        // TEACHER_ASSIGNMENTS
        await client.query(`
            CREATE TABLE teacher_assignments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                class_section_id UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
                subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                is_class_teacher BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(teacher_id, class_section_id, subject_id, session_id)
            );
            CREATE INDEX idx_teacher_assignments_session ON teacher_assignments(session_id);
        `);
        console.log('✅ teacher_assignments');

        // ATTENDANCE_RECORDS
        await client.query(`
            CREATE TABLE attendance_records (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                class_section_id UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
                subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
                teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                period_number INTEGER DEFAULT 1,
                status VARCHAR(10) NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late','excused')),
                remarks TEXT,
                recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, class_section_id, subject_id, date, period_number)
            );
            CREATE INDEX idx_attendance_date ON attendance_records(date);
            CREATE INDEX idx_attendance_class_section ON attendance_records(class_section_id);
            CREATE INDEX idx_attendance_student ON attendance_records(student_id);
        `);
        console.log('✅ attendance_records');

        // SCHOOL_SETTINGS
        await client.query(`
            CREATE TABLE school_settings (
                key VARCHAR(100) PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ school_settings');

        // MIGRATIONS TRACKER
        await client.query(`
            CREATE TABLE _migrations (
                name VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO _migrations (name) VALUES
                ('001_initial'),('002_departments'),('003_subjects'),
                ('004_attendance'),('005_students'),('006_application_settings'),
                ('007_sms_school_model'),('008_sms_attendance')
            ON CONFLICT DO NOTHING;
        `);
        console.log('✅ _migrations');

        // SEED DEFAULT DATA
        console.log('\n🌱 Seeding default data...');

        await client.query(`
            INSERT INTO sections (name) VALUES ('A'),('B'),('C'),('D') ON CONFLICT DO NOTHING;
        `);

        await client.query(`
            INSERT INTO classes (name, display_order) VALUES
                ('Nursery',1),('LKG',2),('UKG',3),
                ('Class 1',4),('Class 2',5),('Class 3',6),
                ('Class 4',7),('Class 5',8),('Class 6',9),
                ('Class 7',10),('Class 8',11),('Class 9',12),('Class 10',13)
            ON CONFLICT DO NOTHING;
        `);
        console.log('✅ 13 classes + 4 sections seeded');

        await client.query(`
            INSERT INTO school_settings (key,value) VALUES
                ('school_name','"My School"'),('school_address','""'),
                ('school_phone','""'),('school_email','""'),
                ('whatsapp_enabled','false'),('online_fees_enabled','false')
            ON CONFLICT DO NOTHING;
        `);

        // SEED TEST USERS
        console.log('\n👤 Creating test accounts...');
        const hash = await bcrypt.hash('Test@1234', 10);

        const users = [
            ['Super', 'Admin', 'admin@school.com', 'super_admin'],
            ['Test', 'Teacher', 'teacher@school.com', 'teacher'],
            ['Test', 'Accountant', 'accountant@school.com', 'accountant'],
        ];

        for (const [fn, ln, email, role] of users) {
            await client.query(
                `INSERT INTO users (first_name, last_name, email, password_hash, role)
                 VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO UPDATE SET password_hash=$4, role=$5`,
                [fn, ln, email, hash, role]
            );
            console.log(`  ✅ ${role.padEnd(13)} → ${email}  /  Test@1234`);
        }

        console.log('\n🎉 Fresh database is ready!\n');
        console.log('Login Credentials:');
        console.log('  Super Admin  : admin@school.com      / Test@1234');
        console.log('  Teacher      : teacher@school.com    / Test@1234');
        console.log('  Accountant   : accountant@school.com / Test@1234');

    } finally {
        client.release();
        pool.end();
    }
}

run().catch(e => { console.error('Fatal error:', e.message); pool.end(); });
