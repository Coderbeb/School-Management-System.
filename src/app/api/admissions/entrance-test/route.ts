import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId, schoolFilter } from '@/lib/auth';

// GET /api/admissions/entrance-test — List tests and scores
export async function GET(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const url = new URL(request.url);
    const windowId = url.searchParams.get('windowId');
    const testId = url.searchParams.get('testId');

    // Get scores for a specific test
    if (testId) {
        const sf = schoolFilter(schoolId, 't', 2);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const test = await queryOne<any>(
            `SELECT t.*, c.name as class_name, w.title as window_title
             FROM admission_entrance_tests t
             LEFT JOIN classes c ON c.id = t.class_id
             LEFT JOIN admission_registration_windows w ON w.id = t.window_id
             WHERE t.id = $1 ${sf.clause}`,
            [testId, ...sf.params]
        );

        if (!test) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

        // Get all registrations for this test's class+window with their scores
        const students = await query(
            `SELECT r.id as registration_id, r.registration_number, r.student_name,
                    r.father_name, r.guardian_phone, r.status, r.entrance_score, r.merit_rank,
                    ts.marks_obtained, ts.attendance, ts.remarks as score_remarks
             FROM admission_registrations r
             LEFT JOIN admission_test_scores ts ON ts.registration_id = r.id AND ts.test_id = $1
             WHERE r.window_id = $2 AND r.class_id = $3
               AND r.status NOT IN ('cancelled', 'rejected')
             ORDER BY r.merit_rank ASC NULLS LAST, r.student_name ASC`,
            [testId, test.window_id, test.class_id]
        );

        return NextResponse.json({ test, students });
    }

    // List all tests
    const sf = schoolFilter(schoolId, 't', 1);
    let paramIdx = sf.nextIndex;
    const params: unknown[] = [...sf.params];
    let clauses = '';

    if (windowId) {
        clauses += ` AND t.window_id = $${paramIdx}`;
        params.push(windowId);
        paramIdx++;
    }

    const tests = await query(
        `SELECT t.*, c.name as class_name, w.title as window_title,
                (SELECT COUNT(*) FROM admission_test_scores ts WHERE ts.test_id = t.id) as score_count,
                (SELECT COUNT(*) FROM admission_test_scores ts WHERE ts.test_id = t.id AND ts.attendance = 'present') as appeared_count
         FROM admission_entrance_tests t
         LEFT JOIN classes c ON c.id = t.class_id
         LEFT JOIN admission_registration_windows w ON w.id = t.window_id
         WHERE 1=1 ${sf.clause} ${clauses}
         ORDER BY t.test_date DESC`,
        params
    );

    return NextResponse.json({ tests });
}

// POST /api/admissions/entrance-test — Create a new test
export async function POST(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    if (!schoolId) return NextResponse.json({ error: 'School context required' }, { status: 400 });

    const body = await request.json();
    const { windowId, classId, testName, testDate, testTime, venue,
            maxMarks, passingMarks, instructions } = body;

    if (!windowId || !classId || !testDate) {
        return NextResponse.json({ error: 'windowId, classId, testDate required' }, { status: 400 });
    }

    const result = await query(
        `INSERT INTO admission_entrance_tests (
            school_id, window_id, class_id, test_name, test_date, test_time,
            venue, max_marks, passing_marks, instructions, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [schoolId, windowId, classId, testName || 'Entrance Test', testDate,
         testTime || null, venue || null, maxMarks || 100, passingMarks || 33,
         instructions || null, user.userId]
    );

    return NextResponse.json({ test: result[0] }, { status: 201 });
}

// PUT /api/admissions/entrance-test — Update test status
export async function PUT(request: NextRequest) {
    const { user, error } = requireSchoolAuth(request, ['developer', 'super_admin']);
    if (error) return error;

    const schoolId = resolveSchoolId(user, request);
    const body = await request.json();
    const { testId, status: testStatus } = body;

    if (!testId) return NextResponse.json({ error: 'testId required' }, { status: 400 });

    const sf = schoolFilter(schoolId, '', 3);
    const result = await query(
        `UPDATE admission_entrance_tests SET status = COALESCE($1, status)
         WHERE id = $2 ${sf.clause} RETURNING *`,
        [testStatus || null, testId, ...sf.params]
    );

    return NextResponse.json({ test: result[0] });
}
