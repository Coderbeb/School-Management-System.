import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { hashPassword, generateToken } from '@/lib/auth';

interface UserRow {
    id: string;
    email: string;
}

// POST - Create initial super admin (only works if no users exist)
export async function POST(request: NextRequest) {
    try {
        // Check if any users exist
        const existingUser = await queryOne<UserRow>(
            'SELECT id FROM users LIMIT 1'
        );

        if (existingUser) {
            return NextResponse.json(
                { error: 'Setup already completed. Users exist.' },
                { status: 400 }
            );
        }

        const { email, password, firstName, lastName } = await request.json();

        // Create default values if not provided
        const adminEmail = email || 'admin@college.edu';
        const adminPassword = password || 'admin123';
        const adminFirstName = firstName || 'Super';
        const adminLastName = lastName || 'Admin';

        const passwordHash = await hashPassword(adminPassword);

        const users = await query<UserRow>(
            `INSERT INTO users (email, password_hash, first_name, last_name, role)
             VALUES ($1, $2, $3, $4, 'super_admin')
             RETURNING id, email`,
            [adminEmail, passwordHash, adminFirstName, adminLastName]
        );

        const user = users[0];
        const token = generateToken({
            userId: user.id,
            email: user.email,
            role: 'super_admin',
        });

        return NextResponse.json({
            message: 'Super Admin created successfully!',
            user: {
                id: user.id,
                email: adminEmail,
                firstName: adminFirstName,
                lastName: adminLastName,
                role: 'super_admin',
            },
            token,
            credentials: {
                email: adminEmail,
                password: adminPassword,
            }
        }, { status: 201 });
    } catch (error) {
        console.error('Setup error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
