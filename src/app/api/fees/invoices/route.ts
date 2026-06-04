import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/fees/invoices — Fetch invoices
 * POST /api/fees/invoices — Generate invoices (bulk or single student)
 * PUT /api/fees/invoices — Update invoice status (e.g., void, overdue)
 */

// GET: Fetch invoices — V3 with billing calendar + summary stats
export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'student', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const classSectionId = searchParams.get('classSectionId');
    const status = searchParams.get('status');
    const sessionId = searchParams.get('sessionId');
    const includeCalendar = searchParams.get('include') === 'calendar';

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
            LEFT JOIN sections sec ON cs.section_id = sec.id
            WHERE 1=1
        `;
        const params: unknown[] = [];
        let idx = 1;

        if (schoolId) { sql += ` AND inv.school_id = $${idx++}`; params.push(schoolId); }
        if (studentId) { sql += ` AND inv.student_id = $${idx++}`; params.push(studentId); }
        if (classSectionId) { sql += ` AND (cs.id = $${idx} OR cs.class_id = $${idx})`; params.push(classSectionId); idx++; }
        if (status) {
            if (status === 'unpaid') {
                sql += ` AND inv.status IN ('unpaid', 'partially_paid', 'overdue')`;
            } else {
                sql += ` AND inv.status = $${idx++}`;
                params.push(status);
            }
        }
        if (sessionId) { sql += ` AND inv.session_id = $${idx++}`; params.push(sessionId); }

        sql += ` ORDER BY inv.due_date DESC, inv.created_at DESC`;
        const invoices = await query<any>(sql, params);

        // Bulk fetch ALL invoice items in ONE query instead of N+1
        if (invoices.length > 0) {
            const invoiceIds = invoices.map(inv => inv.id);
            const allItems = await query<any>(
                `SELECT ii.*, fh.name as head_name, fh.category as head_category
                 FROM invoice_items ii
                 LEFT JOIN fee_heads fh ON ii.fee_head_id = fh.id
                 WHERE ii.invoice_id = ANY($1::uuid[])`,
                [invoiceIds]
            );
            // Map items to invoices
            const itemsByInvoice = new Map<string, any[]>();
            for (const item of allItems) {
                if (!itemsByInvoice.has(item.invoice_id)) itemsByInvoice.set(item.invoice_id, []);
                itemsByInvoice.get(item.invoice_id)!.push(item);
            }
            for (const inv of invoices) {
                inv.items = itemsByInvoice.get(inv.id) || [];
            }
        }

        // Build response
        const result: any = { invoices };

        // Summary stats (for session-level queries)
        if (sessionId && schoolId) {
            const statsResult = await query<any>(
                `SELECT 
                    COUNT(*) as total_invoices,
                    COALESCE(SUM(total_amount), 0) as total_generated,
                    COALESCE(SUM(paid_amount), 0) as total_collected,
                    COALESCE(SUM(total_amount - paid_amount) FILTER (WHERE status IN ('unpaid', 'partially_paid')), 0) as total_pending,
                    COALESCE(SUM(total_amount - paid_amount) FILTER (WHERE status = 'overdue' OR (due_date < CURRENT_DATE AND status IN ('unpaid', 'partially_paid'))), 0) as total_overdue,
                    COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
                    COUNT(*) FILTER (WHERE status IN ('unpaid', 'partially_paid')) as unpaid_count,
                    COUNT(*) FILTER (WHERE status = 'overdue' OR (due_date < CURRENT_DATE AND status IN ('unpaid', 'partially_paid'))) as overdue_count
                 FROM invoices
                 WHERE school_id = $1 AND session_id = $2 AND status != 'void'`,
                [schoolId, sessionId]
            );
            result.summary = statsResult[0] || {};
        }

        // Billing calendar (per-month breakdown)
        if (includeCalendar && sessionId && schoolId) {
            const calendar = await query<any>(
                `SELECT 
                    billing_month,
                    COUNT(*) as invoice_count,
                    COALESCE(SUM(total_amount), 0) as total_amount,
                    COALESCE(SUM(paid_amount), 0) as paid_amount,
                    COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
                    COUNT(*) FILTER (WHERE status IN ('unpaid', 'partially_paid', 'overdue')) as unpaid_count
                 FROM invoices
                 WHERE school_id = $1 AND session_id = $2 AND status != 'void'
                   AND billing_month IS NOT NULL
                 GROUP BY billing_month
                 ORDER BY billing_month ASC`,
                [schoolId, sessionId]
            );
            result.billingCalendar = calendar;
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('Error fetching invoices:', error);
        return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
    }
}

// POST: Generate invoices (bulk or single student) — V3 frequency-aware
export async function POST(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        const { sessionId, classId, studentId, dueDate, billingMonth, feeGroupId } = await request.json();

        if (!sessionId || !dueDate) {
            return NextResponse.json({ error: 'sessionId and dueDate are required' }, { status: 400 });
        }

        // Derive billingMonth from dueDate if not provided (e.g. '2026-06')
        const effectiveBillingMonth = billingMonth || dueDate.substring(0, 7);

        // Helper: determine which month index within the session this billing month is
        // (used for quarterly/half-yearly/yearly frequency logic)
        const session = await queryOne<any>(
            `SELECT * FROM academic_sessions WHERE id = $1`, [sessionId]
        );
        const sessionStart = session?.start_date ? new Date(session.start_date) : new Date(`${effectiveBillingMonth}-01`);
        const billingDate = new Date(`${effectiveBillingMonth}-01`);
        const monthsFromStart = (billingDate.getFullYear() - sessionStart.getFullYear()) * 12
            + (billingDate.getMonth() - sessionStart.getMonth());
        const monthIndex = Math.max(0, monthsFromStart); // 0-based month within session

        // Helper: check if a fee item should be included for this billing month
        const shouldIncludeByFrequency = (frequency: string): boolean => {
            switch (frequency) {
                case 'monthly': return true;
                case 'quarterly': return monthIndex % 3 === 0;
                case 'half_yearly': return monthIndex % 6 === 0;
                case 'yearly': return monthIndex === 0;
                case 'one_time': return true; // handled separately via already-billed check
                default: return true;
            }
        };

        // 1. Resolve list of students to process
        let studentsSql = `
            SELECT DISTINCT s.id as student_id, s.first_name, s.last_name
            FROM students s
            JOIN student_enrollments se ON se.student_id = s.id AND se.session_id = $1 AND se.status = 'active'
            JOIN class_sections cs ON se.class_section_id = cs.id
        `;
        const studentsParams: unknown[] = [sessionId, schoolId];
        let idx = 3;

        if (feeGroupId) {
            studentsSql += ` JOIN student_fee_groups sfg ON sfg.student_id = s.id AND sfg.session_id = $1 AND sfg.fee_group_id = $${idx++}`;
            studentsParams.push(feeGroupId);
        }

        studentsSql += ` WHERE s.school_id = $2`;

        if (studentId) {
            studentsSql += ` AND s.id = $${idx++}`;
            studentsParams.push(studentId);
        } else if (classId) {
            studentsSql += ` AND cs.class_id = $${idx++}`;
            studentsParams.push(classId);
        }

        const students = await query<any>(studentsSql, studentsParams);

        if (students.length === 0) {
            return NextResponse.json({ message: 'No students found matching the filters.', count: 0, skipped: 0 }, { status: 200 });
        }

        let generatedCount = 0;
        let skippedCount = 0;

        // 2. Loop through each student
        for (const student of students) {

            // ── Duplicate prevention: check if a regular invoice already exists for this billing month ──
            if (effectiveBillingMonth) {
                let existingQuery = `
                    SELECT id FROM invoices
                    WHERE student_id = $1 AND session_id = $2 AND billing_month = $3
                      AND status != 'void' AND billing_type = 'regular'
                `;
                const existingParams: unknown[] = [student.student_id, sessionId, effectiveBillingMonth];

                if (feeGroupId) {
                    existingQuery = `
                        SELECT inv.id FROM invoices inv
                        JOIN invoice_items ii ON ii.invoice_id = inv.id
                        JOIN fee_group_heads fgh ON fgh.fee_head_id = ii.fee_head_id
                        WHERE inv.student_id = $1 AND inv.session_id = $2 AND inv.billing_month = $3
                          AND inv.status != 'void' AND inv.billing_type = 'regular'
                          AND fgh.fee_group_id = $4
                        LIMIT 1
                    `;
                    existingParams.push(feeGroupId);
                }

                const existing = await queryOne<any>(existingQuery, existingParams);
                if (existing) {
                    skippedCount++;
                    continue; // Already has an invoice containing this group/month
                }
            }

            // Find fee groups assigned to the student
            let groupHeadsSql = `
                 SELECT fgh.*, fh.id as fee_head_id, fh.name as head_name,
                        fh.category as head_category, fh.is_taxable, fh.tax_rate,
                        fgh.frequency
                 FROM student_fee_groups sfg
                 JOIN fee_groups fg ON sfg.fee_group_id = fg.id
                 JOIN fee_group_heads fgh ON fg.id = fgh.fee_group_id
                 JOIN fee_heads fh ON fgh.fee_head_id = fh.id
                 WHERE sfg.student_id = $1 AND sfg.session_id = $2
            `;
            const groupHeadsParams: unknown[] = [student.student_id, sessionId];
            if (feeGroupId) {
                groupHeadsSql += ` AND fg.id = $3`;
                groupHeadsParams.push(feeGroupId);
            }

            const groupHeads = await query<any>(groupHeadsSql, groupHeadsParams);

            if (groupHeads.length === 0) {
                skippedCount++;
                continue;
            }

            // ── Filter items by frequency ──
            const applicableItems: any[] = [];
            for (const gh of groupHeads) {
                const freq = gh.frequency || 'monthly';

                // Check frequency applicability for this billing month
                if (!shouldIncludeByFrequency(freq)) continue;

                // For one_time items, check if already billed in any previous invoice for this session
                if (freq === 'one_time') {
                    const alreadyBilled = await queryOne<any>(
                        `SELECT ii.id FROM invoice_items ii
                         JOIN invoices inv ON ii.invoice_id = inv.id
                         WHERE inv.student_id = $1 AND inv.session_id = $2
                           AND ii.fee_head_id = $3 AND inv.status != 'void'`,
                        [student.student_id, sessionId, gh.fee_head_id]
                    );
                    if (alreadyBilled) continue; // Already billed this one-time item
                }

                applicableItems.push(gh);
            }

            if (applicableItems.length === 0) {
                skippedCount++;
                continue; // No items due for this billing period
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
            for (const gh of applicableItems) {
                const amount = parseFloat(gh.amount || '0');
                let discount = 0;
                let tax = 0;

                // Find matching concession:
                // 1. First look for concession targeting this specific fee_head_id
                // 2. Then fall back to general concession (fee_head_id IS NULL)
                const matchingConcession = concessions.find(
                    (c: any) => c.fee_head_id === gh.fee_head_id
                ) || concessions.find(
                    (c: any) => !c.fee_head_id
                );

                if (matchingConcession) {
                    if (matchingConcession.concession_type === 'percentage') {
                        discount = amount * (parseFloat(matchingConcession.value) / 100);
                    } else if (matchingConcession.concession_type === 'fixed_amount') {
                        discount = Math.min(amount, parseFloat(matchingConcession.value));
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

            // Insert invoice record with billing_month and billing_type
            const invoice = await queryOne<any>(
                `INSERT INTO invoices (school_id, student_id, session_id, invoice_number, due_date,
                    billing_month, billing_type, subtotal, tax_amount, discount_amount, total_amount, status)
                 VALUES ($1, $2, $3, $4, $5, $6, 'regular', $7, $8, $9, $10, 'unpaid') RETURNING id`,
                [
                    schoolId, student.student_id, sessionId, invoiceNumber, dueDate,
                    effectiveBillingMonth, subtotal, taxAmount, discountAmount, totalAmount
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

        return NextResponse.json({
            message: `Generated ${generatedCount} invoices. ${skippedCount > 0 ? `Skipped ${skippedCount} (already billed or no items due).` : ''}`,
            count: generatedCount,
            skipped: skippedCount
        });
    } catch (error) {
        console.error('Error generating invoices:', error);
        return NextResponse.json({ error: 'Failed to generate invoices' }, { status: 500 });
    }
}

// PUT: Update invoice details (e.g. status)
export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
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
    const auth = requireSchoolAuth(request, ['super_admin', 'accountant', 'developer']);
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
