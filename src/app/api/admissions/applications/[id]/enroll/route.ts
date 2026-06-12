import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

// POST /api/admissions/applications/[id]/enroll — Convert approved application to student
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    if (!schoolId) {
        return NextResponse.json({ error: 'School context required' }, { status: 400 });
    }

    const { id } = await params;
    const body = await request.json();
    const { classSectionId, rollNumber } = body;

    // 1. Get the application
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = await queryOne<any>(
        `SELECT * FROM admission_applications WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
    );

    if (!app) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    if (app.status !== 'approved') {
        return NextResponse.json(
            { error: `Application must be approved before enrollment. Current status: ${app.status}` },
            { status: 400 }
        );
    }

    // 2. Resolve class_section_id — if not provided, find the first available section for the class
    let targetClassSectionId = classSectionId;
    if (!targetClassSectionId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cs = await queryOne<any>(
            `SELECT cs.id FROM class_sections cs
             WHERE cs.class_id = $1 AND cs.session_id = $2 AND cs.is_active = true
             ORDER BY cs.id LIMIT 1`,
            [app.class_id, app.session_id]
        );
        if (!cs) {
            return NextResponse.json(
                { error: 'No active class-section found for this class and session. Please create one first.' },
                { status: 400 }
            );
        }
        targetClassSectionId = cs.id;
    }

    // 3. Generate admission number: SCH/2026/0001
    const year = new Date().getFullYear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastStudent = await queryOne<any>(
        `SELECT admission_number FROM students 
         WHERE school_id = $1 AND admission_number IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
        [schoolId]
    );
    let counter = 1;
    if (lastStudent?.admission_number) {
        const parts = lastStudent.admission_number.split('/');
        const lastNum = parseInt(parts[parts.length - 1] || '0');
        if (!isNaN(lastNum)) counter = lastNum + 1;
    }
    const admissionNumber = `SMS/${year}/${String(counter).padStart(4, '0')}`;

    // 4. Create student record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const student = await queryOne<any>(
        `INSERT INTO students (
            school_id, name, date_of_birth, gender, blood_group, address, photo_url,
            guardian_name, guardian_relation, guardian_phone, guardian_email, guardian_phone_alt,
            admission_number, admission_date, status
         ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_DATE, 'active'
         ) RETURNING *`,
        [
            schoolId, app.student_name, app.date_of_birth, app.gender, app.blood_group,
            [app.address, app.city, app.state, app.pincode].filter(Boolean).join(', '),
            app.photo_url,
            app.guardian_name || app.father_name || app.mother_name,
            app.guardian_relation || 'father',
            app.guardian_phone,
            app.guardian_email || app.father_email || app.mother_email,
            app.father_phone || app.mother_phone,
            admissionNumber
        ]
    );

    if (!student) {
        return NextResponse.json({ error: 'Failed to create student record' }, { status: 500 });
    }

    // 5. Create enrollment in the class-section
    await query(
        `INSERT INTO student_enrollments (student_id, class_section_id, session_id, roll_number, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (student_id, session_id) DO UPDATE 
         SET class_section_id = $2, roll_number = $4, status = 'active'`,
        [student.id, targetClassSectionId, app.session_id, rollNumber || null]
    );

    // 6. Mark application as enrolled
    await query(
        `UPDATE admission_applications 
         SET status = 'enrolled', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [id]
    );

    return NextResponse.json({
        success: true,
        student,
        admissionNumber,
        message: `Student "${app.student_name}" enrolled successfully with admission number ${admissionNumber}`
    }, { status: 201 });
}
