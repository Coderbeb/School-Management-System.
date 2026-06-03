import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * DELETE /api/fees/invoices/bulk — Bulk delete unpaid invoices
 */
export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const sessionId = searchParams.get('sessionId');
        const target = searchParams.get('target'); // 'all' | 'class' | 'student'
        const classId = searchParams.get('classId');
        const studentId = searchParams.get('studentId');

        if (!sessionId || !target) {
            return NextResponse.json({ error: 'sessionId and target are required' }, { status: 400 });
        }

        if (target === 'class' && !classId) {
            return NextResponse.json({ error: 'classId is required for class target' }, { status: 400 });
        }

        if (target === 'student' && !studentId) {
            return NextResponse.json({ error: 'studentId is required for student target' }, { status: 400 });
        }

        // 1. Find all unpaid invoice IDs matching the filters
        let sql = `
            SELECT DISTINCT inv.id 
            FROM invoices inv
            LEFT JOIN student_enrollments se ON se.student_id = inv.student_id AND se.session_id = inv.session_id
            LEFT JOIN class_sections cs ON se.class_section_id = cs.id
            WHERE inv.school_id = $1 
              AND inv.session_id = $2 
              AND inv.status = 'unpaid'
              AND NOT EXISTS (
                  SELECT 1 FROM fee_payment_orders fpo WHERE fpo.invoice_id = inv.id AND fpo.status = 'paid'
              )
        `;
        const params: unknown[] = [schoolId, sessionId];
        let idx = 3;

        if (target === 'class') {
            sql += ` AND cs.class_id = $${idx++}`;
            params.push(classId);
        } else if (target === 'student') {
            sql += ` AND inv.student_id = $${idx++}`;
            params.push(studentId);
        }

        const invoices = await query<{ id: string }>(sql, params);

        if (invoices.length === 0) {
            return NextResponse.json({ success: true, message: 'No matching unpaid invoices found to delete.', count: 0 });
        }

        const invoiceIds = invoices.map(i => i.id);

        // 2. Delete invoice items
        // In PostgreSQL, we can use: DELETE FROM invoice_items WHERE invoice_id = ANY($1)
        await query(
            `DELETE FROM invoice_items WHERE invoice_id = ANY($1)`,
            [invoiceIds]
        );

        // 3. Delete invoices
        await query(
            `DELETE FROM invoices WHERE id = ANY($1)`,
            [invoiceIds]
        );

        return NextResponse.json({
            success: true,
            message: `Successfully deleted ${invoiceIds.length} unpaid invoices.`,
            count: invoiceIds.length
        });
    } catch (error) {
        console.error('Error bulk deleting invoices:', error);
        return NextResponse.json({ error: 'Failed to bulk delete invoices' }, { status: 500 });
    }
}
