import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, pool } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

interface AttendanceInput {
    studentId: string;
    subjectId?: string;
    status: 'present' | 'absent' | 'late' | 'excused';
    date?: string;
}

// POST - Save attendance records (per-period)
export async function POST(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'teacher']);
        if (auth.error) return auth.error;
        const { role, userId } = auth.user;
        const schoolId = resolveSchoolId(auth.user, request);

        const { records, subjectId, date, lectureNumber = 1, sessionLectureNumber, topic, classSectionId, sessionId } = await request.json() as {
            records: AttendanceInput[];
            subjectId?: string;
            date?: string;
            lectureNumber?: number;
            sessionLectureNumber?: number | null;
            topic?: string;
            classSectionId?: string;
            sessionId?: string;
        };

        if (!records || records.length === 0) {
            return NextResponse.json({ error: 'No attendance records provided' }, { status: 400 });
        }

        const firstRecord = records[0];
        const batchSubjectId = subjectId || firstRecord.subjectId || null;
        const batchDate = date || firstRecord.date;

        if (!batchDate) {
            return NextResponse.json({ error: 'Date is required' }, { status: 400 });
        }

        // 1. Prevent Future Dates
        const now = new Date();
        const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        const todayStr = istTime.toISOString().split('T')[0];

        if (batchDate > todayStr) {
            return NextResponse.json({ error: `Cannot mark attendance for future date: ${batchDate}` }, { status: 400 });
        }

        // 1b. Holiday constraint: block attendance on Sundays and school holidays
        const batchDateObj = new Date(batchDate + 'T00:00:00+05:30');
        if (batchDateObj.getDay() === 0) {
            return NextResponse.json({ error: 'Cannot mark student attendance on Sundays.' }, { status: 400 });
        }
        if (schoolId) {
            const holidayRecord = await queryOne<{ id: string; name: string }>(
                `SELECT id, name FROM holidays WHERE school_id = $1 AND date = $2`,
                [schoolId, batchDate]
            );
            if (holidayRecord) {
                return NextResponse.json({ error: `Cannot mark student attendance on ${holidayRecord.name}.` }, { status: 400 });
            }
        }

        // 2. Resolve classSectionId and sessionId if not supplied directly
        let finalClassSectionId = classSectionId;
        let finalSessionId = sessionId;

        if (!finalClassSectionId || !finalSessionId) {
            let assignment;
            if (batchSubjectId) {
                assignment = await query<{ class_section_id: string; session_id: string }>(
                    `SELECT class_section_id, session_id FROM teacher_assignments 
                     WHERE teacher_id = $1 AND subject_id = $2 
                     LIMIT 1`,
                    [userId, batchSubjectId]
                );
            } else {
                assignment = await query<{ class_section_id: string; session_id: string }>(
                    `SELECT class_section_id, session_id FROM teacher_assignments 
                     WHERE teacher_id = $1 
                     LIMIT 1`,
                    [userId]
                );
            }
            if (assignment && assignment.length > 0) {
                finalClassSectionId = finalClassSectionId || assignment[0].class_section_id;
                finalSessionId = finalSessionId || assignment[0].session_id;
            }
        }

        if (!finalClassSectionId || !finalSessionId) {
            return NextResponse.json({ error: 'Class section and session are required to record attendance.' }, { status: 400 });
        }

        // 2b. School isolation: verify class-section belongs to this school
        if (schoolId) {
            const csCheck = await query<{ id: string }>(
                `SELECT cs.id FROM class_sections cs
                 JOIN classes c ON cs.class_id = c.id
                 WHERE cs.id = $1 AND c.school_id = $2`,
                [finalClassSectionId, schoolId]
            );
            if (csCheck.length === 0) {
                return NextResponse.json({ error: 'Class section does not belong to your school' }, { status: 403 });
            }
        }

        // 3. Determine Period (Lecture) number for this class-section/subject/date
        let assignedLectureNumber: number;
        if (sessionLectureNumber && sessionLectureNumber > 0) {
            assignedLectureNumber = sessionLectureNumber;
        } else {
            // Check if this teacher already marked attendance for this class_section + subject + date
            let existingLecture;
            if (batchSubjectId) {
                existingLecture = await query<{ period_number: number }>(
                    `SELECT period_number FROM attendance_records 
                     WHERE teacher_id = $1 AND class_section_id = $2 AND subject_id = $3 AND date = $4
                     LIMIT 1`,
                    [userId, finalClassSectionId, batchSubjectId, batchDate]
                );
            } else {
                existingLecture = await query<{ period_number: number }>(
                    `SELECT period_number FROM attendance_records 
                     WHERE teacher_id = $1 AND class_section_id = $2 AND subject_id IS NULL AND date = $3
                     LIMIT 1`,
                    [userId, finalClassSectionId, batchDate]
                );
            }

            if (existingLecture && existingLecture.length > 0) {
                assignedLectureNumber = existingLecture[0].period_number;
            } else {
                // Find next available period_number for this class_section today
                const maxLecture = await query<{ max_lecture: number | null }>(
                    `SELECT COALESCE(MAX(period_number), 0) as max_lecture
                     FROM attendance_records
                     WHERE class_section_id = $1 AND date = $2`,
                    [finalClassSectionId, batchDate]
                );
                assignedLectureNumber = (maxLecture[0]?.max_lecture || 0) + 1;
            }
        }

        // 4. Verify Teacher Assignment (Unless Admin)
        if (role !== 'super_admin') {
            let assignmentCheck;
            if (batchSubjectId) {
                assignmentCheck = await query(
                    `SELECT 1 FROM teacher_assignments 
                     WHERE teacher_id = $1 AND class_section_id = $2 AND subject_id = $3
                     LIMIT 1`,
                    [userId, finalClassSectionId, batchSubjectId]
                );
            } else {
                assignmentCheck = await query(
                    `SELECT 1 FROM teacher_assignments 
                     WHERE teacher_id = $1 AND class_section_id = $2
                     LIMIT 1`,
                    [userId, finalClassSectionId]
                );
            }

            if (!assignmentCheck || assignmentCheck.length === 0) {
                console.warn(`User ${userId} not assigned to class-section ${finalClassSectionId}`);
                return NextResponse.json({ error: 'Not assigned to this class section' }, { status: 403 });
            }
        }

        // Trim topic — store null if empty
        const topicValue = topic?.trim() || null;

        // 5. Upsert each record in a database transaction
        const client = await pool.connect();
        let savedCount = 0;
        try {
            await client.query('BEGIN');
            for (const record of records) {
                if (!record.studentId || !record.status) continue;
                if (batchSubjectId) {
                    await client.query(
                        `INSERT INTO attendance_records
                            (student_id, class_section_id, subject_id, teacher_id, session_id, date, period_number, status, topic)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                         ON CONFLICT (student_id, class_section_id, subject_id, date, period_number)
                         DO UPDATE SET status = EXCLUDED.status, topic = EXCLUDED.topic, recorded_at = CURRENT_TIMESTAMP`,
                        [
                            record.studentId,
                            finalClassSectionId,
                            batchSubjectId,
                            userId,
                            finalSessionId,
                            batchDate,
                            assignedLectureNumber,
                            record.status,
                            topicValue
                        ]
                    );
                } else {
                    await client.query(
                        `INSERT INTO attendance_records
                            (student_id, class_section_id, subject_id, teacher_id, session_id, date, period_number, status, topic)
                         VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8)
                         ON CONFLICT (student_id, class_section_id, date, period_number) WHERE subject_id IS NULL
                         DO UPDATE SET status = EXCLUDED.status, topic = EXCLUDED.topic, recorded_at = CURRENT_TIMESTAMP`,
                        [
                            record.studentId,
                            finalClassSectionId,
                            userId,
                            finalSessionId,
                            batchDate,
                            assignedLectureNumber,
                            record.status,
                            topicValue
                        ]
                    );
                }
                savedCount++;
            }
            await client.query('COMMIT');
        } catch (txError) {
            await client.query('ROLLBACK');
            throw txError;
        } finally {
            client.release();
        }

        return NextResponse.json({
            message: `Saved ${savedCount} attendance records`,
            savedCount: savedCount,
            lectureNumber: assignedLectureNumber,
            semester: 1,
        });
    } catch (error) {
        console.error('Save attendance error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

// GET - Get attendance records for a date and subject/class-section
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const { role, userId } = auth.user;
        const schoolId = resolveSchoolId(auth.user, request);

        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        const subjectId = searchParams.get('subjectId');
        const classSectionId = searchParams.get('classSectionId');
        const lectureNumber = searchParams.get('lectureNumber') || searchParams.get('periodNumber');

        if (!date) {
            return NextResponse.json({ error: 'Date is required' }, { status: 400 });
        }

        let queryStr = `
            SELECT ar.id, ar.student_id, ar.subject_id, ar.teacher_id, ar.date, ar.period_number as lecture_number, ar.status, ar.remarks, ar.topic,
                   se.roll_number, s.first_name, s.last_name,
                   sub.code as subject_code, sub.name as subject_name
            FROM attendance_records ar
            JOIN students s ON ar.student_id = s.id
            LEFT JOIN student_enrollments se ON se.student_id = ar.student_id AND se.class_section_id = ar.class_section_id
            LEFT JOIN subjects sub ON ar.subject_id = sub.id
            WHERE ar.date = $1
        `;
        const params: (string | number)[] = [date];

        // School isolation: filter by school via students table
        if (schoolId) {
            params.push(schoolId);
            queryStr += ` AND s.school_id = $${params.length}`;
        }

        // RBAC: Teachers only see their own records
        if (role === 'teacher') {
            params.push(userId);
            queryStr += ` AND ar.teacher_id = $${params.length}`;
        }

        if (subjectId) {
            params.push(subjectId);
            queryStr += ` AND ar.subject_id = $${params.length}`;
        } else {
            queryStr += ` AND ar.subject_id IS NULL`;
        }

        if (classSectionId) {
            params.push(classSectionId);
            queryStr += ` AND ar.class_section_id = $${params.length}`;
        }

        if (lectureNumber) {
            params.push(parseInt(lectureNumber));
            queryStr += ` AND ar.period_number = $${params.length}`;
        }

        queryStr += ' ORDER BY se.roll_number ASC, s.first_name ASC';

        const records = await query(queryStr, params);
        return NextResponse.json({ records });
    } catch (error) {
        console.error('Get attendance error:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
