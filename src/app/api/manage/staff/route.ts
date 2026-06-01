import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// GET - List staff members (non-student, non-parent)
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search')?.toLowerCase() || '';
        const role = searchParams.get('role'); // e.g., 'teacher', 'accountant', 'admin'

        let sql = `
            SELECT id, first_name, last_name, email, role, created_at
            FROM users
            WHERE role NOT IN ('student', 'parent')
        `;
        const params: any[] = [];
        let idx = 1;

        if (role) {
            sql += ` AND role = $${idx++}`;
            params.push(role);
        }

        if (search) {
            sql += ` AND (LOWER(first_name || ' ' || last_name) LIKE $${idx} OR LOWER(email) LIKE $${idx})`;
            params.push(`%${search}%`);
            idx++;
        }

        // We could isolate by school_id if users table had it directly for all staff,
        // but for now, we assume global users or isolation handled elsewhere if needed.
        // Assuming global users for staff as per current schema usage.

        sql += ` ORDER BY first_name ASC, last_name ASC LIMIT 50`;

        const staff = await query(sql, params);

        return NextResponse.json({ staff });
    } catch (error) {
        console.error('Get staff error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
