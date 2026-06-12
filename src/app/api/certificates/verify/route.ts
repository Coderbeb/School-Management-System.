import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

// GET /api/certificates/verify?code=XXXX — Public certificate verification
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const certNumber = url.searchParams.get('number');

    if (!code && !certNumber) {
        return NextResponse.json({ error: 'Provide verification code or certificate number' }, { status: 400 });
    }

    let clause = '';
    const params: unknown[] = [];
    if (code) {
        clause = 'ic.verification_code = $1';
        params.push(code);
    } else {
        clause = 'ic.certificate_number = $1';
        params.push(certNumber);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cert = await queryOne<any>(
        `SELECT ic.certificate_number, ic.issued_at, ic.revoked, ic.revoked_reason, ic.revoked_at,
                ic.verification_code,
                ct.name as template_name, ct.type as template_type,
                s.name as student_name, s.admission_number, s.date_of_birth,
                sch.name as school_name, sch.city as school_city,
                u.first_name || ' ' || u.last_name as issued_by_name
         FROM issued_certificates ic
         LEFT JOIN students s ON s.id = ic.student_id
         LEFT JOIN certificate_templates ct ON ct.id = ic.template_id
         LEFT JOIN schools sch ON sch.id = ic.school_id
         LEFT JOIN users u ON u.id = ic.issued_by
         WHERE ${clause}`,
        params
    );

    if (!cert) {
        return NextResponse.json({
            verified: false,
            message: 'No certificate found with this verification code or number'
        });
    }

    if (cert.revoked) {
        return NextResponse.json({
            verified: false,
            message: 'This certificate has been REVOKED',
            revoked_reason: cert.revoked_reason,
            revoked_at: cert.revoked_at,
            certificate: {
                number: cert.certificate_number,
                type: cert.template_name,
                student: cert.student_name,
                school: cert.school_name,
            }
        });
    }

    return NextResponse.json({
        verified: true,
        message: 'Certificate is valid and authentic',
        certificate: {
            number: cert.certificate_number,
            type: cert.template_name,
            templateType: cert.template_type,
            student: cert.student_name,
            admissionNumber: cert.admission_number,
            school: cert.school_name,
            schoolCity: cert.school_city,
            issuedAt: cert.issued_at,
            issuedBy: cert.issued_by_name,
        }
    });
}
