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

// Auto-migration: runs once on first query
let migrationDone = false;
async function ensureMigrations() {
    if (migrationDone) return;
    migrationDone = true; // Set immediately to prevent concurrent runs
    try {
        const { runMigrations } = await import('./migrate');
        await runMigrations();
    } catch (err) {
        console.error('[DB] Migration error (non-fatal):', err);
    }
}

// Trigger migration on pool ready (non-blocking)
ensureMigrations();

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
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
