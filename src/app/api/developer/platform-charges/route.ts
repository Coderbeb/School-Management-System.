import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['developer']);
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month');

        let sql = `
            SELECT pc.*, s.name as school_name
            FROM platform_charges pc
            JOIN schools s ON pc.school_id = s.id
            WHERE 1=1
        `;
        const params: unknown[] = [];
        let idx = 1;

        if (month) {
            sql += ` AND pc.billing_month = $${idx++}`;
            params.push(month);
        }

        sql += ` ORDER BY pc.billing_month DESC, s.name ASC`;
        const charges = await query<any>(sql, params);
        return NextResponse.json({ charges });
    } catch (error) {
        console.error('Error fetching platform charges:', error);
        return NextResponse.json({ error: 'Failed to fetch platform charges' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['developer']);
    if (auth.error) return auth.error;

    try {
        const body = await request.json();
        const { schoolId, billingMonth, totalAmount, description, dueDate, month } = body;

        // 1. Create a custom single platform charge for a school
        if (schoolId) {
            if (!billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
                return NextResponse.json({ error: 'Valid billingMonth required (format: YYYY-MM)' }, { status: 400 });
            }
            if (totalAmount === undefined || isNaN(parseFloat(totalAmount))) {
                return NextResponse.json({ error: 'Valid totalAmount is required' }, { status: 400 });
            }

            const school = await queryOne(`SELECT id FROM schools WHERE id = $1`, [schoolId]);
            if (!school) {
                return NextResponse.json({ error: 'School not found' }, { status: 404 });
            }

            const finalDueDate = dueDate || `${billingMonth}-28`;

            const charge = await queryOne<any>(
                `INSERT INTO platform_charges
                    (school_id, billing_month, student_count, charge_model, charge_amount, total_amount, status, due_date, description)
                 VALUES ($1, $2, 0, 'custom', $3, $3, 'pending', $4, $5)
                 ON CONFLICT (school_id, billing_month) DO UPDATE SET
                    total_amount = EXCLUDED.total_amount,
                    charge_amount = EXCLUDED.charge_amount,
                    charge_model = EXCLUDED.charge_model,
                    due_date = EXCLUDED.due_date,
                    description = EXCLUDED.description,
                    status = 'pending'
                 RETURNING *`,
                [schoolId, billingMonth, parseFloat(totalAmount), finalDueDate, description || 'Platform Service Charge']
            );

            // Fetch school name for response consistency
            const schoolWithDetails = await queryOne<any>(
                `SELECT pc.*, s.name as school_name 
                 FROM platform_charges pc
                 JOIN schools s ON pc.school_id = s.id
                 WHERE pc.id = $1`,
                [charge.id]
            );

            return NextResponse.json({
                success: true,
                charge: schoolWithDetails
            }, { status: 201 });
        }

        // 2. Batch generate charges based on month (existing code)
        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return NextResponse.json({ error: 'Valid month required (format: YYYY-MM)' }, { status: 400 });
        }

        const platformConfig = await queryOne<any>(
            `SELECT * FROM platform_config LIMIT 1`
        );

        if (!platformConfig) {
            return NextResponse.json({ error: 'Platform config not found. Configure it first.' }, { status: 400 });
        }

        const schools = await query<any>(
            `SELECT id, name FROM schools WHERE is_active = true`
        );

        if (schools.length === 0) {
            return NextResponse.json({ error: 'No active schools found' }, { status: 404 });
        }

        const results: any[] = [];
        const batchDueDate = `${month}-28`;

        for (const school of schools) {
            const studentCount = await queryOne<{ count: string }>(
                `SELECT COUNT(*) as count FROM students WHERE school_id = $1 AND is_active = true`,
                [school.id]
            );

            const count = parseInt(studentCount?.count || '0');
            let amount = 0;

            if (platformConfig.charge_model === 'monthly_flat') {
                amount = parseFloat(platformConfig.charge_amount || '0');
            } else if (platformConfig.charge_model === 'per_student') {
                amount = count * parseFloat(platformConfig.charge_amount || '0');
            } else if (platformConfig.charge_model === 'per_transaction') {
                amount = 0;
            }

            const charge = await queryOne<any>(
                `INSERT INTO platform_charges
                    (school_id, billing_month, student_count, charge_model, charge_amount, total_amount, status, due_date, description)
                VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
                ON CONFLICT (school_id, billing_month) DO NOTHING
                RETURNING *`,
                [school.id, month, count, platformConfig.charge_model,
                 platformConfig.charge_amount, amount, batchDueDate, `Platform Subscription Fee (${month})`]
            );

            if (charge) {
                results.push({ ...charge, school_name: school.name });
            }
        }

        return NextResponse.json({
            generated: results.length,
            skipped: schools.length - results.length,
            charges: results
        }, { status: 201 });
    } catch (error: any) {
        console.error('Error generating platform charges:', error);
        return NextResponse.json({ error: error.message || 'Failed to generate platform charges' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['developer']);
    if (auth.error) return auth.error;

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Charge ID is required' }, { status: 400 });
        }

        const charge = await queryOne<any>(`SELECT status FROM platform_charges WHERE id = $1`, [id]);
        if (!charge) {
            return NextResponse.json({ error: 'Platform charge not found' }, { status: 404 });
        }

        if (charge.status === 'paid') {
            return NextResponse.json({ error: 'Cannot delete a paid platform charge' }, { status: 400 });
        }

        await query(`DELETE FROM platform_charges WHERE id = $1`, [id]);

        return NextResponse.json({ success: true, message: 'Platform charge deleted successfully' });
    } catch (error: any) {
        console.error('Error deleting platform charge:', error);
        return NextResponse.json({ error: error.message || 'Failed to delete platform charge' }, { status: 500 });
    }
}
