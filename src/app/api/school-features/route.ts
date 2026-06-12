import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSchoolAuth, resolveSchoolId } from '@/lib/auth';

const DEFAULT_FEATURES = [
    'admissions',
    'transport',
    'timetable',
    'certificates',
    'hr_salary',
    'hostel',
    'finance',
    'exams',
    'attendance',
    'report_cards',
    'library'
];

export async function GET(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['super_admin', 'developer', 'accountant', 'teacher']);
    if (auth.error) return auth.error;
    const schoolId = resolveSchoolId(auth.user, request);

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        // Fetch current features in DB
        let dbFeatures = await query<any>(
            `SELECT feature_key, is_enabled FROM school_features WHERE school_id = $1`,
            [schoolId]
        );

        // Auto-seed if empty
        if (dbFeatures.length === 0) {
            for (const key of DEFAULT_FEATURES) {
                await query(
                    `INSERT INTO school_features (school_id, feature_key, is_enabled)
                     VALUES ($1, $2, true)
                     ON CONFLICT DO NOTHING`,
                    [schoolId, key]
                );
            }

            dbFeatures = await query<any>(
                `SELECT feature_key, is_enabled FROM school_features WHERE school_id = $1`,
                [schoolId]
            );
        }

        // Map list to dynamic config object: { [key]: boolean }
        const featureMap: Record<string, boolean> = {};
        DEFAULT_FEATURES.forEach(key => {
            const dbMatch = dbFeatures.find(f => f.feature_key === key);
            featureMap[key] = dbMatch ? dbMatch.is_enabled : true;
        });

        return NextResponse.json({ features: featureMap });
    } catch (error) {
        console.error('Error fetching tenant school features:', error);
        return NextResponse.json({ error: 'Failed to fetch features' }, { status: 500 });
    }
}
