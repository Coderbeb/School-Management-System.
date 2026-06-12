import { Pool } from 'pg';
import dns from 'dns';

// Force IPv4 to fix ENOTFOUND on IPv6-only Supabase hosts
dns.setDefaultResultOrder('ipv4first');


/**
 * Auto-migration runner for the YSM Attendance system.
 * Runs pending SQL migrations on server startup.
 * Tracks which migrations have been applied via a `_migrations` table.
 */

const MIGRATIONS: { name: string; sql: string }[] = [
    {
        name: '001_add_semester',
        sql: `
            -- Step 1: Add semester column if not exists
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'attendance_records' AND column_name = 'semester'
                ) THEN
                    ALTER TABLE attendance_records ADD COLUMN semester INTEGER;
                    RAISE NOTICE 'Added semester column to attendance_records';
                END IF;
            END $$;

            -- Step 2: Backfill semester from student's current_semester (only if column exists)
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'students' AND column_name = 'current_semester'
                ) THEN
                    UPDATE attendance_records ar
                    SET semester = s.current_semester
                    FROM students s
                    WHERE ar.student_id = s.id AND ar.semester IS NULL;
                ELSE
                    UPDATE attendance_records SET semester = 1 WHERE semester IS NULL;
                END IF;
            END $$;

            -- Step 3: Set default for future records
            DO $$
            BEGIN
                ALTER TABLE attendance_records ALTER COLUMN semester SET DEFAULT 1;
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;

            -- Step 4: Drop old constraint, add new one with semester
            DO $$
            BEGIN
                ALTER TABLE attendance_records 
                    DROP CONSTRAINT IF EXISTS attendance_records_subject_id_student_id_teacher_id_date_le_key;
                ALTER TABLE attendance_records 
                    DROP CONSTRAINT IF EXISTS attendance_records_unique;
                ALTER TABLE attendance_records 
                    DROP CONSTRAINT IF EXISTS attendance_records_unique_v2;
            EXCEPTION WHEN OTHERS THEN
                NULL;
            END $$;

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'attendance_records_unique_with_semester'
                ) THEN
                    -- Only add constraint if legacy columns exist
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'attendance_records' AND column_name = 'lecture_number'
                    ) THEN
                        ALTER TABLE attendance_records 
                            ADD CONSTRAINT attendance_records_unique_with_semester 
                            UNIQUE(subject_id, student_id, teacher_id, date, lecture_number, semester);
                    END IF;
                END IF;
            END $$;

            -- Step 5: Add indexes (safe - only if columns exist)
            DO $$
            BEGIN
                CREATE INDEX IF NOT EXISTS idx_attendance_semester ON attendance_records(semester);
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;

            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'attendance_records' AND column_name = 'lecture_number'
                ) THEN
                    CREATE INDEX IF NOT EXISTS idx_attendance_session_count 
                        ON attendance_records(date, subject_id, semester, lecture_number);
                END IF;
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;
        `
    },
    {
        name: '002_holidays_department_id',
        sql: `
            -- Add department_id to holidays for department-specific holidays
            -- Only if departments table exists (legacy college model)
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_name = 'departments' AND table_schema = 'public'
                ) THEN
                    ALTER TABLE holidays
                    ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE CASCADE;
                END IF;
            END $$;

            -- Drop unique date constraint so multiple departments can have holidays on the same date
            ALTER TABLE holidays
            DROP CONSTRAINT IF EXISTS holidays_date_key;
        `
    },
    {
        name: '003_add_topic_column',
        sql: `
            -- Add optional topic column to attendance_records
            ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS topic VARCHAR(255);
        `
    },
    {
        name: '004_class_schedule',
        sql: `
            -- Class time slots & daily assignments: Only create if departments table exists (legacy model)
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_name = 'departments' AND table_schema = 'public'
                ) THEN
                    CREATE TABLE IF NOT EXISTS class_time_slots (
                        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                        department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
                        slot_number INTEGER NOT NULL CHECK (slot_number >= 1 AND slot_number <= 6),
                        start_time TIME NOT NULL,
                        end_time TIME NOT NULL,
                        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(department_id, slot_number)
                    );

                    CREATE TABLE IF NOT EXISTS daily_class_assignments (
                        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                        department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
                        semester INTEGER NOT NULL,
                        slot_number INTEGER NOT NULL CHECK (slot_number >= 1 AND slot_number <= 6),
                        teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
                        subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
                        date DATE NOT NULL DEFAULT CURRENT_DATE,
                        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(department_id, semester, slot_number, date)
                    );

                    CREATE INDEX IF NOT EXISTS idx_class_time_slots_dept ON class_time_slots(department_id);
                    CREATE INDEX IF NOT EXISTS idx_daily_assignments_dept_date ON daily_class_assignments(department_id, date);
                    CREATE INDEX IF NOT EXISTS idx_daily_assignments_teacher_date ON daily_class_assignments(teacher_id, date);
                ELSE
                    RAISE NOTICE 'Skipping 004_class_schedule: departments table does not exist (school model)';
                END IF;
            END $$;
        `
    },
    {
        name: '005_realtime_notify_triggers',
        sql: `
            -- Generic function for real-time NOTIFY on table changes
            CREATE OR REPLACE FUNCTION notify_table_change()
            RETURNS TRIGGER AS $$
            BEGIN
                PERFORM pg_notify(
                    'table_changes',
                    json_build_object('table', TG_TABLE_NAME, 'op', TG_OP)::text
                );
                RETURN COALESCE(NEW, OLD);
            END;
            $$ LANGUAGE plpgsql;

            -- Attach triggers to all key tables
            DO $$
            DECLARE
                tbl TEXT;
            BEGIN
                FOR tbl IN
                    SELECT unnest(ARRAY[
                        'students', 'users', 'departments', 'subjects',
                        'student_subjects', 'teacher_subjects', 'teacher_departments',
                        'holidays', 'attendance_records',
                        'class_time_slots', 'daily_class_assignments',
                        'batch_semester_config'
                    ])
                LOOP
                    -- Only add trigger if table exists
                    IF EXISTS (
                        SELECT 1 FROM information_schema.tables
                        WHERE table_name = tbl AND table_schema = 'public'
                    ) THEN
                        EXECUTE format(
                            'DROP TRIGGER IF EXISTS trg_notify_%I ON %I; ' ||
                            'CREATE TRIGGER trg_notify_%I ' ||
                            'AFTER INSERT OR UPDATE OR DELETE ON %I ' ||
                            'FOR EACH ROW EXECUTE FUNCTION notify_table_change();',
                            tbl, tbl, tbl, tbl
                        );
                    END IF;
                END LOOP;
            END $$;
        `
    },
    {
        name: '006_application_settings',
        sql: `
            -- Settings table for email automation config, etc.
            CREATE TABLE IF NOT EXISTS application_settings (
                key VARCHAR(255) PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `
    },
    {
        name: '007_sms_school_model',
        sql: `
            -- ============================================================
            -- School Management System: Core School-Based Data Model
            -- Replaces the old college model (departments/semesters)
            -- with school model (classes/sections/sessions)
            -- ============================================================

            -- Academic Sessions (e.g. "2026-2027")
            CREATE TABLE IF NOT EXISTS academic_sessions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(50) NOT NULL UNIQUE,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                is_current BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- Classes / Grade Levels (LKG, UKG, Class 1 ... Class 10)
            CREATE TABLE IF NOT EXISTS classes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(50) NOT NULL UNIQUE,
                display_order INTEGER NOT NULL DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- Sections (A, B, C, D)
            CREATE TABLE IF NOT EXISTS sections (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(10) NOT NULL UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- Class-Sections: actual classrooms (Class 10 + A + 2026-2027)
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

            -- Subjects Master List
            CREATE TABLE IF NOT EXISTS subjects (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(200) NOT NULL,
                code VARCHAR(20) NOT NULL UNIQUE,
                description TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- Class-Subject Mapping (which subjects a class studies)
            CREATE TABLE IF NOT EXISTS class_subjects (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                is_elective BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(class_id, subject_id, session_id)
            );

            -- Extend students table with guardian & personal fields
            ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(150);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_relation VARCHAR(30);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(20);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_email VARCHAR(255);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS guardian_phone_alt VARCHAR(20);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_birth DATE;
            ALTER TABLE students ADD COLUMN IF NOT EXISTS gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other'));
            ALTER TABLE students ADD COLUMN IF NOT EXISTS blood_group VARCHAR(5);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS address TEXT;
            ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url TEXT;
            ALTER TABLE students ADD COLUMN IF NOT EXISTS admission_number VARCHAR(50) UNIQUE;
            ALTER TABLE students ADD COLUMN IF NOT EXISTS admission_date DATE DEFAULT CURRENT_DATE;
            ALTER TABLE students ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

            -- Extend users table with new roles and phone
            ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
            -- Update role constraint to include accountant and student
            DO $$
            BEGIN
                ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
                ALTER TABLE users ADD CONSTRAINT users_role_check
                    CHECK (role IN ('super_admin', 'hod', 'teacher', 'accountant', 'student'));
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;

            -- Student Enrollments (Student -> ClassSection per session)
            CREATE TABLE IF NOT EXISTS student_enrollments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                class_section_id UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                roll_number INTEGER,
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'promoted', 'transferred', 'withdrawn')),
                enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, session_id)
            );

            -- Teacher Assignments (Teacher -> ClassSection + Subject per session)
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

            -- School Settings (key-value store)
            CREATE TABLE IF NOT EXISTS school_settings (
                key VARCHAR(100) PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- Performance Indexes
            CREATE INDEX IF NOT EXISTS idx_class_sections_session ON class_sections(session_id);
            CREATE INDEX IF NOT EXISTS idx_class_subjects_session ON class_subjects(session_id);
            CREATE INDEX IF NOT EXISTS idx_student_enrollments_session ON student_enrollments(session_id);
            CREATE INDEX IF NOT EXISTS idx_student_enrollments_class_section ON student_enrollments(class_section_id);
            CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher ON teacher_assignments(teacher_id);
            CREATE INDEX IF NOT EXISTS idx_teacher_assignments_session ON teacher_assignments(session_id);
            CREATE INDEX IF NOT EXISTS idx_students_guardian_phone ON students(guardian_phone);

            -- Seed default sections A, B, C, D
            INSERT INTO sections (name) VALUES ('A'), ('B'), ('C'), ('D')
            ON CONFLICT (name) DO NOTHING;

            -- Seed default school classes
            INSERT INTO classes (name, display_order) VALUES
                ('Nursery', 1), ('LKG', 2), ('UKG', 3),
                ('Class 1', 4), ('Class 2', 5), ('Class 3', 6),
                ('Class 4', 7), ('Class 5', 8), ('Class 6', 9),
                ('Class 7', 10), ('Class 8', 11), ('Class 9', 12), ('Class 10', 13)
            ON CONFLICT (name) DO NOTHING;

            -- Seed default school settings
            INSERT INTO school_settings (key, value) VALUES
                ('school_name', '"My School"'),
                ('school_address', '""'),
                ('school_phone', '""'),
                ('school_email', '""'),
                ('whatsapp_enabled', 'false'),
                ('online_fees_enabled', 'false')
            ON CONFLICT (key) DO NOTHING;
        `
    },
    {
        name: '008_sms_attendance',
        sql: `
            -- Attendance records (class-section based)
            CREATE TABLE IF NOT EXISTS attendance_records (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                class_section_id UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
                subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
                teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                period_number INTEGER DEFAULT 1,
                status VARCHAR(10) NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'excused')),
                remarks TEXT,
                recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, class_section_id, subject_id, date, period_number)
            );

            CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);
            CREATE INDEX IF NOT EXISTS idx_attendance_class_section ON attendance_records(class_section_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_records(session_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_teacher ON attendance_records(teacher_id);
        `
    },
    {
        name: '009_sms_attendance_daily_index',
        sql: `
            -- Support daily/general attendance (without subject) with a unique index on null subject
            CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_daily_idx 
            ON attendance_records (student_id, class_section_id, date, period_number) 
            WHERE subject_id IS NULL;
        `
    },
    {
        name: '010_marks_management_system',
        sql: `
            -- ============================================================
            -- Marks Management System (MMS)
            -- Complete academic evaluation, grading, and report card system
            -- ============================================================

            -- 1. GRADING SCALES
            -- Configurable per school: CBSE, ICSE, State Board, Custom
            CREATE TABLE IF NOT EXISTS grading_scales (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) NOT NULL,
                description TEXT,
                is_default BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- Individual grade definitions within a scale
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

            -- 2. EXAMS
            -- Each exam term (Unit Test 1, Half Yearly, Annual, etc.)
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

            -- 3. MARK COMPONENTS
            -- Configurable components: Theory, Practical, Internal, Oral, Project, etc.
            CREATE TABLE IF NOT EXISTS mark_components (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(50) NOT NULL,
                short_name VARCHAR(10) NOT NULL,
                description TEXT,
                display_order INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name)
            );

            -- Seed default mark components
            INSERT INTO mark_components (name, short_name, display_order) VALUES
                ('Theory', 'TH', 1),
                ('Practical', 'PR', 2),
                ('Internal Assessment', 'IA', 3),
                ('Oral', 'OR', 4),
                ('Project', 'PJ', 5)
            ON CONFLICT (name) DO NOTHING;

            -- 4. EXAM SUBJECTS
            -- Per-exam, per-subject configuration with component-wise max marks
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

            -- Component-wise breakdown for each exam-subject
            -- e.g. Science in Half Yearly: Theory=70, Practical=30
            CREATE TABLE IF NOT EXISTS exam_subject_components (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                exam_subject_id UUID NOT NULL REFERENCES exam_subjects(id) ON DELETE CASCADE,
                component_id UUID NOT NULL REFERENCES mark_components(id) ON DELETE CASCADE,
                max_marks NUMERIC(6,2) NOT NULL,
                display_order INTEGER DEFAULT 0,
                UNIQUE(exam_subject_id, component_id)
            );

            -- 5. MARKS RECORDS
            -- The core data: one row per student per exam per subject per component
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

            -- 6. MARKS SUBMISSIONS
            -- Track teacher submission status per exam/class/subject
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

            -- 7. CO-SCHOLASTIC AREAS
            -- Non-academic evaluation: Art, Sports, Discipline, etc.
            CREATE TABLE IF NOT EXISTS co_scholastic_areas (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) NOT NULL,
                description TEXT,
                display_order INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(name)
            );

            -- Co-scholastic grades per student per exam
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

            -- 8. UPDATE USER ROLE TO INCLUDE DEVELOPER
            DO $$
            BEGIN
                ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
                ALTER TABLE users ADD CONSTRAINT users_role_check
                    CHECK (role IN ('developer', 'super_admin', 'hod', 'teacher', 'accountant', 'student'));
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;

            -- 9. PERFORMANCE INDEXES
            CREATE INDEX IF NOT EXISTS idx_exams_session ON exams(session_id);
            CREATE INDEX IF NOT EXISTS idx_exams_published ON exams(is_published);
            CREATE INDEX IF NOT EXISTS idx_exam_subjects_exam ON exam_subjects(exam_id);
            CREATE INDEX IF NOT EXISTS idx_exam_subjects_class ON exam_subjects(class_id);
            CREATE INDEX IF NOT EXISTS idx_marks_records_student ON marks_records(student_id);
            CREATE INDEX IF NOT EXISTS idx_marks_records_exam_subject ON marks_records(exam_subject_id);
            CREATE INDEX IF NOT EXISTS idx_marks_submissions_exam ON marks_submissions(exam_id);
            CREATE INDEX IF NOT EXISTS idx_marks_submissions_teacher ON marks_submissions(teacher_id);
            CREATE INDEX IF NOT EXISTS idx_co_scholastic_student ON co_scholastic_records(student_id);

            -- 10. SEED DEFAULT GRADING SCALES
            -- CBSE Pattern
            INSERT INTO grading_scales (id, name, description, is_default)
            VALUES ('00000000-0000-0000-0000-000000000001', 'CBSE Pattern', 'Standard CBSE 8-point grading scale', true)
            ON CONFLICT (id) DO NOTHING;

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

            -- Percentage Only
            INSERT INTO grading_scales (id, name, description)
            VALUES ('00000000-0000-0000-0000-000000000002', 'Percentage Only', 'No grades, just percentage-based results')
            ON CONFLICT (id) DO NOTHING;

            -- Simple A-F
            INSERT INTO grading_scales (id, name, description)
            VALUES ('00000000-0000-0000-0000-000000000003', 'Simple (A-F)', 'Simple 5-grade scale')
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO grade_definitions (grading_scale_id, grade_name, min_percentage, max_percentage, grade_point, description, display_order)
            VALUES
                ('00000000-0000-0000-0000-000000000003', 'A', 80, 100, 4.0, 'Excellent', 1),
                ('00000000-0000-0000-0000-000000000003', 'B', 60, 79, 3.0, 'Good', 2),
                ('00000000-0000-0000-0000-000000000003', 'C', 45, 59, 2.0, 'Average', 3),
                ('00000000-0000-0000-0000-000000000003', 'D', 33, 44, 1.0, 'Below Average', 4),
                ('00000000-0000-0000-0000-000000000003', 'F', 0, 32, 0, 'Fail', 5)
            ON CONFLICT DO NOTHING;

            -- Seed default co-scholastic areas
            INSERT INTO co_scholastic_areas (name, description, display_order) VALUES
                ('Work Education', 'Skill-based work and vocational learning', 1),
                ('Art Education', 'Visual and performing arts', 2),
                ('Health & Physical Education', 'Sports, fitness, and health awareness', 3),
                ('Discipline', 'Behavior, punctuality, and conduct', 4)
            ON CONFLICT (name) DO NOTHING;
        `
    },
    {
        name: '011_multi_school_platform',
        sql: `
            -- ============================================================
            -- MULTI-SCHOOL PLATFORM MIGRATION
            -- Converts single-school system into multi-tenant SaaS platform
            -- ============================================================

            -- 1. SCHOOLS TABLE (The root entity)
            CREATE TABLE IF NOT EXISTS schools (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(200) NOT NULL,
                short_name VARCHAR(50),
                address TEXT,
                city VARCHAR(100),
                state VARCHAR(100),
                pincode VARCHAR(10),
                phone VARCHAR(20),
                email VARCHAR(255),
                website VARCHAR(255),
                logo_url TEXT,
                board_type VARCHAR(50) DEFAULT 'custom'
                    CHECK (board_type IN ('cbse', 'icse', 'state_board', 'custom')),
                affiliation_number VARCHAR(100),
                principal_name VARCHAR(150),
                established_year INTEGER,
                is_active BOOLEAN DEFAULT true,
                subscription_tier VARCHAR(20) DEFAULT 'free'
                    CHECK (subscription_tier IN ('free', 'basic', 'premium', 'enterprise')),
                max_students INTEGER DEFAULT 500,
                grading_scale_id UUID REFERENCES grading_scales(id) ON DELETE SET NULL,
                created_by UUID,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- 2. SCHOOL BOARD TEMPLATES (Preset configurations)
            CREATE TABLE IF NOT EXISTS school_board_templates (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                board_type VARCHAR(50) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                grading_scale_id UUID REFERENCES grading_scales(id) ON DELETE SET NULL,
                default_exam_pattern JSONB DEFAULT '[]',
                default_mark_components JSONB DEFAULT '[]',
                report_card_layout VARCHAR(50) DEFAULT 'standard',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- Ensure grading scales exist before seeding board templates (safety net)
            INSERT INTO grading_scales (id, name, description, is_default)
            VALUES ('00000000-0000-0000-0000-000000000001', 'CBSE Pattern', 'Standard CBSE 8-point grading scale', true)
            ON CONFLICT (id) DO NOTHING;
            INSERT INTO grading_scales (id, name, description)
            VALUES ('00000000-0000-0000-0000-000000000002', 'Percentage Only', 'No grades, just percentage-based results')
            ON CONFLICT (id) DO NOTHING;
            INSERT INTO grading_scales (id, name, description)
            VALUES ('00000000-0000-0000-0000-000000000003', 'Simple (A-F)', 'Simple 5-grade scale')
            ON CONFLICT (id) DO NOTHING;

            -- Seed board templates
            INSERT INTO school_board_templates (board_type, name, description, grading_scale_id, default_exam_pattern, default_mark_components) VALUES
                ('cbse', 'CBSE', 'Central Board of Secondary Education', '00000000-0000-0000-0000-000000000001',
                 '[{"name":"Periodic Test 1","category":"unit_test","weightage":10},{"name":"Periodic Test 2","category":"unit_test","weightage":10},{"name":"Half Yearly","category":"term_exam","weightage":30},{"name":"Annual Exam","category":"term_exam","weightage":50}]'::jsonb,
                 '[{"name":"Theory","short":"TH","percentage":80},{"name":"Internal Assessment","short":"IA","percentage":20}]'::jsonb),
                ('icse', 'ICSE', 'Indian Certificate of Secondary Education', '00000000-0000-0000-0000-000000000003',
                 '[{"name":"Unit Test","category":"unit_test","weightage":20},{"name":"Terminal Exam","category":"term_exam","weightage":80}]'::jsonb,
                 '[{"name":"Theory","short":"TH","percentage":70},{"name":"Practical","short":"PR","percentage":15},{"name":"Project","short":"PJ","percentage":15}]'::jsonb),
                ('state_board', 'State Board', 'Generic State Board Pattern', '00000000-0000-0000-0000-000000000003',
                 '[{"name":"First Term","category":"term_exam","weightage":40},{"name":"Second Term","category":"term_exam","weightage":60}]'::jsonb,
                 '[{"name":"Theory","short":"TH","percentage":100}]'::jsonb),
                ('custom', 'Custom', 'Fully customizable configuration', NULL,
                 '[]'::jsonb, '[]'::jsonb)
            ON CONFLICT (board_type) DO NOTHING;

            -- 3. CREATE DEFAULT SCHOOL FOR EXISTING DATA
            -- All existing data will be assigned to this school
            INSERT INTO schools (id, name, short_name, board_type, is_active, subscription_tier, max_students)
            VALUES ('00000000-0000-0000-0000-000000000099', 'Default School', 'DS', 'custom', true, 'enterprise', 9999)
            ON CONFLICT DO NOTHING;

            -- 4. ADD school_id TO ALL CORE TABLES
            -- Using DO blocks so migration is idempotent (safe to re-run)

            -- users
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='school_id') THEN
                    ALTER TABLE users ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
                    UPDATE users SET school_id = '00000000-0000-0000-0000-000000000099' WHERE school_id IS NULL AND role != 'developer';
                END IF;
            END $$;

            -- students
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='school_id') THEN
                    ALTER TABLE students ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
                    UPDATE students SET school_id = '00000000-0000-0000-0000-000000000099' WHERE school_id IS NULL;
                END IF;
            END $$;

            -- academic_sessions
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='academic_sessions' AND column_name='school_id') THEN
                    ALTER TABLE academic_sessions ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
                    UPDATE academic_sessions SET school_id = '00000000-0000-0000-0000-000000000099' WHERE school_id IS NULL;
                    -- Drop old unique on name alone, add school-scoped unique
                    ALTER TABLE academic_sessions DROP CONSTRAINT IF EXISTS academic_sessions_name_key;
                    DO $inner$ BEGIN
                        ALTER TABLE academic_sessions ADD CONSTRAINT academic_sessions_school_name_key UNIQUE(school_id, name);
                    EXCEPTION WHEN duplicate_table THEN NULL;
                    END $inner$;
                END IF;
            END $$;

            -- classes
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='classes' AND column_name='school_id') THEN
                    ALTER TABLE classes ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
                    UPDATE classes SET school_id = '00000000-0000-0000-0000-000000000099' WHERE school_id IS NULL;
                    ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_name_key;
                    DO $inner$ BEGIN
                        ALTER TABLE classes ADD CONSTRAINT classes_school_name_key UNIQUE(school_id, name);
                    EXCEPTION WHEN duplicate_table THEN NULL;
                    END $inner$;
                END IF;
            END $$;

            -- sections
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sections' AND column_name='school_id') THEN
                    ALTER TABLE sections ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
                    UPDATE sections SET school_id = '00000000-0000-0000-0000-000000000099' WHERE school_id IS NULL;
                    ALTER TABLE sections DROP CONSTRAINT IF EXISTS sections_name_key;
                    DO $inner$ BEGIN
                        ALTER TABLE sections ADD CONSTRAINT sections_school_name_key UNIQUE(school_id, name);
                    EXCEPTION WHEN duplicate_table THEN NULL;
                    END $inner$;
                END IF;
            END $$;

            -- subjects
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subjects' AND column_name='school_id') THEN
                    ALTER TABLE subjects ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
                    UPDATE subjects SET school_id = '00000000-0000-0000-0000-000000000099' WHERE school_id IS NULL;
                    ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_code_key;
                    DO $inner$ BEGIN
                        ALTER TABLE subjects ADD CONSTRAINT subjects_school_code_key UNIQUE(school_id, code);
                    EXCEPTION WHEN duplicate_table THEN NULL;
                    END $inner$;
                END IF;
            END $$;

            -- exams
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='exams' AND column_name='school_id') THEN
                    ALTER TABLE exams ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
                    UPDATE exams SET school_id = '00000000-0000-0000-0000-000000000099' WHERE school_id IS NULL;
                END IF;
            END $$;

            -- grading_scales
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grading_scales' AND column_name='school_id') THEN
                    ALTER TABLE grading_scales ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE SET NULL;
                END IF;
            END $$;

            -- co_scholastic_areas
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='co_scholastic_areas' AND column_name='school_id') THEN
                    ALTER TABLE co_scholastic_areas ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
                    UPDATE co_scholastic_areas SET school_id = '00000000-0000-0000-0000-000000000099' WHERE school_id IS NULL;
                END IF;
            END $$;

            -- school_settings (already has key, just add school_id)
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='school_settings' AND column_name='school_id') THEN
                    ALTER TABLE school_settings ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
                    UPDATE school_settings SET school_id = '00000000-0000-0000-0000-000000000099' WHERE school_id IS NULL;
                END IF;
            END $$;

            -- holidays
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='holidays' AND column_name='school_id') THEN
                    ALTER TABLE holidays ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
                    UPDATE holidays SET school_id = '00000000-0000-0000-0000-000000000099' WHERE school_id IS NULL;
                END IF;
            END $$;

            -- 5. PERFORMANCE INDEXES FOR MULTI-SCHOOL
            CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
            CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id);
            CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_school ON academic_sessions(school_id);
            CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id);
            CREATE INDEX IF NOT EXISTS idx_exams_school ON exams(school_id);
            CREATE INDEX IF NOT EXISTS idx_schools_active ON schools(is_active);

            -- 6. ENSURE DEVELOPER USER EXISTS
            -- This is the platform-level account that manages all schools
            DO $$
            DECLARE
                dev_hash TEXT;
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'developer@ysm.edu') THEN
                    SELECT crypt('Dev@2026', gen_salt('bf')) INTO dev_hash;
                    INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, school_id)
                    VALUES ('developer@ysm.edu', dev_hash, 'Platform', 'Developer', 'developer', true, NULL);
                END IF;
            EXCEPTION WHEN OTHERS THEN
                -- crypt may not be available, skip
                NULL;
            END $$;
        `
    },
    {
        name: '012_staff_attendance_and_leaves',
        sql: `
            -- ============================================================
            -- STAFF ATTENDANCE & LEAVE MANAGEMENT
            -- Geofenced check-in/check-out, leave requests with approvals
            -- ============================================================

            -- 1. STAFF ATTENDANCE TABLE
            CREATE TABLE IF NOT EXISTS staff_attendance (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                check_in_time TIMESTAMPTZ,
                check_out_time TIMESTAMPTZ,
                check_in_lat NUMERIC(10,7),
                check_in_lng NUMERIC(10,7),
                check_out_lat NUMERIC(10,7),
                check_out_lng NUMERIC(10,7),
                status VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'half_day', 'on_leave')),
                auto_status VARCHAR(20),
                remarks TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, date)
            );
            CREATE INDEX IF NOT EXISTS idx_staff_attendance_school ON staff_attendance(school_id);
            CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(date);
            CREATE INDEX IF NOT EXISTS idx_staff_attendance_user ON staff_attendance(user_id);

            -- 2. LEAVE REQUESTS TABLE
            CREATE TABLE IF NOT EXISTS leave_requests (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                leave_type VARCHAR(30) NOT NULL CHECK (leave_type IN ('sick', 'casual', 'personal', 'maternity', 'other')),
                from_date DATE NOT NULL,
                to_date DATE NOT NULL,
                reason TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
                reviewed_by UUID REFERENCES users(id),
                review_remarks TEXT,
                reviewed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_leave_requests_school ON leave_requests(school_id);
            CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON leave_requests(user_id);
            CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);

            -- 3. GEOFENCE & TIMING COLUMNS ON SCHOOLS
            ALTER TABLE schools ADD COLUMN IF NOT EXISTS geo_lat NUMERIC(10,7);
            ALTER TABLE schools ADD COLUMN IF NOT EXISTS geo_lng NUMERIC(10,7);
            ALTER TABLE schools ADD COLUMN IF NOT EXISTS geo_radius_meters INTEGER DEFAULT 200;
            ALTER TABLE schools ADD COLUMN IF NOT EXISTS staff_entry_time TIME DEFAULT '08:00';
            ALTER TABLE schools ADD COLUMN IF NOT EXISTS staff_grace_minutes INTEGER DEFAULT 15;
            ALTER TABLE schools ADD COLUMN IF NOT EXISTS staff_exit_time TIME DEFAULT '15:30';
        `
    },
    {
        name: '013_fee_management_v2',
        sql: `
            -- 1. Payment Gateway Config (per school — stores their Razorpay credentials)
            CREATE TABLE IF NOT EXISTS payment_gateway_config (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
                gateway_type VARCHAR(20) DEFAULT 'razorpay' CHECK (gateway_type IN ('razorpay', 'stripe')),
                key_id TEXT,                             -- Encrypted Razorpay Key ID
                key_secret TEXT,                         -- Encrypted Razorpay Key Secret
                webhook_secret TEXT,                     -- For webhook signature verification
                is_active BOOLEAN DEFAULT false,
                -- School bank details (for receipts)
                bank_name VARCHAR(200),
                bank_account_number VARCHAR(50),
                bank_ifsc VARCHAR(20),
                bank_account_name VARCHAR(200),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, gateway_type)
            );

            -- 2. Developer Platform Config (global — Developer's Razorpay + charge model)
            CREATE TABLE IF NOT EXISTS platform_config (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                developer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                razorpay_key_id TEXT,                    -- Developer's Razorpay Key (encrypted)
                razorpay_key_secret TEXT,                -- Developer's Razorpay Secret (encrypted)
                charge_model VARCHAR(30) DEFAULT 'monthly_flat' CHECK (charge_model IN ('monthly_flat', 'per_student', 'per_transaction')),
                charge_amount DECIMAL(10, 2) DEFAULT 0,  -- Flat amount or per-student amount
                charge_percentage DECIMAL(5, 2) DEFAULT 0, -- For per_transaction model
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- 3. Platform Charges (monthly billing records for each school)
            CREATE TABLE IF NOT EXISTS platform_charges (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
                billing_month VARCHAR(7) NOT NULL,       -- '2026-05'
                student_count INTEGER DEFAULT 0,
                charge_model VARCHAR(30),
                charge_amount DECIMAL(10, 2) DEFAULT 0,
                total_amount DECIMAL(10, 2) NOT NULL,
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
                razorpay_payment_id TEXT,
                paid_at TIMESTAMP WITH TIME ZONE,
                due_date DATE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, billing_month)
            );

            -- 4. Fee Payment Orders (Razorpay order tracking for student online payments)
            CREATE TABLE IF NOT EXISTS fee_payment_orders (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                fee_structure_id UUID REFERENCES fee_structures(id) ON DELETE CASCADE,
                invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
                school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
                razorpay_order_id TEXT UNIQUE,
                razorpay_payment_id TEXT,
                razorpay_signature TEXT,
                amount DECIMAL(10, 2) NOT NULL,
                status VARCHAR(20) DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'expired')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- 5. Add new columns to fee_structures
            ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS frequency VARCHAR(20) DEFAULT 'one_time' CHECK (frequency IN ('monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time'));
            ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS late_fee_per_day DECIMAL(10, 2) DEFAULT 0;
            ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS grace_period_days INTEGER DEFAULT 0;

            -- 6. Add Razorpay tracking to fee_payments
            ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
            ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
            ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;

            -- 7. Indexes
            CREATE INDEX IF NOT EXISTS idx_pgc_school ON payment_gateway_config(school_id);
            CREATE INDEX IF NOT EXISTS idx_platform_charges_school ON platform_charges(school_id);
            CREATE INDEX IF NOT EXISTS idx_platform_charges_month ON platform_charges(billing_month);
            CREATE INDEX IF NOT EXISTS idx_fpo_student ON fee_payment_orders(student_id);
            CREATE INDEX IF NOT EXISTS idx_fpo_order ON fee_payment_orders(razorpay_order_id);
            CREATE INDEX IF NOT EXISTS idx_fee_payments_school ON fee_payments(school_id);
        `
    },
    {
        name: '014_fee_system_complete',
        sql: `
            -- salary_structures table
            CREATE TABLE IF NOT EXISTS salary_structures (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                role_target VARCHAR(20) DEFAULT 'teacher' CHECK (role_target IN ('teacher', 'accountant', 'all_staff')),
                designation VARCHAR(100),
                base_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
                allowances JSONB DEFAULT '{}',
                deductions JSONB DEFAULT '{}',
                net_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
                effective_from DATE DEFAULT CURRENT_DATE,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_salary_structures_school ON salary_structures(school_id);
            CREATE INDEX IF NOT EXISTS idx_salary_structures_user ON salary_structures(user_id);

            -- salary_payments table
            CREATE TABLE IF NOT EXISTS salary_payments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                salary_structure_id UUID REFERENCES salary_structures(id) ON DELETE SET NULL,
                month VARCHAR(7) NOT NULL,
                gross_amount DECIMAL(12,2) NOT NULL,
                deductions_amount DECIMAL(12,2) DEFAULT 0,
                net_amount DECIMAL(12,2) NOT NULL,
                payment_mode VARCHAR(20) DEFAULT 'bank_transfer' CHECK (payment_mode IN ('cash', 'bank_transfer', 'upi', 'cheque')),
                payment_date DATE DEFAULT CURRENT_DATE,
                reference_number TEXT,
                remarks TEXT,
                paid_by UUID REFERENCES users(id),
                status VARCHAR(20) DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'cancelled')),
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_salary_payments_school ON salary_payments(school_id);
            CREATE INDEX IF NOT EXISTS idx_salary_payments_user ON salary_payments(user_id);
            CREATE INDEX IF NOT EXISTS idx_salary_payments_month ON salary_payments(month);

            -- fee_concessions table
            CREATE TABLE IF NOT EXISTS fee_concessions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                fee_structure_id UUID REFERENCES fee_structures(id) ON DELETE CASCADE,
                concession_type VARCHAR(20) DEFAULT 'percentage' CHECK (concession_type IN ('percentage', 'fixed_amount')),
                value DECIMAL(10,2) NOT NULL DEFAULT 0,
                reason TEXT,
                approved_by UUID REFERENCES users(id),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_fee_concessions_school ON fee_concessions(school_id);
            CREATE INDEX IF NOT EXISTS idx_fee_concessions_student ON fee_concessions(student_id);

            -- Alter platform_charges for offline payments
            ALTER TABLE platform_charges ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20) DEFAULT 'online';
            ALTER TABLE platform_charges ADD COLUMN IF NOT EXISTS payment_reference TEXT;
            ALTER TABLE platform_charges ADD COLUMN IF NOT EXISTS marked_by UUID REFERENCES users(id);

            -- Alter fee_structures for late fee toggle
            ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS late_fee_enabled BOOLEAN DEFAULT false;
            ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS concession_allowed BOOLEAN DEFAULT true;

            -- School-level feature flags
            ALTER TABLE schools ADD COLUMN IF NOT EXISTS late_fee_enabled BOOLEAN DEFAULT false;
            ALTER TABLE schools ADD COLUMN IF NOT EXISTS concession_enabled BOOLEAN DEFAULT false;
        `
    },
    {
        name: '015_invoice_ledger_system',
        sql: `
            -- 1. FEE HEADS (master list of charge types per school)
            CREATE TABLE IF NOT EXISTS fee_heads (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                category VARCHAR(50) DEFAULT 'academic' CHECK (category IN ('academic', 'transport', 'hostel', 'activity', 'one_time', 'other')),
                is_taxable BOOLEAN DEFAULT false,
                tax_rate DECIMAL(5, 2) DEFAULT 0,
                hsn_code VARCHAR(20),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, name)
            );

            -- 2. FEE GROUPS (bundles of fee heads per school)
            CREATE TABLE IF NOT EXISTS fee_groups (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, name)
            );

            -- 3. FEE GROUP HEADS (junction table linking heads to groups with specific amount & frequency)
            CREATE TABLE IF NOT EXISTS fee_group_heads (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                fee_group_id UUID NOT NULL REFERENCES fee_groups(id) ON DELETE CASCADE,
                fee_head_id UUID NOT NULL REFERENCES fee_heads(id) ON DELETE CASCADE,
                amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                frequency VARCHAR(30) DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(fee_group_id, fee_head_id)
            );

            -- 4. STUDENT FEE GROUPS (assigning students to fee groups for a session)
            CREATE TABLE IF NOT EXISTS student_fee_groups (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                fee_group_id UUID NOT NULL REFERENCES fee_groups(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, fee_group_id, session_id)
            );

            -- 5. INVOICES
            CREATE TABLE IF NOT EXISTS invoices (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                invoice_number VARCHAR(50) NOT NULL UNIQUE,
                due_date DATE NOT NULL,
                billing_period_start DATE,
                billing_period_end DATE,
                subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
                tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                late_fee_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                status VARCHAR(20) DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'void', 'overdue')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- 6. INVOICE ITEMS (individual lines in an invoice)
            CREATE TABLE IF NOT EXISTS invoice_items (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
                fee_head_id UUID REFERENCES fee_heads(id) ON DELETE SET NULL,
                name VARCHAR(150) NOT NULL,
                amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0
            );

            -- 7. ALTER fee_payments to link to invoice
            ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

            -- 8. INDEXES for fast lookups
            CREATE INDEX IF NOT EXISTS idx_fee_heads_school ON fee_heads(school_id);
            CREATE INDEX IF NOT EXISTS idx_fee_groups_school ON fee_groups(school_id);
            CREATE INDEX IF NOT EXISTS idx_invoices_school ON invoices(school_id);
            CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id);
            CREATE INDEX IF NOT EXISTS idx_invoices_session ON invoices(session_id);
            CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
            CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
            CREATE INDEX IF NOT EXISTS idx_fee_payments_invoice ON fee_payments(invoice_id);
        `
    },
    {
        name: '016_fee_groups_hierarchy',
        sql: `
            -- ============================================================
            -- FEE GROUPS HIERARCHY UPGRADE
            -- Adds class-range targeting, auto-assignment, and scope control
            -- to fee_groups for full multi-school fee hierarchy support.
            -- ============================================================

            -- 1. Target classes: which classes this group applies to (array of class UUIDs)
            ALTER TABLE fee_groups ADD COLUMN IF NOT EXISTS target_class_ids UUID[] DEFAULT '{}';

            -- 2. Is this a default/mandatory group that auto-assigns on enrollment?
            ALTER TABLE fee_groups ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

            -- 3. Scope: 'all' = every student, 'specific_classes' = only target classes, 'individual' = manual
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'fee_groups' AND column_name = 'apply_to'
                ) THEN
                    ALTER TABLE fee_groups ADD COLUMN apply_to VARCHAR(20) DEFAULT 'individual';
                    ALTER TABLE fee_groups ADD CONSTRAINT fee_groups_apply_to_check
                        CHECK (apply_to IN ('all', 'specific_classes', 'individual'));
                END IF;
            END $$;

            -- 4. Display order for sorting in UI
            ALTER TABLE fee_groups ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

            -- 5. Active flag to enable/disable without deleting
            ALTER TABLE fee_groups ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

            -- 6. Indexes for efficient queries
            CREATE INDEX IF NOT EXISTS idx_fee_groups_apply_to ON fee_groups(apply_to);
            CREATE INDEX IF NOT EXISTS idx_fee_groups_is_default ON fee_groups(is_default);
            CREATE INDEX IF NOT EXISTS idx_fee_groups_active ON fee_groups(is_active);
        `
    },
    {
        name: '017_platform_charges_description',
        sql: `
            ALTER TABLE platform_charges ADD COLUMN IF NOT EXISTS description TEXT;
        `
    },
    {
        name: '018_fix_payment_orders_schema',
        sql: `
            -- Fix fee_payment_orders: add invoice_id and make fee_structure_id nullable
            ALTER TABLE fee_payment_orders ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

            -- Make fee_structure_id nullable (it was NOT NULL but invoice payments don't have one)
            DO $$ BEGIN
                ALTER TABLE fee_payment_orders ALTER COLUMN fee_structure_id DROP NOT NULL;
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;

            -- Make fee_payments.fee_structure_id nullable (invoice payments use invoice_id instead)
            DO $$ BEGIN
                ALTER TABLE fee_payments ALTER COLUMN fee_structure_id DROP NOT NULL;
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;

            -- Index for invoice lookups on orders
            CREATE INDEX IF NOT EXISTS idx_fpo_invoice ON fee_payment_orders(invoice_id);
        `
    },
    {
        name: '019_fix_platform_config_upsert',
        sql: `
            -- platform_config is a singleton table (only 1 row for the entire platform).
            -- The developer config API uses ON CONFLICT ((true)) to upsert,
            -- which requires a unique index on the expression (true).
            CREATE UNIQUE INDEX IF NOT EXISTS platform_config_singleton ON platform_config ((true));
        `
    },
    {
        name: '020_fee_system_v3',
        sql: `
            -- ============================================================
            -- FEE SYSTEM V3 — Phase 1 Migration
            -- Billing periods, frequency-aware invoicing, enhanced concessions
            -- ============================================================

            -- 1. Add billing_month to invoices (e.g. '2026-06')
            ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_month VARCHAR(7);

            -- 2. Add billing_type to invoices
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'invoices' AND column_name = 'billing_type'
                ) THEN
                    ALTER TABLE invoices ADD COLUMN billing_type VARCHAR(20) DEFAULT 'regular';
                    ALTER TABLE invoices ADD CONSTRAINT invoices_billing_type_check
                        CHECK (billing_type IN ('regular', 'adhoc', 'arrear'));
                END IF;
            END $$;

            -- 3. Unique index to prevent duplicate invoices per student+session+billing_month
            --    (only for regular invoices with a billing_month set, excludes voided invoices)
            CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_unique_billing
                ON invoices(student_id, session_id, billing_month)
                WHERE billing_month IS NOT NULL AND status != 'void' AND billing_type = 'regular';

            -- 4. Index for billing_month lookups
            CREATE INDEX IF NOT EXISTS idx_invoices_billing_month ON invoices(billing_month);
            CREATE INDEX IF NOT EXISTS idx_invoices_billing_type ON invoices(billing_type);

            -- 5. Enhanced concessions: add category and optional fee_head_id targeting
            ALTER TABLE fee_concessions ADD COLUMN IF NOT EXISTS category VARCHAR(50)
                DEFAULT 'other';
            ALTER TABLE fee_concessions ADD COLUMN IF NOT EXISTS fee_head_id UUID REFERENCES fee_heads(id) ON DELETE SET NULL;

            -- Update the category constraint (safe to re-run)
            DO $$ BEGIN
                ALTER TABLE fee_concessions DROP CONSTRAINT IF EXISTS fee_concessions_category_check;
                ALTER TABLE fee_concessions ADD CONSTRAINT fee_concessions_category_check
                    CHECK (category IN ('scholarship', 'sibling', 'rte', 'staff_child', 'merit', 'financial_need', 'other'));
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;

            -- 6. Fee schedule table (when each group gets billed during the year)
            CREATE TABLE IF NOT EXISTS fee_schedule (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                fee_group_id UUID NOT NULL REFERENCES fee_groups(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                billing_months TEXT[] NOT NULL DEFAULT '{}',
                due_day INTEGER DEFAULT 10,
                grace_days INTEGER DEFAULT 7,
                late_fee_per_day DECIMAL(10, 2) DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, fee_group_id, session_id)
            );
            CREATE INDEX IF NOT EXISTS idx_fee_schedule_school ON fee_schedule(school_id);
            CREATE INDEX IF NOT EXISTS idx_fee_schedule_group ON fee_schedule(fee_group_id);

            -- 7. Auto-invoice log table (tracks automatic invoice generation runs)
            CREATE TABLE IF NOT EXISTS auto_invoice_log (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                billing_month VARCHAR(7) NOT NULL,
                students_processed INTEGER DEFAULT 0,
                invoices_generated INTEGER DEFAULT 0,
                invoices_skipped INTEGER DEFAULT 0,
                errors INTEGER DEFAULT 0,
                error_details TEXT,
                triggered_by VARCHAR(20) DEFAULT 'cron' CHECK (triggered_by IN ('cron', 'manual')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_auto_invoice_log_school ON auto_invoice_log(school_id);

            -- 8. Add auto_invoice_enabled and auto_invoice_day to schools
            ALTER TABLE schools ADD COLUMN IF NOT EXISTS auto_invoice_enabled BOOLEAN DEFAULT false;
            ALTER TABLE schools ADD COLUMN IF NOT EXISTS auto_invoice_day INTEGER DEFAULT 1;
        `
    },
    {
        name: '021_fee_refunds',
        sql: `
            -- Fee refunds table for tracking refund records
            CREATE TABLE IF NOT EXISTS fee_refunds (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                payment_id UUID REFERENCES fee_payments(id) ON DELETE SET NULL,
                invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
                amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
                reason TEXT,
                refund_mode VARCHAR(30) DEFAULT 'cash'
                    CHECK (refund_mode IN ('cash', 'upi', 'bank_transfer', 'cheque', 'adjustment')),
                refund_date DATE DEFAULT CURRENT_DATE,
                approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
                status VARCHAR(20) DEFAULT 'completed'
                    CHECK (status IN ('pending', 'completed', 'cancelled')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_fee_refunds_school ON fee_refunds(school_id);
            CREATE INDEX IF NOT EXISTS idx_fee_refunds_student ON fee_refunds(student_id);
        `
    },
    {
        name: '022_flexible_exam_system',
        sql: `
            -- ============================================================
            -- FLEXIBLE EXAMINATION SYSTEM
            -- Supports any exam pattern: standalone, grouped, consolidated,
            -- teacher tests, configurable result rules.
            -- ============================================================

            -- 1. EXAM GROUPS (optional term/consolidation structure)
            -- Schools that want consolidated results create groups.
            -- Schools that don't simply skip this — no impact.
            CREATE TABLE IF NOT EXISTS exam_groups (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                name VARCHAR(150) NOT NULL,
                description TEXT,
                aggregation_method VARCHAR(30) DEFAULT 'weighted_sum'
                    CHECK (aggregation_method IN (
                        'weighted_sum',
                        'average',
                        'best_of_n',
                        'latest',
                        'cumulative'
                    )),
                best_of_count INTEGER,
                generates_report_card BOOLEAN DEFAULT true,
                display_order INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, session_id, name)
            );

            CREATE INDEX IF NOT EXISTS idx_exam_groups_school ON exam_groups(school_id);
            CREATE INDEX IF NOT EXISTS idx_exam_groups_session ON exam_groups(session_id);

            -- 2. EXAM GROUP MEMBERS (which exams belong to a group + their weightage)
            CREATE TABLE IF NOT EXISTS exam_group_members (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                exam_group_id UUID NOT NULL REFERENCES exam_groups(id) ON DELETE CASCADE,
                exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
                weightage NUMERIC(5,2) NOT NULL DEFAULT 100,
                display_order INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(exam_group_id, exam_id)
            );

            CREATE INDEX IF NOT EXISTS idx_egm_group ON exam_group_members(exam_group_id);
            CREATE INDEX IF NOT EXISTS idx_egm_exam ON exam_group_members(exam_id);

            -- 3. NEW COLUMNS ON EXAMS
            -- generates_report_card: whether this individual exam produces a report card
            ALTER TABLE exams ADD COLUMN IF NOT EXISTS generates_report_card BOOLEAN DEFAULT true;

            -- is_teacher_test: informal test created by a teacher (not counted in formal results)
            ALTER TABLE exams ADD COLUMN IF NOT EXISTS is_teacher_test BOOLEAN DEFAULT false;

            -- created_by: who created this exam (admin or teacher)
            ALTER TABLE exams ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

            -- display_order: for ordering in the UI
            ALTER TABLE exams ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

            -- Remove rigid exam_category CHECK constraint — allow any string
            DO $$ BEGIN
                ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_exam_category_check;
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;
            -- Widen the column and keep it free-text (no CHECK)
            ALTER TABLE exams ALTER COLUMN exam_category TYPE VARCHAR(50);

            -- 4. SCHOOL-SCOPED MARK COMPONENTS
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mark_components' AND column_name='school_id') THEN
                    ALTER TABLE mark_components ADD COLUMN school_id UUID REFERENCES schools(id) ON DELETE CASCADE;
                    -- Global defaults (school_id = NULL) remain available to all schools
                END IF;
            END $$;

            -- 5. COMPONENT-LEVEL PASSING MARKS
            ALTER TABLE exam_subject_components ADD COLUMN IF NOT EXISTS passing_marks NUMERIC(6,2) DEFAULT 0;

            -- 6. RESULT PRESET ON SCHOOLS
            -- standard: >2 fail = FAIL, 1-2 = COMPARTMENT
            -- strict: any fail = FAIL
            -- grade_only: no numeric pass/fail, only grades
            -- percentage_only: no grades, just percentage
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schools' AND column_name='result_preset') THEN
                    ALTER TABLE schools ADD COLUMN result_preset VARCHAR(30) DEFAULT 'standard';
                END IF;
            END $$;
        `
    },
    {
        name: '023_notification_system',
        sql: `
            -- Notification log table
            CREATE TABLE IF NOT EXISTS notification_log (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
                student_id UUID REFERENCES students(id) ON DELETE SET NULL,
                event_type VARCHAR(50) NOT NULL,
                channel VARCHAR(20) NOT NULL CHECK (channel IN ('whatsapp', 'email')),
                recipient_phone VARCHAR(20),
                recipient_email VARCHAR(255),
                template_key VARCHAR(100),
                variables JSONB DEFAULT '{}',
                message_body TEXT,
                status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'mock')),
                error_message TEXT,
                sent_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_notification_log_school ON notification_log(school_id);
            CREATE INDEX IF NOT EXISTS idx_notification_log_event ON notification_log(event_type);
            CREATE INDEX IF NOT EXISTS idx_notification_log_student ON notification_log(student_id);
            CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at DESC);

            -- Seed notification settings
            INSERT INTO school_settings (key, value, school_id) VALUES
                ('notification_email_enabled', 'false', '00000000-0000-0000-0000-000000000099'),
                ('notification_whatsapp_enabled', 'false', '00000000-0000-0000-0000-000000000099'),
                ('smtp_host', '""', '00000000-0000-0000-0000-000000000099'),
                ('smtp_port', '"587"', '00000000-0000-0000-0000-000000000099'),
                ('smtp_user', '""', '00000000-0000-0000-0000-000000000099'),
                ('smtp_password', '""', '00000000-0000-0000-0000-000000000099'),
                ('smtp_from_email', '""', '00000000-0000-0000-0000-000000000099'),
                ('smtp_from_name', '""', '00000000-0000-0000-0000-000000000099'),
                ('whatsapp_provider', '"meta"', '00000000-0000-0000-0000-000000000099'),
                ('whatsapp_api_key', '""', '00000000-0000-0000-0000-000000000099'),
                ('whatsapp_phone_number_id', '""', '00000000-0000-0000-0000-000000000099')
            ON CONFLICT (key, school_id) DO NOTHING;
        `
    },
    {
        name: '024_admission_system',
        sql: `
            -- ============================================================
            -- STUDENT ADMISSION SYSTEM
            -- End-to-end pipeline: Enquiry → Application → Review → Enroll
            -- ============================================================

            -- 1. ADMISSION ENQUIRIES (first touchpoint)
            CREATE TABLE IF NOT EXISTS admission_enquiries (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                student_name VARCHAR(150) NOT NULL,
                guardian_name VARCHAR(150) NOT NULL,
                guardian_phone VARCHAR(20) NOT NULL,
                guardian_email VARCHAR(255),
                class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                date_of_birth DATE,
                gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
                previous_school VARCHAR(255),
                source VARCHAR(30) DEFAULT 'walk_in'
                    CHECK (source IN ('walk_in', 'online', 'referral', 'advertisement', 'other')),
                status VARCHAR(20) DEFAULT 'new'
                    CHECK (status IN ('new', 'contacted', 'follow_up', 'converted', 'closed')),
                notes TEXT,
                follow_up_date DATE,
                assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
                created_by UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_admission_enquiries_school ON admission_enquiries(school_id);
            CREATE INDEX IF NOT EXISTS idx_admission_enquiries_session ON admission_enquiries(session_id);
            CREATE INDEX IF NOT EXISTS idx_admission_enquiries_status ON admission_enquiries(status);
            CREATE INDEX IF NOT EXISTS idx_admission_enquiries_class ON admission_enquiries(class_id);

            -- 2. ADMISSION APPLICATIONS (full application form)
            CREATE TABLE IF NOT EXISTS admission_applications (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                enquiry_id UUID REFERENCES admission_enquiries(id) ON DELETE SET NULL,
                application_number VARCHAR(50) NOT NULL,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,

                -- Student info
                student_name VARCHAR(150) NOT NULL,
                date_of_birth DATE NOT NULL,
                gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female', 'other')),
                blood_group VARCHAR(5),
                nationality VARCHAR(50) DEFAULT 'Indian',
                religion VARCHAR(50),
                caste_category VARCHAR(30),
                aadhar_number VARCHAR(20),
                address TEXT,
                city VARCHAR(100),
                state VARCHAR(100),
                pincode VARCHAR(10),
                photo_url TEXT,

                -- Previous school
                previous_school VARCHAR(255),
                previous_class VARCHAR(50),
                previous_percentage NUMERIC(5,2),
                tc_number VARCHAR(50),

                -- Guardian info
                father_name VARCHAR(150),
                father_phone VARCHAR(20),
                father_email VARCHAR(255),
                father_occupation VARCHAR(100),
                father_income VARCHAR(50),
                mother_name VARCHAR(150),
                mother_phone VARCHAR(20),
                mother_email VARCHAR(255),
                mother_occupation VARCHAR(100),
                guardian_name VARCHAR(150),
                guardian_relation VARCHAR(30),
                guardian_phone VARCHAR(20) NOT NULL,
                guardian_email VARCHAR(255),

                -- Medical
                medical_conditions TEXT,
                allergies TEXT,
                emergency_contact_name VARCHAR(150),
                emergency_contact_phone VARCHAR(20),

                -- Custom data
                custom_fields JSONB DEFAULT '{}',

                -- Status
                status VARCHAR(20) DEFAULT 'submitted'
                    CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'waitlisted', 'enrolled')),
                reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
                review_remarks TEXT,
                submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TIMESTAMP WITH TIME ZONE,

                -- Fees
                registration_fee DECIMAL(10,2) DEFAULT 0,
                registration_fee_paid BOOLEAN DEFAULT false,

                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, application_number)
            );
            CREATE INDEX IF NOT EXISTS idx_admission_apps_school ON admission_applications(school_id);
            CREATE INDEX IF NOT EXISTS idx_admission_apps_session ON admission_applications(session_id);
            CREATE INDEX IF NOT EXISTS idx_admission_apps_status ON admission_applications(status);
            CREATE INDEX IF NOT EXISTS idx_admission_apps_class ON admission_applications(class_id);
            CREATE INDEX IF NOT EXISTS idx_admission_apps_guardian_phone ON admission_applications(guardian_phone);

            -- 3. ADMISSION DOCUMENTS (uploaded files)
            CREATE TABLE IF NOT EXISTS admission_documents (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                application_id UUID NOT NULL REFERENCES admission_applications(id) ON DELETE CASCADE,
                document_type VARCHAR(50) NOT NULL
                    CHECK (document_type IN ('birth_certificate', 'aadhar_card', 'transfer_certificate', 'marksheet', 'photo', 'address_proof', 'caste_certificate', 'medical_certificate', 'other')),
                document_name VARCHAR(255) NOT NULL,
                file_url TEXT NOT NULL,
                is_verified BOOLEAN DEFAULT false,
                verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
                uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_admission_docs_app ON admission_documents(application_id);

            -- 4. ADMISSION SETTINGS (per school config)
            INSERT INTO school_settings (key, value, school_id) VALUES
                ('admission_open', 'false', '00000000-0000-0000-0000-000000000099'),
                ('admission_registration_fee', '0', '00000000-0000-0000-0000-000000000099'),
                ('admission_auto_number_prefix', '"ADM"', '00000000-0000-0000-0000-000000000099'),
                ('admission_auto_number_counter', '0', '00000000-0000-0000-0000-000000000099'),
                ('admission_required_documents', '["birth_certificate","photo","aadhar_card"]', '00000000-0000-0000-0000-000000000099')
            ON CONFLICT (key, school_id) DO NOTHING;
        `
    },
    {
        name: '025_student_promotion',
        sql: `
            -- ============================================================
            -- STUDENT PROMOTION & HISTORY SYSTEM
            -- Track promotions, retentions, transfers, and full history
            -- ============================================================

            -- 1. STUDENT PROMOTIONS LOG
            CREATE TABLE IF NOT EXISTS student_promotions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                from_class_section_id UUID REFERENCES class_sections(id) ON DELETE SET NULL,
                to_class_section_id UUID REFERENCES class_sections(id) ON DELETE SET NULL,
                from_session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                to_session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                action VARCHAR(20) NOT NULL DEFAULT 'promoted'
                    CHECK (action IN ('promoted', 'retained', 'transferred_out', 'withdrawn', 'graduated', 'tc_issued')),
                remarks TEXT,
                batch_id UUID,
                promoted_by UUID REFERENCES users(id) ON DELETE SET NULL,
                promoted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_promotions_school ON student_promotions(school_id);
            CREATE INDEX IF NOT EXISTS idx_promotions_student ON student_promotions(student_id);
            CREATE INDEX IF NOT EXISTS idx_promotions_batch ON student_promotions(batch_id);
            CREATE INDEX IF NOT EXISTS idx_promotions_session ON student_promotions(from_session_id);

            -- 2. STUDENT DOCUMENTS (general doc storage)
            CREATE TABLE IF NOT EXISTS student_documents (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                document_type VARCHAR(50) NOT NULL,
                document_name VARCHAR(255) NOT NULL,
                file_url TEXT,
                uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
                uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_student_docs_school ON student_documents(school_id);
            CREATE INDEX IF NOT EXISTS idx_student_docs_student ON student_documents(student_id);
        `
    },
    {
        name: '026_certificate_system',
        sql: `
            -- ============================================================
            -- CERTIFICATE GENERATION SYSTEM
            -- TC, Bonafide, Character, and custom certificates
            -- ============================================================

            -- 1. CERTIFICATE TEMPLATES
            CREATE TABLE IF NOT EXISTS certificate_templates (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                name VARCHAR(150) NOT NULL,
                type VARCHAR(30) NOT NULL DEFAULT 'custom'
                    CHECK (type IN ('transfer_certificate', 'bonafide', 'character', 'study', 'conduct', 'custom')),
                html_template TEXT NOT NULL DEFAULT '',
                css_styles TEXT DEFAULT '',
                placeholders JSONB DEFAULT '[]',
                is_default BOOLEAN DEFAULT false,
                is_active BOOLEAN DEFAULT true,
                created_by UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, name)
            );
            CREATE INDEX IF NOT EXISTS idx_cert_templates_school ON certificate_templates(school_id);
            CREATE INDEX IF NOT EXISTS idx_cert_templates_type ON certificate_templates(type);

            -- 2. ISSUED CERTIFICATES
            CREATE TABLE IF NOT EXISTS issued_certificates (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                template_id UUID NOT NULL REFERENCES certificate_templates(id) ON DELETE CASCADE,
                certificate_number VARCHAR(50) NOT NULL,
                data JSONB DEFAULT '{}',
                issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
                issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                revoked BOOLEAN DEFAULT false,
                revoked_reason TEXT,
                UNIQUE(school_id, certificate_number)
            );
            CREATE INDEX IF NOT EXISTS idx_issued_certs_school ON issued_certificates(school_id);
            CREATE INDEX IF NOT EXISTS idx_issued_certs_student ON issued_certificates(student_id);
            CREATE INDEX IF NOT EXISTS idx_issued_certs_template ON issued_certificates(template_id);

            -- 3. Seed default templates
            -- (will be populated per-school on first access)
        `
    },
    {
        name: '027_student_categories',
        sql: `
            -- ============================================================
            -- STUDENT CATEGORIES
            -- For fee concessions, government reporting, filtering
            -- ============================================================

            CREATE TABLE IF NOT EXISTS student_categories (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                fee_discount_percentage NUMERIC(5,2) DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                display_order INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, name)
            );
            CREATE INDEX IF NOT EXISTS idx_student_cats_school ON student_categories(school_id);

            -- Add category_id to students
            ALTER TABLE students ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES student_categories(id) ON DELETE SET NULL;
            CREATE INDEX IF NOT EXISTS idx_students_category ON students(category_id);

            -- Add nationality and religion to students if missing
            ALTER TABLE students ADD COLUMN IF NOT EXISTS nationality VARCHAR(50) DEFAULT 'Indian';
            ALTER TABLE students ADD COLUMN IF NOT EXISTS religion VARCHAR(50);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS caste_category VARCHAR(30);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS aadhar_number VARCHAR(20);
            ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_school VARCHAR(255);
        `
    },
    {
        name: '028_transport_system',
        sql: `
            -- ============================================================
            -- TRANSPORT MANAGEMENT SYSTEM
            -- ============================================================

            -- 1. VEHICLES
            CREATE TABLE IF NOT EXISTS transport_vehicles (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                vehicle_number VARCHAR(50) NOT NULL,
                vehicle_type VARCHAR(30) NOT NULL CHECK (vehicle_type IN ('bus', 'van', 'auto', 'other')),
                capacity INTEGER NOT NULL,
                driver_name VARCHAR(150),
                driver_phone VARCHAR(20),
                insurance_expiry DATE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, vehicle_number)
            );
            CREATE INDEX IF NOT EXISTS idx_trans_veh_school ON transport_vehicles(school_id);

            -- 2. ROUTES
            CREATE TABLE IF NOT EXISTS transport_routes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                route_name VARCHAR(150) NOT NULL,
                vehicle_id UUID REFERENCES transport_vehicles(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, route_name)
            );
            CREATE INDEX IF NOT EXISTS idx_trans_rt_school ON transport_routes(school_id);

            -- 3. STOPS
            CREATE TABLE IF NOT EXISTS transport_stops (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                route_id UUID NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
                stop_name VARCHAR(150) NOT NULL,
                pickup_time TIME,
                drop_time TIME,
                sequence_order INTEGER NOT NULL,
                monthly_fare NUMERIC(10,2) DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_trans_st_school ON transport_stops(school_id);
            CREATE INDEX IF NOT EXISTS idx_trans_st_route ON transport_stops(route_id);

            -- 4. FEE SLABS
            CREATE TABLE IF NOT EXISTS transport_fee_slabs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                slab_name VARCHAR(100) NOT NULL,
                min_stops INTEGER DEFAULT 0,
                max_stops INTEGER DEFAULT 99,
                monthly_fare NUMERIC(10,2) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, slab_name)
            );
            CREATE INDEX IF NOT EXISTS idx_trans_slab_school ON transport_fee_slabs(school_id);

            -- 5. ASSIGNMENTS
            CREATE TABLE IF NOT EXISTS transport_assignments (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                route_id UUID NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
                stop_id UUID NOT NULL REFERENCES transport_stops(id) ON DELETE CASCADE,
                from_date DATE NOT NULL DEFAULT CURRENT_DATE,
                to_date DATE,
                monthly_fare NUMERIC(10,2) NOT NULL,
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, student_id)
            );
            CREATE INDEX IF NOT EXISTS idx_trans_asgn_school ON transport_assignments(school_id);
            CREATE INDEX IF NOT EXISTS idx_trans_asgn_student ON transport_assignments(student_id);
        `
    },
    {
        name: '029_timetable_system',
        sql: `
            -- ============================================================
            -- TIMETABLE MANAGEMENT SYSTEM
            -- ============================================================

            -- 1. DAY TEMPLATES
            CREATE TABLE IF NOT EXISTS timetable_day_templates (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, name)
            );
            CREATE INDEX IF NOT EXISTS idx_tt_tpl_school ON timetable_day_templates(school_id);

            -- 2. PERIODS
            CREATE TABLE IF NOT EXISTS timetable_periods (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                day_template_id UUID NOT NULL REFERENCES timetable_day_templates(id) ON DELETE CASCADE,
                period_number INTEGER NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                is_break BOOLEAN DEFAULT false,
                label VARCHAR(50),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(day_template_id, period_number)
            );
            CREATE INDEX IF NOT EXISTS idx_tt_prd_school ON timetable_periods(school_id);
            CREATE INDEX IF NOT EXISTS idx_tt_prd_tpl ON timetable_periods(day_template_id);

            -- 3. TIMETABLE ENTRIES
            CREATE TABLE IF NOT EXISTS timetable_entries (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1: Mon, 6: Sat, 7: Sun
                period_id UUID NOT NULL REFERENCES timetable_periods(id) ON DELETE CASCADE,
                class_section_id UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
                subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(day_of_week, period_id, class_section_id)
            );
            CREATE INDEX IF NOT EXISTS idx_tt_ent_school ON timetable_entries(school_id);
            CREATE INDEX IF NOT EXISTS idx_tt_ent_section ON timetable_entries(class_section_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_tt_ent_teacher_clash ON timetable_entries(day_of_week, period_id, teacher_id) WHERE teacher_id IS NOT NULL;
        `
    },
    {
        name: '030_salary_enhancement',
        sql: `
            -- ============================================================
            -- SALARY ENHANCEMENT SYSTEM
            -- ============================================================

            -- 1. SALARY COMPONENTS
            CREATE TABLE IF NOT EXISTS salary_components (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                type VARCHAR(20) NOT NULL CHECK (type IN ('earning', 'deduction')),
                is_percentage BOOLEAN DEFAULT false,
                percentage_of VARCHAR(50), -- e.g. "base_salary"
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, name)
            );
            CREATE INDEX IF NOT EXISTS idx_sal_comp_school ON salary_components(school_id);

            -- 2. SALARY ADVANCES
            CREATE TABLE IF NOT EXISTS salary_advances (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                amount NUMERIC(10,2) NOT NULL,
                given_date DATE NOT NULL DEFAULT CURRENT_DATE,
                repayment_start_month VARCHAR(7) NOT NULL, -- "YYYY-MM"
                monthly_deduction NUMERIC(10,2) NOT NULL,
                amount_repaid NUMERIC(10,2) DEFAULT 0,
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'fully_repaid', 'written_off')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_sal_adv_school ON salary_advances(school_id);
            CREATE INDEX IF NOT EXISTS idx_sal_adv_user ON salary_advances(user_id);

            -- 3. ALTER PAYMENTS TABLE
            ALTER TABLE salary_payments ADD COLUMN IF NOT EXISTS advance_deducted NUMERIC(10,2) DEFAULT 0;
        `
    },
    {
        name: '031_feature_toggles',
        sql: `
            -- ============================================================
            -- FEATURE TOGGLES SYSTEM
            -- ============================================================

            CREATE TABLE IF NOT EXISTS school_features (
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                feature_key VARCHAR(50) NOT NULL,
                is_enabled BOOLEAN NOT NULL DEFAULT true,
                disabled_reason TEXT,
                toggled_by UUID REFERENCES users(id) ON DELETE SET NULL,
                toggled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (school_id, feature_key)
            );
            CREATE INDEX IF NOT EXISTS idx_school_feat_school ON school_features(school_id);
        `
    },
    {
        name: '032_hostel_system',
        sql: `
            -- ============================================================
            -- HOSTEL MANAGEMENT SYSTEM
            -- ============================================================

            -- 1. HOSTELS
            CREATE TABLE IF NOT EXISTS hostels (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                name VARCHAR(150) NOT NULL,
                type VARCHAR(30) NOT NULL CHECK (type IN ('boys', 'girls', 'coed')),
                warden_name VARCHAR(150),
                warden_phone VARCHAR(20),
                total_capacity INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, name)
            );
            CREATE INDEX IF NOT EXISTS idx_hostels_school ON hostels(school_id);

            -- 2. HOSTEL ROOMS
            CREATE TABLE IF NOT EXISTS hostel_rooms (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                hostel_id UUID NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
                room_number VARCHAR(50) NOT NULL,
                floor INTEGER NOT NULL DEFAULT 0,
                room_type VARCHAR(30) NOT NULL CHECK (room_type IN ('single', 'double', 'dormitory')),
                capacity INTEGER NOT NULL DEFAULT 1,
                monthly_rent NUMERIC(10,2) DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(hostel_id, room_number)
            );
            CREATE INDEX IF NOT EXISTS idx_hostel_rooms_school ON hostel_rooms(school_id);
            CREATE INDEX IF NOT EXISTS idx_hostel_rooms_hostel ON hostel_rooms(hostel_id);

            -- 3. HOSTEL ALLOCATIONS
            CREATE TABLE IF NOT EXISTS hostel_allocations (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                room_id UUID NOT NULL REFERENCES hostel_rooms(id) ON DELETE CASCADE,
                bed_number VARCHAR(10),
                from_date DATE NOT NULL DEFAULT CURRENT_DATE,
                to_date DATE,
                status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'vacated')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_hostel_alloc_school ON hostel_allocations(school_id);
            CREATE INDEX IF NOT EXISTS idx_hostel_alloc_student ON hostel_allocations(student_id);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_hostel_alloc_active ON hostel_allocations(school_id, student_id) WHERE status = 'active';

            -- 4. HOSTEL FEE STRUCTURES
            CREATE TABLE IF NOT EXISTS hostel_fee_structures (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                room_type VARCHAR(30) NOT NULL CHECK (room_type IN ('single', 'double', 'dormitory')),
                rent_amount NUMERIC(10,2) NOT NULL,
                mess_charge NUMERIC(10,2) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, room_type)
            );
            CREATE INDEX IF NOT EXISTS idx_hostel_fee_school ON hostel_fee_structures(school_id);
        `
    },
    {
        name: '033_hostel_upgrade',
        sql: `
            -- ============================================================
            -- HOSTEL MANAGEMENT SYSTEM — FULL UPGRADE
            -- Extends buildings, rooms, allocations + adds leave, visitors, complaints
            -- ============================================================

            -- 1. EXTEND HOSTELS TABLE
            ALTER TABLE hostels ADD COLUMN IF NOT EXISTS address TEXT;
            ALTER TABLE hostels ADD COLUMN IF NOT EXISTS assistant_warden_name VARCHAR(150);
            ALTER TABLE hostels ADD COLUMN IF NOT EXISTS assistant_warden_phone VARCHAR(20);
            ALTER TABLE hostels ADD COLUMN IF NOT EXISTS mess_type VARCHAR(30) DEFAULT 'none'
                CHECK (mess_type IN ('vegetarian', 'non_vegetarian', 'both', 'none'));
            ALTER TABLE hostels ADD COLUMN IF NOT EXISTS mess_charge NUMERIC(10,2) DEFAULT 0;
            ALTER TABLE hostels ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
            ALTER TABLE hostels ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES academic_sessions(id) ON DELETE SET NULL;

            -- Fix mess_type CHECK: use DO block for safety on re-run
            DO $$ BEGIN
                ALTER TABLE hostels DROP CONSTRAINT IF EXISTS hostels_mess_type_check;
                ALTER TABLE hostels ADD CONSTRAINT hostels_mess_type_check
                    CHECK (mess_type IN ('vegetarian', 'non_vegetarian', 'both', 'none'));
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;

            -- 2. EXTEND HOSTEL ROOMS TABLE — new room types
            DO $$ BEGIN
                ALTER TABLE hostel_rooms DROP CONSTRAINT IF EXISTS hostel_rooms_room_type_check;
                ALTER TABLE hostel_rooms ADD CONSTRAINT hostel_rooms_room_type_check
                    CHECK (room_type IN ('single', 'double', 'triple', 'four_sharing', 'six_sharing', 'dormitory'));
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;

            ALTER TABLE hostel_rooms ADD COLUMN IF NOT EXISTS amenities TEXT;
            ALTER TABLE hostel_rooms ADD COLUMN IF NOT EXISTS remarks TEXT;

            -- 3. EXTEND HOSTEL ALLOCATIONS TABLE
            ALTER TABLE hostel_allocations ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES academic_sessions(id) ON DELETE SET NULL;
            ALTER TABLE hostel_allocations ADD COLUMN IF NOT EXISTS remarks TEXT;
            ALTER TABLE hostel_allocations ADD COLUMN IF NOT EXISTS guardian_consent BOOLEAN DEFAULT false;

            -- 4. HOSTEL LEAVE REQUESTS
            CREATE TABLE IF NOT EXISTS hostel_leave_requests (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                leave_type VARCHAR(30) NOT NULL DEFAULT 'home_visit'
                    CHECK (leave_type IN ('home_visit', 'medical', 'festival', 'emergency', 'other')),
                from_date DATE NOT NULL,
                to_date DATE NOT NULL,
                reason TEXT NOT NULL,
                guardian_phone VARCHAR(20),
                status VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
                approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
                approved_at TIMESTAMP WITH TIME ZONE,
                remarks TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_hostel_leave_school ON hostel_leave_requests(school_id);
            CREATE INDEX IF NOT EXISTS idx_hostel_leave_student ON hostel_leave_requests(student_id);
            CREATE INDEX IF NOT EXISTS idx_hostel_leave_status ON hostel_leave_requests(status);

            -- 5. HOSTEL VISITORS LOG
            CREATE TABLE IF NOT EXISTS hostel_visitors (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                visitor_name VARCHAR(150) NOT NULL,
                visitor_relation VARCHAR(50) DEFAULT 'other'
                    CHECK (visitor_relation IN ('father', 'mother', 'guardian', 'sibling', 'relative', 'other')),
                visitor_phone VARCHAR(20),
                purpose TEXT,
                check_in TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                check_out TIMESTAMP WITH TIME ZONE,
                approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
                remarks TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_hostel_visitor_school ON hostel_visitors(school_id);
            CREATE INDEX IF NOT EXISTS idx_hostel_visitor_student ON hostel_visitors(student_id);
            CREATE INDEX IF NOT EXISTS idx_hostel_visitor_checkin ON hostel_visitors(check_in);

            -- 6. HOSTEL COMPLAINTS / MAINTENANCE
            CREATE TABLE IF NOT EXISTS hostel_complaints (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                student_id UUID REFERENCES students(id) ON DELETE SET NULL,
                room_id UUID REFERENCES hostel_rooms(id) ON DELETE SET NULL,
                complaint_type VARCHAR(50) NOT NULL DEFAULT 'other'
                    CHECK (complaint_type IN ('maintenance', 'electrical', 'plumbing', 'furniture', 'cleanliness', 'other')),
                description TEXT NOT NULL,
                priority VARCHAR(20) DEFAULT 'medium'
                    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
                status VARCHAR(20) DEFAULT 'open'
                    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
                resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
                resolved_at TIMESTAMP WITH TIME ZONE,
                resolution_notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_hostel_complaint_school ON hostel_complaints(school_id);
            CREATE INDEX IF NOT EXISTS idx_hostel_complaint_status ON hostel_complaints(status);
            CREATE INDEX IF NOT EXISTS idx_hostel_complaint_room ON hostel_complaints(room_id);
        `
    },
    {
        name: '034_library_management_system',
        sql: `
            -- ============================================================
            -- LIBRARY MANAGEMENT SYSTEM (LMS)
            -- Complete book catalog, circulation, reservations, and fines
            -- Multi-tenant: all tables scoped by school_id
            -- ============================================================

            -- 1. LIBRARY SETTINGS — Per-school library configuration
            CREATE TABLE IF NOT EXISTS library_settings (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                max_books_per_student INTEGER DEFAULT 3,
                loan_duration_days INTEGER DEFAULT 14,
                max_renewals INTEGER DEFAULT 2,
                fine_per_day NUMERIC(10,2) DEFAULT 1.00,
                fine_currency VARCHAR(10) DEFAULT 'INR',
                allow_student_renewal BOOLEAN DEFAULT true,
                allow_student_reservation BOOLEAN DEFAULT true,
                overdue_alert_days_before INTEGER DEFAULT 2,
                isbn_auto_fetch BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id)
            );

            -- 2. LIBRARY CATEGORIES — Book genres/categories
            CREATE TABLE IF NOT EXISTS library_categories (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                display_order INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, name)
            );

            -- 3. LIBRARY BOOKS — Master catalog
            CREATE TABLE IF NOT EXISTS library_books (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                title VARCHAR(500) NOT NULL,
                author VARCHAR(300),
                isbn VARCHAR(20),
                publisher VARCHAR(300),
                edition VARCHAR(50),
                publication_year INTEGER,
                category_id UUID REFERENCES library_categories(id) ON DELETE SET NULL,
                language VARCHAR(50) DEFAULT 'English',
                description TEXT,
                cover_image_url TEXT,
                total_copies INTEGER DEFAULT 1,
                available_copies INTEGER DEFAULT 1,
                shelf_location VARCHAR(100),
                accession_number_prefix VARCHAR(20),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- 4. LIBRARY BOOK COPIES — Individual physical copies
            CREATE TABLE IF NOT EXISTS library_book_copies (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                book_id UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                accession_number VARCHAR(50) NOT NULL,
                barcode VARCHAR(100),
                condition VARCHAR(20) DEFAULT 'good'
                    CHECK (condition IN ('new', 'good', 'fair', 'damaged', 'lost')),
                status VARCHAR(20) DEFAULT 'available'
                    CHECK (status IN ('available', 'issued', 'reserved', 'lost', 'damaged', 'withdrawn')),
                added_date DATE DEFAULT CURRENT_DATE,
                remarks TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, accession_number)
            );

            -- 5. LIBRARY TRANSACTIONS — Issue/Return/Renew log
            CREATE TABLE IF NOT EXISTS library_transactions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                copy_id UUID NOT NULL REFERENCES library_book_copies(id) ON DELETE CASCADE,
                book_id UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                issued_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                transaction_type VARCHAR(20) NOT NULL DEFAULT 'issue'
                    CHECK (transaction_type IN ('issue', 'return', 'renew', 'lost')),
                issued_date DATE NOT NULL DEFAULT CURRENT_DATE,
                due_date DATE NOT NULL,
                returned_date DATE,
                renewed_count INTEGER DEFAULT 0,
                fine_amount NUMERIC(10,2) DEFAULT 0,
                fine_paid BOOLEAN DEFAULT false,
                fine_waived BOOLEAN DEFAULT false,
                remarks TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- 6. LIBRARY RESERVATIONS — Book hold requests
            CREATE TABLE IF NOT EXISTS library_reservations (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                book_id UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                reserved_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                expiry_date TIMESTAMP WITH TIME ZONE,
                status VARCHAR(20) DEFAULT 'active'
                    CHECK (status IN ('active', 'fulfilled', 'expired', 'cancelled')),
                notified_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(book_id, student_id, status)
            );

            -- 7. LIBRARY FINES — Fine tracking
            CREATE TABLE IF NOT EXISTS library_fines (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                transaction_id UUID NOT NULL REFERENCES library_transactions(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                amount NUMERIC(10,2) NOT NULL DEFAULT 0,
                paid_amount NUMERIC(10,2) DEFAULT 0,
                status VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'waived', 'partial')),
                paid_date TIMESTAMP WITH TIME ZONE,
                waived_by UUID REFERENCES users(id) ON DELETE SET NULL,
                waived_reason TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- 8. PERFORMANCE INDEXES
            CREATE INDEX IF NOT EXISTS idx_library_books_school ON library_books(school_id);
            CREATE INDEX IF NOT EXISTS idx_library_books_isbn ON library_books(isbn);
            CREATE INDEX IF NOT EXISTS idx_library_books_title ON library_books(title);
            CREATE INDEX IF NOT EXISTS idx_library_books_category ON library_books(category_id);
            CREATE INDEX IF NOT EXISTS idx_library_copies_book ON library_book_copies(book_id);
            CREATE INDEX IF NOT EXISTS idx_library_copies_school ON library_book_copies(school_id);
            CREATE INDEX IF NOT EXISTS idx_library_copies_status ON library_book_copies(status);
            CREATE INDEX IF NOT EXISTS idx_library_txn_school ON library_transactions(school_id);
            CREATE INDEX IF NOT EXISTS idx_library_txn_student ON library_transactions(student_id);
            CREATE INDEX IF NOT EXISTS idx_library_txn_copy ON library_transactions(copy_id);
            CREATE INDEX IF NOT EXISTS idx_library_txn_due_date ON library_transactions(due_date);
            CREATE INDEX IF NOT EXISTS idx_library_txn_active ON library_transactions(is_active);
            CREATE INDEX IF NOT EXISTS idx_library_res_school ON library_reservations(school_id);
            CREATE INDEX IF NOT EXISTS idx_library_res_student ON library_reservations(student_id);
            CREATE INDEX IF NOT EXISTS idx_library_res_book ON library_reservations(book_id);
            CREATE INDEX IF NOT EXISTS idx_library_res_status ON library_reservations(status);
            CREATE INDEX IF NOT EXISTS idx_library_fines_school ON library_fines(school_id);
            CREATE INDEX IF NOT EXISTS idx_library_fines_student ON library_fines(student_id);
            CREATE INDEX IF NOT EXISTS idx_library_fines_status ON library_fines(status);

            -- 9. SEED DEFAULT CATEGORIES (universal for any school type)
            -- These will be auto-created when a school first enables the library
        `
    },
    {
        name: '035_admission_registration_history',
        sql: `
            -- ============================================================
            -- ADMISSION REGISTRATION, ENTRANCE TESTS & STUDENT HISTORY
            -- Real-world school workflow:
            -- Registration Opens → Students Register → Entrance Exam → 
            -- Merit List → Admission Granted → Added to Class
            -- ============================================================

            -- 1. ADMISSION REGISTRATION WINDOWS
            -- Admin creates registration periods with dates and classes
            CREATE TABLE IF NOT EXISTS admission_registration_windows (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                open_date DATE NOT NULL,
                close_date DATE NOT NULL,
                classes_offered UUID[] DEFAULT '{}',
                registration_fee NUMERIC(10,2) DEFAULT 0,
                max_registrations INTEGER,
                is_active BOOLEAN DEFAULT true,
                slug VARCHAR(100),
                created_by UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(school_id, slug)
            );
            CREATE INDEX IF NOT EXISTS idx_reg_windows_school ON admission_registration_windows(school_id);
            CREATE INDEX IF NOT EXISTS idx_reg_windows_session ON admission_registration_windows(session_id);
            CREATE INDEX IF NOT EXISTS idx_reg_windows_active ON admission_registration_windows(is_active);

            -- 2. ADMISSION REGISTRATIONS (public registration entries)
            CREATE TABLE IF NOT EXISTS admission_registrations (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                window_id UUID NOT NULL REFERENCES admission_registration_windows(id) ON DELETE CASCADE,
                registration_number VARCHAR(50) NOT NULL,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                
                -- Student info
                student_name VARCHAR(150) NOT NULL,
                date_of_birth DATE NOT NULL,
                gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female', 'other')),
                previous_school VARCHAR(255),
                previous_class VARCHAR(50),
                
                -- Parent info
                father_name VARCHAR(150),
                father_phone VARCHAR(20),
                father_occupation VARCHAR(100),
                mother_name VARCHAR(150),
                mother_phone VARCHAR(20),
                guardian_name VARCHAR(150),
                guardian_phone VARCHAR(20) NOT NULL,
                guardian_email VARCHAR(255),
                address TEXT,
                city VARCHAR(100),
                pincode VARCHAR(10),
                
                -- Status tracking
                status VARCHAR(30) DEFAULT 'registered'
                    CHECK (status IN ('registered', 'test_scheduled', 'test_appeared', 'test_absent',
                                      'selected', 'waitlisted', 'rejected', 'admitted', 'cancelled')),
                
                -- Exam & Merit
                entrance_score NUMERIC(6,2),
                merit_rank INTEGER,
                
                -- Fee tracking
                registration_fee_paid BOOLEAN DEFAULT false,
                fee_receipt_number VARCHAR(50),
                
                remarks TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(school_id, registration_number)
            );
            CREATE INDEX IF NOT EXISTS idx_reg_school ON admission_registrations(school_id);
            CREATE INDEX IF NOT EXISTS idx_reg_window ON admission_registrations(window_id);
            CREATE INDEX IF NOT EXISTS idx_reg_class ON admission_registrations(class_id);
            CREATE INDEX IF NOT EXISTS idx_reg_status ON admission_registrations(status);
            CREATE INDEX IF NOT EXISTS idx_reg_guardian_phone ON admission_registrations(guardian_phone);

            -- 3. ADMISSION ENTRANCE TESTS
            CREATE TABLE IF NOT EXISTS admission_entrance_tests (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                window_id UUID NOT NULL REFERENCES admission_registration_windows(id) ON DELETE CASCADE,
                class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                test_name VARCHAR(150) NOT NULL DEFAULT 'Entrance Test',
                test_date DATE NOT NULL,
                test_time VARCHAR(20),
                venue VARCHAR(255),
                max_marks NUMERIC(6,2) NOT NULL DEFAULT 100,
                passing_marks NUMERIC(6,2) DEFAULT 33,
                instructions TEXT,
                status VARCHAR(20) DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
                created_by UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_entrance_test_school ON admission_entrance_tests(school_id);
            CREATE INDEX IF NOT EXISTS idx_entrance_test_window ON admission_entrance_tests(window_id);

            -- 4. ADMISSION TEST SCORES
            CREATE TABLE IF NOT EXISTS admission_test_scores (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                test_id UUID NOT NULL REFERENCES admission_entrance_tests(id) ON DELETE CASCADE,
                registration_id UUID NOT NULL REFERENCES admission_registrations(id) ON DELETE CASCADE,
                marks_obtained NUMERIC(6,2),
                attendance VARCHAR(10) DEFAULT 'present'
                    CHECK (attendance IN ('present', 'absent')),
                remarks TEXT,
                entered_by UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(test_id, registration_id)
            );
            CREATE INDEX IF NOT EXISTS idx_test_scores_test ON admission_test_scores(test_id);
            CREATE INDEX IF NOT EXISTS idx_test_scores_reg ON admission_test_scores(registration_id);

            -- 5. STUDENT HISTORY (permanent timeline)
            -- Every event permanently recorded with snapshot data
            CREATE TABLE IF NOT EXISTS student_history (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                event_type VARCHAR(50) NOT NULL,
                event_date DATE NOT NULL DEFAULT CURRENT_DATE,
                session_id UUID REFERENCES academic_sessions(id) ON DELETE SET NULL,
                from_class VARCHAR(100),
                to_class VARCHAR(100),
                from_session VARCHAR(100),
                to_session VARCHAR(100),
                details JSONB DEFAULT '{}',
                recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_student_history_school ON student_history(school_id);
            CREATE INDEX IF NOT EXISTS idx_student_history_student ON student_history(student_id);
            CREATE INDEX IF NOT EXISTS idx_student_history_type ON student_history(event_type);
            CREATE INDEX IF NOT EXISTS idx_student_history_date ON student_history(event_date);
            CREATE INDEX IF NOT EXISTS idx_student_history_session ON student_history(session_id);

            -- 6. CERTIFICATE ENHANCEMENTS
            ALTER TABLE issued_certificates ADD COLUMN IF NOT EXISTS verification_code VARCHAR(20);
            ALTER TABLE issued_certificates ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
            ALTER TABLE issued_certificates ADD COLUMN IF NOT EXISTS print_count INTEGER DEFAULT 0;
            ALTER TABLE issued_certificates ADD COLUMN IF NOT EXISTS last_printed_at TIMESTAMPTZ;
            DO $$ BEGIN
                CREATE UNIQUE INDEX IF NOT EXISTS idx_issued_certs_verification ON issued_certificates(verification_code) WHERE verification_code IS NOT NULL;
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;

            -- 7. ADD status TO students IF NOT EXISTS
            ALTER TABLE students ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

            -- 8. UPDATE student_enrollments status constraint to include more statuses
            DO $$ BEGIN
                ALTER TABLE student_enrollments DROP CONSTRAINT IF EXISTS student_enrollments_status_check;
                ALTER TABLE student_enrollments ADD CONSTRAINT student_enrollments_status_check
                    CHECK (status IN ('active', 'promoted', 'retained', 'transferred', 'withdrawn', 'tc_issued', 'graduated'));
            EXCEPTION WHEN OTHERS THEN NULL;
            END $$;
        `
    },
    {
        name: '013_library_advanced',
        sql: `
            -- 1. LIBRARY VENDORS
            CREATE TABLE IF NOT EXISTS library_vendors (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                contact_person VARCHAR(255),
                email VARCHAR(255),
                phone VARCHAR(50),
                address TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- 2. ALTER LIBRARY BOOKS
            ALTER TABLE library_books ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES library_vendors(id) ON DELETE SET NULL;
            ALTER TABLE library_books ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(10,2);
            ALTER TABLE library_books ADD COLUMN IF NOT EXISTS purchase_date DATE;
        `
    },
];



export async function runMigrations() {
    // Prefer direct connection for migrations (triggers/DO blocks may not work through PgBouncer)
    const dbUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

    const isLocalhost =
        dbUrl?.includes('localhost') ||
        dbUrl?.includes('127.0.0.1');

    const pool = new Pool({
        connectionString: dbUrl,
        ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } }),
    });

    const client = await pool.connect();
    try {
        // Create migrations tracking table if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS _migrations (
                name VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check which migrations have been applied
        const applied = await client.query('SELECT name FROM _migrations');
        const appliedNames = new Set(applied.rows.map((r: { name: string }) => r.name));

        for (const migration of MIGRATIONS) {
            if (appliedNames.has(migration.name)) {
                continue; // Already applied
            }

            console.log(`[Migration] Running: ${migration.name}...`);
            try {
                await client.query(migration.sql);
                await client.query(
                    'INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
                    [migration.name]
                );
                console.log(`[Migration] ✅ ${migration.name} applied successfully`);
            } catch (err) {
                console.error(`[Migration] ❌ ${migration.name} failed:`, err);
                // Don't throw - let the app continue even if migration fails
            }
        }

        console.log('[Migration] All migrations checked.');
    } catch (err) {
        console.error('[Migration] Migration runner error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}
