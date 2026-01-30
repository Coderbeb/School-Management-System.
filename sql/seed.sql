-- College Attendance System Seed Data
-- Run this AFTER schema.sql

-- ============================================
-- DEPARTMENTS
-- ============================================

-- Regular Departments (BA/BSc - Arts & Science)
INSERT INTO departments (name, code, dept_type, description) VALUES
('History', 'HIS', 'regular', 'Department of History'),
('Political Science', 'POL', 'regular', 'Department of Political Science'),
('Economics', 'ECO', 'regular', 'Department of Economics'),
('English', 'ENG', 'regular', 'Department of English'),
('Hindi', 'HIN', 'regular', 'Department of Hindi'),
('Philosophy', 'PHI', 'regular', 'Department of Philosophy'),
('Physics', 'PHY', 'regular', 'Department of Physics'),
('Chemistry', 'CHE', 'regular', 'Department of Chemistry'),
('Mathematics', 'MAT', 'regular', 'Department of Mathematics'),
('Botany', 'BOT', 'regular', 'Department of Botany'),
('Zoology', 'ZOO', 'regular', 'Department of Zoology'),
('Commerce (B.Com.)', 'COM', 'regular', 'Department of Commerce - Bachelor of Commerce')
ON CONFLICT (code) DO NOTHING;

-- Vocational Departments
INSERT INTO departments (name, code, dept_type, description) VALUES
('BCA & IT', 'IT', 'vocational', 'Department of Computer Applications & Information Technology - includes B.Sc.-CA, B.Sc.IT, B.Com.-CA'),
('BBA', 'BBA', 'vocational', 'Department of Business Administration')
ON CONFLICT (code) DO NOTHING;

-- PG Departments
INSERT INTO departments (name, code, dept_type, description) VALUES
('Commerce (M.Com.)', 'MCOM', 'pg', 'Department of Commerce - Master of Commerce')
ON CONFLICT (code) DO NOTHING;




