import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/fees/invoices — Fetch invoices
 * POST /api/fees/invoices — Generate invoices (bulk or single student)
 * PUT /api/fees/invoices — Update invoice status (e.g., void, overdue)
 */

// GET: Fetch invoices
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'student', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const classSectionId = searchParams.get('classSectionId');
    const status = searchParams.get('status');
    const sessionId = searchParams.get('sessionId');

    try {
        let sql = `
            SELECT inv.*,
                st.first_name || ' ' || st.last_name as student_name,
                st.admission_number,
                c.name as class_name,
                sec.name as section_name
            FROM invoices inv
            JOIN students st ON inv.student_id = st.id
            JOIN student_enrollments se ON se.student_id = st.id AND se.session_id = inv.session_id
            JOIN class_sections cs ON se.class_section_id = cs.id
            JOIN classes c ON cs.class_id = c.id
            JOIN sections sec ON cs.section_id = sec.id
            WHERE 1=1
        `;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) {
            sql += ` AND inv.school_id = $${idx++}`;
            params.push(schoolId);
        }

        if (studentId) {
            sql += ` AND inv.student_id = $${idx++}`;
            params.push(studentId);
        }

        if (classSectionId) {
            sql += ` AND cs.id = $${idx++}`;
            params.push(classSectionId);
        }

        if (status) {
            sql += ` AND inv.status = $${idx++}`;
            params.push(status);
        }

        if (sessionId) {
            sql += ` AND inv.session_id = $${idx++}`;
            params.push(sessionId);
        }

        sql += ` ORDER BY inv.due_date DESC, inv.created_at DESC`;
        const invoices = await query<any>(sql, params);

        // Fetch invoice items for each invoice
        for (const inv of invoices) {
            const itemsSql = `
                SELECT ii.*, fh.name as head_name, fh.category as head_category
                FROM invoice_items ii
                LEFT JOIN fee_heads fh ON ii.fee_head_id = fh.id
                WHERE ii.invoice_id = $1
            `;
            inv.items = await query<any>(itemsSql, [inv.id]);
        }

        return NextResponse.json({ invoices });
    } catch (error) {
        console.error('Error fetching invoices:', error);
        return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }
}

// POST: Generate invoices (bulk or single student)
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { sessionId, classId, studentId, dueDate, billingPeriodStart, billingPeriodEnd } = await request.json();

        if (!sessionId || !dueDate) {
            return NextResponse.json({ error: 'sessionId and dueDate are required' }, { status: 400 });
        }

        // 1. Resolve list of students to process
        let studentsSql = `
            SELECT s.id as student_id, s.first_name, s.last_name
            FROM students s
            JOIN student_enrollments se ON se.student_id = s.id AND se.session_id = $1
            JOIN class_sections cs ON se.class_section_id = cs.id
            WHERE s.school_id = $2
        `;
        const studentsParams: unknown[] = [sessionId, schoolId];

        if (studentId) {
            studentsSql += ` AND s.id = $3`;
            studentsParams.push(studentId);
        } else if (classId) {
            studentsSql += ` AND cs.class_id = $3`;
            studentsParams.push(classId);
        }

        const students = await query<any>(studentsSql, studentsParams);

        if (students.length === 0) {
            return NextResponse.json({ message: 'No students found matching the filters.' }, { status: 200 });
        }

        let generatedCount = 0;

        // 2. Loop through each student to construct invoice
        for (const student of students) {
            // Find fee groups assigned to the student
            const groupsSql = `
                SELECT fgh.*, fh.id as fee_head_id, fh.name as head_name, fh.category as head_category, fh.is_taxable, fh.tax_rate
                FROM student_fee_groups sfg
                JOIN fee_groups fg ON sfg.fee_group_id = fg.id
                JOIN fee_group_heads fgh ON fg.id = fgh.fee_group_id
                JOIN fee_heads fh ON fgh.fee_head_id = fh.id
                WHERE sfg.student_id = $1 AND sfg.session_id = $2
            `;
            const groupHeads = await query<any>(groupsSql, [student.student_id, sessionId]);

            if (groupHeads.length === 0) {
                // No fee assignments for this student, skip
                continue;
            }

            // Check student concessions
            const concessions = await query<any>(
                `SELECT * FROM fee_concessions WHERE student_id = $1 AND is_active = true`,
                [student.student_id]
            );

            // Generate unique invoice number
            const rand = Math.floor(1000 + Math.random() * 9000);
            const ts = Date.now().toString().slice(-6);
            const invoiceNumber = `INV-${ts}-${rand}`;

            // Initialize totals
            let subtotal = 0;
            let taxAmount = 0;
            let discountAmount = 0;

            const itemsToInsert: any[] = [];

            // Calculate per fee head
            for (const gh of groupHeads) {
                const amount = parseFloat(gh.amount || '0');
                let discount = 0;
                let tax = 0;

                // Check for matching concessions (check if concessions are matching by head or general)
                // For simplicity, we check if concession exists. If there's a concession, let's apply it.
                // Normally concessions can apply to tuition or overall. Let's apply it if the concession's value is set.
                // We'll apply it to the Tuition category or generally.
                if (concessions.length > 0) {
                    const conc = concessions[0]; // Apply first active concession
                    if (conc.concession_type === 'percentage') {
                        discount = amount * (parseFloat(conc.value) / 100);
                    } else if (conc.concession_type === 'fixed_amount') {
                        // Apply fixed discount distributed (or just direct up to amount)
                        discount = Math.min(amount, parseFloat(conc.value));
                    }
                }

                if (gh.is_taxable) {
                    tax = (amount - discount) * (parseFloat(gh.tax_rate || '0') / 100);
                }

                const total = amount + tax - discount;

                subtotal += amount;
                taxAmount += tax;
                discountAmount += discount;

                itemsToInsert.push({
                    fee_head_id: gh.fee_head_id,
                    name: gh.head_name,
                    amount,
                    tax_amount: tax,
                    discount_amount: discount,
                    total_amount: total
                });
            }

            const totalAmount = subtotal + taxAmount - discountAmount;

            // Insert invoice record
            const invoice = await queryOne<any>(
                `INSERT INTO invoices (school_id, student_id, session_id, invoice_number, due_date, billing_period_start, billing_period_end, subtotal, tax_amount, discount_amount, total_amount, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'unpaid') RETURNING id`,
                [
                    schoolId, student.student_id, sessionId, invoiceNumber, dueDate,
                    billingPeriodStart || null, billingPeriodEnd || null,
                    subtotal, taxAmount, discountAmount, totalAmount
                ]
            );

            // Insert invoice items
            for (const item of itemsToInsert) {
                await query(
                    `INSERT INTO invoice_items (invoice_id, fee_head_id, name, amount, tax_amount, discount_amount, total_amount)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [invoice.id, item.fee_head_id, item.name, item.amount, item.tax_amount, item.discount_amount, item.total_amount]
                );
            }

            generatedCount++;
        }

        return NextResponse.json({ message: `Successfully generated ${generatedCount} invoices.`, count: generatedCount });
    } catch (error) {
        console.error('Error generating invoices:', error);
        return NextResponse.json({ error: 'Failed to generate invoices' }, { status: 500 });
    }
}

// PUT: Update invoice details (e.g. status)
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { id, status } = await request.json();
        if (!id || !status) {
            return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
        }

        // Verify school ownership if not developer
        if (schoolId) {
            const check = await queryOne<any>(
                `SELECT school_id FROM invoices WHERE id = $1`, [id]
            );
            if (!check || check.school_id !== schoolId) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        const updated = await queryOne<any>(
            `UPDATE invoices SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
            [id, status]
        );

        return NextResponse.json({ invoice: updated });
    } catch (error) {
        console.error('Error updating invoice:', error);
        return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
    }
}

// DELETE: Delete an invoice
export async function DELETE(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        // Verify school ownership if not developer
        if (schoolId) {
            const check = await queryOne<any>(
                `SELECT school_id FROM invoices WHERE id = $1`, [id]
            );
            if (!check || check.school_id !== schoolId) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        // Check if there are any completed payments associated with this invoice via fee_payment_orders
        // Since invoices are linked to payments via orders in the new schema:
        const payments = await queryOne<any>(
            `SELECT count(*) as cnt FROM fee_payment_orders WHERE invoice_id = $1 AND status = 'paid'`,
            [id]
        );
        if (payments && parseInt(payments.cnt) > 0) {
            return NextResponse.json({ error: 'Cannot delete an invoice that has completed payments' }, { status: 400 });
        }

        // Delete items first (if no CASCADE)
        await query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [id]);
        
        // Delete invoice
        await query(`DELETE FROM invoices WHERE id = $1`, [id]);

        return NextResponse.json({ success: true, message: 'Invoice deleted successfully' });
    } catch (error) {
        console.error('Error deleting invoice:', error);
        return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 });
    }
}
