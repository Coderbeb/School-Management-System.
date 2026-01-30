import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { comparePassword, generateToken } from '@/lib/auth';

interface UserRow {
    id: string;
    email: string;
    password_hash: string;
    first_name: string;
    last_name: string;
    role: 'super_admin' | 'hod' | 'teacher';
    department_id: string | null;
}

export async function POST(request: NextRequest) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email and password are required' },
                { status: 400 }
            );
        }

        // Find user by email
        const user = await queryOne<UserRow>(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (!user) {
            return NextResponse.json(
                { error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        // Verify password
        const isValid = await comparePassword(password, user.password_hash);
        if (!isValid) {
            return NextResponse.json(
                { error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        // Generate JWT token
        const token = generateToken({
            userId: user.id,
            email: user.email,
            role: user.role,
            departmentId: user.department_id || undefined,
        });

        return NextResponse.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                departmentId: user.department_id,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        );
    }
}
