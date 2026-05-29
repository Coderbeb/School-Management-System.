/**
 * Run all migrations then seed admin + test accounts
 */
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const DB = 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres';
const pool = new Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } });

const MIGRATIONS = [
    {
        name: '001_initial',
        sql: `
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'teacher' CHECK (role IN ('super_admin','hod','teacher','accountant','student')),
                phone VARCHAR(20),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS students (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE,
                phone VARCHAR(20),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `
    },
    {
        name: '007_sms_school_model',
        sql: `
            CREATE TABLE IF NOT EXISTS academic_sessions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(50) NOT NULL UNIQUE,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                is_current BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS classes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(50) NOT NULL UNIQUE,
                display_order INTEGER NOT NULL DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS sections (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(10) NOT NULL UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS class_sections (
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
            CREATE TABLE IF NOT EXISTS subjects (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(200) NOT NULL,
                code VARCHAR(20) NOT NULL UNIQUE,
                description TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS class_subjects (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                is_elective BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(class_id, subject_id, session_id)
            );
            ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(150);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_relation VARCHAR(30);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(20);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_email VARCHAR(255);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_phone_alt VARCHAR(20);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_birth DATE;
            ALTER TABLE students ADD COLUMN IF NOT EXISTS gender VARCHAR(10) CHECK (gender IN ('male','female','other'));
            ALTER TABLE students ADD COLUMN IF NOT EXISTS blood_group VARCHAR(5);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS address TEXT;
            ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url TEXT;
            ALTER TABLE students ADD COLUMN IF NOT EXISTS admission_number VARCHAR(50) UNIQUE;
            ALTER TABLE students ADD COLUMN IF NOT EXISTS admission_date DATE DEFAULT CURRENT_DATE;
            ALTER TABLE students ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
            CREATE TABLE IF NOT EXISTS student_enrollments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                class_section_id UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                roll_number INTEGER,
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','promoted','transferred','withdrawn')),
                enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, session_id)
            );
            CREATE TABLE IF NOT EXISTS teacher_assignments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                class_section_id UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
                subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                is_class_teacher BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(teacher_id, class_section_id, subject_id, session_id)
            );
            CREATE TABLE IF NOT EXISTS school_settings (
                key VARCHAR(100) PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_class_sections_session ON class_sections(session_id);
            CREATE INDEX IF NOT EXISTS idx_student_enrollments_session ON student_enrollments(session_id);
            CREATE INDEX IF NOT EXISTS idx_teacher_assignments_session ON teacher_assignments(session_id);
            INSERT INTO sections (name) VALUES ('A'),('B'),('C'),('D') ON CONFLICT (name) DO NOTHING;
            INSERT INTO classes (name, display_order) VALUES
                ('Nursery',1),('LKG',2),('UKG',3),
                ('Class 1',4),('Class 2',5),('Class 3',6),
                ('Class 4',7),('Class 5',8),('Class 6',9),
                ('Class 7',10),('Class 8',11),('Class 9',12),('Class 10',13)
            ON CONFLICT (name) DO NOTHING;
            INSERT INTO school_settings (key,value) VALUES
                ('school_name','"My School"'),('school_address','""'),
                ('school_phone','""'),('school_email','""'),
                ('whatsapp_enabled','false'),('online_fees_enabled','false')
            ON CONFLICT (key) DO NOTHING;
        `
    },
    {
        name: '008_sms_attendance',
        sql: `
            CREATE TABLE IF NOT EXISTS attendance_records (
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
            CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);
            CREATE INDEX IF NOT EXISTS idx_attendance_class_section ON attendance_records(class_section_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_records(session_id);
        `
    }
];

async function run() {
    const client = await pool.connect();
    try {
        // Create migrations table
        await client.query(`CREATE TABLE IF NOT EXISTS _migrations (name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`);
        const applied = await client.query('SELECT name FROM _migrations');
        const appliedSet = new Set(applied.rows.map(r => r.name));

        for (const m of MIGRATIONS) {
            if (appliedSet.has(m.name)) { console.log(`⏭️  Skipping ${m.name} (already applied)`); continue; }
            try {
                await client.query(m.sql);
                await client.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [m.name]);
                console.log(`✅ ${m.name} applied`);
            } catch(e) {
                console.error(`❌ ${m.name} failed:`, e.message);
            }
        }

        // Seed admin + test users
        const hash = await bcrypt.hash('Test@1234', 10);
        const users = [
            ['Super', 'Admin', 'admin@school.com', hash, 'super_admin'],
            ['Test', 'Teacher', 'teacher@school.com', hash, 'teacher'],
            ['Test', 'Accountant', 'accountant@school.com', hash, 'accountant'],
        ];
        for (const [fn, ln, email, ph, role] of users) {
            await client.query(
                `INSERT INTO users (first_name, last_name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO UPDATE SET password_hash=$4, role=$5`,
                [fn, ln, email, ph, role]
            );
            console.log(`👤 ${role}: ${email} / Test@1234`);
        }

        console.log('\n✅ Database setup complete!');
    } finally {
        client.release();
        pool.end();
    }
}

run().catch(e => { console.error('Fatal:', e.message); pool.end(); });
