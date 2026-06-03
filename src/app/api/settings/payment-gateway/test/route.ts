import { NextRequest, NextResponse } from 'next/server';
import { requireSchoolAuth } from '@/lib/auth';
import Razorpay from 'razorpay';

/**
 * POST /api/settings/payment-gateway/test
 * Tests Razorpay API credentials by making a simple API call.
 * Does NOT save anything — just validates the keys work.
 */
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    try {
        const { keyId, keySecret } = await request.json();

        if (!keyId || !keySecret) {
            return NextResponse.json({ error: 'Key ID and Key Secret are required' }, { status: 400 });
        }

        // Initialize Razorpay with provided credentials
        const razorpay = new Razorpay({
            key_id: keyId,
            key_secret: keySecret
        });

        // Test by fetching orders with limit 1 — cheapest API call
        await razorpay.orders.all({ count: 1 });

        return NextResponse.json({
            success: true,
            message: 'Razorpay credentials are valid! Connection successful.',
            keyType: keyId.startsWith('rzp_test_') ? 'test' : 'live'
        });
    } catch (error: any) {
        console.error('Razorpay connection test failed:', error);

        // Razorpay returns specific error codes
        const statusCode = error.statusCode || 500;
        let message = 'Connection failed';

        if (statusCode === 401) {
            message = 'Invalid API credentials. Please check your Key ID and Key Secret.';
        } else if (statusCode === 403) {
            message = 'Access denied. Your Razorpay account may be inactive or restricted.';
        } else if (error.message) {
            message = error.message;
        }

        return NextResponse.json({
            success: false,
            error: message
        }, { status: 400 });
    }
}
