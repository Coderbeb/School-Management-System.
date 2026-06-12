import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId, schoolFilter } from '@/lib/auth';

// GET /api/admissions/applications/[id] — Get single application detail
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin', 'teacher']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const { id } = await params;

    const sf = schoolFilter(schoolId, 'a', 2);

    const application = await query(
        `SELECT a.*,
            c.name as class_name,
            s.name as session_name,
            rv.first_name || ' ' || rv.last_name as reviewed_by_name
         FROM admission_applications a
         LEFT JOIN classes c ON c.id = a.class_id
         LEFT JOIN academic_sessions s ON s.id = a.session_id
         LEFT JOIN users rv ON rv.id = a.reviewed_by
         WHERE a.id = $1 ${sf.clause}`,
        [id, ...sf.params]
    );

    if (!application.length) {
        return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    // Get attached documents
    const documents = await query(
        `SELECT * FROM admission_documents WHERE application_id = $1 ORDER BY uploaded_at`,
        [id]
    );

    // Get linked enquiry if any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = application[0] as any;
    let enquiry = null;
    if (app.enquiry_id) {
        const enquiryResult = await query(
            `SELECT * FROM admission_enquiries WHERE id = $1`,
            [app.enquiry_id]
        );
        enquiry = enquiryResult[0] || null;
    }

    return NextResponse.json({ application: app, documents, enquiry });
}

// PUT /api/admissions/applications/[id] — Update application (status, review, details)
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const { id } = await params;
    const body = await request.json();
    const { status, reviewRemarks } = body;

    if (!status) {
        return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    const validStatuses = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'waitlisted', 'enrolled'];
    if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    const isReview = ['approved', 'rejected', 'waitlisted'].includes(status);

    if (isReview) {
        // $1=status, $2=reviewRemarks, $3=userId, $4=id
        const sf = schoolFilter(schoolId, '', 5);
        const result = await query(
            `UPDATE admission_applications
             SET status = $1,
                 review_remarks = COALESCE($2, review_remarks),
                 reviewed_by = $3,
                 reviewed_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4 ${sf.clause}
             RETURNING *`,
            [status, reviewRemarks || null, user.userId, id, ...sf.params]
        );

        if (!result.length) {
            return NextResponse.json({ error: 'Application not found' }, { status: 404 });
        }
        return NextResponse.json({ application: result[0] });
    } else {
        // $1=status, $2=reviewRemarks, $3=id
        const sf = schoolFilter(schoolId, '', 4);
        const result = await query(
            `UPDATE admission_applications
             SET status = $1,
                 review_remarks = COALESCE($2, review_remarks),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3 ${sf.clause}
             RETURNING *`,
            [status, reviewRemarks || null, id, ...sf.params]
        );

        if (!result.length) {
            return NextResponse.json({ error: 'Application not found' }, { status: 404 });
        }
        return NextResponse.json({ application: result[0] });
    }
}
