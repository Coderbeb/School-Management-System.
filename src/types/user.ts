// ============================================================
// User & Auth Types
// ============================================================

export type UserRole = 'super_admin' | 'teacher' | 'accountant' | 'student';

export interface User {
    id: string;
    email: string | null;
    phone: string | null;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserResponse {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string;
    lastName: string;
    role: UserRole;
}

export interface AuthResponse {
    token: string;
    user: UserResponse;
}

export interface LoginRequest {
    email: string;
    password: string;
}
