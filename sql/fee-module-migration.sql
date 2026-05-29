-- ============================================================
-- Fee Module Tables Migration
-- Run this after the main schema is set up
-- ============================================================

-- Fee Structures: defines what fees each class must pay
CREATE TABLE IF NOT EXISTS fee_structures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    fee_type VARCHAR(50) DEFAULT 'tuition' CHECK (fee_type IN ('tuition', 'transport', 'lab', 'library', 'exam', 'sports', 'uniform', 'other')),
    class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
    session_id UUID REFERENCES academic_sessions(id) ON DELETE SET NULL,
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    due_date DATE,
    is_active BOOLEAN DEFAULT true,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Fee Payments: records each payment made by a student
CREATE TABLE IF NOT EXISTS fee_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    fee_structure_id UUID NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
    amount_paid DECIMAL(10, 2) NOT NULL,
    payment_mode VARCHAR(30) DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'upi', 'bank_transfer', 'cheque', 'card', 'online', 'other')),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    receipt_number VARCHAR(50) UNIQUE,
    payment_status VARCHAR(20) DEFAULT 'completed' CHECK (payment_status IN ('completed', 'partial', 'refunded', 'cancelled')),
    remarks TEXT,
    collected_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_fee_structures_school ON fee_structures(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_class ON fee_structures(class_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_structure ON fee_payments(fee_structure_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_date ON fee_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_fee_payments_receipt ON fee_payments(receipt_number);
