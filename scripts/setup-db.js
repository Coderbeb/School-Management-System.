const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Basic .env parser since we don't want to rely on dotenv package if not installed
function loadEnv() {
    try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
            const envConfig = fs.readFileSync(envPath, 'utf8');
            envConfig.split('\n').forEach(line => {
                const [key, ...value] = line.split('=');
                if (key && value) {
                    process.env[key.trim()] = value.join('=').trim().replace(/^["']|["']$/g, '');
                }
            });
            console.log('Loaded environment from .env.local');
        } else {
            console.log('No .env.local found, checking .env');
            const envPath2 = path.resolve(process.cwd(), '.env');
            if (fs.existsSync(envPath2)) {
                // ... similiar logic or just rely on process.env
            }
        }
    } catch (e) {
        console.error('Error loading .env file:', e);
    }
}

loadEnv();

if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL is not defined in .env.local');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function setup() {
    const client = await pool.connect();
    try {
        console.log('Connected to database...');

        // Read SQL files
        const schemaSql = fs.readFileSync(path.join(process.cwd(), 'sql/schema.sql'), 'utf8');
        const seedSql = fs.readFileSync(path.join(process.cwd(), 'sql/seed.sql'), 'utf8');

        console.log('Running schema.sql...');
        await client.query(schemaSql);
        console.log('Schema created successfully.');

        console.log('Running seed.sql...');
        await client.query(seedSql);
        console.log('Seed data inserted successfully.');

        console.log('Database setup complete!');
    } catch (err) {
        console.error('Error running setup:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

setup();
