'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { AccessDenied } from '@/components/ui/access-denied';
import { 
    Check, 
    X, 
    Calendar, 
    Users, 
    Save, 
    BookOpen, 
    ClipboardCheck, 
    ArrowLeft, 
    Search,
    Clock,
    AlertCircle,
    SlidersHorizontal,
    Sparkles
} from 'lucide-react';

interface Student {
    id: string;
    enrollment_id: string;
    roll_number: number | null;
    first_name: string;
    last_name: string;
    admission_number: string | null;
    attendance?: 'present' | 'absent' | 'late' | 'excused';
}

interface User {
    id: string;
    role: string;
    firstName: string;
    lastName: string;
    email: string;
}

interface Session {
    id: string;
    name: string;
    is_current: boolean;
}

interface ClassSection {
    id: string;
    class_id: string;
    class_name: string;
    section_name: string;
    display_name: string;
    session_id: string;
}

interface Subject {
    id: string;
    name: string;
    code: string;
}

export default function AttendancePage() {
    const router = useRouter();

    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    // Masters list
    const [sessions, setSessions] = useState<Session[]>([]);
    const [classSections, setClassSections] = useState<ClassSection[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);

    // Selected filters
    const [selectedSessionId, setSelectedSessionId] = useState('');
    const [selectedClassSectionId, setSelectedClassSectionId] = useState('');
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [selectedPeriod, setSelectedPeriod] = useState<number>(1);
    const [selectedDate, setSelectedDate] = useState(() => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    });

    const [topic, setTopic] = useState('');
    const [students, setStudents] = useState<Student[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    // 1. Initial Load: Authenticate and fetch sessions
    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.replace('/login');
            return;
        }

        try {
            const parsed = JSON.parse(userData);
            if (!['super_admin', 'teacher'].includes(parsed.role)) {
                router.replace('/dashboard');
                return;
            }
            setUser(parsed);
            fetchSessions(token);
        } catch {
            router.replace('/login');
        }
    }, [router]);

    // Fetch Academic Sessions
    const fetchSessions = async (token: string) => {
        try {
            const res = await fetch('/api/manage/sessions', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const sessionList = data.sessions || [];
                setSessions(sessionList);
                
                // Set default/current session
                const current = sessionList.find((s: Session) => s.is_current);
                if (current) {
                    setSelectedSessionId(current.id);
                } else if (sessionList.length > 0) {
                    setSelectedSessionId(sessionList[0].id);
                }
            }
        } catch (err) {
            console.error('Fetch sessions failed', err);
        } finally {
            setLoading(false);
        }
    };

    // 2. Load Class Sections when session changes
    useEffect(() => {
        if (!selectedSessionId) return;
        const token = localStorage.getItem('token');
        if (!token) return;

        fetchClassSections(token, selectedSessionId);
    }, [selectedSessionId]);

    const fetchClassSections = async (token: string, sessionId: string) => {
        try {
            const res = await fetch(`/api/manage/class-sections?sessionId=${sessionId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setClassSections(data.classSections || []);
                setSelectedClassSectionId('');
                setStudents([]);
                setSubjects([]);
            }
        } catch (err) {
            console.error('Fetch class sections failed', err);
        }
    };

    // 3. Load Subjects and Students when class section changes
    useEffect(() => {
        if (!selectedClassSectionId) {
            setSubjects([]);
            setStudents([]);
            return;
        }
        const token = localStorage.getItem('token');
        if (!token) return;

        const classSec = classSections.find(cs => cs.id === selectedClassSectionId);
        if (classSec) {
            fetchSubjects(token, classSec.class_id, selectedSessionId);
            loadAttendanceSheet(token, selectedClassSectionId, selectedSessionId);
        }
    }, [selectedClassSectionId, selectedDate, selectedSubjectId, selectedPeriod, classSections, selectedSessionId]);

    const fetchSubjects = async (token: string, classId: string, sessionId: string) => {
        try {
            const res = await fetch(`/api/manage/subjects?classId=${classId}&sessionId=${sessionId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSubjects(data.subjects || []);
            }
        } catch (err) {
            console.error('Fetch subjects failed', err);
        }
    };

    // 4. Load attendance sheet (enrolled students + existing marks)
    const loadAttendanceSheet = async (token: string, classSectionId: string, sessionId: string) => {
        setLoadingStudents(true);
        setMessage('');
        try {
            // Load enrolled students
            const enrolledRes = await fetch(
                `/api/attendance/mark?classSectionId=${classSectionId}&sessionId=${sessionId}&subjectId=${selectedSubjectId || ''}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!enrolledRes.ok) throw new Error('Failed to load students');
            const enrolledData = await enrolledRes.json();
            const enrolledList: Student[] = (enrolledData.students || []).map((s: any) => ({
                id: s.id,
                enrollment_id: s.enrollment_id,
                roll_number: s.roll_number,
                first_name: s.first_name,
                last_name: s.last_name,
                admission_number: s.admission_number,
                attendance: undefined
            }));

            // Load existing marks
            const marksRes = await fetch(
                `/api/attendance?date=${selectedDate}&classSectionId=${classSectionId}&subjectId=${selectedSubjectId || ''}&periodNumber=${selectedPeriod}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            let existingMarks: any[] = [];
            if (marksRes.ok) {
                const marksData = await marksRes.json();
                existingMarks = marksData.records || [];
                // Retrieve topic if recorded
                if (existingMarks.length > 0 && existingMarks[0].topic) {
                    setTopic(existingMarks[0].topic);
                } else {
                    setTopic('');
                }
            }

            // Merge
            const merged = enrolledList.map(student => {
                const record = existingMarks.find(m => m.student_id === student.id);
                return {
                    ...student,
                    attendance: record ? record.status : 'present' // default to present if no record
                };
            });

            merged.sort((a, b) => (a.roll_number || 0) - (b.roll_number || 0));
            setStudents(merged);
        } catch (err) {
            console.error(err);
            setMessage('❌ Error loading attendance sheet');
        } finally {
            setLoadingStudents(false);
        }
    };

    // Toggle single attendance status
    const toggleStatus = (studentId: string, status: 'present' | 'absent' | 'late' | 'excused') => {
        setStudents(prev => prev.map(s => 
            s.id === studentId ? { ...s, attendance: status } : s
        ));
    };

    const markAllStatus = (status: 'present' | 'absent') => {
        setStudents(prev => prev.map(s => ({ ...s, attendance: status })));
    };

    // Save Attendance
    const saveAttendance = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;

        if (!selectedClassSectionId || !selectedSessionId) {
            setMessage('❌ Please select a class and section first');
            return;
        }

        const attendanceData = students
            .filter(s => s.attendance)
            .map(s => ({ studentId: s.id, status: s.attendance }));

        if (attendanceData.length === 0) {
            setMessage('❌ No student attendance marked');
            return;
        }

        setSaving(true);
        setMessage('');

        try {
            const res = await fetch('/api/attendance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    records: attendanceData,
                    subjectId: selectedSubjectId || undefined,
                    date: selectedDate,
                    classSectionId: selectedClassSectionId,
                    sessionId: selectedSessionId,
                    sessionLectureNumber: selectedPeriod,
                    topic: topic || undefined
                })
            });

            if (res.ok) {
                setMessage('✅ Attendance saved successfully!');
                // Reload
                loadAttendanceSheet(token, selectedClassSectionId, selectedSessionId);
            } else {
                const errData = await res.json();
                setMessage(`❌ Save failed: ${errData.error || 'Server error'}`);
            }
        } catch (err) {
            console.error(err);
            setMessage('❌ Network error — could not save');
        } finally {
            setSaving(false);
        }
    };

    // Filter students by search query
    const filteredStudents = useMemo(() => {
        if (!searchQuery) return students;
        const q = searchQuery.toLowerCase();
        return students.filter(s => 
            s.first_name.toLowerCase().includes(q) || 
            s.last_name.toLowerCase().includes(q) || 
            String(s.roll_number).includes(q)
        );
    }, [students, searchQuery]);

    const presentCount = students.filter(s => s.attendance === 'present').length;
    const absentCount = students.filter(s => s.attendance === 'absent').length;
    const lateCount = students.filter(s => s.attendance === 'late').length;
    const excusedCount = students.filter(s => s.attendance === 'excused').length;
    const attendancePercentage = students.length > 0 
        ? ((presentCount + lateCount) / students.length * 100).toFixed(1) 
        : '0.0';

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium text-sm">Loading details...</p>
                </div>
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">
                
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                            <span className="p-2 rounded-xl bg-blue-500 text-white shadow-md shadow-blue-200">
                                <ClipboardCheck className="w-6 h-6" />
                            </span>
                            Attendance Hub
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">Manage and track student daily/subject attendance records.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="inline-flex items-center gap-2 px-4 h-10 bg-white hover:bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-700 rounded-xl shadow-sm transition-all"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Dashboard
                        </button>
                    </div>
                </div>

                {/* Filters Grid */}
                <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm mb-6">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                        <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Attendance Scope & Filters</h2>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        {/* Session */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Academic Session</label>
                            <select
                                value={selectedSessionId}
                                onChange={(e) => setSelectedSessionId(e.target.value)}
                                className="h-11 rounded-xl border border-gray-200 px-3.5 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            >
                                <option value="">Select Session</option>
                                {sessions.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} {s.is_current ? '(Current)' : ''}</option>
                                ))}
                            </select>
                        </div>

                        {/* Class & Section */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Class & Section</label>
                            <select
                                value={selectedClassSectionId}
                                onChange={(e) => setSelectedClassSectionId(e.target.value)}
                                className="h-11 rounded-xl border border-gray-200 px-3.5 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:opacity-50"
                                disabled={!selectedSessionId}
                            >
                                <option value="">Select Class & Section</option>
                                {classSections.map(cs => (
                                    <option key={cs.id} value={cs.id}>{cs.display_name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Subject */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Subject (Optional)</label>
                            <select
                                value={selectedSubjectId}
                                onChange={(e) => setSelectedSubjectId(e.target.value)}
                                className="h-11 rounded-xl border border-gray-200 px-3.5 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:opacity-50"
                                disabled={!selectedClassSectionId}
                            >
                                <option value="">General Daily Attendance</option>
                                {subjects.map(sub => (
                                    <option key={sub.id} value={sub.id}>{sub.name} ({sub.code})</option>
                                ))}
                            </select>
                        </div>

                        {/* Period */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Period / Slot</label>
                            <select
                                value={selectedPeriod}
                                onChange={(e) => setSelectedPeriod(Number(e.target.value))}
                                className="h-11 rounded-xl border border-gray-200 px-3.5 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            >
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(p => (
                                    <option key={p} value={p}>Period {p}</option>
                                ))}
                            </select>
                        </div>

                        {/* Date */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Date</label>
                            <input
                                type="date"
                                value={selectedDate}
                                max={new Date().toISOString().split('T')[0]}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="h-11 rounded-xl border border-gray-200 px-3.5 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            />
                        </div>
                    </div>

                    {/* Optional Topic Field */}
                    {selectedClassSectionId && (
                        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 border-t border-gray-50 pt-4">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Topic Taught</label>
                            <input
                                type="text"
                                placeholder="Enter details or topic for this period (optional)..."
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                className="flex-1 h-10 px-4 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    )}
                </div>

                {/* Main Content Area */}
                {!selectedClassSectionId ? (
                    <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200 p-8 shadow-sm">
                        <SlidersHorizontal className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-gray-800 mb-1">No Class Selected</h3>
                        <p className="text-sm text-gray-500 max-w-sm mx-auto">Please select an academic session and a class-section from the filters above to mark or view attendance sheet.</p>
                    </div>
                ) : loadingStudents ? (
                    <div className="bg-white rounded-3xl p-16 border border-gray-100 shadow-sm flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-sm text-gray-400 font-medium">Fetching students sheet...</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Stats Dashboard */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-center">
                                <div className="text-2xl font-black text-gray-900">{students.length}</div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Total Enrolled</div>
                            </div>
                            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 shadow-sm text-center">
                                <div className="text-2xl font-black text-emerald-700">{presentCount}</div>
                                <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mt-1">Present</div>
                            </div>
                            <div className="bg-red-50/50 border border-red-100 rounded-2xl p-4 shadow-sm text-center">
                                <div className="text-2xl font-black text-red-700">{absentCount}</div>
                                <div className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-1">Absent</div>
                            </div>
                            <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 shadow-sm text-center">
                                <div className="text-2xl font-black text-amber-700">{lateCount}</div>
                                <div className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mt-1">Late</div>
                            </div>
                            <div className="bg-blue-50/50 border border-blue-100 rounded-2xl col-span-2 md:col-span-1 p-4 shadow-sm text-center">
                                <div className="text-2xl font-black text-blue-700">{attendancePercentage}%</div>
                                <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mt-1">Attendance Rate</div>
                            </div>
                        </div>

                        {/* Message Banner */}
                        {message && (
                            <div className={`p-4 rounded-2xl text-sm font-semibold flex items-center gap-2 shadow-sm border ${
                                message.includes('❌') 
                                ? 'bg-red-50 border-red-100 text-red-700' 
                                : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                            }`}>
                                {message}
                            </div>
                        )}

                        {/* Student Search & Action Bar */}
                        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                                {/* Search Input */}
                                <div className="relative flex-1 max-w-md">
                                    <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Search student by name or roll number..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full h-10 pl-10 pr-4 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                    />
                                </div>

                                {/* Quick Bulk Actions */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => markAllStatus('present')}
                                        className="h-10 px-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold text-emerald-700 rounded-xl flex items-center gap-1.5 transition-all"
                                    >
                                        <Check className="w-4 h-4" />
                                        Mark All Present
                                    </button>
                                    <button
                                        onClick={() => markAllStatus('absent')}
                                        className="h-10 px-4 bg-red-50 hover:bg-red-100 border border-red-200 text-xs font-bold text-red-700 rounded-xl flex items-center gap-1.5 transition-all"
                                    >
                                        <X className="w-4 h-4" />
                                        Mark All Absent
                                    </button>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto rounded-2xl border border-gray-100">
                                <table className="w-full border-collapse text-left">
                                    <thead className="bg-slate-50 border-b border-gray-100">
                                        <tr>
                                            <th className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider w-24">Roll No</th>
                                            <th className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Student Name</th>
                                            <th className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider w-40">Admission No</th>
                                            <th className="px-5 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-center w-72">Attendance Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {filteredStudents.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-5 py-12 text-center text-sm text-gray-400 font-medium">
                                                    No matching students found in this section.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredStudents.map((student) => (
                                                <tr key={student.id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-5 py-4 text-sm font-mono font-bold text-gray-800">
                                                        {student.roll_number || '-'}
                                                    </td>
                                                    <td className="px-5 py-4 text-sm font-semibold text-gray-900">
                                                        {student.first_name} {student.last_name}
                                                    </td>
                                                    <td className="px-5 py-4 text-sm font-medium text-gray-500">
                                                        {student.admission_number || 'N/A'}
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            {/* Present */}
                                                            <button
                                                                onClick={() => toggleStatus(student.id, 'present')}
                                                                className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all border ${
                                                                    student.attendance === 'present'
                                                                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                                                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                P
                                                            </button>

                                                            {/* Absent */}
                                                            <button
                                                                onClick={() => toggleStatus(student.id, 'absent')}
                                                                className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all border ${
                                                                    student.attendance === 'absent'
                                                                    ? 'bg-red-500 border-red-500 text-white shadow-sm'
                                                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                A
                                                            </button>

                                                            {/* Late */}
                                                            <button
                                                                onClick={() => toggleStatus(student.id, 'late')}
                                                                className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all border ${
                                                                    student.attendance === 'late'
                                                                    ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                                                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                L
                                                            </button>

                                                            {/* Excused */}
                                                            <button
                                                                onClick={() => toggleStatus(student.id, 'excused')}
                                                                className={`h-9 px-3.5 rounded-xl text-xs font-bold transition-all border ${
                                                                    student.attendance === 'excused'
                                                                    ? 'bg-blue-500 border-blue-500 text-white shadow-sm'
                                                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                E
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Save Actions */}
                        {students.length > 0 && (
                            <div className="flex items-center justify-end gap-3 pb-16">
                                <button
                                    onClick={saveAttendance}
                                    disabled={saving}
                                    className="h-12 px-6 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-sm font-bold text-white rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 active:translate-y-0"
                                >
                                    {saving ? (
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4" />
                                            Save Attendance Sheet
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
