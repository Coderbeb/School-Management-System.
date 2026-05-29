import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';
import Razorpay from 'razorpay';

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['student']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { feeStructureId } = await request.json();

        if (!feeStructureId) {
            return NextResponse.json({ error: 'Fee Structure ID is required' }, { status: 400 });
        }

        // 1. Resolve student ID from auth.user.userId
        const student = await queryOne<any>(
            `SELECT id FROM students WHERE user_id = $1 AND school_id = $2`,
            [auth.user.userId, schoolId]
        );

        if (!student) {
            return NextResponse.json({ error: 'Student record not found' }, { status: 404 });
        }

        // 2. Fetch fee structure
        const structure = await queryOne<any>(
            `SELECT * FROM fee_structures WHERE id = $1 AND school_id = $2 AND is_active = true`,
            [feeStructureId, schoolId]
        );

        if (!structure) {
            return NextResponse.json({ error: 'Fee structure not found or inactive' }, { status: 404 });
        }

        // 3. Fetch already paid amount
        const paidResult = await queryOne<any>(
            `SELECT SUM(amount_paid) as total_paid FROM fee_payments WHERE student_id = $1 AND fee_structure_id = $2`,
            [student.id, feeStructureId]
        );

        const totalPaid = parseFloat(paidResult?.total_paid || '0');
        const remainingAmount = parseFloat(structure.amount) - totalPaid;

        if (remainingAmount <= 0) {
            return NextResponse.json({ error: 'This fee is already fully paid' }, { status: 400 });
        }

        // 4. Fetch school's payment gateway configuration
        const pgConfig = await queryOne<any>(
            `SELECT key_id, key_secret, is_active FROM payment_gateway_config WHERE school_id = $1 AND gateway_type = 'razorpay'`,
            [schoolId]
        );

        if (!pgConfig || !pgConfig.is_active || !pgConfig.key_id || !pgConfig.key_secret) {
            return NextResponse.json({ error: 'Online payments are currently not configured for this school' }, { status: 400 });
        }

        // 5. Initialize Razorpay and create order
        const razorpay = new Razorpay({
            key_id: pgConfig.key_id,
            key_secret: pgConfig.key_secret
        });

        const order = await razorpay.orders.create({
            amount: Math.round(remainingAmount * 100), // Razorpay expects amount in paise
            currency: 'INR',
            receipt: `rcpt_${student.id.slice(0, 8)}_${Date.now()}`
        });

        // 6. Record order in fee_payment_orders
        await query(
            `INSERT INTO fee_payment_orders
                (student_id, fee_structure_id, school_id, razorpay_order_id, amount, status)
            VALUES ($1, $2, $3, $4, $5, 'created')`,
            [student.id, feeStructureId, schoolId, order.id, remainingAmount]
        );

        return NextResponse.json({
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: pgConfig.key_id
        });
    } catch (error: any) {
        console.error('Error creating payment order:', error);
        return NextResponse.json({ error: error.message || 'Failed to create payment order' }, { status: 500 });
    }
}
