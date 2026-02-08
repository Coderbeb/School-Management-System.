-- Migration: Enable Multiple Teachers to Mark Independent Attendance
-- Description: Modifies the attendance_records table to allow multiple teachers
--              to mark attendance for the same subject/date/lecture without conflicts.
--              Changes unique constraint to include teacher_id.
-- Date: 2026-02-08

BEGIN;

-- Step 1: Drop the existing unique constraint
-- First, we need to find the constraint name
-- In PostgreSQL, the constraint name is auto-generated if not specified
-- Common pattern: attendance_records_subject_id_student_id_date_lecture_number_key

-- Drop the old constraint (adjust name if different in your database)
-- You can find the actual constraint name by running:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'attendance_records'::regclass;

ALTER TABLE attendance_records 
DROP CONSTRAINT IF EXISTS attendance_records_subject_id_student_id_date_lecture_number_key;

-- Also drop if it was named differently (common alternative)
ALTER TABLE attendance_records 
DROP CONSTRAINT IF EXISTS attendance_records_subject_id_student_id_date_lecture_nu_key;

-- Step 2: Add the new unique constraint that includes teacher_id
-- This allows each teacher to have their own attendance records
-- while preventing duplicate entries by the same teacher

ALTER TABLE attendance_records
ADD CONSTRAINT attendance_records_unique_per_teacher 
UNIQUE (subject_id, student_id, teacher_id, date, lecture_number);

-- Step 3: Create an index to optimize queries filtering by teacher_id
CREATE INDEX IF NOT EXISTS idx_attendance_teacher_date 
ON attendance_records(teacher_id, date);

-- Step 4: Create an index for admin queries (no teacher filter)
CREATE INDEX IF NOT EXISTS idx_attendance_subject_student_date 
ON attendance_records(subject_id, student_id, date);

COMMIT;

-- Rollback script (if needed):
-- BEGIN;
-- ALTER TABLE attendance_records DROP CONSTRAINT attendance_records_unique_per_teacher;
-- ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_subject_id_student_id_date_lecture_number_key 
--     UNIQUE (subject_id, student_id, date, lecture_number);
-- DROP INDEX IF EXISTS idx_attendance_teacher_date;
-- DROP INDEX IF EXISTS idx_attendance_subject_student_date;
-- COMMIT;
