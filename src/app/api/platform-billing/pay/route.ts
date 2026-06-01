import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';
import Razorpay from 'razorpay';

/**
 * POST /api/platform-billing/pay — Creates a Razorpay order for a platform charge
 * Uses the DEVELOPER's Razorpay credentials from platform_config
 */

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant']);
    if (auth.error) return auth.error;

    try {
        const { chargeId } = await request.json();

        if (!chargeId) {
            return NextResponse.json({ error: 'chargeId is required' }, { status: 400 });
        }

        // 1. Fetch the platform charge
        const charge = await queryOne<any>(
            `SELECT * FROM platform_charges WHERE id = $1`,
            [chargeId]
        );

        if (!charge) {
            return NextResponse.json({ error: 'Platform charge not found' }, { status: 404 });
        }

        if (charge.status === 'paid') {
            return NextResponse.json({ error: 'This charge is already paid' }, { status: 400 });
        }

        // 2. Fetch developer's Razorpay keys from platform_config
        const platformConfig = await queryOne<any>(
            `SELECT razorpay_key_id, razorpay_key_secret FROM platform_config WHERE is_active = true LIMIT 1`
        );

        if (!platformConfig || !platformConfig.razorpay_key_id || !platformConfig.razorpay_key_secret) {
            return NextResponse.json({ error: 'Platform payment gateway is not configured' }, { status: 400 });
        }

        // 3. Create Razorpay order
        const razorpay = new Razorpay({
            key_id: platformConfig.razorpay_key_id,
            key_secret: platformConfig.razorpay_key_secret
        });

        const order = await razorpay.orders.create({
            amount: Math.round(parseFloat(charge.total_amount) * 100), // Razorpay expects paise
            currency: 'INR',
            receipt: `platform_${chargeId.slice(0, 8)}_${Date.now()}`
        });

        return NextResponse.json({
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: platformConfig.razorpay_key_id
        });
    } catch (error: any) {
        console.error('Error creating platform billing order:', error);
        return NextResponse.json({ error: error.message || 'Failed to create payment order' }, { status: 500 });
    }
}
