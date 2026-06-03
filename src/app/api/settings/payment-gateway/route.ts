import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const config = await queryOne<any>(
            `SELECT id, school_id, gateway_type,
                CASE WHEN key_id IS NOT NULL THEN '****' || RIGHT(key_id, 4) ELSE NULL END as key_id,
                CASE WHEN key_secret IS NOT NULL THEN '********' ELSE NULL END as key_secret,
                CASE WHEN webhook_secret IS NOT NULL THEN '********' ELSE NULL END as webhook_secret,
                is_active, bank_name, bank_account_number, bank_ifsc, bank_account_name,
                created_at, updated_at
            FROM payment_gateway_config
            WHERE school_id = $1`,
            [schoolId]
        );

        return NextResponse.json({ config });
    } catch (error) {
        console.error('Error fetching payment gateway config:', error);
        return NextResponse.json({ error: 'Failed to fetch payment gateway config' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const {
            keyId, keySecret, webhookSecret, isActive,
            bankName, bankAccountNumber, bankIfsc, bankAccountName
        } = await request.json();

        // Check if config exists
        const existing = await queryOne<any>(
            `SELECT id FROM payment_gateway_config WHERE school_id = $1 AND gateway_type = 'razorpay'`,
            [schoolId]
        );

        let config;
        if (existing) {
            // UPDATE - preserve existing keys if not provided
            config = await queryOne<any>(
                `UPDATE payment_gateway_config SET
                    key_id = COALESCE(NULLIF($2, ''), key_id),
                    key_secret = COALESCE(NULLIF($3, ''), key_secret),
                    webhook_secret = COALESCE(NULLIF($4, ''), webhook_secret),
                    is_active = COALESCE($5, is_active),
                    bank_name = $6,
                    bank_account_number = $7,
                    bank_ifsc = $8,
                    bank_account_name = $9,
                    updated_at = CURRENT_TIMESTAMP
                WHERE school_id = $1 AND gateway_type = 'razorpay'
                RETURNING id, school_id, gateway_type,
                    '****' || RIGHT(key_id, 4) as key_id,
                    '********' as key_secret,
                    CASE WHEN webhook_secret IS NOT NULL THEN '********' ELSE NULL END as webhook_secret,
                    is_active, bank_name, bank_account_number, bank_ifsc, bank_account_name,
                    created_at, updated_at`,
                [schoolId, keyId || '', keySecret || '', webhookSecret || '', isActive !== false,
                 bankName || null, bankAccountNumber || null, bankIfsc || null, bankAccountName || null]
            );
        } else {
            // INSERT
            if (!keyId || !keySecret) {
                return NextResponse.json({ error: 'Razorpay Key ID and Key Secret are required for initial setup' }, { status: 400 });
            }
            config = await queryOne<any>(
                `INSERT INTO payment_gateway_config
                    (school_id, gateway_type, key_id, key_secret, webhook_secret, is_active,
                     bank_name, bank_account_number, bank_ifsc, bank_account_name)
                VALUES ($1, 'razorpay', $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id, school_id, gateway_type,
                    '****' || RIGHT(key_id, 4) as key_id,
                    '********' as key_secret,
                    CASE WHEN webhook_secret IS NOT NULL THEN '********' ELSE NULL END as webhook_secret,
                    is_active, bank_name, bank_account_number, bank_ifsc, bank_account_name,
                    created_at, updated_at`,
                [schoolId, keyId, keySecret, webhookSecret || '', isActive !== false,
                 bankName || null, bankAccountNumber || null, bankIfsc || null, bankAccountName || null]
            );
        }

        return NextResponse.json({ config });
    } catch (error) {
        console.error('Error saving payment gateway config:', error);
        return NextResponse.json({ error: 'Failed to save payment gateway config' }, { status: 500 });
    }
}
