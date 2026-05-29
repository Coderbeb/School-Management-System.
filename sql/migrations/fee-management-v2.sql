-- ============================================================
-- Fee Management System v2 — Migration
-- Run AFTER fee-module-migration.sql
-- ============================================================

-- 1. Payment Gateway Config (per school — stores their Razorpay credentials)
CREATE TABLE IF NOT EXISTS payment_gateway_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    gateway_type VARCHAR(20) DEFAULT 'razorpay' CHECK (gateway_type IN ('razorpay', 'stripe')),
    key_id TEXT,                             -- Encrypted Razorpay Key ID
    key_secret TEXT,                         -- Encrypted Razorpay Key Secret
    webhook_secret TEXT,                     -- For webhook signature verification
    is_active BOOLEAN DEFAULT false,
    -- School bank details (for receipts)
    bank_name VARCHAR(200),
    bank_account_number VARCHAR(50),
    bank_ifsc VARCHAR(20),
    bank_account_name VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(school_id, gateway_type)
);

-- 2. Developer Platform Config (global — Developer's Razorpay + charge model)
CREATE TABLE IF NOT EXISTS platform_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    razorpay_key_id TEXT,                    -- Developer's Razorpay Key (encrypted)
    razorpay_key_secret TEXT,                -- Developer's Razorpay Secret (encrypted)
    charge_model VARCHAR(30) DEFAULT 'monthly_flat' CHECK (charge_model IN ('monthly_flat', 'per_student', 'per_transaction')),
    charge_amount DECIMAL(10, 2) DEFAULT 0,  -- Flat amount or per-student amount
    charge_percentage DECIMAL(5, 2) DEFAULT 0, -- For per_transaction model
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Platform Charges (monthly billing records for each school)
CREATE TABLE IF NOT EXISTS platform_charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    billing_month VARCHAR(7) NOT NULL,       -- '2026-05'
    student_count INTEGER DEFAULT 0,
    charge_model VARCHAR(30),
    charge_amount DECIMAL(10, 2) DEFAULT 0,
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
    razorpay_payment_id TEXT,
    paid_at TIMESTAMP WITH TIME ZONE,
    due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(school_id, billing_month)
);

-- 4. Fee Payment Orders (Razorpay order tracking for student online payments)
CREATE TABLE IF NOT EXISTS fee_payment_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    fee_structure_id UUID NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    razorpay_order_id TEXT UNIQUE,
    razorpay_payment_id TEXT,
    razorpay_signature TEXT,
    amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Add new columns to fee_structures
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS frequency VARCHAR(20) DEFAULT 'one_time' CHECK (frequency IN ('monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time'));
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS late_fee_per_day DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS grace_period_days INTEGER DEFAULT 0;

-- 6. Add Razorpay tracking to fee_payments
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_pgc_school ON payment_gateway_config(school_id);
CREATE INDEX IF NOT EXISTS idx_platform_charges_school ON platform_charges(school_id);
CREATE INDEX IF NOT EXISTS idx_platform_charges_month ON platform_charges(billing_month);
CREATE INDEX IF NOT EXISTS idx_fpo_student ON fee_payment_orders(student_id);
CREATE INDEX IF NOT EXISTS idx_fpo_order ON fee_payment_orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_school ON fee_payments(school_id);
