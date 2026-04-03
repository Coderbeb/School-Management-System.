-- Migration: Add semester column to attendance_records
-- Purpose: Track which semester's class this attendance is for
-- SAFE TO RUN: Does NOT delete any data. Can be run multiple times.

-- Step 1: Add semester column (nullable, so existing data stays intact)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'attendance_records' AND column_name = 'semester'
    ) THEN
        ALTER TABLE attendance_records ADD COLUMN semester INTEGER;
        RAISE NOTICE 'Added semester column to attendance_records';
    ELSE
        RAISE NOTICE 'semester column already exists, skipping';
    END IF;
END $$;

-- Step 2: Backfill semester from student's current_semester
-- This fills in NULL semester values using the student's current semester
UPDATE attendance_records ar
SET semester = s.current_semester
FROM students s
WHERE ar.student_id = s.id AND ar.semester IS NULL;

-- Step 3: Set default for future records
ALTER TABLE attendance_records ALTER COLUMN semester SET DEFAULT 1;

-- Step 4: Update unique constraint to include semester
-- Drop old constraint (try both possible names)
DO $$
BEGIN
    -- Try the auto-generated name
    ALTER TABLE attendance_records 
        DROP CONSTRAINT IF EXISTS attendance_records_subject_id_student_id_teacher_id_date_le_key;
    -- Try other possible names
    ALTER TABLE attendance_records 
        DROP CONSTRAINT IF EXISTS attendance_records_unique;
    ALTER TABLE attendance_records 
        DROP CONSTRAINT IF EXISTS attendance_records_unique_v2;
    
    RAISE NOTICE 'Dropped old unique constraint';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No old constraint to drop (already removed or different name)';
END $$;

-- Create new unique constraint with semester
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'attendance_records_unique_with_semester'
    ) THEN
        ALTER TABLE attendance_records 
            ADD CONSTRAINT attendance_records_unique_with_semester 
            UNIQUE(subject_id, student_id, teacher_id, date, lecture_number, semester);
        RAISE NOTICE 'Created new unique constraint with semester';
    ELSE
        RAISE NOTICE 'New unique constraint already exists, skipping';
    END IF;
END $$;

-- Step 5: Add index on semester column for performance
CREATE INDEX IF NOT EXISTS idx_attendance_semester ON attendance_records(semester);

-- Step 6: Add composite index for session counting (date + subject + semester + lecture)
CREATE INDEX IF NOT EXISTS idx_attendance_session_count 
    ON attendance_records(date, subject_id, semester, lecture_number);

-- Done!
SELECT 'Migration 001_add_semester completed successfully!' as result;
