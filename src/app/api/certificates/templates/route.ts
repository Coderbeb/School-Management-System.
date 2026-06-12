import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId, schoolFilter } from '@/lib/auth';

// GET /api/certificates/templates — List certificate templates
export async function GET(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const sf = schoolFilter(schoolId, 't', 1);

    const templates = await query(
        `SELECT t.*, 
            u.first_name || ' ' || u.last_name as created_by_name,
            (SELECT COUNT(*) FROM issued_certificates ic WHERE ic.template_id = t.id) as issued_count
         FROM certificate_templates t
         LEFT JOIN users u ON u.id = t.created_by
         WHERE 1=1 ${sf.clause}
         ORDER BY t.type, t.name`,
        sf.params
    );

    return NextResponse.json({ templates });
}

// POST /api/certificates/templates — Create a new template
export async function POST(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    if (!schoolId) {
        return NextResponse.json({ error: 'School context required' }, { status: 400 });
    }

    const body = await request.json();
    const { name, type, htmlTemplate, cssStyles, placeholders, isDefault } = body;

    if (!name || !type) {
        return NextResponse.json({ error: 'Name and type are required' }, { status: 400 });
    }

    const defaultHtml = getDefaultTemplate(type);

    const result = await query(
        `INSERT INTO certificate_templates 
            (school_id, name, type, html_template, css_styles, placeholders, is_default, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [schoolId, name, type, htmlTemplate || defaultHtml, cssStyles || '',
         JSON.stringify(placeholders || getDefaultPlaceholders(type)),
         isDefault || false, user.userId]
    );

    return NextResponse.json({ template: result[0] }, { status: 201 });
}

// PUT /api/certificates/templates — Update a template
export async function PUT(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const body = await request.json();
    const { id, name, htmlTemplate, cssStyles, placeholders, isActive } = body;

    if (!id) return NextResponse.json({ error: 'Template ID required' }, { status: 400 });

    const sf = schoolFilter(schoolId, '', 7);
    const result = await query(
        `UPDATE certificate_templates 
         SET name = COALESCE($1, name),
             html_template = COALESCE($2, html_template),
             css_styles = COALESCE($3, css_styles),
             placeholders = COALESCE($4, placeholders),
             is_active = COALESCE($5, is_active),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 ${sf.clause}
         RETURNING *`,
        [name || null, htmlTemplate || null, cssStyles || null,
         placeholders ? JSON.stringify(placeholders) : null,
         isActive !== undefined ? isActive : null, id, ...sf.params]
    );

    if (!result.length) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    return NextResponse.json({ template: result[0] });
}

function getDefaultPlaceholders(type: string): string[] {
    const common = ['{{student_name}}', '{{father_name}}', '{{mother_name}}', '{{class}}', '{{section}}', '{{admission_number}}', '{{date_of_birth}}', '{{address}}', '{{school_name}}', '{{date}}', '{{certificate_number}}'];
    if (type === 'transfer_certificate') {
        return [...common, '{{date_of_admission}}', '{{date_of_leaving}}', '{{reason_for_leaving}}', '{{conduct}}', '{{last_exam_passed}}', '{{subjects_studied}}', '{{fee_concession}}', '{{tc_number}}'];
    }
    if (type === 'bonafide') {
        return [...common, '{{academic_year}}', '{{purpose}}'];
    }
    return common;
}

function getDefaultTemplate(type: string): string {
    if (type === 'transfer_certificate') {
        return `<div style="text-align:center;font-family:serif;padding:40px;border:3px double #333;">
<h2 style="margin:0">{{school_name}}</h2>
<h3 style="margin:5px 0 20px;">TRANSFER CERTIFICATE</h3>
<p style="text-align:left;line-height:2;">
<strong>TC No:</strong> {{certificate_number}}<br/>
<strong>Name of Student:</strong> {{student_name}}<br/>
<strong>Father's Name:</strong> {{father_name}}<br/>
<strong>Mother's Name:</strong> {{mother_name}}<br/>
<strong>Date of Birth:</strong> {{date_of_birth}}<br/>
<strong>Class:</strong> {{class}} - {{section}}<br/>
<strong>Admission No:</strong> {{admission_number}}<br/>
<strong>Date of Admission:</strong> {{date_of_admission}}<br/>
<strong>Date of Leaving:</strong> {{date_of_leaving}}<br/>
<strong>Reason for Leaving:</strong> {{reason_for_leaving}}<br/>
<strong>Conduct:</strong> {{conduct}}<br/>
</p>
<div style="display:flex;justify-content:space-between;margin-top:60px;">
<div>Class Teacher</div><div>Principal</div>
</div>
<p style="margin-top:20px;font-size:12px;">Date: {{date}}</p>
</div>`;
    }
    if (type === 'bonafide') {
        return `<div style="text-align:center;font-family:serif;padding:40px;border:3px double #333;">
<h2 style="margin:0">{{school_name}}</h2>
<h3 style="margin:5px 0 20px;">BONAFIDE CERTIFICATE</h3>
<p style="text-align:left;line-height:2;margin:20px 0;">
This is to certify that <strong>{{student_name}}</strong>, 
son/daughter of <strong>{{father_name}}</strong>, 
is a bonafide student of this school studying in Class <strong>{{class}} - {{section}}</strong> 
during the academic year <strong>{{academic_year}}</strong>.
</p>
<p style="text-align:left;">His/Her date of birth as per our records is <strong>{{date_of_birth}}</strong>.</p>
<p style="text-align:left;margin-top:10px;">This certificate is issued for the purpose of <strong>{{purpose}}</strong>.</p>
<div style="text-align:right;margin-top:60px;">
<div>Principal</div>
<div style="font-size:12px;">{{school_name}}</div>
</div>
<p style="text-align:left;font-size:12px;">Cert No: {{certificate_number}} | Date: {{date}}</p>
</div>`;
    }
    return `<div style="text-align:center;font-family:serif;padding:40px;border:3px double #333;">
<h2>{{school_name}}</h2>
<h3>CERTIFICATE</h3>
<p style="line-height:2;">This is to certify that <strong>{{student_name}}</strong> of Class <strong>{{class}} - {{section}}</strong> is a student of this institution.</p>
<div style="text-align:right;margin-top:60px;">Principal</div>
<p style="font-size:12px;">Date: {{date}} | No: {{certificate_number}}</p>
</div>`;
}
