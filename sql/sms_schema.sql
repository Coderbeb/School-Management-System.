-- ============================================================
-- School Management System - Core Database Schema
-- ============================================================
-- Replaces the old college-based model (departments, semesters, degree_types)
-- with a school-based model (classes, sections, academic sessions).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. ACADEMIC SESSIONS
-- ============================================================
-- Represents an academic year like "2026-2027".
-- One session is marked as current. All data is scoped by session.
CREATE TABLE IF NOT EXISTS academic_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,              -- e.g., "2026-2027"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. CLASSES (Grade Levels)
-- ============================================================
-- Master list of all grade levels in the school.
-- e.g., Nursery, LKG, UKG, Class 1, Class 2 ... Class 10
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,              -- e.g., "Class 10", "LKG"
    display_order INTEGER NOT NULL DEFAULT 0,      -- For sorting (Nursery=1, LKG=2, ... Class 10=13)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. SECTIONS
-- ============================================================
-- Master list of sections: A, B, C, D, etc.
CREATE TABLE IF NOT EXISTS sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(10) NOT NULL UNIQUE,              -- e.g., "A", "B", "C"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 4. CLASS-SECTIONS (Actual Classrooms)
-- ============================================================
-- Combines a Class + Section for a specific academic session.
-- This is the actual classroom: "Class 10-A for 2026-2027"
CREATE TABLE IF NOT EXISTS class_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
    room_number VARCHAR(20),                       -- Optional physical room assignment
    capacity INTEGER DEFAULT 40,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_id, section_id, session_id)
);

-- ============================================================
-- 5. SUBJECTS (Master List)
-- ============================================================
-- All subjects taught in the school.
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,                    -- e.g., "Mathematics", "English"
    code VARCHAR(20) NOT NULL UNIQUE,              -- e.g., "MATH", "ENG"
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 6. CLASS-SUBJECTS (Which subjects a class studies)
-- ============================================================
-- Links subjects to classes.
-- e.g., "Class 10 studies Mathematics, Science, English"
-- Applies to ALL sections of that class uniformly.
CREATE TABLE IF NOT EXISTS class_subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
    is_elective BOOLEAN DEFAULT false,             -- true if only some students take this
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_id, subject_id, session_id)
);

-- ============================================================
-- 7. USERS (All roles in one table)
-- ============================================================
-- Roles: super_admin, teacher, accountant, student
-- Students also get a user account for login.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'teacher', 'accountant', 'student')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 8. STUDENTS (Extended profiles)
-- ============================================================
-- Detailed student information beyond the user login.
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL, -- Optional login account
    admission_number VARCHAR(50) UNIQUE,           -- School admission number
    roll_number INTEGER,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
    blood_group VARCHAR(5),
    address TEXT,
    photo_url TEXT,

    -- Guardian / Parent Details (critical for WhatsApp & communication)
    guardian_name VARCHAR(150),
    guardian_relation VARCHAR(30),                  -- Father, Mother, Guardian
    guardian_phone VARCHAR(20),                     -- Primary WhatsApp number
    guardian_email VARCHAR(255),
    guardian_phone_alt VARCHAR(20),                 -- Alternate phone

    -- Academic
    admission_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 9. STUDENT ENROLLMENTS (Student → Classroom per session)
-- ============================================================
-- Links a student to a specific Class-Section for an academic session.
-- e.g., "Rahul is in Class 10-A for 2026-2027"
CREATE TABLE IF NOT EXISTS student_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_section_id UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
    roll_number INTEGER,                           -- Roll number within this class-section
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'promoted', 'transferred', 'withdrawn')),
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, session_id)                 -- A student can be in only one class per session
);

-- ============================================================
-- 10. TEACHER ASSIGNMENTS (Teacher → Class-Section + Subject)
-- ============================================================
-- Links a teacher to teach a specific subject in a specific classroom.
-- e.g., "Mr. Smith teaches Science to Class 10-A for 2026-2027"
CREATE TABLE IF NOT EXISTS teacher_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_section_id UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
    is_class_teacher BOOLEAN DEFAULT false,        -- Whether this teacher is the class teacher
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id, class_section_id, subject_id, session_id)
);

-- ============================================================
-- 11. SCHOOL SETTINGS (Key-Value config store)
-- ============================================================
CREATE TABLE IF NOT EXISTS school_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 12. HOLIDAYS
-- ============================================================
CREATE TABLE IF NOT EXISTS holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    session_id UUID REFERENCES academic_sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 13. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PERFORMANCE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_class_sections_class ON class_sections(class_id);
CREATE INDEX IF NOT EXISTS idx_class_sections_session ON class_sections(session_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_class ON class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_session ON class_subjects(session_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_student ON student_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_class_section ON student_enrollments(class_section_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_session ON student_enrollments(session_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher ON teacher_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class_section ON teacher_assignments(class_section_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_session ON teacher_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_students_guardian_phone ON students(guardian_phone);
