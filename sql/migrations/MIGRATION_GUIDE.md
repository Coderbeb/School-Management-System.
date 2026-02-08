# Database Migration Guide - Multi-Teacher Attendance

## Overview
This migration modifies the `attendance_records` table to support multiple teachers marking independent attendance for the same subject without conflicts.

## What Changes

**Before:** Only one teacher could mark attendance for a given `(subject, student, date, lecture_number)` combination.

**After:** Multiple teachers can independently mark attendance for the same `(subject, student, date, lecture_number)` with different `teacher_id` values.

## Migration Steps

### Step 1: Backup Your Database
```powershell
# Windows PowerShell
$env:PGPASSWORD="Ritik@123"
pg_dump -h localhost -U postgres -d college_attendance -F c -b -v -f "backup_$(Get-Date -Format 'yyyy-MM-dd_HHmmss').dump"
```

### Step 2: Run the Migration Script
```powershell
# Navigate to the project directory
cd c:\Users\rajhr\OneDrive\Documents\Desktop\YSM-Attendance

# Run the migration
$env:PGPASSWORD="Ritik@123"
psql -h localhost -U postgres -d college_attendance -f sql/migrations/001_multi_teacher_attendance.sql
```

### Step 3: Verify the Migration
```powershell
# Check the new constraint
$env:PGPASSWORD="Ritik@123"
psql -h localhost -U postgres -d college_attendance -c "\d attendance_records"
```

Look for the constraint: `attendance_records_unique_per_teacher UNIQUE (subject_id, student_id, teacher_id, date, lecture_number)`

## Rollback (If Needed)

If something goes wrong, you can rollback using:

```sql
BEGIN;
ALTER TABLE attendance_records DROP CONSTRAINT attendance_records_unique_per_teacher;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_subject_id_student_id_date_lecture_number_key 
    UNIQUE (subject_id, student_id, date, lecture_number);
DROP INDEX IF EXISTS idx_attendance_teacher_date;
DROP INDEX IF EXISTS idx_attendance_subject_student_date;
COMMIT;
```

Then restore from backup:
```powershell
$env:PGPASSWORD="Ritik@123"
pg_restore -h localhost -U postgres -d college_attendance -c backup_YYYY-MM-DD_HHMMSS.dump
```

## Testing After Migration

### Test 1: Multi-Teacher Attendance
1. Login as Teacher A
2. Mark attendance for Subject X, Date Today, Lecture 1
3. Logout and login as Teacher B
4. Mark attendance for same Subject X, Date Today, Lecture 1
5. ✓ Both records should exist (no overwrites)

### Test 2: Teacher Views Own Data
1. Login as Teacher A
2. Go to Student Reports
3. View a student's attendance
4. ✓ Should only see attendance from Teacher A's classes

### Test 3: Admin Views Merged Data
1. Login as Super Admin or HOD
2. Go to Student Reports
3. View the same student's attendance
4. ✓ Should see combined attendance from all teachers

## Next Steps

After successful migration:
1. Restart your development server
2. Run the tests above
3. Verify report downloads work correctly
