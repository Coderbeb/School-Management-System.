import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId, schoolFilter } from '@/lib/auth';

// GET /api/admissions/registrations — List registrations or registration windows
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const windowSlug = url.searchParams.get('slug');
    const schoolSlug = url.searchParams.get('school');

    // PUBLIC: Get registration window by slug (no auth required)
    if (windowSlug) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const window = await queryOne<any>(
            `SELECT w.*, s.name as school_name, s.logo_url, s.address as school_address,
                    s.city as school_city, s.phone as school_phone,
                    ses.name as session_name
             FROM admission_registration_windows w
             JOIN schools s ON s.id = w.school_id
             LEFT JOIN academic_sessions ses ON ses.id = w.session_id
             WHERE w.slug = $1 AND w.is_active = true`,
            [windowSlug]
        );
        if (!window) return NextResponse.json({ error: 'Registration window not found or closed' }, { status: 404 });

        // Get offered classes
        const classes = await query(
            `SELECT id, name, display_order FROM classes
             WHERE id = ANY($1::uuid[]) AND is_active = true
             ORDER BY display_order`,
            [window.classes_offered || []]
        );

        // Count current registrations
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const countResult = await queryOne<any>(
            `SELECT COUNT(*) as total FROM admission_registrations WHERE window_id = $1`,
            [window.id]
        );

        return NextResponse.json({
            window: {
                ...window,
                registration_count: parseInt(countResult?.total || '0'),
            },
            classes
        });
    }

    // ADMIN: List registrations (auth required)
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const windowId = url.searchParams.get('windowId');
    const classId = url.searchParams.get('classId');
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');
    const listType = url.searchParams.get('list'); // 'windows' to list registration windows

    // List registration windows
    if (listType === 'windows') {
        const sf = schoolFilter(schoolId, 'w', 1);
        const windows = await query(
            `SELECT w.*, ses.name as session_name,
                    (SELECT COUNT(*) FROM admission_registrations r WHERE r.window_id = w.id) as registration_count,
                    (SELECT COUNT(*) FROM admission_registrations r WHERE r.window_id = w.id AND r.status = 'selected') as selected_count,
                    (SELECT COUNT(*) FROM admission_registrations r WHERE r.window_id = w.id AND r.status = 'admitted') as admitted_count
             FROM admission_registration_windows w
             LEFT JOIN academic_sessions ses ON ses.id = w.session_id
             WHERE 1=1 ${sf.clause}
             ORDER BY w.created_at DESC`,
            sf.params
        );
        return NextResponse.json({ windows });
    }

    // List registrations
    const sf = schoolFilter(schoolId, 'r', 1);
    let paramIdx = sf.nextIndex;
    const params: unknown[] = [...sf.params];
    let clauses = '';

    if (windowId) {
        clauses += ` AND r.window_id = $${paramIdx}`;
        params.push(windowId);
        paramIdx++;
    }
    if (classId) {
        clauses += ` AND r.class_id = $${paramIdx}`;
        params.push(classId);
        paramIdx++;
    }
    if (status) {
        clauses += ` AND r.status = $${paramIdx}`;
        params.push(status);
        paramIdx++;
    }
    if (search) {
        clauses += ` AND (r.student_name ILIKE $${paramIdx} OR r.guardian_phone ILIKE $${paramIdx} OR r.registration_number ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
    }

    const registrations = await query(
        `SELECT r.*, c.name as class_name, ses.name as session_name,
                w.title as window_title
         FROM admission_registrations r
         LEFT JOIN classes c ON c.id = r.class_id
         LEFT JOIN academic_sessions ses ON ses.id = r.session_id
         LEFT JOIN admission_registration_windows w ON w.id = r.window_id
         WHERE 1=1 ${sf.clause} ${clauses}
         ORDER BY r.created_at DESC`,
        params
    );

    // Stats
    const allSf = schoolFilter(schoolId, 'r', 1);
    let statsWindowClause = '';
    const statsParams = [...allSf.params];
    if (windowId) {
        statsWindowClause = ` AND r.window_id = $${allSf.nextIndex}`;
        statsParams.push(windowId);
    }
    const stats = await query(
        `SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE r.status = 'registered') as registered,
            COUNT(*) FILTER (WHERE r.status = 'test_appeared') as test_appeared,
            COUNT(*) FILTER (WHERE r.status = 'selected') as selected,
            COUNT(*) FILTER (WHERE r.status = 'waitlisted') as waitlisted_count,
            COUNT(*) FILTER (WHERE r.status = 'rejected') as rejected,
            COUNT(*) FILTER (WHERE r.status = 'admitted') as admitted
         FROM admission_registrations r
         WHERE 1=1 ${allSf.clause} ${statsWindowClause}`,
        statsParams
    );

    return NextResponse.json({ registrations, stats: stats[0] || {} });
}

// POST /api/admissions/registrations — Public registration OR admin create window
export async function POST(request: NextRequest) {
    const body = await request.json();
    const { action } = body;

    // PUBLIC: Student registration (no auth)
    if (action === 'register') {
        const { windowId, classId, studentName, dateOfBirth, gender,
                previousSchool, previousClass, fatherName, fatherPhone,
                fatherOccupation, motherName, motherPhone, guardianName,
                guardianPhone, guardianEmail, address, city, pincode } = body;

        if (!windowId || !classId || !studentName || !dateOfBirth || !gender || !guardianPhone) {
            return NextResponse.json({ error: 'Required fields: windowId, classId, studentName, dateOfBirth, gender, guardianPhone' }, { status: 400 });
        }

        // Verify window exists and is open
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const window = await queryOne<any>(
            `SELECT * FROM admission_registration_windows WHERE id = $1 AND is_active = true`,
            [windowId]
        );
        if (!window) return NextResponse.json({ error: 'Registration window not found or closed' }, { status: 404 });

        const now = new Date();
        if (new Date(window.open_date) > now) return NextResponse.json({ error: 'Registration has not started yet' }, { status: 400 });
        if (new Date(window.close_date) < now) return NextResponse.json({ error: 'Registration period has ended' }, { status: 400 });

        // Check max registrations
        if (window.max_registrations) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const count = await queryOne<any>(
                `SELECT COUNT(*) as total FROM admission_registrations WHERE window_id = $1`,
                [windowId]
            );
            if (parseInt(count?.total || '0') >= window.max_registrations) {
                return NextResponse.json({ error: 'Maximum registrations reached for this window' }, { status: 400 });
            }
        }

        // Check duplicate (same phone + same window)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = await queryOne<any>(
            `SELECT id FROM admission_registrations WHERE window_id = $1 AND guardian_phone = $2 AND student_name = $3`,
            [windowId, guardianPhone, studentName]
        );
        if (existing) return NextResponse.json({ error: 'A registration with this student name and phone already exists' }, { status: 400 });

        // Generate registration number: REG/2026/0001
        const year = new Date().getFullYear();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lastReg = await queryOne<any>(
            `SELECT registration_number FROM admission_registrations
             WHERE school_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [window.school_id]
        );
        let counter = 1;
        if (lastReg?.registration_number) {
            const parts = lastReg.registration_number.split('/');
            const lastNum = parseInt(parts[parts.length - 1] || '0');
            if (!isNaN(lastNum)) counter = lastNum + 1;
        }
        const registrationNumber = `REG/${year}/${String(counter).padStart(4, '0')}`;

        const result = await query(
            `INSERT INTO admission_registrations (
                school_id, window_id, registration_number, session_id, class_id,
                student_name, date_of_birth, gender, previous_school, previous_class,
                father_name, father_phone, father_occupation,
                mother_name, mother_phone,
                guardian_name, guardian_phone, guardian_email,
                address, city, pincode
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
             RETURNING *`,
            [window.school_id, windowId, registrationNumber, window.session_id, classId,
             studentName, dateOfBirth, gender, previousSchool || null, previousClass || null,
             fatherName || null, fatherPhone || null, fatherOccupation || null,
             motherName || null, motherPhone || null,
             guardianName || null, guardianPhone, guardianEmail || null,
             address || null, city || null, pincode || null]
        );

        return NextResponse.json({
            registration: result[0],
            registrationNumber,
            message: `Registration successful! Your registration number is ${registrationNumber}`
        }, { status: 201 });
    }

    // ADMIN: Create registration window (auth required)
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    if (!schoolId) return NextResponse.json({ error: 'School context required' }, { status: 400 });

    const { title, sessionId, openDate, closeDate, classesOffered,
            registrationFee, maxRegistrations, description } = body;

    if (!title || !sessionId || !openDate || !closeDate) {
        return NextResponse.json({ error: 'title, sessionId, openDate, closeDate are required' }, { status: 400 });
    }

    // Generate slug
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

    const result = await query(
        `INSERT INTO admission_registration_windows (
            school_id, session_id, title, description, open_date, close_date,
            classes_offered, registration_fee, max_registrations, slug, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [schoolId, sessionId, title, description || null, openDate, closeDate,
         classesOffered || [], registrationFee || 0, maxRegistrations || null,
         slug, user.userId]
    );

    return NextResponse.json({ window: result[0], slug }, { status: 201 });
}

// PUT /api/admissions/registrations — Update registration status or window
export async function PUT(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const body = await request.json();
    const { action: updateAction } = body;

    // Update registration status (single or bulk)
    if (updateAction === 'update_status') {
        const { registrationIds, status } = body;
        if (!registrationIds?.length || !status) {
            return NextResponse.json({ error: 'registrationIds and status required' }, { status: 400 });
        }

        const sf = schoolFilter(schoolId, '', 3);
        const updated = await query(
            `UPDATE admission_registrations
             SET status = $1, updated_at = NOW()
             WHERE id = ANY($2::uuid[]) ${sf.clause}
             RETURNING id, student_name, status`,
            [status, registrationIds, ...sf.params]
        );

        return NextResponse.json({ updated, count: updated.length });
    }

    // Update window
    if (updateAction === 'update_window') {
        const { windowId, title, openDate, closeDate, classesOffered, registrationFee,
                maxRegistrations, description, isActive } = body;

        const sf = schoolFilter(schoolId, '', 9);
        const result = await query(
            `UPDATE admission_registration_windows
             SET title = COALESCE($1, title),
                 open_date = COALESCE($2, open_date),
                 close_date = COALESCE($3, close_date),
                 classes_offered = COALESCE($4, classes_offered),
                 registration_fee = COALESCE($5, registration_fee),
                 max_registrations = COALESCE($6, max_registrations),
                 description = COALESCE($7, description),
                 is_active = COALESCE($8, is_active),
                 updated_at = NOW()
             WHERE id = $9 ${sf.clause}
             RETURNING *`,
            [title || null, openDate || null, closeDate || null,
             classesOffered || null, registrationFee ?? null,
             maxRegistrations ?? null, description ?? null,
             isActive ?? null, windowId, ...sf.params]
        );

        return NextResponse.json({ window: result[0] });
    }

    // Save entrance test scores and generate merit list
    if (updateAction === 'save_scores') {
        const { testId, scores } = body;
        // scores: Array<{ registrationId, marksObtained, attendance }>

        if (!testId || !scores?.length) {
            return NextResponse.json({ error: 'testId and scores required' }, { status: 400 });
        }

        for (const score of scores) {
            await query(
                `INSERT INTO admission_test_scores (test_id, registration_id, marks_obtained, attendance, entered_by)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (test_id, registration_id) DO UPDATE
                 SET marks_obtained = $3, attendance = $4, entered_by = $5`,
                [testId, score.registrationId, score.marksObtained ?? null,
                 score.attendance || 'present', user.userId]
            );

            // Update registration score
            if (score.marksObtained !== undefined) {
                await query(
                    `UPDATE admission_registrations
                     SET entrance_score = $1, status = $2, updated_at = NOW()
                     WHERE id = $3`,
                    [score.marksObtained, score.attendance === 'absent' ? 'test_absent' : 'test_appeared',
                     score.registrationId]
                );
            }
        }

        // Generate merit ranks (for those who appeared)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const test = await queryOne<any>(
            `SELECT * FROM admission_entrance_tests WHERE id = $1`,
            [testId]
        );

        if (test) {
            const rankedStudents = await query(
                `SELECT r.id, r.entrance_score
                 FROM admission_registrations r
                 JOIN admission_test_scores ts ON ts.registration_id = r.id AND ts.test_id = $1
                 WHERE r.window_id = $2 AND r.class_id = $3 AND ts.attendance = 'present'
                 ORDER BY r.entrance_score DESC NULLS LAST`,
                [testId, test.window_id, test.class_id]
            ) as { id: string; entrance_score: number }[];

            for (let i = 0; i < rankedStudents.length; i++) {
                await query(
                    `UPDATE admission_registrations SET merit_rank = $1 WHERE id = $2`,
                    [i + 1, rankedStudents[i].id]
                );
            }
        }

        return NextResponse.json({ success: true, message: 'Scores saved and merit list generated' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
