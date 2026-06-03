import { Pool } from 'pg';
import dns from 'dns';

// Force Node.js to prefer IPv4 to fix ENOTFOUND issues with IPv6-only Supabase hosts
dns.setDefaultResultOrder('ipv4first');

const isLocalhost =
    process.env.DATABASE_URL?.includes('localhost') ||
    process.env.DATABASE_URL?.includes('127.0.0.1');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ...(isLocalhost ? {} : {
        ssl: { rejectUnauthorized: false },
        // Connection timeout settings for stability
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        max: 10,
    }),
});

// Auto-migration: runs once on first query (NOT on import)
let migrationDone = false;
async function ensureMigrations() {
    if (migrationDone) return;
    migrationDone = true; // Set immediately to prevent concurrent runs

    // Skip migrations during `next build` — only run at runtime
    // NEXT_PHASE is set by Next.js: 'phase-production-build' during build
    if (process.env.NEXT_PHASE === 'phase-production-build') {
        console.log('[DB] Skipping migrations during build phase');
        return;
    }

    try {
        const { runMigrations } = await import('./migrate');
        await runMigrations();
    } catch (err) {
        console.error('[DB] Migration error (non-fatal):', err);
    }
}

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
    // Trigger migration on first query (lazy, not on import)
    await ensureMigrations();

    const client = await pool.connect();
    try {
        const result = await client.query(text, params);
        return result.rows as T[];
    } finally {
        client.release();
    }
}

export async function queryOne<T>(text: string, params?: unknown[]): Promise<T | null> {
    const rows = await query<T>(text, params);
    return rows[0] || null;
}

export { pool };

