import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['student', 'super_admin', 'accountant', 'teacher']);
    if (auth.error) return auth.error;

    try {
        let studentId: string | null = null;

        if (auth.user.role === 'student') {
            const student = await queryOne<{ id: string }>(
                `SELECT id FROM students WHERE user_id = $1`,
                [auth.user.userId]
            );
            if (!student) {
                return NextResponse.json({ error: 'Student record not found' }, { status: 404 });
            }
            studentId = student.id;
        } else {
            const { searchParams } = new URL(request.url);
            studentId = searchParams.get('studentId');
            if (!studentId) {
                return NextResponse.json({ error: 'studentId query parameter is required' }, { status: 400 });
            }
        }

        const student = await queryOne<any>(
            `SELECT s.id, s.first_name, s.last_name, s.admission_number, s.school_id,
                se.class_section_id, cs.class_id
            FROM students s
            JOIN student_enrollments se ON s.id = se.student_id
            JOIN class_sections cs ON se.class_section_id = cs.id
            WHERE s.id = $1 AND se.status = 'active'
            LIMIT 1`,
            [studentId]
        );

        if (!student) {
            return NextResponse.json({ error: 'Student or active enrollment not found' }, { status: 404 });
        }

        const feeStructures = await query<any>(
            `SELECT * FROM fee_structures
            WHERE (class_id = $1 OR class_id IS NULL)
                AND school_id = $2
                AND is_active = true
            ORDER BY due_date ASC`,
            [student.class_id, student.school_id]
        );

        const payments = await query<any>(
            `SELECT * FROM fee_payments
            WHERE student_id = $1
            ORDER BY payment_date DESC`,
            [studentId]
        );

        // Fetch concessions for this student
        const concessions = await query<any>(
            `SELECT * FROM fee_concessions WHERE student_id = $1 AND is_active = true`,
            [studentId]
        );

        // Fetch school config for feature flags
        const schoolConfig = await queryOne<any>(
            `SELECT late_fee_enabled, concession_enabled FROM schools WHERE id = $1`,
            [student.school_id]
        );

        const today = new Date().toISOString().split('T')[0];

        const structuresWithSummary = feeStructures.map((fs: any) => {
            const structurePayments = payments.filter(
                (p: any) => p.fee_structure_id === fs.id && p.payment_status === 'completed'
            );
            const totalPaid = structurePayments.reduce(
                (sum: number, p: any) => sum + parseFloat(p.amount_paid || '0'), 0
            );
            let feeAmount = parseFloat(fs.amount || '0');

            // Concession calculation
            let concessionInfo = null;
            let concessionDiscount = 0;
            if (schoolConfig?.concession_enabled) {
                // Find concession for this specific fee structure, or a blanket concession (null fee_structure_id)
                const applicableConcession = concessions.find(
                    (c: any) => c.fee_structure_id === fs.id || c.fee_structure_id === null
                );
                if (applicableConcession) {
                    if (applicableConcession.concession_type === 'percentage') {
                        concessionDiscount = feeAmount * (parseFloat(applicableConcession.value) / 100);
                    } else {
                        concessionDiscount = parseFloat(applicableConcession.value);
                    }
                    concessionDiscount = Math.min(concessionDiscount, feeAmount);
                    feeAmount = feeAmount - concessionDiscount;
                    concessionInfo = {
                        id: applicableConcession.id,
                        type: applicableConcession.concession_type,
                        value: parseFloat(applicableConcession.value),
                        discount: concessionDiscount,
                        reason: applicableConcession.reason,
                    };
                }
            }

            // Late fee calculation
            let lateFeeInfo = null;
            let lateFeeAmount = 0;
            if (schoolConfig?.late_fee_enabled && fs.late_fee_enabled && parseFloat(fs.late_fee_per_day || '0') > 0) {
                const dueDate = fs.due_date;
                const gracePeriod = parseInt(fs.grace_period_days || '0');
                if (dueDate) {
                    const dueDateTime = new Date(dueDate);
                    dueDateTime.setDate(dueDateTime.getDate() + gracePeriod);
                    const graceDateStr = dueDateTime.toISOString().split('T')[0];
                    if (today > graceDateStr) {
                        const todayDate = new Date(today);
                        const graceDate = new Date(graceDateStr);
                        const daysLate = Math.floor((todayDate.getTime() - graceDate.getTime()) / (1000 * 60 * 60 * 24));
                        lateFeeAmount = daysLate * parseFloat(fs.late_fee_per_day);
                        lateFeeInfo = {
                            daysLate,
                            perDayCharge: parseFloat(fs.late_fee_per_day),
                            totalLateFee: lateFeeAmount,
                            gracePeriodDays: gracePeriod,
                        };
                    }
                }
            }

            const effectiveAmount = feeAmount + lateFeeAmount;
            const remaining = Math.max(0, effectiveAmount - totalPaid);
            const isOverdue = fs.due_date && fs.due_date < today && remaining > 0;

            return {
                ...fs,
                originalAmount: parseFloat(fs.amount || '0'),
                feeAmount: effectiveAmount,
                totalPaid,
                remaining,
                isOverdue,
                concession: concessionInfo,
                lateFee: lateFeeInfo,
            };
        });

        const invoices = await query<any>(
            `SELECT * FROM invoices WHERE student_id = $1 ORDER BY due_date DESC`,
            [studentId]
        );

        for (const inv of invoices) {
            inv.items = await query<any>(
                `SELECT ii.*, fh.name as head_name, fh.category as head_category
                 FROM invoice_items ii
                 LEFT JOIN fee_heads fh ON ii.fee_head_id = fh.id
                 WHERE ii.invoice_id = $1`,
                [inv.id]
            );
        }

        const pgConfig = await queryOne<any>(
            `SELECT is_active FROM payment_gateway_config WHERE school_id = $1 AND gateway_type = 'razorpay'`,
            [student.school_id]
        );
        const onlinePaymentsEnabled = !!pgConfig?.is_active;

        return NextResponse.json({
            student,
            feeStructures: structuresWithSummary,
            payments,
            invoices,
            onlinePaymentsEnabled,
            schoolConfig: {
                lateFeeEnabled: !!schoolConfig?.late_fee_enabled,
                concessionEnabled: !!schoolConfig?.concession_enabled,
            },
        });
    } catch (error) {
        console.error('Error fetching student fee summary:', error);
        return NextResponse.json({ error: 'Failed to fetch student fee summary' }, { status: 500 });
    }
}

