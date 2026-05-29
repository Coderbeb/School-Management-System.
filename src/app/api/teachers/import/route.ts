import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken, hashPassword } from '@/lib/auth';

export async function POST(req: Request) {
    try {
        const token = req.headers.get('authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const { teachers } = body;

        if (!Array.isArray(teachers) || teachers.length === 0) {
            return NextResponse.json({ error: 'No teacher data provided' }, { status: 400 });
        }

        if (teachers.length > 200) {
            return NextResponse.json({ error: 'Maximum 200 teachers per import' }, { status: 400 });
        }

        const results = {
            success: 0,
            failed: 0,
            errors: [] as { row: number; name: string; error: string }[]
        };

        // Cache existing user emails
        const emailsInDb = await query<{ email: string }>(`SELECT email FROM users`);
        const existingEmails = new Set(emailsInDb.map(u => u.email.toLowerCase().trim()));

        // Process each teacher account
        for (let i = 0; i < teachers.length; i++) {
            const rowNum = i + 1;
            const tRecord = teachers[i];

            try {
                let firstName = tRecord.firstName || tRecord.first_name || '';
                let lastName = tRecord.lastName || tRecord.last_name || '';
                if (tRecord.name && !firstName) {
                    const parts = tRecord.name.trim().split(/\s+/);
                    firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0];
                    lastName = parts.length > 1 ? parts[parts.length - 1] : '';
                }

                const email = tRecord.email ? tRecord.email.toLowerCase().trim() : '';
                const phone = tRecord.phone || null;
                const passwordStr = tRecord.password || 'Teacher@1234';

                if (!firstName || !email) {
                    throw new Error('First name and unique email address are required.');
                }

                if (existingEmails.has(email)) {
                    throw new Error(`Email address "${email}" is already registered in the system.`);
                }

                // Hash password
                const passwordHash = hashPassword(passwordStr);

                // Insert into users
                await query(
                    `INSERT INTO users (first_name, last_name, email, phone, password_hash, role, is_active)
                     VALUES ($1, $2, $3, $4, $5, 'teacher', true)`,
                    [firstName, lastName, email, phone, passwordHash]
                );

                existingEmails.add(email);
                results.success++;
            } catch (err: any) {
                results.failed++;
                results.errors.push({
                    row: rowNum,
                    name: `${tRecord.firstName || tRecord.name || 'Unknown'}`,
                    error: err.message || 'Validation error'
                });
            }
        }

        return NextResponse.json(results);
    } catch (error: any) {
        console.error('Import teachers API error:', error);
        return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
    }
}
