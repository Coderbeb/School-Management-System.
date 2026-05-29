import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId, hashPassword } from '@/lib/auth';

// GET: List all accountants and super_admins (scoped by school)
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search');

        let sql = `SELECT id, email, phone, first_name, last_name, role, is_active, created_at FROM users WHERE role IN ('super_admin', 'accountant')`;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) {
            sql += ` AND school_id = $${idx++}`;
            params.push(schoolId);
        }

        if (search) {
            sql += ` AND (first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR email ILIKE $${idx})`;
            params.push(`%${search}%`);
            idx++;
        }

        sql += ` ORDER BY role DESC, first_name ASC`;
        const accounts = await query(sql, params);
        return NextResponse.json({ accounts });
    } catch (error) {
        console.error('GET accounts error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST: Create a new accountant or admin account
export async function POST(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { firstName, lastName, email, phone, password, role } = await request.json();

        if (!firstName || !lastName || !email || !password || !role) {
            return NextResponse.json({ error: 'First name, last name, email, password, and role are required' }, { status: 400 });
        }

        if (!['super_admin', 'accountant'].includes(role)) {
            return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
        }
        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        const passwordHash = await hashPassword(password);
        const account = await queryOne(
            `INSERT INTO users (first_name, last_name, email, phone, password_hash, role, school_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, first_name, last_name, email, phone, role, is_active`,
            [firstName, lastName, email, phone || null, passwordHash, role, schoolId]
        );

        return NextResponse.json({ account }, { status: 201 });
    } catch (error: any) {
        console.error('POST account error:', error);
        if (error?.code === '23505') return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT: Update account details or toggle active status
export async function PUT(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { id, firstName, lastName, email, phone, role, isActive } = await request.json();
        if (!id) return NextResponse.json({ error: 'Account ID required' }, { status: 400 });

        if (role && !['super_admin', 'accountant'].includes(role)) {
            return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
        }

        // Prevent self-deactivation or self-demotion
        if (id === auth.user.userId) {
            if (isActive === false) return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 });
            if (role && role !== 'super_admin') return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
        }

        let sql = `UPDATE users SET
                first_name = COALESCE($2, first_name),
                last_name = COALESCE($3, last_name),
                email = COALESCE($4, email),
                phone = COALESCE($5, phone),
                role = COALESCE($6, role),
                is_active = COALESCE($7, is_active),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND role IN ('super_admin', 'accountant')`;
        const params: unknown[] = [id, firstName, lastName, email, phone, role, isActive];

        if (schoolId) {
            sql += ` AND school_id = $8`;
            params.push(schoolId);
        }

        sql += ` RETURNING id, first_name, last_name, email, phone, role, is_active`;
        const account = await queryOne(sql, params);

        if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        return NextResponse.json({ account });
    } catch (error) {
        console.error('PUT account error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
