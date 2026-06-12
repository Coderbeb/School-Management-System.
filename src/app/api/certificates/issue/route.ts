import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId, schoolFilter } from '@/lib/auth';
import { randomBytes } from 'crypto';

function generateVerificationCode(): string {
    return randomBytes(5).toString('hex').toUpperCase(); // 10-char hex code
}

// POST /api/certificates/issue — Issue a certificate to a student
export async function POST(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    if (!schoolId) {
        return NextResponse.json({ error: 'School context required' }, { status: 400 });
    }

    const body = await request.json();
    const { studentId, templateId, data, certificateType } = body;

    if (!studentId || (!templateId && !certificateType)) {
        return NextResponse.json({ error: 'studentId and (templateId or certificateType) are required' }, { status: 400 });
    }

    // If certificateType is provided instead of templateId, find or create the template
    let actualTemplateId = templateId;
    if (!actualTemplateId && certificateType) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let template = await queryOne<any>(
            `SELECT id FROM certificate_templates WHERE school_id = $1 AND type = $2 AND is_active = true LIMIT 1`,
            [schoolId, certificateType]
        );
        if (!template) {
            // Auto-create a default template for this type
            const typeNames: Record<string, string> = {
                transfer_certificate: 'Transfer Certificate',
                bonafide: 'Bonafide Certificate',
                character: 'Character Certificate',
                study: 'Study Certificate',
                conduct: 'Conduct Certificate',
            };
            const result = await query(
                `INSERT INTO certificate_templates (school_id, name, type, html_template, is_default, created_by)
                 VALUES ($1, $2, $3, '', true, $4) RETURNING id`,
                [schoolId, typeNames[certificateType] || 'Certificate', certificateType, user.userId]
            );
            template = result[0];
        }
        actualTemplateId = template.id;
    }

    // Get student data for auto-fill
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const student = await queryOne<any>(
        `SELECT s.*, e.roll_number,
            c.name as class_name, sec.name as section_name,
            ses.name as session_name
         FROM students s
         LEFT JOIN student_enrollments e ON e.student_id = s.id AND e.status = 'active'
         LEFT JOIN class_sections cs ON cs.id = e.class_section_id
         LEFT JOIN classes c ON c.id = cs.class_id
         LEFT JOIN sections sec ON sec.id = cs.section_id
         LEFT JOIN academic_sessions ses ON ses.id = e.session_id
         WHERE s.id = $1 AND s.school_id = $2`,
        [studentId, schoolId]
    );
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    // Get school info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const school = await queryOne<any>(
        `SELECT * FROM schools WHERE id = $1`,
        [schoolId]
    );

    // Get template info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const template = await queryOne<any>(
        `SELECT * FROM certificate_templates WHERE id = $1`,
        [actualTemplateId]
    );

    // Generate certificate number
    const prefix = template?.type === 'transfer_certificate' ? 'TC' : 'CERT';
    const year = new Date().getFullYear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastCert = await queryOne<any>(
        `SELECT certificate_number FROM issued_certificates
         WHERE school_id = $1 ORDER BY issued_at DESC LIMIT 1`,
        [schoolId]
    );
    let counter = 1;
    if (lastCert?.certificate_number) {
        const parts = lastCert.certificate_number.split('/');
        const lastNum = parseInt(parts[parts.length - 1] || '0');
        if (!isNaN(lastNum)) counter = lastNum + 1;
    }
    const certificateNumber = `${prefix}/${year}/${String(counter).padStart(4, '0')}`;
    const verificationCode = generateVerificationCode();

    // Merge auto-fill data
    const mergedData = {
        student_name: student.name,
        father_name: student.guardian_name || '',
        mother_name: '',
        class: student.class_name || '',
        section: student.section_name || '',
        admission_number: student.admission_number || '',
        date_of_birth: student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString('en-IN') : '',
        address: student.address || '',
        school_name: school?.name || '',
        school_address: school?.address || '',
        school_city: school?.city || '',
        school_phone: school?.phone || '',
        school_email: school?.email || '',
        affiliation_number: school?.affiliation_number || '',
        principal_name: school?.principal_name || '',
        board_type: school?.board_type || '',
        date: new Date().toLocaleDateString('en-IN'),
        certificate_number: certificateNumber,
        verification_code: verificationCode,
        academic_year: student.session_name || '',
        admission_date: student.admission_date ? new Date(student.admission_date).toLocaleDateString('en-IN') : '',
        gender: student.gender || '',
        roll_number: student.roll_number || '',
        guardian_phone: student.guardian_phone || '',
        nationality: student.nationality || 'Indian',
        religion: student.religion || '',
        caste_category: student.caste_category || '',
        ...data,
    };

    const result = await query(
        `INSERT INTO issued_certificates (school_id, student_id, template_id, certificate_number, data, issued_by, verification_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [schoolId, studentId, actualTemplateId, certificateNumber, JSON.stringify(mergedData), user.userId, verificationCode]
    );

    // Log to student_history
    await query(
        `INSERT INTO student_history (school_id, student_id, event_type, event_date, session_id, from_class, details, recorded_by)
         VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7)`,
        [schoolId, studentId, 'certificate_issued', student.session_name ? undefined : null,
         student.class_name ? `${student.class_name} - ${student.section_name || ''}` : null,
         JSON.stringify({
             certificate_number: certificateNumber,
             certificate_type: template?.type || certificateType,
             template_name: template?.name || '',
             verification_code: verificationCode,
         }),
         user.userId]
    );

    // If TC is issued, deactivate student
    if (template?.type === 'transfer_certificate') {
        await query(`UPDATE students SET status = 'tc_issued', is_active = false WHERE id = $1`, [studentId]);
        await query(
            `UPDATE student_enrollments SET status = 'tc_issued' WHERE student_id = $1 AND status = 'active'`,
            [studentId]
        );
        // Log TC event to history
        await query(
            `INSERT INTO student_history (school_id, student_id, event_type, event_date, from_class, details, recorded_by)
             VALUES ($1, $2, 'tc_issued', CURRENT_DATE, $3, $4, $5)`,
            [schoolId, studentId,
             student.class_name ? `${student.class_name} - ${student.section_name || ''}` : null,
             JSON.stringify({
                 certificate_number: certificateNumber,
                 reason: data?.reason_for_leaving || '',
                 conduct: data?.conduct || '',
             }),
             user.userId]
        );
    }

    return NextResponse.json({ certificate: result[0], data: mergedData, verificationCode }, { status: 201 });
}

// GET /api/certificates/issue — List issued certificates
export async function GET(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const url = new URL(request.url);
    const studentId = url.searchParams.get('studentId');
    const certType = url.searchParams.get('type');
    const search = url.searchParams.get('search');

    const sf = schoolFilter(schoolId, 'ic', 1);
    let paramIdx = sf.nextIndex;
    const params: unknown[] = [...sf.params];
    let clauses = '';

    if (studentId) {
        clauses += ` AND ic.student_id = $${paramIdx}`;
        params.push(studentId);
        paramIdx++;
    }
    if (certType) {
        clauses += ` AND ct.type = $${paramIdx}`;
        params.push(certType);
        paramIdx++;
    }
    if (search) {
        clauses += ` AND (s.name ILIKE $${paramIdx} OR ic.certificate_number ILIKE $${paramIdx} OR s.admission_number ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
    }

    const certificates = await query(
        `SELECT ic.*,
            s.name as student_name, s.admission_number, s.date_of_birth,
            s.guardian_name, s.guardian_phone, s.photo_url,
            ct.name as template_name, ct.type as template_type,
            u.first_name || ' ' || u.last_name as issued_by_name
         FROM issued_certificates ic
         LEFT JOIN students s ON s.id = ic.student_id
         LEFT JOIN certificate_templates ct ON ct.id = ic.template_id
         LEFT JOIN users u ON u.id = ic.issued_by
         WHERE 1=1 ${sf.clause} ${clauses}
         ORDER BY ic.issued_at DESC`,
        params
    );

    return NextResponse.json({ certificates });
}

// PUT /api/certificates/issue — Revoke a certificate
export async function PUT(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const body = await request.json();
    const { certificateId, action: certAction, reason } = body;

    if (!certificateId) return NextResponse.json({ error: 'certificateId required' }, { status: 400 });

    if (certAction === 'revoke') {
        const sf = schoolFilter(schoolId, '', 4);
        const result = await query(
            `UPDATE issued_certificates
             SET revoked = true, revoked_reason = $1, revoked_at = NOW()
             WHERE id = $2 AND revoked = false ${sf.clause}
             RETURNING *`,
            [reason || 'Revoked by admin', certificateId, ...sf.params]
        );
        if (!result.length) return NextResponse.json({ error: 'Certificate not found or already revoked' }, { status: 404 });
        return NextResponse.json({ certificate: result[0], message: 'Certificate revoked successfully' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
