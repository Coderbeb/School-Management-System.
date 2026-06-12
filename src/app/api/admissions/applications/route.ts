import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId, schoolFilter } from '@/lib/auth';

// GET /api/admissions/applications — List all applications
export async function GET(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin', 'teacher']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const sessionId = url.searchParams.get('sessionId');
    const classId = url.searchParams.get('classId');
    const search = url.searchParams.get('search');

    const sf = schoolFilter(schoolId, 'a', 1);
    let paramIdx = sf.nextIndex;
    const params: unknown[] = [...sf.params];

    let statusClause = '';
    if (status) {
        statusClause = ` AND a.status = $${paramIdx}`;
        params.push(status);
        paramIdx++;
    }
    let sessionClause = '';
    if (sessionId) {
        sessionClause = ` AND a.session_id = $${paramIdx}`;
        params.push(sessionId);
        paramIdx++;
    }
    let classClause = '';
    if (classId) {
        classClause = ` AND a.class_id = $${paramIdx}`;
        params.push(classId);
        paramIdx++;
    }
    let searchClause = '';
    if (search) {
        searchClause = ` AND (a.student_name ILIKE $${paramIdx} OR a.guardian_phone ILIKE $${paramIdx} OR a.application_number ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
    }

    const applications = await query(
        `SELECT a.id, a.application_number, a.student_name, a.date_of_birth, a.gender,
            a.guardian_phone, a.guardian_name, a.father_name, a.mother_name,
            a.status, a.submitted_at, a.reviewed_at, a.review_remarks,
            a.previous_school, a.registration_fee_paid, a.photo_url,
            c.name as class_name,
            s.name as session_name,
            rv.first_name || ' ' || rv.last_name as reviewed_by_name,
            (SELECT COUNT(*) FROM admission_documents d WHERE d.application_id = a.id) as doc_count
         FROM admission_applications a
         LEFT JOIN classes c ON c.id = a.class_id
         LEFT JOIN academic_sessions s ON s.id = a.session_id
         LEFT JOIN users rv ON rv.id = a.reviewed_by
         WHERE 1=1 ${sf.clause} ${statusClause} ${sessionClause} ${classClause} ${searchClause}
         ORDER BY a.created_at DESC`,
        params
    );

    // Stats
    const allSf = schoolFilter(schoolId, 'a', 1);
    const stats = await query(
        `SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE a.status = 'submitted') as submitted,
            COUNT(*) FILTER (WHERE a.status = 'under_review') as under_review,
            COUNT(*) FILTER (WHERE a.status = 'approved') as approved,
            COUNT(*) FILTER (WHERE a.status = 'rejected') as rejected,
            COUNT(*) FILTER (WHERE a.status = 'waitlisted') as waitlisted,
            COUNT(*) FILTER (WHERE a.status = 'enrolled') as enrolled
         FROM admission_applications a
         WHERE 1=1 ${allSf.clause}`,
        allSf.params
    );

    return NextResponse.json({ applications, stats: stats[0] || {} });
}

// POST /api/admissions/applications — Create a new application
export async function POST(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin', 'teacher']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    if (!schoolId) {
        return NextResponse.json({ error: 'School context required' }, { status: 400 });
    }

    const body = await request.json();
    const {
        enquiryId, sessionId, classId,
        studentName, dateOfBirth, gender, bloodGroup, nationality, religion,
        casteCategory, aadharNumber, address, city, state, pincode, photoUrl,
        previousSchool, previousClass, previousPercentage, tcNumber,
        fatherName, fatherPhone, fatherEmail, fatherOccupation, fatherIncome,
        motherName, motherPhone, motherEmail, motherOccupation,
        guardianName, guardianRelation, guardianPhone, guardianEmail,
        medicalConditions, allergies, emergencyContactName, emergencyContactPhone,
        customFields, registrationFee
    } = body;

    if (!studentName || !dateOfBirth || !gender || !guardianPhone || !classId || !sessionId) {
        return NextResponse.json(
            { error: 'Student name, DOB, gender, guardian phone, class, and session are required' },
            { status: 400 }
        );
    }

    // Generate application number: ADM/2026/0001
    const counterResult = await queryOne<{ value: string }>(
        `SELECT value FROM school_settings WHERE key = 'admission_auto_number_counter' AND school_id = $1`,
        [schoolId]
    );
    // Fallback to global setting if school-level doesn't exist
    const currentCounter = counterResult ? parseInt(JSON.parse(counterResult.value) || '0') : 0;
    const nextCounter = currentCounter + 1;

    const prefixResult = await queryOne<{ value: string }>(
        `SELECT value FROM school_settings WHERE key = 'admission_auto_number_prefix' AND school_id = $1`,
        [schoolId]
    );
    const prefix = prefixResult ? JSON.parse(prefixResult.value) : 'ADM';
    const year = new Date().getFullYear();
    const applicationNumber = `${prefix}/${year}/${String(nextCounter).padStart(4, '0')}`;

    // Update counter
    await query(
        `INSERT INTO school_settings (key, value, school_id) VALUES ('admission_auto_number_counter', $1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [JSON.stringify(nextCounter), schoolId]
    );

    const result = await query(
        `INSERT INTO admission_applications (
            school_id, enquiry_id, application_number, session_id, class_id,
            student_name, date_of_birth, gender, blood_group, nationality, religion,
            caste_category, aadhar_number, address, city, state, pincode, photo_url,
            previous_school, previous_class, previous_percentage, tc_number,
            father_name, father_phone, father_email, father_occupation, father_income,
            mother_name, mother_phone, mother_email, mother_occupation,
            guardian_name, guardian_relation, guardian_phone, guardian_email,
            medical_conditions, allergies, emergency_contact_name, emergency_contact_phone,
            custom_fields, registration_fee
         ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
            $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,
            $36,$37,$38,$39,$40,$41
         ) RETURNING *`,
        [
            schoolId, enquiryId || null, applicationNumber, sessionId, classId,
            studentName, dateOfBirth, gender, bloodGroup || null, nationality || 'Indian',
            religion || null, casteCategory || null, aadharNumber || null,
            address || null, city || null, state || null, pincode || null, photoUrl || null,
            previousSchool || null, previousClass || null, previousPercentage || null, tcNumber || null,
            fatherName || null, fatherPhone || null, fatherEmail || null, fatherOccupation || null, fatherIncome || null,
            motherName || null, motherPhone || null, motherEmail || null, motherOccupation || null,
            guardianName || null, guardianRelation || null, guardianPhone, guardianEmail || null,
            medicalConditions || null, allergies || null, emergencyContactName || null, emergencyContactPhone || null,
            customFields ? JSON.stringify(customFields) : '{}', registrationFee || 0
        ]
    );

    // If this came from an enquiry, mark it as converted
    if (enquiryId) {
        await query(
            `UPDATE admission_enquiries SET status = 'converted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [enquiryId]
        );
    }

    return NextResponse.json({ application: result[0] }, { status: 201 });
}
