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
        const { month } = await request.json();

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
        const dueDate = `${month}-28`;

        for (const school of schools) {
            const studentCount = await queryOne<{ count: string }>(
                `SELECT COUNT(*) as count FROM students WHERE school_id = $1 AND is_active = true`,
                [school.id]
            );

            const count = parseInt(studentCount?.count || '0');
            let totalAmount = 0;

            if (platformConfig.charge_model === 'monthly_flat') {
                totalAmount = parseFloat(platformConfig.charge_amount || '0');
            } else if (platformConfig.charge_model === 'per_student') {
                totalAmount = count * parseFloat(platformConfig.charge_amount || '0');
            } else if (platformConfig.charge_model === 'per_transaction') {
                totalAmount = 0;
            }

            const charge = await queryOne<any>(
                `INSERT INTO platform_charges
                    (school_id, billing_month, student_count, charge_model, charge_amount, total_amount, status, due_date)
                VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
                ON CONFLICT (school_id, billing_month) DO NOTHING
                RETURNING *`,
                [school.id, month, count, platformConfig.charge_model,
                 platformConfig.charge_amount, totalAmount, dueDate]
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
    } catch (error) {
        console.error('Error generating platform charges:', error);
        return NextResponse.json({ error: 'Failed to generate platform charges' }, { status: 500 });
    }
}
