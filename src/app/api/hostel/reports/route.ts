import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get('type') || 'occupancy';

    try {
        if (reportType === 'occupancy') {
            // Building-wise occupancy summary
            const buildings = await query<any>(
                `SELECT h.id, h.name, h.type, h.is_active,
                    (SELECT COUNT(*)::integer FROM hostel_rooms hr WHERE hr.hostel_id = h.id) as total_rooms,
                    (SELECT COALESCE(SUM(hr2.capacity), 0)::integer FROM hostel_rooms hr2 WHERE hr2.hostel_id = h.id AND hr2.is_active = true) as total_beds,
                    (
                        SELECT COUNT(*)::integer
                        FROM hostel_allocations ha
                        JOIN hostel_rooms hr3 ON ha.room_id = hr3.id
                        WHERE hr3.hostel_id = h.id AND ha.status = 'active'
                    ) as occupied_beds,
                    (SELECT COUNT(*)::integer FROM hostel_rooms hr4 WHERE hr4.hostel_id = h.id AND hr4.is_active = false) as inactive_rooms
                 FROM hostels h
                 WHERE h.school_id = $1
                 ORDER BY h.name ASC`,
                [schoolId]
            );

            // Overall totals
            const totals = {
                totalBuildings: buildings.length,
                totalRooms: buildings.reduce((s: number, b: any) => s + b.total_rooms, 0),
                totalBeds: buildings.reduce((s: number, b: any) => s + b.total_beds, 0),
                occupiedBeds: buildings.reduce((s: number, b: any) => s + b.occupied_beds, 0),
                vacantBeds: 0,
                occupancyPercent: 0
            };
            totals.vacantBeds = totals.totalBeds - totals.occupiedBeds;
            totals.occupancyPercent = totals.totalBeds > 0 ? Math.round((totals.occupiedBeds / totals.totalBeds) * 100) : 0;

            return NextResponse.json({ reportType: 'occupancy', buildings, totals });
        }

        if (reportType === 'student-list') {
            // Room-wise student list — printable
            const hostelId = searchParams.get('hostelId');

            let sql = `
                SELECT h.name as hostel_name, h.type as hostel_type,
                    hr.room_number, hr.floor, hr.room_type, hr.capacity,
                    ha.bed_number, ha.from_date,
                    s.name as student_name, s.admission_number,
                    c.name as class_name, cs.name as section_name
                 FROM hostel_allocations ha
                 JOIN students s ON ha.student_id = s.id
                 JOIN hostel_rooms hr ON ha.room_id = hr.id
                 JOIN hostels h ON hr.hostel_id = h.id
                 LEFT JOIN student_enrollments se ON se.student_id = s.id AND se.status = 'active'
                 LEFT JOIN class_sections cs ON se.class_section_id = cs.id
                 LEFT JOIN classes c ON cs.class_id = c.id
                 WHERE ha.school_id = $1 AND ha.status = 'active'`;
            const params: unknown[] = [schoolId];
            let idx = 2;

            if (hostelId) {
                sql += ` AND h.id = $${idx++}`;
                params.push(hostelId);
            }

            sql += ` ORDER BY h.name ASC, hr.floor ASC, hr.room_number ASC, ha.bed_number ASC`;
            const students = await query<any>(sql, params);

            return NextResponse.json({ reportType: 'student-list', students });
        }

        if (reportType === 'leave-summary') {
            // Leave request stats
            const stats = await query<any>(
                `SELECT 
                    COUNT(*)::integer as total,
                    COUNT(*) FILTER (WHERE status = 'pending')::integer as pending,
                    COUNT(*) FILTER (WHERE status = 'approved')::integer as approved,
                    COUNT(*) FILTER (WHERE status = 'rejected')::integer as rejected,
                    COUNT(*) FILTER (WHERE leave_type = 'home_visit')::integer as home_visits,
                    COUNT(*) FILTER (WHERE leave_type = 'medical')::integer as medical,
                    COUNT(*) FILTER (WHERE leave_type = 'festival')::integer as festival,
                    COUNT(*) FILTER (WHERE leave_type = 'emergency')::integer as emergency
                 FROM hostel_leave_requests
                 WHERE school_id = $1`,
                [schoolId]
            );

            // Recent pending leaves
            const pendingLeaves = await query<any>(
                `SELECT lr.*, s.name as student_name, s.admission_number
                 FROM hostel_leave_requests lr
                 JOIN students s ON lr.student_id = s.id
                 WHERE lr.school_id = $1 AND lr.status = 'pending'
                 ORDER BY lr.created_at DESC
                 LIMIT 10`,
                [schoolId]
            );

            return NextResponse.json({
                reportType: 'leave-summary',
                stats: stats[0] || {},
                pendingLeaves
            });
        }

        if (reportType === 'complaints-summary') {
            const stats = await query<any>(
                `SELECT 
                    COUNT(*)::integer as total,
                    COUNT(*) FILTER (WHERE status = 'open')::integer as open_count,
                    COUNT(*) FILTER (WHERE status = 'in_progress')::integer as in_progress,
                    COUNT(*) FILTER (WHERE status = 'resolved')::integer as resolved,
                    COUNT(*) FILTER (WHERE status = 'closed')::integer as closed,
                    COUNT(*) FILTER (WHERE priority = 'urgent')::integer as urgent,
                    COUNT(*) FILTER (WHERE priority = 'high')::integer as high_priority
                 FROM hostel_complaints
                 WHERE school_id = $1`,
                [schoolId]
            );

            return NextResponse.json({
                reportType: 'complaints-summary',
                stats: stats[0] || {}
            });
        }

        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    } catch (error) {
        console.error('Error generating report:', error);
        return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
}
