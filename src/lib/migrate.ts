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
