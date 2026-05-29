'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Check, X, Calendar, Save, ClipboardCheck, ArrowLeft, BookOpen, Users } from 'lucide-react';

interface Student {
    id: string;
    enrollment_id: string;
    roll_number: number | null;
    first_name: string;
    last_name: string;
    admission_number: string | null;
    attendance?: 'present' | 'absent';
}

interface User {
    id: string;
    role: string;
    firstName: string;
    lastName: string;
    email: string;
}

interface Holiday {
    id: string;
    name: string;
    date: string;
}

interface Assignment {
    id: string;
    class_section_name: string;
    subject_name: string;
    subject_code: string;
    class_section_id: string;
    subject_id: string;
    session_id: string;
    is_class_teacher: boolean;
}

function MarkAttendancePageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Selection State
    const [selectedClassSectionId, setSelectedClassSectionId] = useState(searchParams.get('classSectionId') || '');
    const [selectedSubjectId, setSelectedSubjectId] = useState(searchParams.get('subjectId') || '');
    const [selectedSessionId, setSelectedSessionId] = useState(searchParams.get('sessionId') || '');

    const [user, setUser] = useState<User | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [autoSaving, setAutoSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Date - default today
    const [selectedDate] = useState(() => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    });

    // Holiday
    const [isHoliday, setIsHoliday] = useState(false);
    const [holidayName, setHolidayName] = useState('');

    // Topic
    const [topic, setTopic] = useState('');

    // Attendance history
    const [attendanceHistory, setAttendanceHistory] = useState<Record<string, { status: string; date: string }[]>>({});

    // Auto-save
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const pendingChangesRef = useRef(false);
    const studentsRef = useRef<Student[]>([]);
    const sessionLectureNumberRef = useRef<number | null>(null);

    useEffect(() => { studentsRef.current = students; }, [students]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    // Check if date is a holiday
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;
        fetch('/api/holidays', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
                const holidays: Holiday[] = data.holidays || [];
                const match = holidays.find(h => {
                    const hDate = new Date(h.date);
                    const hStr = `${hDate.getFullYear()}-${String(hDate.getMonth() + 1).padStart(2, '0')}-${String(hDate.getDate()).padStart(2, '0')}`;
                    return hStr === selectedDate;
                });
                if (match) {
                    setIsHoliday(true);
                    setHolidayName(match.name);
                } else {
                    setIsHoliday(false);
                    setHolidayName('');
                }
            })
            .catch(() => {});
    }, [selectedDate]);

    // Init: verify user and load assignments
    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'teacher') { router.replace('/dashboard'); return; }
        setUser(parsed);

        // Fetch assignments for the dropdowns
        fetch(`/api/manage/teacher-assignments?teacherId=${parsed.id}`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
            setAssignments(data.assignments || []);
        })
        .catch(err => console.error("Failed to load assignments", err));
    }, []);

    // Fetch students when selection changes
    useEffect(() => {
        if (!user || !selectedClassSectionId) {
            setStudents([]);
            setLoading(false);
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) return;
        
        loadStudentsAndAttendance(token, user.id, selectedClassSectionId, selectedSubjectId, selectedSessionId);
    }, [selectedClassSectionId, selectedSubjectId, selectedSessionId, user, selectedDate]);

    const loadStudentsAndAttendance = async (token: string, teacherId: string, classSecId: string, subjId: string, sessId: string) => {
        setLoading(true);
        setMessage('');
        try {
            // 1. Fetch students enrolled in this class-section
            const studentsRes = await fetch(
                `/api/attendance/mark?classSectionId=${classSecId}&sessionId=${sessId || ''}&subjectId=${subjId || ''}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (studentsRes.status === 401) { router.replace('/login'); return; }
            const studentsData = await studentsRes.json();

            if (studentsData.error) {
                setMessage(`Error: ${studentsData.error}`);
                setLoading(false);
                setStudents([]);
                return;
            }

            const enrolledStudents: Student[] = (studentsData.students || []).map((s: any) => ({
                id: s.id,
                enrollment_id: s.enrollment_id,
                roll_number: s.roll_number,
                first_name: s.first_name,
                last_name: s.last_name,
                admission_number: s.admission_number,
                attendance: undefined,
            }));

            // 2. Fetch existing attendance for this date
            let existingAttendance: any[] = [];
            try {
                const attRes = await fetch(
                    `/api/attendance?subjectId=${subjId || ''}&date=${selectedDate}&classSectionId=${classSecId}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (attRes.ok) {
                    const attData = await attRes.json();
                    existingAttendance = (attData.records || []).filter((r: any) => r.teacher_id === teacherId);
                }
            } catch {}

            // 3. Merge attendance into students
            const merged = enrolledStudents.map(student => {
                const record = existingAttendance.find((r: any) => r.student_id === student.id);
                return {
                    ...student,
                    attendance: record ? (record.status as 'present' | 'absent') : 'absent'
                };
            });

            // Sort by roll number
            merged.sort((a, b) => (a.roll_number || 0) - (b.roll_number || 0));
            setStudents(merged);

            // 4. Fetch attendance history
            if (merged.length > 0 && subjId) {
                const ids = merged.map(s => s.id).join(',');
                try {
                    const histRes = await fetch(
                        `/api/attendance/history?studentIds=${ids}&subjectId=${subjId}&currentDate=${selectedDate}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    if (histRes.ok) {
                        const histData = await histRes.json();
                        setAttendanceHistory(histData.history || {});
                    }
                } catch {}
            } else {
                setAttendanceHistory({});
            }
        } catch (err) {
            console.error('Load error:', err);
            setMessage('Failed to load students');
        }
        setLoading(false);
    };

    // Toggle attendance
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
        setStudents(prev => prev.map(s => ({ ...s, attendance: 'present' as const })));
        setMessage('');
        triggerAutoSave();
    };

    const markAllAbsent = () => {
        setStudents(prev => prev.map(s => ({ ...s, attendance: 'absent' as const })));
        setMessage('');
        triggerAutoSave();
    };

    // Auto-save with debounce
    const triggerAutoSave = useCallback(() => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        pendingChangesRef.current = true;
        autoSaveTimerRef.current = setTimeout(async () => {
            if (!pendingChangesRef.current) return;
            const token = localStorage.getItem('token');
            if (!token) return;
            const currentStudents = studentsRef.current;
            const attendanceData = currentStudents
                .filter(s => s.attendance)
                .map(s => ({ studentId: s.id, status: s.attendance }));
            if (attendanceData.length === 0) return;
            setAutoSaving(true);
            try {
                const res = await fetch('/api/attendance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        records: attendanceData,
                        subjectId: selectedSubjectId || undefined,
                        date: selectedDate,
                        sessionLectureNumber: sessionLectureNumberRef.current,
                        topic: topic || undefined,
                        classSectionId: selectedClassSectionId,
                        sessionId: selectedSessionId
                    }),
                });
                if (res.ok) {
                    pendingChangesRef.current = false;
                    const data = await res.json();
                    if (data.lectureNumber && sessionLectureNumberRef.current === null) {
                        sessionLectureNumberRef.current = data.lectureNumber;
                    }
                }
            } catch (err) {
                console.error('Auto-save error:', err);
            } finally {
                setAutoSaving(false);
            }
        }, 1500);
    }, [selectedSubjectId, selectedClassSectionId, selectedSessionId, selectedDate, topic]);

    // Manual save
    const saveAttendance = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        const attendanceData = students
            .filter(s => s.attendance)
            .map(s => ({ studentId: s.id, status: s.attendance }));
        if (attendanceData.length === 0) { setMessage('❌ Please mark attendance first'); return; }

        setSaving(true);
        try {
            const res = await fetch('/api/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    records: attendanceData,
                    subjectId: selectedSubjectId || undefined,
                    date: selectedDate,
                    sessionLectureNumber: sessionLectureNumberRef.current,
                    topic: topic || undefined,
                    classSectionId: selectedClassSectionId,
                    sessionId: selectedSessionId
                }),
            });
            if (res.ok) {
                pendingChangesRef.current = false;
                const data = await res.json();
                if (data.lectureNumber) {
                    if (sessionLectureNumberRef.current === null) sessionLectureNumberRef.current = data.lectureNumber;
                }
                setMessage('✅ Attendance saved successfully!');
            } else {
                const data = await res.json();
                setMessage(`Error: ${data.error}`);
            }
        } catch {
            setMessage('❌ Network error — could not save');
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => { return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); }; }, []);

    const presentCount = students.filter(s => s.attendance === 'present').length;
    const absentCount = students.filter(s => s.attendance === 'absent').length;
    const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

    // Deduplicate classes for the dropdown
    const uniqueClasses = Array.from(new Set(assignments.map(a => a.class_section_id))).map(csId => {
        return assignments.find(x => x.class_section_id === csId)!;
    });

    // Subjects for the currently selected class
    const availableSubjects = assignments.filter(a => a.class_section_id === selectedClassSectionId);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {user && <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />}
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <div className="flex flex-col flex-1 pt-16 h-screen overflow-hidden">
                {/* Sub-header with Selection Dropdowns - Dark UI Match */}
                <div className="relative overflow-hidden bg-gray-900 text-white shadow-xl z-10 px-4 py-5 border-b border-gray-800 lg:rounded-b-3xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20"></div>
                    
                    <div className="relative z-10 max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button onClick={() => router.push('/teacher/dashboard')}
                                className="p-2 -ml-2 rounded-lg hover:bg-white/10 transition-colors">
                                <ArrowLeft className="w-5 h-5 text-gray-300 hover:text-white" />
                            </button>
                            <div>
                                <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
                                    <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                                        <ClipboardCheck className="w-5 h-5" />
                                    </span>
                                    Mark Attendance
                                    {autoSaving && <span className="text-sm font-normal text-emerald-400 animate-pulse ml-2">Saving...</span>}
                                </h1>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {todayLabel}
                                </p>
                            </div>
                        </div>

                        {/* Filters & Topic */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                            <select 
                                value={selectedClassSectionId} 
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setSelectedClassSectionId(val);
                                    
                                    if (!val) {
                                        setSelectedSubjectId('');
                                        setSelectedSessionId('');
                                        return;
                                    }

                                    const subjectsForClass = assignments.filter(a => a.class_section_id === val);
                                    if (subjectsForClass.length > 0) {
                                        setSelectedSubjectId(subjectsForClass[0].subject_id);
                                        setSelectedSessionId(subjectsForClass[0].session_id);
                                    } else {
                                        setSelectedSubjectId('');
                                        setSelectedSessionId('');
                                    }
                                }}
                                className="px-3 py-2 border border-gray-700 rounded-lg text-sm font-medium text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-gray-800/80 backdrop-blur-sm flex-1 sm:flex-none sm:w-48 shadow-sm cursor-pointer"
                            >
                                <option value="" className="bg-gray-800">Select Class...</option>
                                {uniqueClasses.map(cls => (
                                    <option key={cls.class_section_id} value={cls.class_section_id} className="bg-gray-800">
                                        {cls.class_section_name}
                                    </option>
                                ))}
                            </select>

                            <select 
                                value={selectedSubjectId} 
                                onChange={(e) => setSelectedSubjectId(e.target.value)}
                                className="px-3 py-2 border border-gray-700 rounded-lg text-sm font-medium text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-gray-800/80 backdrop-blur-sm flex-1 sm:flex-none sm:w-48 shadow-sm cursor-pointer disabled:opacity-50"
                                disabled={!selectedClassSectionId}
                            >
                                <option value="" disabled className="bg-gray-800">Select Subject...</option>
                                {availableSubjects.map(a => (
                                    <option key={a.subject_id} value={a.subject_id} className="bg-gray-800">
                                        {a.subject_name} ({a.subject_code})
                                    </option>
                                ))}
                            </select>

                            <input
                                type="text"
                                placeholder="Enter topic (optional)"
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                className="px-3 py-2 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-gray-800/80 backdrop-blur-sm flex-1 sm:flex-none sm:w-48 shadow-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* Main content */}
                <main className="flex-1 overflow-auto bg-gray-50">
                    {isHoliday ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4">
                            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 text-center max-w-sm">
                                <Calendar className="w-16 h-16 mx-auto mb-4 text-amber-500" />
                                <h2 className="text-2xl font-bold text-amber-700 mb-2">Holiday</h2>
                                <p className="text-lg font-medium text-amber-600">{holidayName}</p>
                                <p className="text-sm text-amber-500 mt-2">Attendance cannot be marked on holidays</p>
                            </div>
                        </div>
                    ) : !selectedClassSectionId ? (
                        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 max-w-sm w-full">
                                <BookOpen className="w-12 h-12 text-blue-100 mx-auto mb-3" />
                                <h3 className="text-lg font-bold text-gray-800">Select a Class</h3>
                                <p className="text-sm text-gray-500 mt-1">Please select a class and subject from the header above to load students.</p>
                            </div>
                        </div>
                    ) : loading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                                <div className="text-sm font-medium text-gray-500">Loading students...</div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Stats Bar */}
                            <div className="max-w-7xl mx-auto px-4 py-4">
                                <div className="bg-white rounded-xl shadow-sm p-3 border border-gray-100">
                                    <div className="flex flex-wrap items-center justify-between gap-4">
                                        <div className="flex items-center gap-4 sm:gap-8 flex-1">
                                            <div className="text-center">
                                                <div className="text-xl md:text-2xl font-black text-gray-900">{students.length}</div>
                                                <div className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-gray-500">Total</div>
                                            </div>
                                            <div className="w-px h-10 bg-gray-200" />
                                            <div className="text-center">
                                                <div className="text-xl md:text-2xl font-black text-emerald-600">{presentCount}</div>
                                                <div className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-gray-500">Present</div>
                                            </div>
                                            <div className="w-px h-10 bg-gray-200" />
                                            <div className="text-center">
                                                <div className="text-xl md:text-2xl font-black text-rose-600">{absentCount}</div>
                                                <div className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-gray-500">Absent</div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 w-full sm:w-auto">
                                            <button onClick={markAllPresent}
                                                className="flex-1 sm:flex-none py-2 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 border border-emerald-200 transition-colors">
                                                <Check className="w-4 h-4" /> All P
                                            </button>
                                            <button onClick={markAllAbsent}
                                                className="flex-1 sm:flex-none py-2 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 border border-rose-200 transition-colors">
                                                <X className="w-4 h-4" /> All A
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {message && (
                                <p className={`mx-4 mb-4 text-sm font-medium px-4 py-3 rounded-xl max-w-7xl mx-auto shadow-sm ${message.includes('Error') || message.includes('error') || message.includes('❌') ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-green-50 text-green-700 border border-green-100'}`}>
                                    {message}
                                </p>
                            )}

                            {/* Student Table */}
                            <div className="max-w-7xl mx-auto px-4 pb-24">
                                {students.length === 0 ? (
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
                                        <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                        <p className="text-gray-500 font-medium">No students found in this class section.</p>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                        <div className="overflow-x-auto">
                                            <table className="w-full">
                                                <thead className="bg-gray-50/80 border-b border-gray-200">
                                                    <tr>
                                                        <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-16">Roll</th>
                                                        <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Student Name</th>
                                                        <th className="px-3 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-24 hidden sm:table-cell">Last 5</th>
                                                        <th className="px-4 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-28">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {students.map((student) => (
                                                        <tr key={student.id} className="hover:bg-blue-50/30 transition-colors group">
                                                            <td className="px-4 py-3 text-sm font-mono font-bold text-gray-600 group-hover:text-blue-600">
                                                                {student.roll_number || '-'}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="text-sm font-bold text-gray-900 group-hover:text-blue-900">
                                                                    {student.first_name} {student.last_name}
                                                                </div>
                                                                <div className="text-xs text-gray-400 mt-0.5 sm:hidden">
                                                                    Last 5: 
                                                                    <span className="inline-flex items-center gap-0.5 ml-1 align-middle">
                                                                        {[...(attendanceHistory[student.id] || [])].reverse().map((record, i) => (
                                                                            <span key={i} title={record.date}
                                                                                className={`w-1.5 h-1.5 rounded-full ${record.status === 'present' ? 'bg-emerald-500' : record.status === 'absent' ? 'bg-rose-500' : 'bg-amber-500'}`}
                                                                            />
                                                                        ))}
                                                                        {!attendanceHistory[student.id]?.length && <span className="text-gray-300">-</span>}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-3 text-center hidden sm:table-cell">
                                                                <div className="flex items-center justify-center gap-1">
                                                                    {[...(attendanceHistory[student.id] || [])].reverse().map((record, i) => (
                                                                        <div key={i} title={record.date}
                                                                            className={`w-2 h-2 rounded-full ${record.status === 'present' ? 'bg-emerald-500' : record.status === 'absent' ? 'bg-rose-500' : 'bg-amber-500'}`}
                                                                    />
                                                                    ))}
                                                                    {!attendanceHistory[student.id]?.length && <span className="text-gray-300 text-xs">-</span>}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex justify-center">
                                                                    <button
                                                                        onClick={() => toggleAttendance(student.id)}
                                                                        className={`w-16 sm:w-20 h-10 sm:h-11 rounded-xl flex items-center justify-center font-black text-lg sm:text-xl transition-all duration-200 border-b-4 active:border-b-0 active:translate-y-1 ${student.attendance === 'present'
                                                                            ? 'bg-emerald-500 text-white border-emerald-700 shadow-sm shadow-emerald-200'
                                                                            : student.attendance === 'absent'
                                                                                ? 'bg-rose-500 text-white border-rose-700 shadow-sm shadow-rose-200'
                                                                                : 'bg-gray-100 text-gray-400 border-gray-300 hover:bg-gray-200 hover:text-gray-500'
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
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </main>

                {/* Floating Save Button */}
                {students.length > 0 && !isHoliday && (
                    <div className="fixed bottom-6 right-6 z-20">
                        <button
                            onClick={saveAttendance}
                            disabled={saving}
                            className="w-14 h-14 bg-gray-900 text-white rounded-full shadow-xl shadow-gray-900/20 hover:bg-gray-800 hover:scale-105 transition-all flex items-center justify-center disabled:opacity-50 disabled:hover:scale-100"
                            title="Save Attendance"
                        >
                            {saving ? (
                                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <Save className="w-6 h-6" />
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function MarkAttendancePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                    <div className="text-sm font-medium text-gray-500">Loading page...</div>
                </div>
            </div>
        }>
            <MarkAttendancePageContent />
        </Suspense>
    );
}
