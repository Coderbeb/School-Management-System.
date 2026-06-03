import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

/**
 * GET /api/cron/auto-invoices
 * Cron job endpoint to automatically generate invoices for schools
 * that have auto_invoice_enabled = true and auto_invoice_day = today
 */

export async function GET(request: NextRequest) {
    // Basic security for cron (you can configure a secret header in Vercel)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const today = new Date();
        const currentDay = today.getDate(); // 1-31

        // Find all schools that have auto-invoicing enabled for today
        const schoolsToProcess = await query<any>(
            `SELECT id FROM schools WHERE auto_invoice_enabled = true AND auto_invoice_day = $1`,
            [currentDay]
        );

        if (schoolsToProcess.length === 0) {
            return NextResponse.json({ message: 'No schools configured for auto-invoicing today.' });
        }

        let totalGenerated = 0;

        // Process each school
        for (const school of schoolsToProcess) {
            const schoolId = school.id;

            // Get current active session for the school
            const currentSession = await queryOne<any>(
                `SELECT id FROM academic_sessions WHERE school_id = $1 AND is_current = true`,
                [schoolId]
            );

            if (!currentSession) continue; // Skip if no active session
            const sessionId = currentSession.id;

            // Set due date to 15 days from today
            const due = new Date();
            due.setDate(due.getDate() + 15);
            const dueDate = due.toISOString().split('T')[0];

            // 1. Resolve list of students to process (all students in current session)
            const studentsSql = `
                SELECT s.id as student_id
                FROM students s
                JOIN student_enrollments se ON se.student_id = s.id AND se.session_id = $1
                WHERE s.school_id = $2
            `;
            const students = await query<any>(studentsSql, [sessionId, schoolId]);

            if (students.length === 0) continue;

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

                if (groupHeads.length === 0) continue;

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

                    if (concessions.length > 0) {
                        const conc = concessions[0]; // Apply first active concession
                        if (conc.concession_type === 'percentage') {
                            discount = amount * (parseFloat(conc.value) / 100);
                        } else if (conc.concession_type === 'fixed_amount') {
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
                    `INSERT INTO invoices (school_id, student_id, session_id, invoice_number, due_date, subtotal, tax_amount, discount_amount, total_amount, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'unpaid') RETURNING id`,
                    [
                        schoolId, student.student_id, sessionId, invoiceNumber, dueDate,
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

                totalGenerated++;
            }
        }

        return NextResponse.json({ 
            success: true, 
            message: `Auto-invoice job completed. Generated ${totalGenerated} invoices for ${schoolsToProcess.length} schools.` 
        });

    } catch (error: any) {
        console.error('Error in cron auto-invoices:', error);
        return NextResponse.json({ error: 'Failed to process auto-invoices', details: error.message }, { status: 500 });
    }
}
