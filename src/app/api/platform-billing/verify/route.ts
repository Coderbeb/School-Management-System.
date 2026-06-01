import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';
import crypto from 'crypto';

/**
 * POST /api/platform-billing/verify — Verifies Razorpay payment for platform charge
 */

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant']);
    if (auth.error) return auth.error;

    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, chargeId } = await request.json();

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !chargeId) {
            return NextResponse.json({ error: 'All Razorpay payment details and chargeId are required' }, { status: 400 });
        }

        // 1. Fetch developer's Razorpay secret from platform_config
        const platformConfig = await queryOne<any>(
            `SELECT razorpay_key_secret FROM platform_config WHERE is_active = true LIMIT 1`
        );

        if (!platformConfig || !platformConfig.razorpay_key_secret) {
            return NextResponse.json({ error: 'Platform payment gateway is not configured' }, { status: 400 });
        }

        // 2. Verify the signature
        const generatedSignature = crypto
            .createHmac('sha256', platformConfig.razorpay_key_secret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            return NextResponse.json({ error: 'Payment verification failed: signature mismatch' }, { status: 400 });
        }

        // 3. Update platform_charges status
        await query(
            `UPDATE platform_charges SET
                status = 'paid',
                razorpay_payment_id = $1,
                paid_at = CURRENT_TIMESTAMP,
                payment_mode = 'online'
             WHERE id = $2`,
            [razorpay_payment_id, chargeId]
        );

        return NextResponse.json({
            success: true,
            message: 'Platform billing payment verified and recorded successfully!'
        });
    } catch (error: any) {
        console.error('Error verifying platform billing payment:', error);
        return NextResponse.json({ error: error.message || 'Failed to verify payment' }, { status: 500 });
    }
}
