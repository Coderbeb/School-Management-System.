import { Pool } from 'pg';

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

            -- Step 2: Backfill semester from student's current_semester
            UPDATE attendance_records ar
            SET semester = s.current_semester
            FROM students s
            WHERE ar.student_id = s.id AND ar.semester IS NULL;

            -- Step 3: Set default for future records
            ALTER TABLE attendance_records ALTER COLUMN semester SET DEFAULT 1;

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
                    ALTER TABLE attendance_records 
                        ADD CONSTRAINT attendance_records_unique_with_semester 
                        UNIQUE(subject_id, student_id, teacher_id, date, lecture_number, semester);
                END IF;
            END $$;

            -- Step 5: Add indexes
            CREATE INDEX IF NOT EXISTS idx_attendance_semester ON attendance_records(semester);
            CREATE INDEX IF NOT EXISTS idx_attendance_session_count 
                ON attendance_records(date, subject_id, semester, lecture_number);
        `
    },
    {
        name: '002_holidays_department_id',
        sql: `
            -- Add department_id to holidays for department-specific holidays
            ALTER TABLE holidays
            ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE CASCADE;

            -- Drop unique date constraint so multiple departments can have holidays on the same date
            ALTER TABLE holidays
            DROP CONSTRAINT IF EXISTS holidays_date_key;
        `
    },
    // Add future migrations here as new entries:
    // { name: '003_next_migration', sql: `...` },
];

export async function runMigrations() {
    const isLocalhost =
        process.env.DATABASE_URL?.includes('localhost') ||
        process.env.DATABASE_URL?.includes('127.0.0.1');

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
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
