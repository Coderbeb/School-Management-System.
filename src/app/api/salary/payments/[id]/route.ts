import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// GET - Retrieve a specific salary payment by ID with full details (for Payslip)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        if (!id) return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 });

        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

        // Build base query
        let sql = `
            SELECT 
                sp.*,
                ss.base_salary, ss.allowances, ss.deductions,
                u.first_name, u.last_name, u.email, u.role,
                sch.name as school_name, sch.address as school_address, 
                sch.phone as school_phone, sch.email as school_email, sch.logo_url as school_logo
            FROM salary_payments sp
            JOIN users u ON sp.user_id = u.id
            LEFT JOIN salary_structures ss ON sp.salary_structure_id = ss.id
            LEFT JOIN schools sch ON sp.school_id = sch.id
            WHERE sp.id = $1
        `;
        const sqlParams: any[] = [id];

        // RBAC: If it's a teacher/staff (not super_admin/admin), they can only see their own payslips
        if (payload.role !== 'super_admin' && payload.role !== 'developer' && payload.role !== 'accountant') {
            sql += ` AND sp.user_id = $2`;
            sqlParams.push(payload.userId);
        }

        const payment = await queryOne(sql, sqlParams);

        if (!payment) {
            return NextResponse.json({ error: 'Payment not found or access denied' }, { status: 404 });
        }

        return NextResponse.json({ payment });
    } catch (error) {
        console.error('Error fetching payslip details:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
