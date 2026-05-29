import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { verifyToken, generateToken } from '@/lib/auth';

/**
 * POST /api/developer/impersonate
 * Allows a developer to impersonate any user (log in as them) without needing their password.
 * This generates a new JWT token for the target user.
 * Only accessible by 'developer' role users.
 */
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = verifyToken(authHeader.substring(7));
        if (!payload || payload.role !== 'developer') {
            return NextResponse.json({ error: 'Only developers can impersonate users' }, { status: 403 });
        }

        const { userId } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }

        // Get the target user
        const targetUser = await queryOne<any>(
            `SELECT id, email, first_name, last_name, role, school_id, is_active
             FROM users WHERE id = $1`,
            [userId]
        );

        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (!targetUser.is_active) {
            return NextResponse.json({ error: 'Cannot impersonate an inactive user' }, { status: 400 });
        }

        // Generate a token for the target user (same as login would produce)
        const token = generateToken({
            userId: targetUser.id,
            email: targetUser.email,
            role: targetUser.role,
            schoolId: targetUser.school_id,
        });

        return NextResponse.json({
            success: true,
            token,
            user: {
                id: targetUser.id,
                email: targetUser.email,
                firstName: targetUser.first_name,
                lastName: targetUser.last_name,
                role: targetUser.role,
                schoolId: targetUser.school_id,
            },
            message: `Now impersonating ${targetUser.first_name} ${targetUser.last_name} (${targetUser.role})`,
        });
    } catch (error) {
        console.error('Impersonation error:', error);
        return NextResponse.json({ error: 'Failed to impersonate user' }, { status: 500 });
    }
}
