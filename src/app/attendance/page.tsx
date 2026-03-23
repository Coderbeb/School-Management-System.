'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Check, X, Calendar, Users, Save, BookOpen, ClipboardCheck } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';

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
}

export default function AttendancePage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [students, setStudents] = useState<Student[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [teacherDepartmentIds, setTeacherDepartmentIds] = useState<string[]>([]); // All teacher's dept IDs for filtering
    const [primaryDeptType, setPrimaryDeptType] = useState<string>('regular'); // Primary dept type for batch year calc
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

    // Auto-save timer ref
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const pendingChangesRef = useRef(false);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.push('/login');
            return;
        }
        const parsedUser = JSON.parse(userData);

        // Only HOD and Teacher can access attendance
        if (parsedUser.role === 'super_admin') {
            router.push('/dashboard');
            return;
        }

        setUser(parsedUser);
        fetchTeacherDepartments(token, parsedUser.id);
        fetchTeacherSubjects(token, parsedUser.id);
        fetchHolidays(token);
        setLoading(false);
    }, [router]);

    const fetchTeacherDepartments = async (token: string, teacherId: string) => {
        try {
            // Get departments the teacher is assigned to
            const res = await fetch(`/api/teachers`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.push('/login');
                return;
            }
            const data = await res.json();

            // Find the current teacher in the list
            const teacher = data.teachers?.find((t: any) => t.id === teacherId);
            if (teacher) {
                // Build departments array from primary + additional
                const allDepts: Department[] = [];

                // Add primary department if exists
                if (teacher.department_id && teacher.department_name) {
                    allDepts.push({
                        id: teacher.department_id,
                        name: teacher.department_name,
                        code: teacher.department_code || '',
                        deptType: teacher.department_dept_type || 'regular'
                    });
                }

                // Add additional departments
                if (teacher.additional_departments && Array.isArray(teacher.additional_departments)) {
                    teacher.additional_departments.forEach((dept: any) => {
                        // Avoid duplicates
                        if (!allDepts.find(d => d.id === dept.id)) {
                            allDepts.push({
                                id: dept.id,
                                name: dept.name,
                                code: dept.code || '',
                                deptType: dept.dept_type || 'regular'
                            });
                        }
                    });
                }

                // Always populate departments state to allow stream checking
                setDepartments(allDepts);

                // Always store all department IDs for student filtering
                setTeacherDepartmentIds(allDepts.map(d => d.id));
                // Store primary dept type for batch year calculation
                setPrimaryDeptType(allDepts[0]?.deptType || 'regular');
            }
        } catch (err) {
            console.error('Error fetching departments:', err);
        }
    };

    const fetchTeacherSubjects = async (token: string, teacherId: string) => {
        try {
            const res = await fetch(`/api/teacher-subjects?teacherId=${teacherId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.push('/login');
                return;
            }
            const data = await res.json();
            const assignments = data.assignments || [];
            setSubjects(assignments);

            // Extract unique semesters from all assignments (each has semesters array)
            const semesterSet = new Set<number>();
            assignments.forEach((s: Subject) => s.subjectSemesters.forEach((sem: number) => semesterSet.add(sem)));
            const semesters = Array.from(semesterSet).sort((a, b) => a - b);
            setAvailableSemesters(semesters);

        } catch (err) {
            console.error('Error fetching subjects:', err);
        }
    };

    const fetchHolidays = async (token: string) => {
        try {
            const res = await fetch('/api/holidays', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.push('/login');
                return;
            }
            const data = await res.json();
            setHolidays(data.holidays || []);
        } catch (err) {
            console.error('Error fetching holidays:', err);
        }
    };

    // Check if selected date is a holiday
    useEffect(() => {
        if (holidays.length === 0) {
            setIsHoliday(false);
            setHolidayName('');
            return;
        }

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

        // Find matching holiday
        const holiday = holidays.find(h => {
            const holidayDateNormalized = normalizeDate(h.date);
            return holidayDateNormalized === selectedDateNormalized;
        });

        if (holiday) {
            setIsHoliday(true);
            setHolidayName(holiday.name);
        } else {
            setIsHoliday(false);
            setHolidayName('');
        }
    }, [selectedDate, holidays]);

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


    const fetchStudentsForSubject = async (subjectId: string) => {
        const token = localStorage.getItem('token');
        if (!token || !subjectId) return;

        setLoading(true);
        try {
            // Get all subjects for the selected semester (not just one)
            const semesterSubjects = subjectsToUse.filter(s => s.subjectSemesters.includes(parseInt(selectedSemester)));

            // Fetch students from ALL subjects for this semester and merge them
            const allStudentsMap = new Map<string, Student>();

            for (const subject of semesterSubjects) {
                const res = await fetch(`/api/student-subjects?subjectId=${subject.subjectId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.status === 401) {
                    router.push('/login');
                    return;
                }
                const data = await res.json();

                (data.enrollments || []).forEach((e: any) => {
                    // Only add if student's department matches the selected/teacher's department
                    // AND student's current semester matches the selected semester
                    // AND not already in the map (deduplicate by student ID)
                    const studentDeptId = e.studentDepartmentId;
                    const studentSemester = e.studentCurrentSemester;

                    // Filter by semester - only show students in the selected semester
                    if (selectedSemester && studentSemester !== parseInt(selectedSemester)) {
                        return;
                    }

                    // If specific department is selected, filter by that; otherwise filter by all teacher's departments
                    let matchesDepartment = false;
                    if (selectedDepartmentId) {
                        // Specific department selected - filter by that department only
                        matchesDepartment = studentDeptId === selectedDepartmentId;
                    } else if (teacherDepartmentIds.length > 0) {
                        // No specific selection - filter by all teacher's departments
                        matchesDepartment = teacherDepartmentIds.includes(studentDeptId);
                    } else {
                        // No department info (shouldn't happen) - allow all
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
            }

            const enrolledStudents = Array.from(allStudentsMap.values());

            // Fetch existing attendance for this date and subject
            const attRes = await fetch(`/api/attendance?subjectId=${subjectId}&date=${selectedDate}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (attRes.status === 401) {
                router.push('/login');
                return;
            }
            const attData = await attRes.json();
            const existingAttendance = attData.records || [];

            // NEW: Fetch current teacher's lecture number and total lectures for today
            if (user) {
                try {
                    const lectureInfoRes = await fetch(
                        `/api/attendance?subjectId=${subjectId}&date=${selectedDate}&detailed=true`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    if (lectureInfoRes.ok) {
                        const lectureData = await lectureInfoRes.json();
                        const records = lectureData.detailedRecords || [];

                        // Find teacher's lecture number
                        const teacherRecord = records.find((r: any) => r.teacher_id === user.id);
                        if (teacherRecord) {
                            setCurrentLectureNumber(teacherRecord.lecture_number);
                        } else {
                            setCurrentLectureNumber(null); // Not yet marked
                        }

                        // Count total unique lectures for today
                        const uniqueLectures = new Set(records.map((r: any) => r.lecture_number));
                        setTotalLecturesToday(uniqueLectures.size);
                    }
                } catch (err) {
                    console.error('Error fetching lecture info:', err);
                }
            }

            // FILTER: Only show attendance marked by THIS teacher (not other teachers)
            // Filter existingAttendance to only include records from current teacher
            const teacherAttendance = user ? existingAttendance.filter((r: any) =>
                r.teacher_id === user.id
            ) : existingAttendance;

            // Merge existing attendance into students
            const studentsWithAttendance = enrolledStudents.map((student: Student) => {
                // API returns snake_case (student_id, status) from database
                const record = teacherAttendance.find((r: any) =>
                    (r.student_id === student.id) || (r.studentId === student.id)
                );
                return {
                    ...student,
                    attendance: record ? (record.status as 'present' | 'absent') : undefined
                };
            });

            // Sort students by roll number
            // Sort students by roll number (natural sort for correct numeric ordering)
            studentsWithAttendance.sort((a, b) =>
                String(a.roll_number || '').localeCompare(String(b.roll_number || ''), undefined, { numeric: true, sensitivity: 'base' })
            );

            setStudents(studentsWithAttendance);

            // Fetch history for these students
            fetchAttendanceHistory(studentsWithAttendance, subjectId);
        } catch (err) {
            console.error('Error fetching students:', err);
        }
        setLoading(false);
    };

    // Ref to track latest students for auto-save
    const studentsRef = useRef<Student[]>([]);
    useEffect(() => {
        studentsRef.current = students;
    }, [students]);

    // Fetch attendance history for a list of students
    const fetchAttendanceHistory = async (studentList: Student[], subjectId: string) => {
        const token = localStorage.getItem('token');
        if (!token || studentList.length === 0) return;

        try {
            const studentIds = studentList.map(s => s.id).join(',');
            const res = await fetch(`/api/attendance/history?studentIds=${studentIds}&subjectId=${subjectId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                const data = await res.json();
                setAttendanceHistory(data.history || {});
            }
        } catch (err) {
            console.error('Error fetching history:', err);
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

            // Use ref to get latest students state
            const currentStudents = studentsRef.current;
            const attendanceData = currentStudents
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
                    router.push('/login');
                    return;
                }

                pendingChangesRef.current = false;
            } catch (err) {
                console.error('Auto-save error:', err);
            }
            setAutoSaving(false);
        }, 1500);
    }, [selectedSubjectId, selectedDate]);

    const markAttendance = (studentId: string, status: 'present' | 'absent') => {
        setStudents(prev => prev.map(s =>
            s.id === studentId ? { ...s, attendance: status } : s
        ));
        setMessage('');
        triggerAutoSave();
    };

    // Toggle attendance: undefined/absent -> present, present -> absent
    const toggleAttendance = (studentId: string) => {
        setStudents(prev => prev.map(s => {
            if (s.id !== studentId) return s;
            // If not marked or absent, toggle to present; if present, toggle to absent
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

        const attendanceData = students
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
                router.push('/login');
                return;
            }

            if (res.ok) {
                pendingChangesRef.current = false;
                const data = await res.json();
                // Update lecture number from response
                if (data.lectureNumber) {
                    setCurrentLectureNumber(data.lectureNumber);
                }
                setMessage('✅ Attendance saved successfully!');
            } else {
                const data = await res.json();
                setMessage(`Error: ${data.error}`);
            }
        } catch (err) {
            setMessage('Network error');
        }
        setSaving(false);
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
                        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                            <span className="p-2 rounded-lg bg-emerald-100 text-emerald-600 hidden md:block">
                                <ClipboardCheck className="w-6 h-6" />
                            </span>
                            Mark Attendance
                            {autoSaving && (
                                <span className="text-sm font-normal text-blue-500 animate-pulse ml-2">Saving...</span>
                            )}
                        </h1>
                        <div className="flex items-center gap-3">
                            <Label htmlFor="date" className="whitespace-nowrap text-sm font-medium text-gray-700">Date:</Label>
                            <input
                                id="date"
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                disabled={user?.role === 'teacher' || user?.role === 'hod'} // Only super_admin can change date? Wait, logic was teacher/hod specific in original code
                            />
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
                                        // Calculate batch year label
                                        // Determine dept type: use selected department or first/only department
                                        const activeDept = selectedDepartmentId
                                            ? departments.find(d => d.id === selectedDepartmentId)
                                            : departments[0] || null;
                                        const deptType = activeDept?.deptType || primaryDeptType;
                                        // Current academic year start (e.g. 2025 from July 2025)
                                        const now = new Date();
                                        const academicStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
                                        // Batch start year: semester 1-2 = current year, 3-4 = year-1, etc.
                                        const yearOffset = Math.floor((sem - 1) / 2);
                                        const batchStart = academicStartYear - yearOffset;
                                        // Program duration: vocational/pg = 3yr, regular = 4yr (NEP)
                                        const duration = (deptType === 'vocational' || deptType === 'pg') ? 3 : 4;
                                        const batchEnd = (batchStart + duration) % 100; // last 2 digits
                                        const batchLabel = `${batchStart}-${String(batchEnd).padStart(2, '0')}`;
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
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Roll</th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                                                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 w-24">Status</th>
                                                </tr>
                                            </thead>
                                        </table>
                                        <div className="overflow-auto flex-1">
                                            <table className="w-full">
                                                <tbody className="divide-y divide-gray-100">
                                                    {displayStudents.map((student) => (
                                                        <tr key={student.id} className="hover:bg-gray-50">
                                                            <td className="px-3 py-2 text-sm font-mono font-bold text-gray-900">{student.roll_number}</td>
                                                            <td className="px-3 py-2 text-sm font-medium text-gray-900 truncate max-w-[150px]">
                                                                {student.first_name} {student.last_name}
                                                            </td>
                                                            <td className="px-3 py-2 w-20">
                                                                <div className="flex justify-center">
                                                                    <button
                                                                        onClick={() => toggleAttendance(student.id)}
                                                                        className={`relative group overflow-hidden w-24 h-12 rounded-xl flex items-center justify-center font-bold text-2xl transition-all duration-200 border-b-4 active:border-b-0 active:translate-y-1 ${student.attendance === 'present'
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
                                            const now = new Date();
                                            const academicStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
                                            const yearOffset = Math.floor((sem - 1) / 2);
                                            const batchStart = academicStartYear - yearOffset;
                                            const duration = (deptType === 'vocational' || deptType === 'pg') ? 3 : 4;
                                            const batchEnd = (batchStart + duration) % 100;
                                            const batchLabel = `${batchStart}-${String(batchEnd).padStart(2, '0')}`;
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
                                            <>{currentSubject.subjectName} ({currentSubject.subjectCode})</>
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
