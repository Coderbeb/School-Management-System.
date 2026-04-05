'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Check, X, Calendar, Users, Save, BookOpen, ClipboardCheck, WifiOff, CloudUpload } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { useOfflineStatus } from '@/components/ServiceWorkerProvider';
import { addToQueue, getQueueCount } from '@/lib/offlineQueue';

interface Student {
    id: string;
    student_custom_id?: string;
    roll_number: string;
    first_name: string;
    last_name: string;
    attendance?: 'present' | 'absent';
}

interface User {
    id: string;
    role: 'super_admin' | 'hod' | 'teacher';
    firstName: string;
    lastName: string;
    email: string;
}

interface Subject {
    id: string;
    subjectId: string;
    subjectCode: string;
    subjectPaperCode?: string | null;
    subjectName: string;
    subjectSemesters: number[];
    academicYear: string;
    departmentId?: string;
    departmentName?: string;
}

interface Department {
    id: string;
    name: string;
    code: string;
    deptType: string;
}

interface Holiday {
    id: string;
    name: string;
    date: string;
    description?: string;
    department_id: string | null;
}

export default function AttendancePage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [students, setStudents] = useState<Student[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [teacherDepartmentIds, setTeacherDepartmentIds] = useState<string[]>([]); // All teacher's dept IDs for filtering
    const [primaryDeptType, setPrimaryDeptType] = useState<string>('regular'); // Primary dept type for batch year calc
    const [batchConfig, setBatchConfig] = useState<Record<string, Record<string, number>>>({}); // Saved batch mappings from settings
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Selection States
    const [availableSemesters, setAvailableSemesters] = useState<number[]>([]);
    const [selectedSemester, setSelectedSemester] = useState<string>('');
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [selectedSection, setSelectedSection] = useState(''); // Optional section
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [selectedStream, setSelectedStream] = useState<string>('all');

    const [loading, setLoading] = useState(true);
    // Initialize with local date (IST) to prevent previous day issue in early morning
    const [selectedDate, setSelectedDate] = useState(() => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });
    const [saving, setSaving] = useState(false);
    const [autoSaving, setAutoSaving] = useState(false);
    const [message, setMessage] = useState('');

    // Holiday states
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [isHoliday, setIsHoliday] = useState(false);
    const [holidayName, setHolidayName] = useState('');

    // Attendance history state (last 5 records per student)
    const [attendanceHistory, setAttendanceHistory] = useState<Record<string, { status: string; date: string }[]>>({});

    // Lecture number states
    const [currentLectureNumber, setCurrentLectureNumber] = useState<number | null>(null);
    const [totalLecturesToday, setTotalLecturesToday] = useState<number>(0);

    // Ref to track current stream for auto-save (since useCallback captures stale closures)
    const selectedStreamRef = useRef<string>('all');

    // Auto-save timer ref
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const pendingChangesRef = useRef(false);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.replace('/login');
            return;
        }
        const parsedUser = JSON.parse(userData);

        // Only HOD and Teacher can access attendance
        if (parsedUser.role === 'super_admin') {
            router.push('/dashboard');
            return;
        }

        setUser(parsedUser);
        fetchTeacherDepartments(token);
        fetchTeacherSubjects(token, parsedUser.id);
        fetchHolidays(token);
        fetchBatchConfig(token);
        setLoading(false);
    }, [router]);

    // ========================
    // OFFLINE CACHE HELPERS
    // ========================
    const CACHE_KEYS = {
        ENROLLMENTS: 'offline_all_enrollments',
        DEPARTMENTS: 'offline_departments',
        SUBJECTS: 'offline_subjects',
        HOLIDAYS: 'offline_holidays',
    };

    const cacheToStorage = (key: string, data: any) => {
        try {
            localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
        } catch { /* storage full, silently fail */ }
    };

    const getFromCache = <T,>(key: string): T | null => {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed.data as T;
        } catch { return null; }
    };

    // (prefetchAllStudentData removed — session cache + batch fetch replaces it)

    const applyDepartments = (allDepts: Department[]) => {
        setDepartments(allDepts);
        setTeacherDepartmentIds(allDepts.map(d => d.id));
        setPrimaryDeptType(allDepts[0]?.deptType || 'regular');
    };

    const fetchTeacherDepartments = async (token: string) => {
        // --- INSTANT LOAD: Check cache first (stale-while-revalidate) ---
        const cached = getFromCache<Department[]>(CACHE_KEYS.DEPARTMENTS);
        if (cached && cached.length > 0) {
            applyDepartments(cached);
        }

        try {
            // Lightweight endpoint — returns only this user's departments
            const res = await fetch(`/api/me/departments`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            const allDepts: Department[] = (data.departments || []).map((d: any) => ({
                id: d.id,
                name: d.name,
                code: d.code || '',
                deptType: d.deptType || 'regular'
            }));

            // Update with fresh data
            applyDepartments(allDepts);
            cacheToStorage(CACHE_KEYS.DEPARTMENTS, allDepts);
        } catch (err) {
            console.error('Error fetching departments:', err);
            // Offline fallback: already loaded from cache above, but we can retry if needed
            if (!cached) {
                const fallback = getFromCache<Department[]>(CACHE_KEYS.DEPARTMENTS);
                if (fallback) applyDepartments(fallback);
            }
        }
    };

    const applySubjects = (assignments: Subject[]) => {
        setSubjects(assignments);
        const semesterSet = new Set<number>();
        assignments.forEach((s: Subject) => s.subjectSemesters.forEach((sem: number) => semesterSet.add(sem)));
        const semesters = Array.from(semesterSet).sort((a, b) => a - b);
        setAvailableSemesters(semesters);
    };

    const fetchTeacherSubjects = async (token: string, teacherId: string) => {
        // --- INSTANT LOAD: Check cache first (stale-while-revalidate) ---
        const cached = getFromCache<Subject[]>(CACHE_KEYS.SUBJECTS);
        if (cached && cached.length > 0) {
            applySubjects(cached);
        }

        try {
            const res = await fetch(`/api/teacher-subjects?teacherId=${teacherId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            const assignments = data.assignments || [];
            
            // Update with fresh data
            applySubjects(assignments);
            cacheToStorage(CACHE_KEYS.SUBJECTS, assignments);
        } catch (err) {
            console.error('Error fetching subjects:', err);
            // Offline fallback: already loaded from cache above, but we can retry if needed
            if (!cached) {
                const fallback = getFromCache<Subject[]>(CACHE_KEYS.SUBJECTS);
                if (fallback) applySubjects(fallback);
            }
        }
    };

    const fetchHolidays = async (token: string) => {
        try {
            const res = await fetch('/api/holidays', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            const holidayList = data.holidays || [];
            setHolidays(holidayList);
            cacheToStorage(CACHE_KEYS.HOLIDAYS, holidayList);
        } catch (err) {
            console.error('Error fetching holidays:', err);
            // Offline fallback
            const cached = getFromCache<Holiday[]>(CACHE_KEYS.HOLIDAYS);
            if (cached) setHolidays(cached);
        }
    };

    // Fetch batch config (saved semester-to-batch mappings)
    const fetchBatchConfig = async (token: string) => {
        try {
            const res = await fetch('/api/settings/batch-config', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setBatchConfig(data.mappings || {});
            }
        } catch (err) {
            console.error('Error fetching batch config:', err);
        }
    };

    // Helper: get batch label for a semester using saved config or fallback to date-calc
    const getBatchLabel = (sem: number, deptType: string): string => {
        // 1. Check saved config first
        const savedMappings = batchConfig[deptType];
        if (savedMappings && savedMappings[sem.toString()]) {
            const batchStart = savedMappings[sem.toString()];
            const duration = (deptType === 'vocational' || deptType === 'pg') ? 3 : 4;
            const batchEnd = (batchStart + duration) % 100;
            return `${batchStart}-${String(batchEnd).padStart(2, '0')}`;
        }

        // 2. Fallback to dynamic calculation
        const now = new Date();
        const academicStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
        const yearOffset = Math.floor((sem - 1) / 2);
        const batchStart = academicStartYear - yearOffset;
        const duration = (deptType === 'vocational' || deptType === 'pg') ? 3 : 4;
        const batchEnd = (batchStart + duration) % 100;
        return `${batchStart}-${String(batchEnd).padStart(2, '0')}`;
    };

    // Check if selected date is a holiday
    useEffect(() => {
        // Helper function to normalize date to YYYY-MM-DD in LOCAL timezone
        const normalizeDate = (dateInput: string | Date): string => {
            // Always parse through Date object and extract LOCAL date parts
            // This handles timezone conversion properly (e.g., India UTC+5:30)
            const date = new Date(dateInput);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // The selected date is already in YYYY-MM-DD format from the input
        const selectedDateNormalized = selectedDate;

        // Determine currently active department block
        const activeDeptId = selectedDepartmentId || subjects.find(s => s.subjectId === selectedSubjectId)?.departmentId || teacherDepartmentIds[0];

        // Find matching holiday
        const holiday = holidays.find(h => {
            const holidayDateNormalized = normalizeDate(h.date);
            const isDateMatch = holidayDateNormalized === selectedDateNormalized;
            const isDeptMatch = !h.department_id || h.department_id === activeDeptId;
            return isDateMatch && isDeptMatch;
        });

        // Check if Sunday (Using UTC since the date string YYYY-MM-DD is parsed as UTC midnight)
        const dateObj = new Date(selectedDateNormalized);
        const isSunday = dateObj.getUTCDay() === 0;

        if (holiday) {
            setIsHoliday(true);
            setHolidayName(holiday.name);
        } else if (isSunday) {
            setIsHoliday(true);
            setHolidayName('Sunday (Weekend)');
        } else {
            setIsHoliday(false);
            setHolidayName('');
        }
    }, [selectedDate, holidays, selectedDepartmentId, selectedSubjectId, subjects, teacherDepartmentIds]);

    // Filter subjects by department if selected
    const filteredSubjects = selectedDepartmentId
        ? subjects.filter(s => s.departmentId === selectedDepartmentId)
        : subjects;

    // Get semesters for filtered subjects. If filtering resulted in empty, fall back to all subjects
    const subjectsToUse = filteredSubjects.length > 0 ? filteredSubjects : subjects;
    const filteredSemesters = Array.from(
        new Set(subjectsToUse.flatMap((s: Subject) => s.subjectSemesters))
    ).sort((a, b) => a - b);

    // Auto-select subject when semester changes
    useEffect(() => {
        if (!selectedSemester) {
            setSelectedSubjectId('');
            setStudents([]);
            return;
        }

        // Use subjectsToUse (falls back to all subjects if filter is empty)
        const semesterSubjects = subjectsToUse.filter(s => s.subjectSemesters.includes(parseInt(selectedSemester)));
        if (semesterSubjects.length > 0) {
            // Auto-select the first subject for this semester
            setSelectedSubjectId(semesterSubjects[0].subjectId);
        } else {
            setSelectedSubjectId('');
        }
    }, [selectedSemester, subjectsToUse.length, selectedDepartmentId]);

    // Fetch students when subject is selected (triggered by auto-select above)
    // Refetch when date, subject, department, or semester changes
    useEffect(() => {
        if (selectedSubjectId) {
            fetchStudentsForSubject(selectedSubjectId);
        }
    }, [selectedSubjectId, selectedDate, selectedDepartmentId, selectedSemester]);


    // Shared function to filter enrollments into a student map
    const filterEnrollmentsToStudents = (
        enrollments: any[],
        semesterSubjectIds: string[]
    ): Map<string, Student> => {
        const allStudentsMap = new Map<string, Student>();

        enrollments.forEach((e: any) => {
            // Only include enrollments from subjects in this semester
            const enrollmentSubjectId = e._fromSubjectId || e.subjectId;
            if (!semesterSubjectIds.includes(enrollmentSubjectId)) return;

            const studentDeptId = e.studentDepartmentId;
            const studentSemester = e.studentCurrentSemester;

            // Filter by semester
            if (selectedSemester && studentSemester !== parseInt(selectedSemester)) return;

            // Filter by department
            let matchesDepartment = false;
            if (selectedDepartmentId) {
                matchesDepartment = studentDeptId === selectedDepartmentId;
            } else if (teacherDepartmentIds.length > 0) {
                matchesDepartment = teacherDepartmentIds.includes(studentDeptId);
            } else {
                matchesDepartment = true;
            }

            if (matchesDepartment && !allStudentsMap.has(e.studentId)) {
                allStudentsMap.set(e.studentId, {
                    id: e.studentId,
                    student_custom_id: e.studentCustomId,
                    roll_number: e.studentRollNumber || e.studentId.slice(-4),
                    first_name: e.studentName?.split(' ')[0] || 'Unknown',
                    last_name: e.studentName?.split(' ').slice(1).join(' ') || '',
                    attendance: undefined
                });
            }
        });

        return allStudentsMap;
    };

    const fetchStudentsForSubject = async (subjectId: string) => {
        const token = localStorage.getItem('token');
        if (!token || !subjectId) return;

        setLoading(true);
        const semesterSubjects = subjectsToUse.filter(s => s.subjectSemesters.includes(parseInt(selectedSemester)));
        const semesterSubjectIds = semesterSubjects.map(s => s.subjectId);

        let enrolledStudents: Student[] = [];

        try {
            // === BATCH FETCH: 1 call instead of N (Always fresh data) ===
            const batchIds = semesterSubjectIds.join(',');
            const res = await fetch(`/api/student-subjects?subjectIds=${batchIds}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            const allStudentsMap = new Map<string, Student>();

            (data.enrollments || []).forEach((e: any) => {
                const studentDeptId = e.studentDepartmentId;
                const studentSemester = e.studentCurrentSemester;
                if (selectedSemester && studentSemester !== parseInt(selectedSemester)) return;
                let matchesDepartment = false;
                if (selectedDepartmentId) {
                    matchesDepartment = studentDeptId === selectedDepartmentId;
                } else if (teacherDepartmentIds.length > 0) {
                    matchesDepartment = teacherDepartmentIds.includes(studentDeptId);
                } else {
                    matchesDepartment = true;
                }
                if (matchesDepartment && !allStudentsMap.has(e.studentId)) {
                    allStudentsMap.set(e.studentId, {
                        id: e.studentId,
                        student_custom_id: e.studentCustomId,
                        roll_number: e.studentRollNumber || e.studentId.slice(-4),
                        first_name: e.studentName?.split(' ')[0] || 'Unknown',
                        last_name: e.studentName?.split(' ').slice(1).join(' ') || '',
                        attendance: undefined
                    });
                }
            });
            enrolledStudents = Array.from(allStudentsMap.values());

            // Save to localStorage ONLY for offline fallback
            cacheToStorage(CACHE_KEYS.ENROLLMENTS, data.enrollments || []);
        } catch (err) {
            // OFFLINE FALLBACK: Use cached enrollment data
            console.warn('Network failed, using cached student data');
            const cachedEnrollments = getFromCache<any[]>(CACHE_KEYS.ENROLLMENTS);
            if (cachedEnrollments) {
                const studentMap = filterEnrollmentsToStudents(cachedEnrollments, semesterSubjectIds);
                enrolledStudents = Array.from(studentMap.values());
            }
        }

        // Fetch existing attendance (SW will serve from cache if offline)
        let existingAttendance: any[] = [];
        try {
            const attRes = await fetch(`/api/attendance?subjectId=${subjectId}&date=${selectedDate}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (attRes.status === 401) {
                router.replace('/login');
                return;
            }
            const attData = await attRes.json();
            existingAttendance = attData.records || [];
        } catch (err) {
            console.warn('Could not fetch attendance records (offline)');
        }

        // Fetch lecture info (non-critical, skip gracefully if offline)
        if (user) {
            try {
                const lectureInfoRes = await fetch(
                    `/api/attendance?subjectId=${subjectId}&date=${selectedDate}&detailed=true`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (lectureInfoRes.ok) {
                    const lectureData = await lectureInfoRes.json();
                    const records = lectureData.detailedRecords || [];
                    const teacherRecord = records.find((r: any) => r.teacher_id === user.id);
                    setCurrentLectureNumber(teacherRecord ? teacherRecord.lecture_number : null);
                    const uniqueLectures = new Set(records.map((r: any) => r.lecture_number));
                    setTotalLecturesToday(uniqueLectures.size);
                }
            } catch (err) {
                // Offline - skip lecture info
            }
        }

        // Filter to this teacher's attendance only
        const teacherAttendance = user ? existingAttendance.filter((r: any) =>
            r.teacher_id === user.id
        ) : existingAttendance;

        // Merge attendance into students
        const studentsWithAttendance = enrolledStudents.map((student: Student) => {
            const record = teacherAttendance.find((r: any) =>
                (r.student_id === student.id) || (r.studentId === student.id)
            );
            return {
                ...student,
                attendance: record ? (record.status as 'present' | 'absent') : 'absent'
            };
        });

        // Sort by roll number
        studentsWithAttendance.sort((a, b) =>
            String(a.roll_number || '').localeCompare(String(b.roll_number || ''), undefined, { numeric: true, sensitivity: 'base' })
        );

        setStudents(studentsWithAttendance);

        // Reset pending changes on fresh load
        pendingChangesRef.current = false;

        // Fetch history (non-critical, skip gracefully if offline)
        fetchAttendanceHistory(studentsWithAttendance, subjectId);
        setLoading(false);
    };

    // Ref to track latest students for auto-save
    const studentsRef = useRef<Student[]>([]);
    useEffect(() => {
        studentsRef.current = students;
    }, [students]);

    // Fetch attendance history for a list of students (with offline cache)
    const fetchAttendanceHistory = async (studentList: Student[], subjectId: string) => {
        const token = localStorage.getItem('token');
        if (!token || studentList.length === 0) return;

        const historyCacheKey = `offline_history_${subjectId}`;

        try {
            const studentIds = studentList.map(s => s.id).join(',');
            const res = await fetch(`/api/attendance/history?studentIds=${studentIds}&subjectId=${subjectId}&currentDate=${selectedDate}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                const data = await res.json();
                const history = data.history || {};
                setAttendanceHistory(history);
                // Cache history for offline
                cacheToStorage(historyCacheKey, history);
            }
        } catch (err) {
            console.warn('History fetch failed, using cache');
            // Offline fallback
            const cached = getFromCache<Record<string, { status: string; date: string }[]>>(historyCacheKey);
            if (cached) setAttendanceHistory(cached);
        }
    };

    // Debounced auto-save function
    const triggerAutoSave = useCallback(() => {
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        pendingChangesRef.current = true;

        autoSaveTimerRef.current = setTimeout(async () => {
            if (!pendingChangesRef.current) return;

            const token = localStorage.getItem('token');
            if (!token || !selectedSubjectId) return;

            // Use ref to get latest students — send ALL students in the current stream view
            const currentStudents = studentsRef.current;
            const stream = selectedStreamRef.current;

            // Filter by stream (same logic as displayStudents)
            const streamStudents = stream === 'all'
                ? currentStudents
                : currentStudents.filter(s => s.student_custom_id && s.student_custom_id.toUpperCase().startsWith(stream));

            const attendanceData = streamStudents
                .filter(s => s.attendance)
                .map(s => ({ studentId: s.id, status: s.attendance }));

            if (attendanceData.length === 0) return;

            setAutoSaving(true);
            try {
                const res = await fetch('/api/attendance', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        records: attendanceData,
                        subjectId: selectedSubjectId,
                        date: selectedDate
                    }),
                });

                if (res.status === 401) {
                    router.replace('/login');
                    return;
                }

                if (res.ok) {
                    pendingChangesRef.current = false;
                }
            } catch (err) {
                console.error('Auto-save error:', err);
                // Queue for offline sync
                const token = localStorage.getItem('token');
                if (token) {
                    try {
                        await addToQueue({
                            url: '/api/attendance',
                            body: {
                                records: attendanceData as { studentId: string; status: string }[],
                                subjectId: selectedSubjectId,
                                date: selectedDate
                            },
                            authHeader: `Bearer ${token}`,
                            timestamp: Date.now(),
                        });
                        pendingChangesRef.current = false;
                    } catch (queueErr) {
                        console.error('Failed to queue offline:', queueErr);
                    }
                }
            } finally {
                setAutoSaving(false);
            }
        }, 1500);
    }, [selectedSubjectId, selectedDate]);

    const markAttendance = (studentId: string, status: 'present' | 'absent') => {
        setStudents(prev => prev.map(s =>
            s.id === studentId ? { ...s, attendance: status } : s
        ));
        setMessage('');
        triggerAutoSave();
    };

    const toggleAttendance = (studentId: string) => {
        setStudents(prev => prev.map(s => {
            if (s.id !== studentId) return s;
            const newStatus = s.attendance === 'present' ? 'absent' : 'present';
            return { ...s, attendance: newStatus };
        }));
        setMessage('');
        triggerAutoSave();
    };

    const markAllPresent = () => {
        setStudents(prev => prev.map(s => {
            if (selectedStream !== 'all' && (!s.student_custom_id || !s.student_custom_id.toUpperCase().startsWith(selectedStream))) return s;
            return { ...s, attendance: 'present' as const };
        }));
        setMessage('');
        triggerAutoSave();
    };

    const markAllAbsent = () => {
        setStudents(prev => prev.map(s => {
            if (selectedStream !== 'all' && (!s.student_custom_id || !s.student_custom_id.toUpperCase().startsWith(selectedStream))) return s;
            return { ...s, attendance: 'absent' as const };
        }));
        setMessage('');
        triggerAutoSave();
    };

    const saveAttendance = async () => {
        const token = localStorage.getItem('token');
        if (!token || !selectedSubjectId) return;

        // Save ALL students visible in the current stream view
        const streamStudents = selectedStream === 'all'
            ? students
            : students.filter(s => s.student_custom_id && s.student_custom_id.toUpperCase().startsWith(selectedStream));

        const attendanceData = streamStudents
            .filter(s => s.attendance)
            .map(s => ({ studentId: s.id, status: s.attendance }));

        if (attendanceData.length === 0) {
            setMessage('❌ Please mark attendance first');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/attendance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    records: attendanceData,
                    subjectId: selectedSubjectId,
                    date: selectedDate
                }),
            });

            if (res.status === 401) {
                router.replace('/login');
                return;
            }

            if (res.ok) {
                pendingChangesRef.current = false;
                const data = await res.json();
                // Check if saved offline (from service worker)
                if (data.offline) {
                    setMessage('📱 Saved offline — will sync when online');
                } else {
                    // Update lecture number from response
                    if (data.lectureNumber) {
                        setCurrentLectureNumber(data.lectureNumber);
                    }
                    setMessage('✅ Attendance saved successfully!');
                }
            } else {
                const data = await res.json();
                setMessage(`Error: ${data.error}`);
            }
        } catch (err) {
            // Network error - queue offline
            try {
                await addToQueue({
                    url: '/api/attendance',
                    body: {
                        records: attendanceData as { studentId: string; status: string }[],
                        subjectId: selectedSubjectId,
                        date: selectedDate
                    },
                    authHeader: `Bearer ${token}`,
                    timestamp: Date.now(),
                });
                pendingChangesRef.current = false;
                setMessage('📱 Saved offline — will sync when online');
            } catch (queueErr) {
                setMessage('❌ Network error — could not save');
            }
        } finally {
            setSaving(false);
        }
    };

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, []);

    const [availableStreams, setAvailableStreams] = useState<string[]>([]);

    useEffect(() => {
        const deptIdsToFetch = selectedDepartmentId 
            ? [selectedDepartmentId] 
            : teacherDepartmentIds;

        if (deptIdsToFetch.length === 0) {
            setAvailableStreams([]);
            return;
        }

        const activeDepts = departments.filter(d => deptIdsToFetch.includes(d.id));
        const hasIT = activeDepts.some(d => d.code.toUpperCase() === 'IT');
        
        if (hasIT) {
            setAvailableStreams(['BCA', 'BSCIT']);
        } else {
            setAvailableStreams([]);
        }
    }, [selectedDepartmentId, teacherDepartmentIds, departments]);

    const displayStudents = useMemo(() => {
        if (selectedStream === 'all') return students;
        return students.filter(s => s.student_custom_id && s.student_custom_id.toUpperCase().startsWith(selectedStream));
    }, [students, selectedStream]);

    // Keep ref in sync for auto-save callback
    useEffect(() => {
        selectedStreamRef.current = selectedStream;
    }, [selectedStream]);

    // reset stream when department changes
    useEffect(() => {
        setSelectedStream('all');
    }, [selectedDepartmentId]);

    if (loading && !students.length && !subjects.length) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

    const markedCount = displayStudents.filter(s => s.attendance).length;
    const presentCount = displayStudents.filter(s => s.attendance === 'present').length;
    const absentCount = displayStudents.filter(s => s.attendance === 'absent').length;

    // Find current subject details for display
    const currentSubject = subjects.find(s => s.subjectId === selectedSubjectId);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Mobile Sidebar */}
            {user && (
                <MobileSidebar
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    user={{ ...user, role: user.role }}
                    onLogout={handleLogout}
                />
            )}

            {/* Navbar */}
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} />

            {/* Main Content Wrapper */}
            <div className="flex flex-col flex-1 pt-20 h-screen overflow-hidden">
                {/* Page Header (Sub-header) */}
                <div className="bg-white shadow-sm z-10 px-4 py-3 border-b border-gray-200">
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center justify-between w-full md:w-auto">
                            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                                <span className="p-2 rounded-lg bg-emerald-100 text-emerald-600 hidden md:block">
                                    <ClipboardCheck className="w-6 h-6" />
                                </span>
                                Mark Attendance
                                {autoSaving && (
                                    <span className="text-sm font-normal text-blue-500 animate-pulse ml-2 hidden md:inline">Saving...</span>
                                )}
                            </h1>
                            <div className="flex items-center gap-2">
                                {autoSaving && (
                                    <span className="text-sm font-normal text-blue-500 animate-pulse md:hidden">Saving...</span>
                                )}
                                {!navigator.onLine && (
                                    <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-200">
                                        <WifiOff className="w-3 h-3" /> Offline
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 w-full md:w-auto">
                            <div className="flex items-center gap-3">
                                <Label htmlFor="date" className="whitespace-nowrap text-sm font-medium text-gray-700">Date:</Label>
                                <input
                                    id="date"
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 w-[140px]"
                                    disabled={user?.role === 'teacher' || user?.role === 'hod'} 
                                />
                            </div>
                            
                            {/* Subject display for Mobile */}
                            <div className="md:hidden flex-1 shrink min-w-0 flex justify-end">
                                {currentSubject && (
                                    <span className="text-xs font-semibold bg-gray-100 px-2.5 py-1.5 rounded-lg text-gray-700 block truncate max-w-full border border-gray-200">
                                        {currentSubject.subjectName} ({currentSubject.subjectPaperCode || currentSubject.subjectCode})
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile Content */}
                <main className="md:hidden flex-1 overflow-auto">
                    {/* Only show filters if NOT a holiday */}
                    {!isHoliday && (
                        <div className="p-4">
                            <div className="flex gap-2">
                                {/* Department filter if multiple */}
                                {departments.length > 1 && (
                                    <select
                                        className="flex-1 px-3 py-2.5 bg-white border rounded-xl text-sm font-medium"
                                        value={selectedDepartmentId}
                                        onChange={(e) => {
                                            setSelectedDepartmentId(e.target.value);
                                            // Keep selected semester as requested
                                            setSelectedSubjectId('');
                                        }}
                                    >
                                        <option value="">All Depts</option>
                                        {departments.map(dept => (
                                            <option key={dept.id} value={dept.id}>
                                                {dept.code}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {/* Stream filter if multiple */}
                                {availableStreams.length > 1 && (
                                    <select
                                        className="flex-1 px-3 py-2.5 bg-white border rounded-xl text-sm font-medium"
                                        value={selectedStream}
                                        onChange={(e) => setSelectedStream(e.target.value)}
                                    >
                                        <option value="all">All Streams</option>
                                        {availableStreams.map(stream => (
                                            <option key={stream} value={stream}>{stream}</option>
                                        ))}
                                    </select>
                                )}
                                {/* Semester dropdown */}
                                <select
                                    className={`${departments.length > 1 ? 'flex-1' : 'w-full'} px-3 py-2.5 bg-white border rounded-xl text-sm font-medium`}
                                    value={selectedSemester}
                                    onChange={(e) => setSelectedSemester(e.target.value)}
                                >
                                    <option value="">Select Semester</option>
                                    {(departments.length > 1 && selectedDepartmentId ? filteredSemesters : availableSemesters).map(sem => {
                                        const activeDept = selectedDepartmentId
                                            ? departments.find(d => d.id === selectedDepartmentId)
                                            : departments[0] || null;
                                        const deptType = activeDept?.deptType || primaryDeptType;
                                        const batchLabel = getBatchLabel(sem, deptType);
                                        return (
                                            <option key={sem} value={sem}>Sem {sem} ({batchLabel})</option>
                                        );
                                    })}
                                </select>
                            </div>

                            {subjects.length === 0 && !loading && (
                                <p className="text-red-500 text-sm text-center py-2">No subjects assigned. Contact HOD.</p>
                            )}
                        </div>
                    )}

                    {isHoliday ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4">
                            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 text-center max-w-sm">
                                <Calendar className="w-16 h-16 mx-auto mb-4 text-amber-500" />
                                <h2 className="text-2xl font-bold text-amber-700 mb-2">Holiday</h2>
                                <p className="text-lg font-medium text-amber-600">{holidayName}</p>
                                <p className="text-sm text-amber-500 mt-2">Attendance cannot be marked on holidays</p>
                            </div>
                        </div>
                    ) : selectedSemester ? null : (
                        <div className="text-center py-16 text-gray-500">
                            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            <p>Select a semester to view students</p>
                        </div>
                    )}

                    {/* Lecture Number Indicator */}
                    {selectedSemester && !isHoliday && (
                        <div className="px-4 mb-3">
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 rounded-lg p-3 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <BookOpen className="w-5 h-5 text-blue-600" />
                                        <span className="font-semibold text-blue-900">
                                            {currentLectureNumber
                                                ? `You are marking: Lecture ${currentLectureNumber}`
                                                : 'Ready to mark new lecture'
                                            }
                                        </span>
                                    </div>
                                    {totalLecturesToday > 0 && (
                                        <span className="text-sm text-blue-600 font-medium">
                                            {totalLecturesToday} lecture{totalLecturesToday !== 1 ? 's' : ''} today
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {selectedSemester && !isHoliday ? (
                        <>
                            {/* Stats Bar */}
                            <div className="px-4 mb-3">
                                <div className="bg-white rounded-xl shadow-sm p-3">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-4">
                                            <div className="text-center">
                                                <div className="text-xl font-bold text-gray-900">{displayStudents.length}</div>
                                                <div className="text-xs text-gray-500">Total</div>
                                            </div>
                                            <div className="w-px h-8 bg-gray-200" />
                                            <div className="text-center">
                                                <div className="text-xl font-bold text-green-600">{presentCount}</div>
                                                <div className="text-xs text-gray-500">Present</div>
                                            </div>
                                            <div className="w-px h-8 bg-gray-200" />
                                            <div className="text-center">
                                                <div className="text-xl font-bold text-red-600">{absentCount}</div>
                                                <div className="text-xs text-gray-500">Absent</div>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Quick Action Buttons */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={markAllPresent}
                                            className="flex-1 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1 border border-green-200"
                                        >
                                            <Check className="w-3 h-3" /> All Present
                                        </button>
                                        <button
                                            onClick={markAllAbsent}
                                            className="flex-1 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1 border border-red-200"
                                        >
                                            <X className="w-3 h-3" /> All Absent
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {message && (
                                <p className={`mx-4 mb-2 text-sm px-3 py-2 rounded-lg ${message.includes('Error') || message.includes('error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                    {message}
                                </p>
                            )}

                            {/* Student Table with Sticky Header */}
                            <div className="mx-4 mb-24 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col max-h-[60vh]">
                                {displayStudents.length === 0 ? (
                                    <div className="p-8 text-center text-gray-500">
                                        No students found for this subject.
                                    </div>
                                ) : (
                                    <>
                                        <table className="w-full">
                                            <thead className="bg-gray-50 border-b">
                                                <tr>
                                                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600">Roll</th>
                                                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                                                    <th className="px-1 py-2 text-center text-xs font-semibold text-gray-600">Last 5</th>
                                                    <th className="px-2 py-2 text-center text-xs font-semibold text-gray-600 w-20">Status</th>
                                                </tr>
                                            </thead>
                                        </table>
                                        <div className="overflow-auto flex-1">
                                            <table className="w-full">
                                                <tbody className="divide-y divide-gray-100">
                                                    {displayStudents.map((student) => (
                                                        <tr key={student.id} className="hover:bg-gray-50">
                                                            <td className="px-2 py-2 text-sm font-mono font-bold text-gray-900">{student.roll_number}</td>
                                                            <td className="px-2 py-2 text-sm font-medium text-gray-900 truncate max-w-[120px]">
                                                                {student.first_name} {student.last_name}
                                                            </td>
                                                            <td className="px-1 py-2 text-center">
                                                                <div className="flex items-center justify-center gap-0.5">
                                                                    {[...(attendanceHistory[student.id] || [])].reverse().map((record, i) => (
                                                                        <div
                                                                            key={i}
                                                                            title={record.date}
                                                                            className={`w-2 h-2 rounded-full ${record.status === 'present' ? 'bg-green-500' :
                                                                                record.status === 'absent' ? 'bg-red-500' : 'bg-yellow-500'
                                                                                }`}
                                                                        />
                                                                    ))}
                                                                    {!attendanceHistory[student.id]?.length && <span className="text-gray-300 text-xs">-</span>}
                                                                </div>
                                                            </td>
                                                            <td className="px-2 py-2 w-20">
                                                                <div className="flex justify-center">
                                                                    <button
                                                                        onClick={() => toggleAttendance(student.id)}
                                                                        className={`relative group overflow-hidden w-20 h-11 rounded-xl flex items-center justify-center font-bold text-xl transition-all duration-200 border-b-4 active:border-b-0 active:translate-y-1 ${student.attendance === 'present'
                                                                            ? 'bg-green-500 text-white border-green-700 shadow-lg shadow-green-200'
                                                                            : student.attendance === 'absent'
                                                                            ? 'bg-red-500 text-white border-red-700 shadow-lg shadow-red-200'
                                                                            : 'bg-gray-200 text-gray-500 border-gray-400 shadow-sm'
                                                                            }`}
                                                                    >
                                                                        {student.attendance === 'present' ? 'P' : student.attendance === 'absent' ? 'A' : '-'}
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    ) : null}
                </main>

                {/* Desktop Content */}
                <main className="hidden md:flex max-w-7xl mx-auto px-4 py-4 flex-1 w-full overflow-hidden flex-col">
                    {/* Only show filters if NOT a holiday */}
                    {!isHoliday && (
                        <div className="bg-white rounded-lg shadow px-3 py-3 mb-4">
                            <div className="flex flex-col sm:flex-row flex-wrap items-end gap-3">
                                {/* Department Filter - Full width on mobile, auto on desktop */}
                                {departments.length > 1 && (
                                    <div className="w-full sm:flex-1 sm:min-w-[150px]">
                                        <label htmlFor="department-select" className="block text-xs text-gray-500 mb-1">Department</label>
                                        <select
                                            id="department-select"
                                            className="w-full p-2 border rounded bg-white text-sm"
                                            value={selectedDepartmentId}
                                            onChange={(e) => {
                                                setSelectedDepartmentId(e.target.value);
                                                // Keep selected semester as requested
                                                setSelectedSubjectId('');
                                            }}
                                        >
                                            <option value="">All Departments</option>
                                            {departments.map(dept => (
                                                <option key={dept.id} value={dept.id}>
                                                    {dept.name} ({dept.code})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Stream Filter */}
                                {availableStreams.length > 1 && (
                                    <div className="w-1/2 sm:flex-1 sm:min-w-[120px] px-1 sm:px-0">
                                        <label htmlFor="stream-select" className="block text-xs text-gray-500 mb-1">Stream</label>
                                        <select
                                            id="stream-select"
                                            className="w-full p-2 border rounded bg-white text-sm"
                                            value={selectedStream}
                                            onChange={(e) => setSelectedStream(e.target.value)}
                                        >
                                            <option value="all">All Streams</option>
                                            {availableStreams.map(stream => (
                                                <option key={stream} value={stream}>{stream}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Semester Selection */}
                                <div className="w-1/2 sm:flex-1 sm:min-w-[120px] pr-1 sm:pr-0">
                                    <label htmlFor="semester-select" className="block text-xs text-gray-500 mb-1">Semester</label>
                                    <select
                                        id="semester-select"
                                        className="w-full p-2 border rounded bg-white text-sm"
                                        value={selectedSemester}
                                        onChange={(e) => setSelectedSemester(e.target.value)}
                                    >
                                        <option value="">Select...</option>
                                        {(departments.length > 1 && selectedDepartmentId ? filteredSemesters : availableSemesters).map(sem => {
                                            const activeDept = selectedDepartmentId
                                                ? departments.find(d => d.id === selectedDepartmentId)
                                                : departments[0] || null;
                                            const deptType = activeDept?.deptType || primaryDeptType;
                                            const batchLabel = getBatchLabel(sem, deptType);
                                            return (
                                                <option key={sem} value={sem}>
                                                    Sem {sem} ({batchLabel})
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>

                                {/* Section Selection (Optional) */}
                                <div className="w-1/2 sm:flex-1 sm:min-w-[100px] pl-1 sm:pl-0">
                                    <label htmlFor="section-select" className="block text-xs text-gray-500 mb-1">Section</label>
                                    <input
                                        id="section-select"
                                        type="text"
                                        placeholder="A, B..."
                                        className="w-full p-2 border rounded text-sm"
                                        value={selectedSection}
                                        onChange={(e) => setSelectedSection(e.target.value)}
                                    />
                                </div>

                                {/* Auto-Selected Subject Display */}
                                <div className="w-full sm:flex-1 sm:min-w-[180px]">
                                    <label className="block text-xs text-gray-500 mb-1">Subject</label>
                                    <div className="p-2 bg-gray-100 rounded border text-sm text-gray-700 font-medium truncate">
                                        {currentSubject ? (
                                            <>{currentSubject.subjectName} ({currentSubject.subjectPaperCode || currentSubject.subjectCode})</>
                                        ) : (
                                            <span className="text-gray-400">Select semester...</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {subjects.length === 0 && !loading && (
                                <p className="text-red-500 text-xs mt-2">No subjects assigned. Contact HOD.</p>
                            )}
                        </div>
                    )}

                    {isHoliday ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-8 text-center">
                                <Calendar className="w-20 h-20 mx-auto mb-4 text-amber-500" />
                                <h2 className="text-3xl font-bold text-amber-700 mb-2">Holiday</h2>
                                <p className="text-xl font-medium text-amber-600">{holidayName}</p>
                                <p className="text-sm text-amber-500 mt-3">Attendance cannot be marked on holidays</p>
                            </div>
                        </div>
                    ) : !selectedSemester ? (
                        <div className="text-center py-10 text-gray-500">
                            Please select a semester to view students.
                        </div>
                    ) : (
                        <>
                            {/* Desktop Stats & Actions */}
                            <div className="bg-white rounded-lg shadow px-3 py-3 mb-4">
                                <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-4">
                                        <div className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                                            <span className="text-gray-500 text-xs sm:text-sm">Total:</span>
                                            <span className="font-bold text-sm sm:text-lg">{displayStudents.length}</span>
                                        </div>
                                        <div className="flex items-center gap-2 bg-blue-50 p-2 rounded">
                                            <span className="text-gray-500 text-xs sm:text-sm">Marked:</span>
                                            <span className="font-bold text-sm sm:text-lg text-blue-600">{markedCount}</span>
                                        </div>
                                        <div className="flex items-center gap-2 bg-green-50 p-2 rounded">
                                            <span className="text-gray-500 text-xs sm:text-sm">Present:</span>
                                            <span className="font-bold text-sm sm:text-lg text-green-600">{presentCount}</span>
                                        </div>
                                        <div className="flex items-center gap-2 bg-red-50 p-2 rounded">
                                            <span className="text-gray-500 text-xs sm:text-sm">Absent:</span>
                                            <span className="font-bold text-sm sm:text-lg text-red-600">{absentCount}</span>
                                        </div>
                                    </div>

                                    {/* Quick Actions */}
                                    <div className="flex items-center gap-2 justify-end">
                                        <Button size="sm" onClick={markAllPresent} variant="outline" className="text-green-600 h-8 px-2 sm:px-3 text-xs sm:text-sm flex-1 sm:flex-none">
                                            <Check className="w-4 h-4 mr-1" /> All Present
                                        </Button>
                                        <Button size="sm" onClick={markAllAbsent} variant="outline" className="text-red-600 h-8 px-2 sm:px-3 text-xs sm:text-sm flex-1 sm:flex-none">
                                            <X className="w-4 h-4 mr-1" /> All Absent
                                        </Button>
                                        <Button size="sm" onClick={saveAttendance} disabled={saving || markedCount === 0 || !selectedSubjectId} className="h-8 px-2 sm:px-3 text-xs sm:text-sm flex-1 sm:flex-none">
                                            {saving ? 'Saving...' : <><Save className="w-4 h-4 mr-1" /> Save</>}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {message && (
                                <p className={`mb-2 text-sm px-1 ${message.includes('Error') || message.includes('error') ? 'text-red-600' : 'text-green-600'}`}>
                                    {message}
                                </p>
                            )}

                            {/* Desktop Student Table */}
                            {displayStudents.length === 0 ? (
                                <Card>
                                    <CardContent className="py-8 text-center text-gray-500">
                                        No students found for this subject.
                                    </CardContent>
                                </Card>
                            ) : (
                                <div className="bg-white rounded-lg shadow flex flex-col flex-1 min-h-0 overflow-hidden">
                                    <div className="overflow-auto flex-1">
                                        <table className="w-full relative border-collapse min-w-[350px]">
                                            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                                                <tr>
                                                    <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold bg-gray-50 w-20 sm:w-32">Roll No</th>
                                                    <th className="px-3 sm:px-6 py-3 text-left text-xs sm:text-sm font-semibold bg-gray-50">Name</th>
                                                    <th className="px-3 sm:px-6 py-3 text-center text-xs sm:text-sm font-semibold bg-gray-50">Last 5</th>
                                                    <th className="px-3 sm:px-6 py-3 text-center text-xs sm:text-sm font-semibold bg-gray-50 w-32 sm:w-48">Attendance</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {displayStudents.map((student) => (
                                                    <tr key={student.id} className="hover:bg-gray-50">
                                                        <td className="px-3 sm:px-6 py-3 text-xs sm:text-sm font-mono font-bold">{student.roll_number}</td>
                                                        <td className="px-3 sm:px-6 py-3 text-xs sm:text-sm font-medium">{student.first_name} <span className="hidden sm:inline">{student.last_name}</span></td>
                                                        <td className="px-3 sm:px-6 py-3 text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                {[...(attendanceHistory[student.id] || [])].reverse().map((record, i) => (
                                                                    <div
                                                                        key={i}
                                                                        title={record.date}
                                                                        className={`w-2 h-2 rounded-full ${record.status === 'present' ? 'bg-green-500' :
                                                                            record.status === 'absent' ? 'bg-red-500' : 'bg-yellow-500'
                                                                            }`}
                                                                    />
                                                                ))}
                                                                {!attendanceHistory[student.id]?.length && <span className="text-gray-300 text-xs">-</span>}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 sm:px-6 py-3">
                                                            <div className="flex justify-center">
                                                                <button
                                                                    className={`w-20 h-12 rounded-xl flex items-center justify-center font-bold text-2xl transition-all duration-200 border-b-4 active:border-b-0 active:translate-y-1 ${student.attendance === 'present'
                                                                        ? 'bg-green-500 text-white border-green-700 shadow-lg shadow-green-100'
                                                                        : student.attendance === 'absent'
                                                                        ? 'bg-red-500 text-white border-red-700 shadow-lg shadow-red-100'
                                                                        : 'bg-gray-200 text-gray-500 border-gray-400 shadow-sm'
                                                                        }`}
                                                                    onClick={() => toggleAttendance(student.id)}
                                                                    title={student.attendance === 'present' ? 'Present - Cycle states' : student.attendance === 'absent' ? 'Absent - Cycle states' : 'Not Marked - Cycle states'}
                                                                >
                                                                    {student.attendance === 'present' ? 'P' : student.attendance === 'absent' ? 'A' : '-'}
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </main>

                {/* Mobile Floating Save Button - Right Bottom */}
                {selectedSemester && markedCount > 0 && (
                    <div className="md:hidden fixed bottom-6 right-6">
                        <button
                            onClick={saveAttendance}
                            disabled={saving || !selectedSubjectId}
                            className="w-14 h-14 bg-gray-900 text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center justify-center disabled:opacity-50"
                        >
                            <Save className="w-6 h-6" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
