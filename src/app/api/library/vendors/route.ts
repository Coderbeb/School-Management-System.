import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const vendors = await query<any>(
            `SELECT * FROM library_vendors WHERE school_id = $1 ORDER BY name ASC`,
            [schoolId]
        );
        return NextResponse.json({ vendors });
    } catch (error) {
        console.error('Error fetching vendors:', error);
        return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { name, contactPerson, email, phone, address } = await request.json();

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Vendor name is required' }, { status: 400 });
        }

        const vendor = await queryOne<any>(
            `INSERT INTO library_vendors (school_id, name, contact_person, email, phone, address)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                schoolId,
                name.trim(),
                contactPerson?.trim() || null,
                email?.trim() || null,
                phone?.trim() || null,
                address?.trim() || null,
            ]
        );

        return NextResponse.json({ vendor }, { status: 201 });
    } catch (error) {
        console.error('Error creating vendor:', error);
        return NextResponse.json({ error: 'Failed to create vendor' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { id, name, contactPerson, email, phone, address } = await request.json();

        if (!id || !name?.trim()) {
            return NextResponse.json({ error: 'ID and vendor name are required' }, { status: 400 });
        }

        const existing = await queryOne<any>(
            `SELECT school_id FROM library_vendors WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        const vendor = await queryOne<any>(
            `UPDATE library_vendors SET
                name = $2, contact_person = $3, email = $4, phone = $5, address = $6, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [
                id,
                name.trim(),
                contactPerson?.trim() || null,
                email?.trim() || null,
                phone?.trim() || null,
                address?.trim() || null,
            ]
        );

        return NextResponse.json({ vendor });
    } catch (error) {
        console.error('Error updating vendor:', error);
        return NextResponse.json({ error: 'Failed to update vendor' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Vendor ID is required' }, { status: 400 });
    }

    try {
        const existing = await queryOne<any>(
            `SELECT school_id FROM library_vendors WHERE id = $1`, [id]
        );
        if (!existing || existing.school_id !== schoolId) {
            return NextResponse.json({ error: 'Forbidden or not found' }, { status: 403 });
        }

        await query(`DELETE FROM library_vendors WHERE id = $1`, [id]);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting vendor:', error);
        if (error.code === '23503') { // Foreign key violation
            return NextResponse.json({ error: 'Cannot delete vendor because books are linked to it.' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to delete vendor' }, { status: 500 });
    }
}
