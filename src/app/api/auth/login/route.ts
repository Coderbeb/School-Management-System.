import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { comparePassword, generateToken } from '@/lib/auth';

interface UserRow {
    id: string;
    email: string;
    password_hash: string;
    first_name: string;
    last_name: string;
    role: 'developer' | 'super_admin' | 'teacher' | 'accountant' | 'student';
    is_active: boolean;
    school_id: string | null;
}

export async function POST(request: NextRequest) {
    try {
        const { email, password, rememberMe } = await request.json();

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

        // Check if user is active
        if (!user.is_active) {
            return NextResponse.json(
                { error: 'Your account has been deactivated. Please contact the administrator.' },
                { status: 403 }
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
            schoolId: user.school_id,
        }, !!rememberMe);

        // Determine the dashboard path based on role
        let dashboardPath = '/dashboard';
        switch (user.role) {
            case 'developer':
                dashboardPath = '/developer/dashboard';
                break;
            case 'super_admin':
                dashboardPath = '/dashboard';
                break;
            case 'teacher':
                dashboardPath = '/teacher/dashboard';
                break;
            case 'accountant':
                dashboardPath = '/accountant/dashboard';
                break;
            case 'student':
                dashboardPath = '/student/dashboard';
                break;
        }

        return NextResponse.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                schoolId: user.school_id,
            },
            dashboardPath,
        });
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'Server error' },
            { status: 500 }
        );
    }
}
