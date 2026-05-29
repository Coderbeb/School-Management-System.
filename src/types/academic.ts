// ============================================================
// School Management System - Academic Types
// ============================================================

// --- Academic Session ---
export interface AcademicSession {
    id: string;
    name: string;               // e.g., "2026-2027"
    startDate: Date;
    endDate: Date;
    isCurrent: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// --- Class (Grade Level) ---
export interface SchoolClass {
    id: string;
    name: string;               // e.g., "Class 10", "LKG"
    displayOrder: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// --- Section ---
export interface Section {
    id: string;
    name: string;               // e.g., "A", "B", "C"
    createdAt: Date;
}

// --- Class-Section (Actual Classroom) ---
export interface ClassSection {
    id: string;
    classId: string;
    sectionId: string;
    sessionId: string;
    roomNumber: string | null;
    capacity: number;
    isActive: boolean;
    createdAt: Date;
    // Joined fields (populated via queries)
    className?: string;
    sectionName?: string;
    sessionName?: string;
    displayName?: string;       // e.g., "Class 10 - A"
}

// --- Subject ---
export interface Subject {
    id: string;
    name: string;
    code: string;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// --- Class-Subject Mapping ---
export interface ClassSubject {
    id: string;
    classId: string;
    subjectId: string;
    sessionId: string;
    isElective: boolean;
    createdAt: Date;
    // Joined fields
    className?: string;
    subjectName?: string;
    subjectCode?: string;
}

// --- Student ---
export interface Student {
    id: string;
    userId: string | null;
    admissionNumber: string | null;
    rollNumber: number | null;
    firstName: string;
    lastName: string;
    dateOfBirth: Date | null;
    gender: 'male' | 'female' | 'other' | null;
    bloodGroup: string | null;
    address: string | null;
    photoUrl: string | null;
    guardianName: string | null;
    guardianRelation: string | null;
    guardianPhone: string | null;
    guardianEmail: string | null;
    guardianPhoneAlt: string | null;
    admissionDate: Date;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// --- Student Enrollment (Student → Classroom per session) ---
export interface StudentEnrollment {
    id: string;
    studentId: string;
    classSectionId: string;
    sessionId: string;
    rollNumber: number | null;
    status: 'active' | 'promoted' | 'transferred' | 'withdrawn';
    enrolledAt: Date;
    // Joined fields
    studentName?: string;
    className?: string;
    sectionName?: string;
}

// --- Teacher Assignment (Teacher → Class-Section + Subject) ---
export interface TeacherAssignment {
    id: string;
    teacherId: string;
    classSectionId: string;
    subjectId: string;
    sessionId: string;
    isClassTeacher: boolean;
    createdAt: Date;
    // Joined fields
    teacherName?: string;
    className?: string;
    sectionName?: string;
    subjectName?: string;
}

// --- Holiday ---
export interface Holiday {
    id: string;
    name: string;
    date: Date;
    description: string | null;
    sessionId: string | null;
    createdAt: Date;
}

// --- Attendance (will be used in Phase 3) ---
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceRecord {
    id: string;
    studentId: string;
    classSectionId: string;
    subjectId: string | null;
    teacherId: string;
    date: Date;
    periodNumber: number;
    status: AttendanceStatus;
    remarks: string | null;
    recordedAt: Date;
}
