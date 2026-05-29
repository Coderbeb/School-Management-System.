/**
 * Run the MMS migration manually
 */
const { Pool } = require('pg');
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const pool = new Pool({
    connectionString: 'postgresql://postgres:BUsuMHKbfbr4j5MY@db.lxuqpdciyftudnwdnlzu.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('🔧 Running Marks Management System migration...\n');

        // 1. Grading Scales
        await client.query(`
            CREATE TABLE IF NOT EXISTS grading_scales (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) NOT NULL,
                description TEXT,
                is_default BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ grading_scales');

        await client.query(`
            CREATE TABLE IF NOT EXISTS grade_definitions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                grading_scale_id UUID NOT NULL REFERENCES grading_scales(id) ON DELETE CASCADE,
                grade_name VARCHAR(10) NOT NULL,
                min_percentage NUMERIC(5,2) NOT NULL,
                max_percentage NUMERIC(5,2) NOT NULL,
                grade_point NUMERIC(4,2) DEFAULT 0,
                description VARCHAR(100),
                display_order INTEGER DEFAULT 0,
                UNIQUE(grading_scale_id, grade_name)
            );
        `);
        console.log('✅ grade_definitions');

        // 2. Exams
        await client.query(`
            CREATE TABLE IF NOT EXISTS exams (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(150) NOT NULL,
                exam_category VARCHAR(50) DEFAULT 'term_exam'
                    CHECK (exam_category IN ('unit_test', 'term_exam', 'practice_test', 'board_exam', 'other')),
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                grading_scale_id UUID REFERENCES grading_scales(id) ON DELETE SET NULL,
                start_date DATE,
                end_date DATE,
                weightage NUMERIC(5,2) DEFAULT 100,
                is_entry_open BOOLEAN DEFAULT false,
                is_published BOOLEAN DEFAULT false,
                is_locked BOOLEAN DEFAULT false,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name, session_id)
            );
        `);
        console.log('✅ exams');

        // 3. Mark Components
        await client.query(`
            CREATE TABLE IF NOT EXISTS mark_components (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(50) NOT NULL,
                short_name VARCHAR(10) NOT NULL,
                description TEXT,
                display_order INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name)
            );
        `);
        await client.query(`
            INSERT INTO mark_components (name, short_name, display_order) VALUES
                ('Theory', 'TH', 1),
                ('Practical', 'PR', 2),
                ('Internal Assessment', 'IA', 3),
                ('Oral', 'OR', 4),
                ('Project', 'PJ', 5)
            ON CONFLICT (name) DO NOTHING;
        `);
        console.log('✅ mark_components (with defaults)');

        // 4. Exam Subjects
        await client.query(`
            CREATE TABLE IF NOT EXISTS exam_subjects (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
                subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                total_max_marks NUMERIC(6,2) NOT NULL DEFAULT 100,
                passing_marks NUMERIC(6,2) NOT NULL DEFAULT 33,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(exam_id, subject_id, class_id)
            );
        `);
        console.log('✅ exam_subjects');

        await client.query(`
            CREATE TABLE IF NOT EXISTS exam_subject_components (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                exam_subject_id UUID NOT NULL REFERENCES exam_subjects(id) ON DELETE CASCADE,
                component_id UUID NOT NULL REFERENCES mark_components(id) ON DELETE CASCADE,
                max_marks NUMERIC(6,2) NOT NULL,
                display_order INTEGER DEFAULT 0,
                UNIQUE(exam_subject_id, component_id)
            );
        `);
        console.log('✅ exam_subject_components');

        // 5. Marks Records
        await client.query(`
            CREATE TABLE IF NOT EXISTS marks_records (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                exam_subject_id UUID NOT NULL REFERENCES exam_subjects(id) ON DELETE CASCADE,
                component_id UUID REFERENCES mark_components(id) ON DELETE SET NULL,
                marks_obtained NUMERIC(6,2),
                status VARCHAR(10) DEFAULT 'scored'
                    CHECK (status IN ('scored', 'absent', 'medical', 'exempted', 'reappear')),
                remarks TEXT,
                entered_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                entered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, exam_subject_id, component_id)
            );
        `);
        console.log('✅ marks_records');

        // 6. Marks Submissions
        await client.query(`
            CREATE TABLE IF NOT EXISTS marks_submissions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
                class_section_id UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
                subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(20) DEFAULT 'draft'
                    CHECK (status IN ('draft', 'submitted', 'locked', 'reopened')),
                submitted_at TIMESTAMP WITH TIME ZONE,
                locked_at TIMESTAMP WITH TIME ZONE,
                locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(exam_id, class_section_id, subject_id)
            );
        `);
        console.log('✅ marks_submissions');

        // 7. Co-Scholastic
        await client.query(`
            CREATE TABLE IF NOT EXISTS co_scholastic_areas (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) NOT NULL,
                description TEXT,
                display_order INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name)
            );
        `);
        await client.query(`
            INSERT INTO co_scholastic_areas (name, description, display_order) VALUES
                ('Work Education', 'Skill-based work and vocational learning', 1),
                ('Art Education', 'Visual and performing arts', 2),
                ('Health & Physical Education', 'Sports, fitness, and health awareness', 3),
                ('Discipline', 'Behavior, punctuality, and conduct', 4)
            ON CONFLICT (name) DO NOTHING;
        `);
        console.log('✅ co_scholastic_areas (with defaults)');

        await client.query(`
            CREATE TABLE IF NOT EXISTS co_scholastic_records (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
                area_id UUID NOT NULL REFERENCES co_scholastic_areas(id) ON DELETE CASCADE,
                grade VARCHAR(5) NOT NULL DEFAULT 'B',
                remarks TEXT,
                entered_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, exam_id, area_id)
            );
        `);
        console.log('✅ co_scholastic_records');

        // 8. Update user role constraint to include developer
        await client.query(`
            DO $$
            BEGIN
                ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
                ALTER TABLE users ADD CONSTRAINT users_role_check
                    CHECK (role IN ('developer', 'super_admin', 'hod', 'teacher', 'accountant', 'student'));
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;
        `);
        console.log('✅ user role constraint updated (developer added)');

        // 9. Indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_exams_session ON exams(session_id);
            CREATE INDEX IF NOT EXISTS idx_exams_published ON exams(is_published);
            CREATE INDEX IF NOT EXISTS idx_exam_subjects_exam ON exam_subjects(exam_id);
            CREATE INDEX IF NOT EXISTS idx_exam_subjects_class ON exam_subjects(class_id);
            CREATE INDEX IF NOT EXISTS idx_marks_records_student ON marks_records(student_id);
            CREATE INDEX IF NOT EXISTS idx_marks_records_exam_subject ON marks_records(exam_subject_id);
            CREATE INDEX IF NOT EXISTS idx_marks_submissions_exam ON marks_submissions(exam_id);
            CREATE INDEX IF NOT EXISTS idx_marks_submissions_teacher ON marks_submissions(teacher_id);
            CREATE INDEX IF NOT EXISTS idx_co_scholastic_student ON co_scholastic_records(student_id);
        `);
        console.log('✅ performance indexes');

        // 10. Seed grading scales
        await client.query(`
            INSERT INTO grading_scales (id, name, description, is_default)
            VALUES ('00000000-0000-0000-0000-000000000001', 'CBSE Pattern', 'Standard CBSE 8-point grading scale', true)
            ON CONFLICT DO NOTHING;
        `);
        await client.query(`
            INSERT INTO grade_definitions (grading_scale_id, grade_name, min_percentage, max_percentage, grade_point, description, display_order)
            VALUES
                ('00000000-0000-0000-0000-000000000001', 'A1', 91, 100, 10.0, 'Outstanding', 1),
                ('00000000-0000-0000-0000-000000000001', 'A2', 81, 90, 9.0, 'Excellent', 2),
                ('00000000-0000-0000-0000-000000000001', 'B1', 71, 80, 8.0, 'Very Good', 3),
                ('00000000-0000-0000-0000-000000000001', 'B2', 61, 70, 7.0, 'Good', 4),
                ('00000000-0000-0000-0000-000000000001', 'C1', 51, 60, 6.0, 'Above Average', 5),
                ('00000000-0000-0000-0000-000000000001', 'C2', 41, 50, 5.0, 'Average', 6),
                ('00000000-0000-0000-0000-000000000001', 'D', 33, 40, 4.0, 'Below Average', 7),
                ('00000000-0000-0000-0000-000000000001', 'E', 0, 32, 0, 'Needs Improvement', 8)
            ON CONFLICT DO NOTHING;
        `);

        await client.query(`
            INSERT INTO grading_scales (id, name, description)
            VALUES ('00000000-0000-0000-0000-000000000002', 'Percentage Only', 'No grades, just percentage-based results')
            ON CONFLICT DO NOTHING;
        `);

        await client.query(`
            INSERT INTO grading_scales (id, name, description)
            VALUES ('00000000-0000-0000-0000-000000000003', 'Simple (A-F)', 'Simple 5-grade scale')
            ON CONFLICT DO NOTHING;
        `);
        await client.query(`
            INSERT INTO grade_definitions (grading_scale_id, grade_name, min_percentage, max_percentage, grade_point, description, display_order)
            VALUES
                ('00000000-0000-0000-0000-000000000003', 'A', 80, 100, 4.0, 'Excellent', 1),
                ('00000000-0000-0000-0000-000000000003', 'B', 60, 79, 3.0, 'Good', 2),
                ('00000000-0000-0000-0000-000000000003', 'C', 45, 59, 2.0, 'Average', 3),
                ('00000000-0000-0000-0000-000000000003', 'D', 33, 44, 1.0, 'Below Average', 4),
                ('00000000-0000-0000-0000-000000000003', 'F', 0, 32, 0, 'Fail', 5)
            ON CONFLICT DO NOTHING;
        `);
        console.log('✅ grading scales seeded (CBSE, Percentage, Simple A-F)');

        // Mark migration as applied
        await client.query(`
            INSERT INTO _migrations (name) VALUES ('010_marks_management_system')
            ON CONFLICT DO NOTHING;
        `);

        console.log('\n🎉 Marks Management System migration complete!');
        console.log('\nNew tables created:');
        console.log('  • grading_scales, grade_definitions');
        console.log('  • exams, exam_subjects, exam_subject_components');
        console.log('  • mark_components');
        console.log('  • marks_records, marks_submissions');
        console.log('  • co_scholastic_areas, co_scholastic_records');
    } finally {
        client.release();
        pool.end();
    }
}

run().catch(e => { console.error('Fatal error:', e.message); pool.end(); });
