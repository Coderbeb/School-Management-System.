// Re-export attendance types from academic.ts for backwards compatibility
export type { AttendanceStatus, AttendanceRecord } from './academic';

export type SessionStatus = 'scheduled' | 'completed' | 'cancelled';

export interface AttendanceInput {
    studentId: string;
    subjectId?: string;
    status: 'present' | 'absent' | 'late' | 'excused';
    lectureNumber?: number;
    remarks?: string;
}

export interface MarkAttendanceRequest {
    subjectId: string;
    date: string;
    lectureNumber?: number;
    attendance: AttendanceInput[];
}
