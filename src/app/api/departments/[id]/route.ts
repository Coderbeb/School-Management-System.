import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

interface DepartmentRow {
    id: string;
    name: string;
    code: string;
    hod_name: string | null;
}

// GET - Get single department
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        const department = await queryOne<DepartmentRow>(
            `SELECT d.id, d.name, d.code,
                    CONCAT(u.first_name, ' ', u.last_name) as hod_name
             FROM departments d
             LEFT JOIN users u ON u.department_id = d.id AND u.role = 'hod'
             WHERE d.id = $1`,
            [id]
        );

        if (!department) {
            return NextResponse.json({ error: 'Department not found' }, { status: 404 });
        }

        return NextResponse.json({ department });
    } catch (error) {
        console.error('Get department error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// PUT - Update department (super_admin only)
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { name, code } = await request.json();

        const departments = await query<DepartmentRow>(
            `UPDATE departments SET name = $1, code = $2, updated_at = NOW()
             WHERE id = $3 RETURNING *, NULL as hod_name`,
            [name, code?.toUpperCase(), id]
        );

        if (departments.length === 0) {
            return NextResponse.json({ error: 'Department not found' }, { status: 404 });
        }

        return NextResponse.json({ department: departments[0] });
    } catch (error) {
        console.error('Update department error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE - Delete department (super_admin only)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const departments = await query<DepartmentRow>(
            'DELETE FROM departments WHERE id = $1 RETURNING *',
            [id]
        );

        if (departments.length === 0) {
            return NextResponse.json({ error: 'Department not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Department deleted' });
    } catch (error) {
        console.error('Delete department error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
