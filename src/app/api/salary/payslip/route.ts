import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'accountant', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const month = searchParams.get('month'); // "2026-06"

    if (!userId || !month) {
        return NextResponse.json({ error: 'userId and month are required' }, { status: 400 });
    }

    // Teacher can only see their own payslip
    if (auth.user.role === 'teacher' && auth.user.id !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const payslip = await queryOne<any>(
            `SELECT sp.*, 
                u.first_name || ' ' || u.last_name as staff_name,
                u.email as staff_email,
                u.role as staff_role,
                u.phone as staff_phone,
                s.name as school_name,
                s.address as school_address,
                s.phone as school_phone
             FROM salary_payments sp
             JOIN users u ON sp.user_id = u.id
             JOIN schools s ON sp.school_id = s.id
             WHERE sp.school_id = $1 AND sp.user_id = $2 AND sp.month = $3`,
            [schoolId, userId, month]
        );

        if (!payslip) {
            return NextResponse.json({ error: 'No salary payment found for the specified month' }, { status: 404 });
        }

        return NextResponse.json({ payslip });
    } catch (error) {
        console.error('Error fetching payslip details:', error);
        return NextResponse.json({ error: 'Failed to fetch payslip details' }, { status: 500 });
    }
}
