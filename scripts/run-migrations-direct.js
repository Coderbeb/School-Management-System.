const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function loadEnv() {
    try {
        let envPath = path.resolve(process.cwd(), '.env.local');
        if (!fs.existsSync(envPath)) {
            envPath = path.resolve(process.cwd(), '.env');
        }
        if (fs.existsSync(envPath)) {
            const envConfig = fs.readFileSync(envPath, 'utf8');
            envConfig.split('\n').forEach(line => {
                if (line.trim().startsWith('#') || !line.trim()) return;
                const [key, ...value] = line.split('=');
                if (key && value.length) {
                    process.env[key.trim()] = value.join('=').trim().replace(/^["']|["']$/g, '');
                }
            });
        }
    } catch (e) {
        console.error('Error loading .env file:', e);
    }
}

loadEnv();

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error('DATABASE_URL not found');
    process.exit(1);
}

const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
const pool = new Pool({
    connectionString: dbUrl,
    ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } })
});

async function run() {
    console.log('Running migrate.ts migrations...');
    // We can require ts-node or since it's Next.js and tsconfig.json is configured, we can just compile or run the typescript file, or we can just extract the SQL from migrate.ts and run it!
    // Since migrate.ts is a TypeScript file, let's just run it using Next or by requiring the compiled version or by manually executing the SQL block.
    // Let's manually run the new migration SQL using our script.
    const client = await pool.connect();
    try {
        // Create migrations tracking table if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS _migrations (
                name VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check if 015_invoice_ledger_system is applied
        const applied = await client.query("SELECT name FROM _migrations WHERE name = '015_invoice_ledger_system'");
        if (applied.rows.length > 0) {
            console.log('015_invoice_ledger_system already applied.');
            return;
        }

        const sql = `
            -- 1. FEE HEADS (master list of charge types per school)
            CREATE TABLE IF NOT EXISTS fee_heads (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                category VARCHAR(50) DEFAULT 'academic' CHECK (category IN ('academic', 'transport', 'hostel', 'activity', 'one_time', 'other')),
                is_taxable BOOLEAN DEFAULT false,
                tax_rate DECIMAL(5, 2) DEFAULT 0,
                hsn_code VARCHAR(20),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, name)
            );

            -- 2. FEE GROUPS (bundles of fee heads per school)
            CREATE TABLE IF NOT EXISTS fee_groups (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, name)
            );

            -- 3. FEE GROUP HEADS (junction table linking heads to groups with specific amount & frequency)
            CREATE TABLE IF NOT EXISTS fee_group_heads (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                fee_group_id UUID NOT NULL REFERENCES fee_groups(id) ON DELETE CASCADE,
                fee_head_id UUID NOT NULL REFERENCES fee_heads(id) ON DELETE CASCADE,
                amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                frequency VARCHAR(30) DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(fee_group_id, fee_head_id)
            );

            -- 4. STUDENT FEE GROUPS (assigning students to fee groups for a session)
            CREATE TABLE IF NOT EXISTS student_fee_groups (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                fee_group_id UUID NOT NULL REFERENCES fee_groups(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, fee_group_id, session_id)
            );

            -- 5. INVOICES
            CREATE TABLE IF NOT EXISTS invoices (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                session_id UUID NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
                invoice_number VARCHAR(50) NOT NULL UNIQUE,
                due_date DATE NOT NULL,
                billing_period_start DATE,
                billing_period_end DATE,
                subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0,
                tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                late_fee_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                status VARCHAR(20) DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'void', 'overdue')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            -- 6. INVOICE ITEMS (individual lines in an invoice)
            CREATE TABLE IF NOT EXISTS invoice_items (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
                fee_head_id UUID REFERENCES fee_heads(id) ON DELETE SET NULL,
                name VARCHAR(150) NOT NULL,
                amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
                total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0
            );

            -- 7. ALTER fee_payments to link to invoice
            ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

            -- 8. INDEXES for fast lookups
            CREATE INDEX IF NOT EXISTS idx_fee_heads_school ON fee_heads(school_id);
            CREATE INDEX IF NOT EXISTS idx_fee_groups_school ON fee_groups(school_id);
            CREATE INDEX IF NOT EXISTS idx_invoices_school ON invoices(school_id);
            CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id);
            CREATE INDEX IF NOT EXISTS idx_invoices_session ON invoices(session_id);
            CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
            CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
            CREATE INDEX IF NOT EXISTS idx_fee_payments_invoice ON fee_payments(invoice_id);
        `;

        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ('015_invoice_ledger_system') ON CONFLICT DO NOTHING");
        console.log('015_invoice_ledger_system applied successfully!');
    } catch (e) {
        console.error('Error running migration:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
