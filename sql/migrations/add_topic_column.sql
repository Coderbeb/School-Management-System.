-- Add topic column to attendance_records
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS topic VARCHAR(255);
