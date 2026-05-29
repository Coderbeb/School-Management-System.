import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * GET /api/settings/school-branding
 * Returns the school's branding details (name, logo, colors, address, etc.)
 * Used by Navbar, Report Cards, and Login screens to dynamically brand per-school.
 */
export async function GET(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        if (!schoolId) {
            // Developer with no specific school context
            return NextResponse.json({
                branding: {
                    schoolName: 'SMS Platform',
                    shortName: 'SMS',
                    address: '',
                    city: '',
                    state: '',
                    principalName: '',
                    logoUrl: null,
                    primaryColor: '#1e3a8a',
                    accentColor: '#b45309',
                    navbarTitle: 'SMS',
                    reportCardTagline: '',
                    reportCardFooter: '',
                    boardType: 'custom',
                }
            });
        }

        // Fetch school profile
        const school = await queryOne<any>(
            `SELECT name, short_name, address, city, state, pincode, phone, email, website,
                    board_type, principal_name, logo_url
             FROM schools WHERE id = $1`,
            [schoolId]
        );

        // Fetch school_settings overrides
        const settings = await query<{ key: string; value: string }>(
            `SELECT key, value FROM school_settings WHERE school_id = $1`,
            [schoolId]
        );

        const settingsMap: Record<string, string> = {};
        for (const s of settings) {
            try {
                settingsMap[s.key] = JSON.parse(s.value);
            } catch {
                settingsMap[s.key] = s.value;
            }
        }

        const branding = {
            schoolName: school?.name || settingsMap['school_name'] || 'School',
            shortName: school?.short_name || school?.name?.substring(0, 3)?.toUpperCase() || 'SMS',
            address: school?.address || settingsMap['school_address'] || '',
            city: school?.city || '',
            state: school?.state || '',
            pincode: school?.pincode || '',
            phone: school?.phone || '',
            email: school?.email || '',
            website: school?.website || '',
            principalName: school?.principal_name || settingsMap['principal_name'] || '',
            logoUrl: school?.logo_url || settingsMap['logo_url'] || null,
            primaryColor: settingsMap['primary_color'] || '#1e3a8a',
            accentColor: settingsMap['accent_color'] || '#b45309',
            navbarTitle: settingsMap['navbar_title'] || school?.short_name || school?.name || 'SMS',
            reportCardTagline: settingsMap['report_card_tagline'] || '',
            reportCardFooter: settingsMap['report_card_footer'] || '',
            boardType: school?.board_type || settingsMap['board_type'] || 'custom',
        };

        return NextResponse.json({ branding });
    } catch (error) {
        console.error('Error fetching school branding:', error);
        return NextResponse.json({ error: 'Failed to fetch branding' }, { status: 500 });
    }
}

/**
 * PUT /api/settings/school-branding
 * Updates branding settings for a school. Accessible by super_admin or developer.
 */
export async function PUT(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin', 'developer']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        const body = await request.json();
        const {
            primaryColor, accentColor, navbarTitle,
            reportCardTagline, reportCardFooter, logoUrl
        } = body;

        // Upsert each setting
        const settingsToSave = [
            { key: 'primary_color', value: primaryColor },
            { key: 'accent_color', value: accentColor },
            { key: 'navbar_title', value: navbarTitle },
            { key: 'report_card_tagline', value: reportCardTagline },
            { key: 'report_card_footer', value: reportCardFooter },
            { key: 'logo_url', value: logoUrl },
        ].filter(s => s.value !== undefined && s.value !== null);

        for (const setting of settingsToSave) {
            await query(
                `INSERT INTO school_settings (key, value, school_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (key, school_id) DO UPDATE SET value = $2`,
                [setting.key, JSON.stringify(setting.value), schoolId]
            );
        }

        // Also update logo_url on the schools table if provided
        if (logoUrl !== undefined) {
            await query(`UPDATE schools SET logo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [logoUrl, schoolId]);
        }

        return NextResponse.json({ success: true, message: 'Branding updated successfully' });
    } catch (error) {
        console.error('Error updating school branding:', error);
        return NextResponse.json({ error: 'Failed to update branding' }, { status: 500 });
    }
}
