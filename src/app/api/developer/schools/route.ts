import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { verifyToken, hashPassword } from '@/lib/auth';

function getAuthUser(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    return verifyToken(authHeader.substring(7));
}

// GET: List all schools
export async function GET(request: NextRequest) {
    const user = getAuthUser(request);
    if (!user || user.role !== 'developer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    try {
        const schools = await query(`
            SELECT s.*,
                (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id AND u.is_active = true) as total_users,
                (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id AND st.is_active = true) as total_students,
                (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id AND u.role = 'teacher' AND u.is_active = true) as total_teachers,
                (SELECT COUNT(*) FROM exams e WHERE e.school_id = s.id) as total_exams,
                (SELECT COUNT(*) FROM classes c WHERE c.school_id = s.id AND c.is_active = true) as total_classes
            FROM schools s
            ORDER BY s.created_at DESC
        `);

        return NextResponse.json({ schools });
    } catch (error) {
        console.error('Error listing schools:', error);
        return NextResponse.json({ error: 'Failed to list schools' }, { status: 500 });
    }
}

// POST: Create a new school
export async function POST(request: NextRequest) {
    const user = getAuthUser(request);
    if (!user || user.role !== 'developer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    try {
        const body = await request.json();
        const {
            name, shortName, address, city, state, pincode, phone, email, website,
            boardType, affiliationNumber, principalName, establishedYear,
            subscriptionTier, maxStudents, adminEmail, adminPassword, adminFirstName, adminLastName
        } = body;

        if (!name) return NextResponse.json({ error: 'School name is required' }, { status: 400 });

        // Get template for the board type
        const template = await queryOne<any>(
            `SELECT * FROM school_board_templates WHERE board_type = $1`, [boardType || 'custom']
        );

        // Create the school
        const school = await queryOne<any>(`
            INSERT INTO schools (name, short_name, address, city, state, pincode, phone, email, website,
                board_type, affiliation_number, principal_name, established_year,
                subscription_tier, max_students, grading_scale_id, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *`,
            [name, shortName || null, address || null, city || null, state || null, pincode || null,
             phone || null, email || null, website || null,
             boardType || 'custom', affiliationNumber || null, principalName || null, establishedYear || null,
             subscriptionTier || 'free', maxStudents || 500,
             template?.grading_scale_id || null, user.userId]
        );

        // Create admin account for the school if credentials provided
        let adminUser = null;
        if (adminEmail && adminPassword) {
            const passwordHash = await hashPassword(adminPassword);
            adminUser = await queryOne(`
                INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, school_id)
                VALUES ($1, $2, $3, $4, 'super_admin', true, $5)
                RETURNING id, email, first_name, last_name, role`,
                [adminEmail, passwordHash,
                 adminFirstName || 'School', adminLastName || 'Admin',
                 school.id]
            );
        }

        // Create school_settings defaults
        const defaultSettings = [
            { key: 'school_name', value: JSON.stringify(name) },
            { key: 'school_address', value: JSON.stringify(address || '') },
            { key: 'principal_name', value: JSON.stringify(principalName || '') },
            { key: 'board_type', value: JSON.stringify(boardType || 'custom') },
        ];
        for (const setting of defaultSettings) {
            await query(
                `INSERT INTO school_settings (key, value, school_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                [setting.key, setting.value, school.id]
            );
        }

        // ============================================================
        // Seed default classes, sections, and academic session
        // ============================================================

        // Seed default classes (1 to 12)
        const defaultClasses = [
            'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6',
            'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'
        ];
        for (let i = 0; i < defaultClasses.length; i++) {
            await query(
                `INSERT INTO classes (name, display_order, school_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                [defaultClasses[i], i + 1, school.id]
            );
        }

        // Seed default sections (A, B, C)
        const defaultSections = ['A', 'B', 'C'];
        for (const sec of defaultSections) {
            await query(
                `INSERT INTO sections (name, school_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [sec, school.id]
            );
        }

        // Seed a default academic session (current year)
        const currentYear = new Date().getFullYear();
        const sessionName = `${currentYear}-${currentYear + 1}`;
        await query(
            `INSERT INTO academic_sessions (name, start_date, end_date, is_current, school_id)
             VALUES ($1, $2, $3, true, $4) ON CONFLICT DO NOTHING`,
            [sessionName, `${currentYear}-04-01`, `${currentYear + 1}-03-31`, school.id]
        );

        return NextResponse.json({
            success: true,
            school,
            adminUser,
            template: template ? { boardType: template.board_type, examPattern: template.default_exam_pattern, markComponents: template.default_mark_components } : null,
            seeded: { classes: defaultClasses.length, sections: defaultSections.length, session: sessionName },
        }, { status: 201 });
    } catch (error) {
        console.error('Error creating school:', error);
        return NextResponse.json({ error: 'Failed to create school' }, { status: 500 });
    }
}

// PUT: Update a school
export async function PUT(request: NextRequest) {
    const user = getAuthUser(request);
    if (!user || user.role !== 'developer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    try {
        const body = await request.json();
        const { id, name, shortName, address, city, state, pincode, phone, email, website,
                boardType, affiliationNumber, principalName, isActive, subscriptionTier, maxStudents } = body;

        if (!id) return NextResponse.json({ error: 'School ID required' }, { status: 400 });

        const updated = await queryOne(`
            UPDATE schools SET
                name = COALESCE($2, name), short_name = COALESCE($3, short_name),
                address = COALESCE($4, address), city = COALESCE($5, city),
                state = COALESCE($6, state), pincode = COALESCE($7, pincode),
                phone = COALESCE($8, phone), email = COALESCE($9, email),
                website = COALESCE($10, website), board_type = COALESCE($11, board_type),
                affiliation_number = COALESCE($12, affiliation_number),
                principal_name = COALESCE($13, principal_name),
                is_active = COALESCE($14, is_active),
                subscription_tier = COALESCE($15, subscription_tier),
                max_students = COALESCE($16, max_students),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 RETURNING *`,
            [id, name, shortName, address, city, state, pincode, phone, email, website,
             boardType, affiliationNumber, principalName, isActive, subscriptionTier, maxStudents]
        );

        return NextResponse.json({ success: true, school: updated });
    } catch (error) {
        console.error('Error updating school:', error);
        return NextResponse.json({ error: 'Failed to update school' }, { status: 500 });
    }
}
