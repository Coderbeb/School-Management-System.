import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

/**
 * PUT /api/settings/school-profile
 * Updates the core school details in the 'schools' table.
 */
export async function PUT(request: NextRequest) {
    try {
        const auth = requireSchoolAuth(request, ['super_admin']);
        if (auth.error) return auth.error;
        const schoolId = resolveSchoolId(auth.user, request);

        if (!schoolId) {
            return NextResponse.json({ error: 'School context required' }, { status: 400 });
        }

        const body = await request.json();
        const {
            name, short_name, address, city, state, pincode, phone, email, website,
            principal_name, logo_url
        } = body;

        if (!name || !short_name) {
            return NextResponse.json({ error: 'School Name and Short Name are required' }, { status: 400 });
        }

        // Update the schools table
        await query(
            `UPDATE schools 
             SET name = $1, short_name = $2, address = $3, city = $4, state = $5, 
                 pincode = $6, phone = $7, email = $8, website = $9, 
                 principal_name = $10, logo_url = COALESCE($11, logo_url), 
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $12`,
            [
                name, short_name, address || null, city || null, state || null, 
                pincode || null, phone || null, email || null, website || null, 
                principal_name || null, logo_url, schoolId
            ]
        );

        // Also sync some values to school_settings for backwards compatibility
        const settingsToSave = [
            { key: 'school_name', value: name },
            { key: 'school_address', value: address },
            { key: 'principal_name', value: principal_name },
        ];
        
        if (logo_url) {
            settingsToSave.push({ key: 'logo_url', value: logo_url });
        }

        for (const setting of settingsToSave) {
            if (setting.value !== undefined) {
                await query(
                    `INSERT INTO school_settings (key, value, school_id)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (key, school_id) DO UPDATE SET value = $2`,
                    [setting.key, JSON.stringify(setting.value), schoolId]
                );
            }
        }

        return NextResponse.json({ success: true, message: 'School profile updated successfully' });
    } catch (error) {
        console.error('Error updating school profile:', error);
        return NextResponse.json({ error: 'Failed to update school profile' }, { status: 500 });
    }
}
