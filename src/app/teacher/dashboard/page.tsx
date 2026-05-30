'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    ClipboardCheck, BookOpen, BarChart3, CalendarDays, PenLine,
    Award, CheckCircle, Clock, ChevronRight, Loader2, MapPin,
    UserCog, GraduationCap, Send, IndianRupee, TrendingUp
} from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: string; }
interface Assignment {
    id: string; class_section_name: string; subject_name: string; subject_code: string;
    class_section_id: string; subject_id: string; session_id: string; is_class_teacher: boolean;
}

interface HubCard {
    id: string;
    title: string;
    description: string;
    href: string;
    iconComponent: React.ReactNode;
    gradient: string;
    textColor: string;
    borderColor: string;
    badge?: string | number;
}

export default function TeacherDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [checkInStatus, setCheckInStatus] = useState<{checked_in: boolean, check_in_time?: string, check_out_time?: string, status?: string} | null>(null);
    const [isHoliday, setIsHoliday] = useState(false);
    const [holidayName, setHolidayName] = useState('');

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

            const [assignRes, holidayRes] = await Promise.all([
                fetch(`/api/manage/teacher-assignments?teacherId=${userId}`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/holidays?month=${todayDate.getMonth() + 1}&year=${todayDate.getFullYear()}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
            ]);
            const assignData = await assignRes.json();
            setAssignments(assignData.assignments || []);

            // Check if today is a holiday
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

    const classTeacherOf = assignments.filter(a => a.is_class_teacher);

    // Get attendance status label for badge
    const getAttendanceBadge = (): string | undefined => {
        if (isHoliday) return '🏖️ Holiday';
        if (!checkInStatus) return undefined;
        if (checkInStatus.status === 'on_leave') return '✈️ On Leave';
        if (checkInStatus.check_out_time) return '✅ Done';
        if (checkInStatus.checked_in) return '🟢 Checked In';
        return '⏳ Pending';
    };

    // ===== Hub Cards: My Attendance Section =====
    const myAttendanceCards: HubCard[] = [
        {
            id: 'my-attendance', title: 'My Attendance', description: 'Check-in, check-out & attendance calendar',
            href: '/teacher/my-attendance', iconComponent: <MapPin className="w-6 h-6" />,
            gradient: 'from-emerald-100 to-teal-100', textColor: 'text-emerald-700', borderColor: 'border-emerald-200',
            badge: getAttendanceBadge()
        },
        {
            id: 'my-performance', title: 'My Performance', description: 'Teaching & attendance analytics',
            href: '/reports/my-performance', iconComponent: <TrendingUp className="w-6 h-6" />,
            gradient: 'from-indigo-100 to-violet-100', textColor: 'text-indigo-700', borderColor: 'border-indigo-200'
        },
        {
            id: 'apply-leave', title: 'Apply for Leave', description: 'Request time off',
            href: '/teacher/apply-leave', iconComponent: <Send className="w-6 h-6" />,
            gradient: 'from-teal-100 to-cyan-100', textColor: 'text-teal-700', borderColor: 'border-teal-200'
        },
        {
            id: 'my-salary', title: 'My Salary', description: 'View salary & payment history',
            href: '/teacher/salary', iconComponent: <IndianRupee className="w-6 h-6" />,
            gradient: 'from-amber-100 to-orange-100', textColor: 'text-amber-700', borderColor: 'border-amber-200'
        },
    ];

    // ===== Hub Cards: Classroom Section =====
    const classroomCards: HubCard[] = [
        {
            id: 'mark-attendance', title: 'Mark Attendance', description: isHoliday ? 'Disabled (Holiday)' : 'Select class & mark student attendance',
            href: '/attendance/mark', iconComponent: <ClipboardCheck className="w-6 h-6" />,
            gradient: 'from-blue-100 to-indigo-100', textColor: 'text-blue-700', borderColor: 'border-blue-200'
        },
        {
            id: 'marks-entry', title: 'Marks Entry', description: 'Enter exam marks & grades',
            href: '/marks/entry', iconComponent: <PenLine className="w-6 h-6" />,
            gradient: 'from-orange-100 to-amber-100', textColor: 'text-orange-700', borderColor: 'border-orange-200'
        },
        {
            id: 'co-scholastic', title: 'Co-Scholastic', description: 'Enter activity grades',
            href: '/manage/co-scholastic', iconComponent: <Award className="w-6 h-6" />,
            gradient: 'from-teal-100 to-emerald-100', textColor: 'text-teal-700', borderColor: 'border-teal-200'
        },
        {
            id: 'view-reports', title: 'View Reports', description: 'Attendance & academic reports',
            href: '/reports', iconComponent: <BarChart3 className="w-6 h-6" />,
            gradient: 'from-sky-100 to-blue-100', textColor: 'text-sky-700', borderColor: 'border-sky-200'
        },
    ];

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">
                {/* Welcome Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-8 mb-8 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse" />
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30" />
                    <div className="relative z-10">
                        <h1 className="text-2xl font-bold mb-2">
                            Hello, {user?.firstName}! <span className="inline-block animate-bounce">👋</span>
                        </h1>
                        <p className="text-emerald-100 text-sm max-w-xl">
                            Welcome to your <span className="font-semibold text-white">Teacher Dashboard</span>. Manage your attendance, classes, and performance from here.
                        </p>
                        <div className="mt-6 flex flex-wrap gap-3">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-medium backdrop-blur-md">
                                <CalendarDays className="w-4 h-4" /> {todayLabel}
                            </span>
                            {!loading && (
                                <>
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-medium backdrop-blur-md">
                                        <BookOpen className="w-4 h-4" /> {assignments.length} subject{assignments.length !== 1 ? 's' : ''} assigned
                                    </span>
                                    {classTeacherOf.length > 0 && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-sm font-medium text-emerald-300 backdrop-blur-md">
                                            <CheckCircle className="w-4 h-4" /> Class Teacher: {classTeacherOf.map(a => a.class_section_name).join(', ')}
                                        </span>
                                    )}
                                    {isHoliday && (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/30 text-sm font-medium text-rose-300 backdrop-blur-md">
                                            🏖️ Holiday: {holidayName}
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                        <p className="text-gray-400 text-sm">Loading your dashboard...</p>
                    </div>
                ) : (
                    <>
                        {/* ===== HUB 1: My Attendance & Personal ===== */}
                        <div className="mb-10">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 rounded-xl bg-emerald-100">
                                    <UserCog className="w-5 h-5 text-emerald-700" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-800">My Attendance & Personal</h2>
                                    <p className="text-xs text-gray-500">Check-in, leave management & performance</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                                {myAttendanceCards.map((card) => (
                                    <HubCardComponent key={card.id} card={card} onClick={() => router.push(card.href)} />
                                ))}
                            </div>
                        </div>

                        {/* ===== HUB 2: Classroom & Academics ===== */}
                        <div className="mb-10">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 rounded-xl bg-blue-100">
                                    <GraduationCap className="w-5 h-5 text-blue-700" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-800">Classroom & Academics</h2>
                                    <p className="text-xs text-gray-500">Student attendance, marks & reports</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                                {classroomCards.map((card) => (
                                    <HubCardComponent key={card.id} card={card} onClick={() => !isHoliday || card.id !== 'mark-attendance' ? router.push(card.href) : undefined} disabled={isHoliday && card.id === 'mark-attendance'} />
                                ))}
                            </div>
                        </div>

                        {/* ===== My Assigned Classes Quick View ===== */}
                        {assignments.length > 0 && (
                            <div className="mb-8">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">My Assigned Classes</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {assignments.map(assignment => (
                                        <div key={assignment.id}
                                            onClick={() => !isHoliday && router.push('/attendance/mark')}
                                            className={`bg-white rounded-xl border p-4 flex items-center justify-between transition-all ${
                                                isHoliday
                                                    ? 'border-gray-100 opacity-60 cursor-not-allowed'
                                                    : 'border-gray-100 hover:border-blue-200 cursor-pointer hover:shadow-md'
                                            }`}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                                    <BookOpen className="w-5 h-5" />
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
                                            <ChevronRight className="w-4 h-4 text-gray-300" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}

// Reusable Hub Card component (matching admin dashboard style)
function HubCardComponent({ card, onClick, disabled }: { card: HubCard; onClick: () => void; disabled?: boolean }) {
    return (
        <div
            onClick={disabled ? undefined : onClick}
            className={`group relative bg-white p-4 sm:p-5 rounded-2xl shadow-sm border ${card.borderColor} transition-all duration-300 overflow-hidden ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-lg hover:-translate-y-1 cursor-pointer'}`}
        >
            {/* Decorative gradient blob */}
            <div className={`absolute -right-8 -top-8 w-24 h-24 rounded-full bg-gradient-to-br ${card.gradient} opacity-20 group-hover:scale-150 transition-transform duration-500`}></div>

            {/* Badge */}
            {card.badge && (
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-gray-900/80 text-white text-[10px] font-bold z-10">
                    {card.badge}
                </div>
            )}

            <div className="relative flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${card.gradient} ${card.textColor}`}>
                    {card.iconComponent}
                </div>
                {!disabled && (
                    <div className="p-1.5 rounded-full bg-gray-50 text-gray-300 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                    </div>
                )}
            </div>

            <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-0.5">
                {card.title}
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                {card.description}
            </p>
        </div>
    );
}
