'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    ClipboardCheck, BookOpen, BarChart3, CalendarDays, PenLine,
    Award, CheckCircle, Clock, AlertCircle, ChevronRight, Loader2, MapPin, ShieldAlert, Lock,
    UserCog, GraduationCap, Send, IndianRupee
} from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: string; }
interface Assignment {
    id: string; class_section_name: string; subject_name: string; subject_code: string;
    class_section_id: string; subject_id: string; session_id: string; is_class_teacher: boolean;
}
interface AttendanceStatus { class_section_id: string; subject_id: string; marked: boolean; date: string; }

export default function TeacherDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [attendanceToday, setAttendanceToday] = useState<AttendanceStatus[]>([]);
    const [checkInStatus, setCheckInStatus] = useState<{checked_in: boolean, check_in_time?: string, check_out_time?: string, status?: string} | null>(null);
    const [checkingIn, setCheckingIn] = useState(false);
    const [locationError, setLocationError] = useState('');
    const [isHoliday, setIsHoliday] = useState(false);
    const [holidayName, setHolidayName] = useState('');

    const [showPreModal, setShowPreModal] = useState(false);
    const [showBlockedModal, setShowBlockedModal] = useState(false);
    const [showDeniedModal, setShowDeniedModal] = useState(false);
    const [pendingAction, setPendingAction] = useState<'check_in' | 'check_out' | null>(null);

    const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'teacher') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchData(parsed.id, token);
    }, [router]);

    const fetchData = async (userId: string, token: string) => {
        setLoading(true);
        try {
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const todayDate = new Date();
            const isSunday = todayDate.getDay() === 0;

            const [assignRes, attendRes, holidayRes] = await Promise.all([
                fetch(`/api/manage/teacher-assignments?teacherId=${userId}`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/sms/attendance?date=${today}&teacherId=${userId}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
                fetch(`/api/holidays?month=${todayDate.getMonth() + 1}&year=${todayDate.getFullYear()}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
            ]);
            const assignData = await assignRes.json();
            setAssignments(assignData.assignments || []);

            if (attendRes && attendRes.ok) {
                const attendData = await attendRes.json();
                const records = attendData.records || attendData.attendance || [];
                // Build a set of class_section_id+subject_id combos that have been marked
                const markedSet = new Set<string>();
                for (const r of records) {
                    if (r.class_section_id && r.subject_id) {
                        markedSet.add(`${r.class_section_id}__${r.subject_id}`);
                    }
                }
                setAttendanceToday(Array.from(markedSet).map(k => {
                    const [csId, subId] = k.split('__');
                    return { class_section_id: csId, subject_id: subId, marked: true, date: today };
                }));
            }

            // Check if today is a holiday (Sunday or school-defined)
            if (isSunday) {
                setIsHoliday(true);
                setHolidayName('Sunday');
            } else if (holidayRes && holidayRes.ok) {
                const holidayData = await holidayRes.json();
                const holidays = holidayData.holidays || [];
                const todayHoliday = holidays.find((h: any) => h.date === today || h.date?.split('T')[0] === today);
                if (todayHoliday) {
                    setIsHoliday(true);
                    setHolidayName(todayHoliday.name || 'School Holiday');
                }
            }

            // Fetch today's check-in status
            try {
                const statusRes = await fetch(`/api/staff-attendance?date=${today}`, { headers: { Authorization: `Bearer ${token}` } });
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    const myRecord = statusData.records?.find((r: any) => r.user_id === userId);
                    if (myRecord) {
                        setCheckInStatus({
                            checked_in: !!myRecord.check_in_time,
                            check_in_time: myRecord.check_in_time,
                            check_out_time: myRecord.check_out_time,
                            status: myRecord.status
                        });
                    } else {
                        setCheckInStatus({ checked_in: false });
                    }
                }
            } catch { /* silent */ }
        } catch { /* silent */ }
        setLoading(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const initiateCheckIn = (action: 'check_in' | 'check_out') => {
        setPendingAction(action);
        const isSecure = typeof window !== 'undefined' && window.isSecureContext;
        const hasGeolocation = typeof navigator !== 'undefined' && navigator.geolocation;

        if (!hasGeolocation || !isSecure) {
            setShowBlockedModal(true);
            return;
        }

        setShowPreModal(true);
    };

    const triggerActualCheckIn = async () => {
        if (!pendingAction) return;
        const action = pendingAction;
        setShowPreModal(false);
        setShowDeniedModal(false);
        setCheckingIn(true);
        setLocationError('');
        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                });
            });
            const { latitude, longitude } = position.coords;
            const token = localStorage.getItem('token');
            const res = await fetch('/api/staff-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ latitude, longitude, action })
            });
            const data = await res.json();
            if (!res.ok) {
                setLocationError(data.error || 'Failed to mark attendance');
            } else {
                setCheckInStatus({
                    checked_in: true,
                    check_in_time: data.record?.check_in_time || new Date().toISOString(),
                    check_out_time: action === 'check_out' ? new Date().toISOString() : undefined,
                    status: data.record?.status
                });
                setLocationError('');
            }
        } catch (err: any) {
            if (err.code === 1) {
                setLocationError('Location access denied. Please allow location access in your browser settings to mark attendance.');
                setShowDeniedModal(true);
            }
            else if (err.code === 2) setLocationError('Unable to determine your location. Please try again.');
            else if (err.code === 3) setLocationError('Location request timed out. Please try again.');
            else setLocationError('Failed to get location. Please try again.');
        }
        setCheckingIn(false);
    };

    const isMarkedToday = (csId: string, subId: string) => {
        return attendanceToday.some(a => a.class_section_id === csId && a.subject_id === subId);
    };

    const markedCount = assignments.filter(a => isMarkedToday(a.class_section_id, a.subject_id)).length;
    const pendingCount = assignments.length - markedCount;
    const classTeacherOf = assignments.filter(a => a.is_class_teacher);

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">
                {/* Welcome Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-8 mb-8 shadow-xl">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
                    <div className="relative z-10">
                        <h1 className="text-xl font-bold mb-1">Hello, {user?.firstName}! 👋</h1>
                        <p className="text-blue-200 text-sm">Ready to mark attendance and manage your classes.</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium">
                                <CalendarDays className="w-3.5 h-3.5" /> {todayLabel}
                            </span>
                            {!loading && (
                                <>
                                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium">
                                        <BookOpen className="w-3.5 h-3.5" /> {assignments.length} subject{assignments.length !== 1 ? 's' : ''} assigned
                                    </span>
                                    {classTeacherOf.length > 0 && (
                                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-xs font-medium text-emerald-300">
                                            <CheckCircle className="w-3.5 h-3.5" /> Class Teacher: {classTeacherOf.map(a => a.class_section_name).join(', ')}
                                        </span>
                                    )}
                                    {isHoliday && (
                                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-xs font-medium text-rose-300">
                                            🏖️ Holiday: {holidayName}
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* =============================================
                    SECTION 1: MY ATTENDANCE (Teacher Portal)
                ============================================= */}
                <div className="mb-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-xl bg-emerald-100">
                            <UserCog className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-800">My Attendance</h2>
                            <p className="text-xs text-gray-500">Your personal check-in & leave management</p>
                        </div>
                    </div>

                    {/* Staff Attendance Check-In Widget */}
                    {!loading && (
                        <div className="mb-4 bg-white rounded-2xl border border-emerald-200 p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className={`p-2 rounded-xl ${
                                        isHoliday ? 'bg-rose-100 text-rose-600' :
                                        checkInStatus?.status === 'on_leave' ? 'bg-blue-100 text-blue-600' :
                                        checkInStatus?.checked_in ? 'bg-emerald-100 text-emerald-600' : 
                                        'bg-amber-100 text-amber-600'
                                    }`}>
                                        <MapPin className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-sm">Today&apos;s Attendance</h3>
                                        <p className="text-xs text-gray-500">
                                            {isHoliday
                                                ? `🏖️ Today is ${holidayName} — attendance marking is disabled`
                                                : checkInStatus?.status === 'on_leave'
                                                    ? 'You are on approved leave today'
                                                    : checkInStatus?.checked_in && checkInStatus.check_in_time
                                                        ? `Checked in at ${new Date(checkInStatus.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}${checkInStatus.check_out_time ? ` · Out at ${new Date(checkInStatus.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : ''}`
                                                        : 'Not checked in yet'
                                            }
                                        </p>
                                    </div>
                                </div>
                                {checkInStatus?.status && !isHoliday && (
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                        checkInStatus.status === 'present' ? 'bg-emerald-100 text-emerald-700' :
                                        checkInStatus.status === 'late' ? 'bg-amber-100 text-amber-700' :
                                        checkInStatus.status === 'on_leave' ? 'bg-blue-100 text-blue-700' :
                                        'bg-gray-100 text-gray-700'
                                    }`}>
                                        {checkInStatus.status === 'present' ? '✓ On Time' : 
                                         checkInStatus.status === 'late' ? '⚠ Late' : 
                                         checkInStatus.status === 'on_leave' ? '✈ On Leave' : 
                                         checkInStatus.status}
                                    </span>
                                )}
                                {isHoliday && (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                                        🏖️ Holiday
                                    </span>
                                )}
                            </div>
                            {locationError && (
                                <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
                                    {locationError}
                                </div>
                            )}
                            <div className="flex gap-2">
                                {isHoliday ? (
                                    <div className="flex-1 py-3 bg-rose-50 text-rose-600 font-semibold rounded-xl text-sm text-center border border-rose-100 flex items-center justify-center gap-2">
                                        🏖️ Holiday — Check-in Disabled
                                    </div>
                                ) : checkInStatus?.status === 'on_leave' ? (
                                    <div className="flex-1 py-3 bg-blue-50 text-blue-600 font-semibold rounded-xl text-sm text-center border border-blue-100 flex items-center justify-center gap-2">
                                        ✈️ On Approved Leave
                                    </div>
                                ) : !checkInStatus?.checked_in ? (
                                    <button onClick={() => initiateCheckIn('check_in')} disabled={checkingIn}
                                        className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer">
                                        {checkingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                                        {checkingIn ? 'Getting Location...' : '📍 Check In'}
                                    </button>
                                ) : !checkInStatus?.check_out_time ? (
                                    <button onClick={() => initiateCheckIn('check_out')} disabled={checkingIn}
                                        className="flex-1 py-3 bg-gradient-to-r from-rose-500 to-red-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer">
                                        {checkingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                                        {checkingIn ? 'Getting Location...' : '📍 Check Out'}
                                    </button>
                                ) : (
                                    <div className="flex-1 py-3 bg-gray-50 text-gray-500 font-medium rounded-xl text-sm text-center">
                                        ✅ Attendance completed for today
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* My Attendance Quick Actions */}
                    {!loading && (
                        <div className="grid grid-cols-3 gap-3">
                            <div onClick={() => router.push('/teacher/my-attendance')} className="bg-white border border-emerald-100 rounded-2xl p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group">
                                <div className="p-2 w-fit rounded-xl bg-emerald-50 text-emerald-600 mb-2 group-hover:scale-110 transition-transform">
                                    <CalendarDays className="w-5 h-5" />
                                </div>
                                <p className="font-bold text-gray-900 text-sm">My Attendance Calendar</p>
                                <p className="text-xs text-gray-500 mt-0.5">View attendance history</p>
                            </div>
                            <div onClick={() => router.push('/teacher/apply-leave')} className="bg-white border border-teal-100 rounded-2xl p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group">
                                <div className="p-2 w-fit rounded-xl bg-teal-50 text-teal-600 mb-2 group-hover:scale-110 transition-transform">
                                    <Send className="w-5 h-5" />
                                </div>
                                <p className="font-bold text-gray-900 text-sm">Apply for Leave</p>
                                <p className="text-xs text-gray-500 mt-0.5">Request time off</p>
                            </div>
                            <div onClick={() => router.push('/teacher/salary')} className="bg-white border border-amber-100 rounded-2xl p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group">
                                <div className="p-2 w-fit rounded-xl bg-amber-50 text-amber-600 mb-2 group-hover:scale-110 transition-transform">
                                    <IndianRupee className="w-5 h-5" />
                                </div>
                                <p className="font-bold text-gray-900 text-sm">My Salary</p>
                                <p className="text-xs text-gray-500 mt-0.5">View salary & payments</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* =============================================
                    SECTION 2: CLASSROOM ATTENDANCE (Student Portal)
                ============================================= */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-xl bg-blue-100">
                            <GraduationCap className="w-5 h-5 text-blue-700" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-800">Classroom Attendance</h2>
                            <p className="text-xs text-gray-500">Mark student attendance & manage academics</p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center py-16 gap-3">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                            <p className="text-gray-400 text-sm">Loading your dashboard...</p>
                        </div>
                    ) : (
                        <>
                            {/* Holiday Banner for Student Attendance */}
                            {isHoliday && (
                                <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3">
                                    <div className="p-2 bg-rose-100 rounded-xl text-rose-600">
                                        <CalendarDays className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-rose-800">Today is {holidayName}</p>
                                        <p className="text-xs text-rose-600">Student attendance marking is disabled for holidays.</p>
                                    </div>
                                </div>
                            )}

                            {/* Today's Stats */}
                            <div className="grid grid-cols-3 gap-3 mb-6">
                                <div className="bg-white rounded-2xl border border-blue-100 p-4">
                                    <div className="flex items-center gap-2 mb-1"><BookOpen className="w-4 h-4 text-blue-500" /><span className="text-xs text-gray-500 font-medium">Assigned</span></div>
                                    <div className="text-2xl font-bold text-gray-900">{assignments.length}</div>
                                    <div className="text-xs text-gray-400">Classes / Subjects</div>
                                </div>
                                <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4">
                                    <div className="flex items-center gap-2 mb-1"><CheckCircle className="w-4 h-4 text-emerald-500" /><span className="text-xs text-emerald-600 font-medium">Marked Today</span></div>
                                    <div className="text-2xl font-bold text-emerald-700">{markedCount}</div>
                                    <div className="text-xs text-emerald-600">Attendance done</div>
                                </div>
                                <div className={`rounded-2xl border p-4 ${pendingCount > 0 ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        {pendingCount > 0 ? <Clock className="w-4 h-4 text-amber-500" /> : <CheckCircle className="w-4 h-4 text-gray-400" />}
                                        <span className={`text-xs font-medium ${pendingCount > 0 ? 'text-amber-600' : 'text-gray-500'}`}>Pending</span>
                                    </div>
                                    <div className={`text-2xl font-bold ${pendingCount > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{pendingCount}</div>
                                    <div className="text-xs text-gray-400">{pendingCount > 0 ? 'Yet to mark' : 'All done!'}</div>
                                </div>
                            </div>

                            {/* Student Quick Actions */}
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Quick Actions</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                                <div onClick={() => !isHoliday && router.push('/attendance/mark')} className={`bg-white border border-blue-100 rounded-2xl p-4 transition-all group ${isHoliday ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md hover:-translate-y-0.5'}`}>
                                    <div className="p-2 w-fit rounded-xl bg-blue-50 text-blue-600 mb-2 group-hover:scale-110 transition-transform">
                                        <ClipboardCheck className="w-5 h-5" />
                                    </div>
                                    <p className="font-bold text-gray-900 text-sm">Mark Attendance</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{isHoliday ? 'Disabled (Holiday)' : 'Select class & subject'}</p>
                                </div>
                                <div onClick={() => router.push('/marks/entry')} className="bg-white border border-amber-100 rounded-2xl p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group">
                                    <div className="p-2 w-fit rounded-xl bg-amber-50 text-amber-600 mb-2 group-hover:scale-110 transition-transform">
                                        <PenLine className="w-5 h-5" />
                                    </div>
                                    <p className="font-bold text-gray-900 text-sm">Marks Entry</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Enter exam marks</p>
                                </div>
                                <div onClick={() => router.push('/manage/co-scholastic')} className="bg-white border border-teal-100 rounded-2xl p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group">
                                    <div className="p-2 w-fit rounded-xl bg-teal-50 text-teal-600 mb-2 group-hover:scale-110 transition-transform">
                                        <Award className="w-5 h-5" />
                                    </div>
                                    <p className="font-bold text-gray-900 text-sm">Co-Scholastic</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Enter activity grades</p>
                                </div>
                                <div onClick={() => router.push('/reports')} className="bg-white border border-sky-100 rounded-2xl p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group">
                                    <div className="p-2 w-fit rounded-xl bg-sky-50 text-sky-600 mb-2 group-hover:scale-110 transition-transform">
                                        <BarChart3 className="w-5 h-5" />
                                    </div>
                                    <p className="font-bold text-gray-900 text-sm">View Reports</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Attendance history</p>
                                </div>
                            </div>

                            {/* My Classes */}
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">My Assigned Classes</h3>
                            {assignments.length === 0 ? (
                                <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                                    <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 font-medium">No classes assigned yet.</p>
                                    <p className="text-gray-400 text-sm mt-1">Contact your school administrator.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {assignments.map(assignment => {
                                        const marked = isMarkedToday(assignment.class_section_id, assignment.subject_id);
                                        return (
                                            <div key={assignment.id}
                                                onClick={() => !isHoliday && router.push('/attendance/mark')}
                                                className={`bg-white rounded-xl border p-4 flex items-center justify-between transition-all ${
                                                    isHoliday
                                                        ? 'border-gray-100 opacity-60 cursor-not-allowed'
                                                        : marked
                                                            ? 'border-emerald-200 cursor-pointer hover:shadow-md'
                                                            : 'border-gray-100 hover:border-blue-200 cursor-pointer hover:shadow-md'
                                                }`}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${marked ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                                                        {marked ? <CheckCircle className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="font-bold text-gray-900 text-sm">{assignment.class_section_name}</h3>
                                                            {assignment.is_class_teacher && (
                                                                <span className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold">CT</span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-gray-500">{assignment.subject_name} ({assignment.subject_code})</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isHoliday ? (
                                                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">Holiday</span>
                                                    ) : marked ? (
                                                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">Done ✓</span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">Pending</span>
                                                    )}
                                                    <ChevronRight className="w-4 h-4 text-gray-300" />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </main>

            {/* Modal: Pre-Permission Request */}
            {showPreModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 flex flex-col items-center text-center transform transition-all duration-300 scale-100 animate-scale-in">
                        <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 mb-4 ring-8 ring-blue-50/50">
                            <MapPin className="w-6 h-6 animate-pulse" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Location Required</h3>
                        <p className="text-xs text-gray-500 leading-relaxed mb-6">
                            YSM Attendance needs your device's location to verify if you are within the school boundary. Please confirm to proceed.
                        </p>
                        <div className="flex flex-col gap-2 w-full">
                            <button
                                type="button"
                                onClick={triggerActualCheckIn}
                                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                            >
                                Allow & Mark Attendance
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowPreModal(false)}
                                className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold transition-all border border-gray-150 cursor-pointer"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: GPS Access Restricted (Non-Secure HTTP) */}
            {showBlockedModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 flex flex-col items-center text-center transform transition-all duration-300 scale-100 animate-scale-in">
                        <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mb-4 ring-8 ring-amber-50/50">
                            <ShieldAlert className="w-6 h-6 animate-bounce" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">GPS Access Restricted</h3>
                        <p className="text-xs text-gray-500 leading-relaxed mb-6 border-b border-gray-100 pb-4">
                            Mobile browsers require a secure <strong>HTTPS</strong> connection to access device location. Because you are on a non-secure local IP, automatic capture is blocked.
                        </p>
                        <p className="text-[10px] text-amber-600 mt-4 leading-normal">
                            💡 Please contact the Super Admin to provide a secure HTTPS link (e.g. ngrok or production deployment) or mark your attendance from a secure desktop browser.
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowBlockedModal(false)}
                            className="mt-6 w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                        >
                            Okay, Got It
                        </button>
                    </div>
                </div>
            )}

            {/* Modal: Permission Denied */}
            {showDeniedModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 flex flex-col items-center text-center transform transition-all duration-300 scale-100 animate-scale-in">
                        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4 ring-8 ring-red-50/50">
                            <Lock className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Permission Denied</h3>
                        <p className="text-xs text-gray-500 leading-relaxed mb-6">
                            Location permission was denied. Please allow location access in your browser settings to automatically mark your attendance.
                        </p>
                        <div className="flex flex-col gap-2 w-full">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowDeniedModal(false);
                                    triggerActualCheckIn();
                                }}
                                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                            >
                                Retry Check-in
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowDeniedModal(false)}
                                className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold transition-all border border-gray-150 cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
