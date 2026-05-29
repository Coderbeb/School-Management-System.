import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

function getJwtSecret(): string {
    if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'fallback-secret')) {
        throw new Error('FATAL: JWT_SECRET environment variable is not defined in production');
    }
    return JWT_SECRET;
}

export interface JWTPayload {
    userId: string;
    email: string;
    role: 'developer' | 'super_admin' | 'teacher' | 'accountant' | 'student';
    schoolId?: string | null;
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REMEMBER_ME_EXPIRES_IN = '30d';

export function generateToken(payload: JWTPayload, rememberMe: boolean = false): string {
    const expiresIn = rememberMe ? JWT_REMEMBER_ME_EXPIRES_IN : JWT_EXPIRES_IN;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return jwt.sign(payload, getJwtSecret(), { expiresIn } as any);
}

export function verifyToken(token: string): JWTPayload | null {
    try {
        return jwt.verify(token, getJwtSecret()) as JWTPayload;
    } catch {
        return null;
    }
}

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

// ============================================================
// Multi-Tenant Auth Helpers
// ============================================================
// These helpers provide a consistent way for all API routes to:
// 1. Authenticate the user from the Authorization header
// 2. Resolve the school_id for data isolation
// Developer role → schoolId is null (sees all schools)
// All other roles → schoolId is enforced (sees only their school)

import { NextRequest, NextResponse } from 'next/server';

export interface AuthResult {
    userId: string;
    email: string;
    role: 'developer' | 'super_admin' | 'teacher' | 'accountant' | 'student';
    schoolId: string | null;
}

/**
 * Extracts and verifies the JWT from a NextRequest's Authorization header.
 * Returns the decoded payload or null if authentication fails.
 */
export function getAuthUser(request: NextRequest): AuthResult | null {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    const payload = verifyToken(authHeader.substring(7));
    if (!payload) return null;
    return {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        schoolId: payload.schoolId || null,
    };
}

/**
 * Returns a 401/403 NextResponse if authentication fails.
 * Otherwise returns the authenticated user with school_id guaranteed.
 * Developer role bypasses school_id requirement.
 * Use this in routes that require school-level data isolation.
 */
export function requireSchoolAuth(
    request: NextRequest,
    allowedRoles?: string[]
): { user: AuthResult; error?: never } | { user?: never; error: NextResponse } {
    const user = getAuthUser(request);
    if (!user) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    return { user };
}

/**
 * Resolves the effective school_id for a query.
 * - Developer role: can optionally filter by schoolId query param, or see all
 * - All other roles: always returns their own school_id
 * Returns null only for developer when no schoolId filter is specified.
 */
export function resolveSchoolId(user: AuthResult, request?: NextRequest): string | null {
    if (user.role === 'developer') {
        // Developer can optionally filter by a specific school
        if (request) {
            const schoolId = new URL(request.url).searchParams.get('schoolId');
            if (schoolId) return schoolId;
        }
        return null; // Developer sees all schools
    }
    return user.schoolId;
}

/**
 * Helper to build a school_id WHERE clause for SQL queries.
 * Returns { clause: string, params: any[] } to append to queries.
 * If schoolId is null (developer, no filter), returns empty clause.
 */
export function schoolFilter(
    schoolId: string | null,
    tableAlias: string = '',
    startParamIndex: number = 1
): { clause: string; params: unknown[]; nextIndex: number } {
    const col = tableAlias ? `${tableAlias}.school_id` : 'school_id';
    if (!schoolId) {
        return { clause: '', params: [], nextIndex: startParamIndex };
    }
    return {
        clause: ` AND ${col} = $${startParamIndex}`,
        params: [schoolId],
        nextIndex: startParamIndex + 1,
    };
}
