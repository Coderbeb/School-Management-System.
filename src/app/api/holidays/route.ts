import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface HolidayRow {
    id: string;
    name: string;
    date: string;
    description: string | null;
}

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        try {
            const holidays = await query<HolidayRow>(
                'SELECT id, name, date, description FROM holidays ORDER BY date ASC'
            );
            return NextResponse.json({ holidays });
        } catch (err) {
            console.error('Holidays query error:', err);
            return NextResponse.json({ holidays: [] });
        }
    } catch (error) {
        console.error('Get holidays error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { name, date, description } = await request.json();

        if (!name || !date) {
            return NextResponse.json({ error: 'Name and date are required' }, { status: 400 });
        }


        const holidays = await query<HolidayRow>(
            `INSERT INTO holidays (name, date, description)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [name, date, description || null]
        );

        return NextResponse.json({ holiday: holidays[0] }, { status: 201 });
    } catch (error) {
        console.error('Create holiday error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
