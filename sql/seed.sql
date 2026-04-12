-- College Attendance System Seed Data
-- Run this AFTER schema.sql

-- ============================================
-- DEPARTMENTS (Subject-based departments for Teachers/Students/HOD)
-- ============================================

-- Regular - BA Departments
INSERT INTO departments (name, code, dept_type, degree_type, description) VALUES
('History', 'HIS', 'regular', 'ba', 'Department of History'),
('English', 'ENG', 'regular', 'ba', 'Department of English'),
('Hindi', 'HIN', 'regular', 'ba', 'Department of Hindi'),
('Political Science', 'POL', 'regular', 'ba', 'Department of Political Science'),
('Economics', 'ECO', 'regular', 'ba', 'Department of Economics'),
('Philosophy', 'PHI', 'regular', 'ba', 'Department of Philosophy')
ON CONFLICT (code) DO NOTHING;

-- Regular - BSc Departments
INSERT INTO departments (name, code, dept_type, degree_type, description) VALUES
('Physics', 'PHY', 'regular', 'bsc', 'Department of Physics'),
('Chemistry', 'CHE', 'regular', 'bsc', 'Department of Chemistry'),
('Mathematics', 'MAT', 'regular', 'bsc', 'Department of Mathematics'),
('Botany', 'BOT', 'regular', 'bsc', 'Department of Botany'),
('Zoology', 'ZOO', 'regular', 'bsc', 'Department of Zoology')
ON CONFLICT (code) DO NOTHING;

-- Regular - BCom Departments
INSERT INTO departments (name, code, dept_type, degree_type, description) VALUES
('Commerce (B.Com.)', 'COM', 'regular', 'bcom', 'Department of Commerce - B.Com')
ON CONFLICT (code) DO NOTHING;

-- Vocational - BCA Department (for BCA students and teachers)
INSERT INTO departments (name, code, dept_type, degree_type, description) VALUES
('BCA', 'BCA', 'vocational', 'bca', 'Department of Computer Applications')
ON CONFLICT (code) DO NOTHING;

-- Vocational - BSc IT Department (for BSc IT students and teachers)
INSERT INTO departments (name, code, dept_type, degree_type, description) VALUES
('BSc IT', 'IT', 'vocational', 'it', 'Department of Information Technology')
ON CONFLICT (code) DO NOTHING;

-- Vocational - BBA Department (for BBA students and teachers)
INSERT INTO departments (name, code, dept_type, degree_type, description) VALUES
('Business Administration', 'BBA', 'vocational', 'bba', 'Department of Business Administration')
ON CONFLICT (code) DO NOTHING;

-- PG - MCom Departments
INSERT INTO departments (name, code, dept_type, degree_type, description) VALUES
('Commerce (M.Com.)', 'MCOM', 'pg', 'mcom', 'Department of Commerce - Master of Commerce')
ON CONFLICT (code) DO NOTHING;
