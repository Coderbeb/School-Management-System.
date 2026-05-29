import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['developer']);
    if (auth.error) return auth.error;

    try {
        const config = await queryOne<any>(
            `SELECT id, developer_user_id,
                CASE WHEN razorpay_key_id IS NOT NULL THEN '****' || RIGHT(razorpay_key_id, 4) ELSE NULL END as razorpay_key_id,
                CASE WHEN razorpay_key_secret IS NOT NULL THEN '********' ELSE NULL END as razorpay_key_secret,
                charge_model, charge_amount, charge_percentage, is_active,
                created_at, updated_at
            FROM platform_config
            LIMIT 1`
        );

        return NextResponse.json({ config });
    } catch (error) {
        console.error('Error fetching platform config:', error);
        return NextResponse.json({ error: 'Failed to fetch platform config' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['developer']);
    if (auth.error) return auth.error;

    try {
        const {
            razorpayKeyId, razorpayKeySecret,
            chargeModel, chargeAmount, chargePercentage
        } = await request.json();

        if (!razorpayKeyId || !razorpayKeySecret) {
            return NextResponse.json({ error: 'Razorpay Key ID and Key Secret are required' }, { status: 400 });
        }

        const validModels = ['monthly_flat', 'per_student', 'per_transaction'];
        if (chargeModel && !validModels.includes(chargeModel)) {
            return NextResponse.json({ error: `Invalid charge model. Must be one of: ${validModels.join(', ')}` }, { status: 400 });
        }

        const config = await queryOne<any>(
            `INSERT INTO platform_config
                (id, developer_user_id, razorpay_key_id, razorpay_key_secret,
                 charge_model, charge_amount, charge_percentage, is_active)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true)
            ON CONFLICT ((true)) DO UPDATE SET
                developer_user_id = $1,
                razorpay_key_id = $2,
                razorpay_key_secret = $3,
                charge_model = COALESCE($4, platform_config.charge_model),
                charge_amount = COALESCE($5, platform_config.charge_amount),
                charge_percentage = COALESCE($6, platform_config.charge_percentage),
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, developer_user_id,
                '****' || RIGHT(razorpay_key_id, 4) as razorpay_key_id,
                '********' as razorpay_key_secret,
                charge_model, charge_amount, charge_percentage, is_active,
                created_at, updated_at`,
            [auth.user.userId, razorpayKeyId, razorpayKeySecret,
             chargeModel || 'monthly_flat', chargeAmount || 0, chargePercentage || 0]
        );

        return NextResponse.json({ config });
    } catch (error) {
        console.error('Error saving platform config:', error);
        return NextResponse.json({ error: 'Failed to save platform config' }, { status: 500 });
    }
}
