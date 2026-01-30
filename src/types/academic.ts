export interface Department {
    id: string;
    name: string;
    code: string;
    hod_name?: string;
    createdAt: Date;
    updatedAt: Date;
}

export type ProgramType = 'regular' | 'vocational' | 'postgraduate';

export interface Program {
    id: string;
    name: string;
    code: string;
    departmentId: string;
    programType: ProgramType;
    durationYears: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface Section {
    id: string;
    name: string;
    programId: string;
    semester?: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface Student {
    id: string;
    rollNumber: string;
    smartCardId: string | null;
    firstName: string;
    lastName: string;
    email: string | null;
    programId: string;
    sectionId: string | null;
    currentSemester: number;
    batchYear: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

// Regular department subject types
export type RegularSubjectType = 'major' | 'minor' | 'mdc' | 'vac' | 'aec';

// Vocational department subject types
export type VocationalSubjectType = 'core1' | 'core2' | 'core3' | 'ge1' | 'ge2' | 'aecc' | 'sec1' | 'dse1' | 'dse2';

// All subject types
export type SubjectType = RegularSubjectType | VocationalSubjectType;

export interface Subject {
    id: string;
    code: string;
    name: string;
    subjectType: SubjectType;
    programId: string;
    semester: number;
    credits: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface TeacherSubject {
    id: string;
    teacherId: string;
    subjectId: string;
    academicYear: string;
    createdAt: Date;
}

export interface StudentSubject {
    id: string;
    studentId: string;
    subjectId: string;
    academicYear: string;
    enrolledAt: Date;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceRecord {
    id: string;
    subjectId: string;
    studentId: string;
    teacherId: string;
    date: Date;
    lectureNumber: number;
    status: AttendanceStatus;
    remarks?: string;
    recordedAt: Date;
}

export interface Holiday {
    id: string;
    name: string;
    date: Date;
    description?: string;
    createdAt: Date;
}
