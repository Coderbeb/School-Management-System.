import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';

/**
 * POST /api/platform-billing/pay-offline — Records offline payment for a platform charge
 */

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;

    try {
        const { chargeId, paymentMode, paymentReference, paymentDate } = await request.json();

        if (!chargeId) {
            return NextResponse.json({ error: 'chargeId is required' }, { status: 400 });
        }

        if (!paymentMode || !['cash', 'bank_transfer', 'upi', 'cheque'].includes(paymentMode)) {
            return NextResponse.json({ error: 'Valid paymentMode is required (cash, bank_transfer, upi, cheque)' }, { status: 400 });
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

        // 2. Update platform_charges
        await query(
            `UPDATE platform_charges SET
                status = 'paid',
                payment_mode = $1,
                payment_reference = $2,
                marked_by = $3,
                paid_at = $4
             WHERE id = $5`,
            [paymentMode, paymentReference || null, auth.user.userId,
             paymentDate || new Date().toISOString(), chargeId]
        );

        return NextResponse.json({
            success: true,
            message: 'Offline payment recorded successfully'
        });
    } catch (error: any) {
        console.error('Error recording offline platform payment:', error);
        return NextResponse.json({ error: error.message || 'Failed to record offline payment' }, { status: 500 });
    }
}
