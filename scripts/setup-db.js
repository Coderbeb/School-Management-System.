const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Basic .env parser since we don't want to rely on dotenv package if not installed
function loadEnv() {
    try {
        let envPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
            console.log('Loading environment from .env.local');
        } else {
            envPath = path.resolve(process.cwd(), '.env');
            if (fs.existsSync(envPath)) {
                console.log('Loading environment from .env');
            } else {
                console.log('No .env.local or .env found');
                return;
            }
        }
        
        const envConfig = fs.readFileSync(envPath, 'utf8');
        envConfig.split('\n').forEach(line => {
            // Skip comments and empty lines
            if (line.trim().startsWith('#') || !line.trim()) return;
            const [key, ...value] = line.split('=');
            if (key && value.length) {
                process.env[key.trim()] = value.join('=').trim().replace(/^["']|["']$/g, '');
            }
        });
    } catch (e) {
        console.error('Error loading .env file:', e);
    }
}

loadEnv();

if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL is not defined in .env or .env.local');
    process.exit(1);
}

// For local connections (localhost), SSL is not needed
const isLocalhost = process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } })
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

        // Dynamic Super Admin Creation
        console.log('Creating Super Admin user...');
        const bcrypt = require('bcrypt');
        const password = 'admin123';
        const saltRounds = 10;
        const hash = await bcrypt.hash(password, saltRounds);

        const insertUserQuery = `
            INSERT INTO users (email, password_hash, first_name, last_name, role, is_active)
            VALUES ($1, $2, $3, $4, 'super_admin', true)
            ON CONFLICT (email) DO UPDATE SET
                password_hash = EXCLUDED.password_hash,
                is_active = true;
        `;

        await client.query(insertUserQuery, ['admin@college.edu', hash, 'Super', 'Admin']);
        console.log(`✅ Super Admin created with password: ${password}`);

        console.log('Database setup complete!');
    } catch (err) {
        console.error('Error running setup:', err);
    } finally {
        // ... (rest of cleanup)

        client.release();
        await pool.end();
    }
}

setup();
