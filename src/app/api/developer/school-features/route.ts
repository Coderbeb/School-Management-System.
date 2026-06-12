import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireSchoolAuth } from '@/lib/auth';

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
    'report_cards'
];

export async function GET(request: NextRequest) {
    // ONLY developer role can access developer API
    const auth = requireSchoolAuth(request, ['developer']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');

    if (!schoolId) {
        return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    try {
        // Fetch current features in DB
        let dbFeatures = await query<any>(
            `SELECT * FROM school_features WHERE school_id = $1`,
            [schoolId]
        );

        const currentKeys = dbFeatures.map(f => f.feature_key);
        const missingKeys = DEFAULT_FEATURES.filter(k => !currentKeys.includes(k));

        // Auto-seed missing features
        if (missingKeys.length > 0) {
            for (const key of missingKeys) {
                await query(
                    `INSERT INTO school_features (school_id, feature_key, is_enabled)
                     VALUES ($1, $2, true)
                     ON CONFLICT DO NOTHING`,
                    [schoolId, key]
                );
            }

            dbFeatures = await query<any>(
                `SELECT * FROM school_features WHERE school_id = $1`,
                [schoolId]
            );
        }

        return NextResponse.json({ features: dbFeatures });
    } catch (error) {
        console.error('Error fetching developer school features:', error);
        return NextResponse.json({ error: 'Failed to fetch features' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const auth = requireSchoolAuth(request, ['developer']);
    if (auth.error) return auth.error;

    try {
        const { schoolId, featureKey, isEnabled, disabledReason } = await request.json();

        if (!schoolId || !featureKey) {
            return NextResponse.json({ error: 'schoolId and featureKey are required' }, { status: 400 });
        }

        const toggled = await queryOne<any>(
            `INSERT INTO school_features (school_id, feature_key, is_enabled, disabled_reason, toggled_by, toggled_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
             ON CONFLICT (school_id, feature_key)
             DO UPDATE SET 
                is_enabled = EXCLUDED.is_enabled,
                disabled_reason = EXCLUDED.disabled_reason,
                toggled_by = EXCLUDED.toggled_by,
                toggled_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [
                schoolId,
                featureKey,
                !!isEnabled,
                disabledReason || null,
                auth.user.userId
            ]
        );

        return NextResponse.json({ feature: toggled });
    } catch (error) {
        console.error('Error toggling school feature:', error);
        return NextResponse.json({ error: 'Failed to toggle feature' }, { status: 500 });
    }
}
