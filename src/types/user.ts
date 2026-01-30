export type UserRole = 'super_admin' | 'hod' | 'teacher';

export interface User {
    id: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    departmentId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserResponse {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    departmentId: string | null;
}

export interface AuthResponse {
    token: string;
    user: UserResponse;
}

export interface LoginRequest {
    email: string;
    password: string;
}
