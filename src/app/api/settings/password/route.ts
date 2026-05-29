import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, comparePassword, hashPassword } from '@/lib/auth';

/**
 * PUT /api/settings/password
 * Updates the logged-in user's password.
 */
export async function PUT(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin']);
        if (auth.error) return auth.error;

        const userId = auth.user.userId; // AuthResult has userId
        const body = await request.json();
        const { currentPassword, newPassword } = body;

        if (!currentPassword || !newPassword) {
            return NextResponse.json({ error: 'Current password and new password are required' }, { status: 400 });
        }

        if (newPassword.length < 6) {
            return NextResponse.json({ error: 'New password must be at least 6 characters long' }, { status: 400 });
        }

        // Fetch user from DB to check current password
        const user = await queryOne<{ password_hash: string }>(
            `SELECT password_hash FROM users WHERE id = $1`,
            [userId]
        );

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Verify current password
        const isValid = await comparePassword(currentPassword, user.password_hash);
        if (!isValid) {
            return NextResponse.json({ error: 'Incorrect current password' }, { status: 401 });
        }

        // Hash new password
        const newPasswordHash = await hashPassword(newPassword);

        // Update password in DB
        await query(
            `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [newPasswordHash, userId]
        );

        return NextResponse.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error updating password:', error);
        return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
    }
}
