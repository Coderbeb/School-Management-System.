import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// POST: Assign a subject to a class
export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { classId, subjectId, sessionId, isElective } = await request.json();
        if (!classId || !subjectId || !sessionId) return NextResponse.json({ error: 'classId, subjectId, sessionId are required' }, { status: 400 });

        const record = await queryOne(
            `INSERT INTO class_subjects (class_id, subject_id, session_id, is_elective)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [classId, subjectId, sessionId, isElective || false]
        );
        return NextResponse.json({ record }, { status: 201 });
    } catch (error: any) {
        if (error?.code === '23505') return NextResponse.json({ error: 'Subject already assigned to this class' }, { status: 409 });
        console.error('POST class-subject error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// DELETE: Remove a subject assignment from a class
export async function DELETE(request: NextRequest) {
    try {
        const token = request.headers.get('authorization')?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const payload = verifyToken(token);
        if (!payload || payload.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

        await query('DELETE FROM class_subjects WHERE id = $1', [id]);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('DELETE class-subject error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
