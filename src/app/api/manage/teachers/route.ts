import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId, hashPassword } from '@/lib/auth';

// GET: List all teachers (scoped by school)
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search');

        let sql = `SELECT id, email, phone, first_name, last_name, role, is_active, created_at FROM users WHERE role = 'teacher'`;
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

        sql += ` ORDER BY first_name ASC`;
        const teachers = await query(sql, params);
        return NextResponse.json({ teachers });
    } catch (error) {
        console.error('GET teachers error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// POST: Create a new teacher account
export async function POST(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { firstName, lastName, email, phone, password } = await request.json();

        if (!firstName || !lastName || !email || !password) {
            return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
        }
        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        const passwordHash = await hashPassword(password);
        const teacher = await queryOne(
            `INSERT INTO users (first_name, last_name, email, phone, password_hash, role, school_id)
             VALUES ($1, $2, $3, $4, $5, 'teacher', $6)
             RETURNING id, first_name, last_name, email, phone, role`,
            [firstName, lastName, email, phone || null, passwordHash, schoolId]
        );

        return NextResponse.json({ teacher }, { status: 201 });
    } catch (error: any) {
        console.error('POST teacher error:', error);
        if (error?.code === '23505') return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT: Update teacher or toggle active status
export async function PUT(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        const { id, firstName, lastName, email, phone, isActive, password } = await request.json();
        if (!id) return NextResponse.json({ error: 'Teacher ID required' }, { status: 400 });

        let passwordHash: string | null = null;
        if (password && password.trim() !== '') {
            passwordHash = await hashPassword(password);
        }

        let sql = `UPDATE users SET
                first_name = COALESCE($2, first_name),
                last_name = COALESCE($3, last_name),
                email = COALESCE($4, email),
                phone = COALESCE($5, phone),
                is_active = COALESCE($6, is_active),
                password_hash = COALESCE($7, password_hash),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND role = 'teacher'`;
        const params: unknown[] = [id, firstName, lastName, email, phone, isActive, passwordHash];

        if (schoolId) {
            sql += ` AND school_id = $8`;
            params.push(schoolId);
        }

        sql += ` RETURNING id, first_name, last_name, email, phone, is_active`;
        const teacher = await queryOne(sql, params);

        if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
        return NextResponse.json({ teacher });
    } catch (error) {
        console.error('PUT teacher error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
