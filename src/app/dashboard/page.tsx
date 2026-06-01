'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Navbar } from '@/components/ui/Navbar';
import {
    School,
    BookOpen,
    Users,
    CalendarDays,
    BarChart3,
    Settings,
    ChevronRight,
    Layers,
    UserCog,
    IndianRupee,
    ClipboardCheck,
    ClipboardList,
    GraduationCap,
    Sparkles,
    Send,
    FileText,
    Trophy,
    Award,
} from 'lucide-react';

interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'developer' | 'super_admin' | 'teacher' | 'accountant' | 'student';
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
    comingSoon?: boolean;
}

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');

        if (!token || !userData) {
            router.replace('/login');
            return;
        }

        try {
            const parsed = JSON.parse(userData);
            setUser(parsed);

            // Redirect non-admin users to their respective dashboards
            if (parsed.role === 'developer') {
                router.replace('/developer/dashboard');
                return;
            } else if (parsed.role === 'teacher') {
                router.replace('/teacher/dashboard');
                return;
            } else if (parsed.role === 'accountant') {
                router.replace('/accountant/dashboard');
                return;
            } else if (parsed.role === 'student') {
                router.replace('/student/dashboard');
                return;
            }
        } catch {
            router.replace('/login');
        }
        setLoading(false);
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium">Loading Dashboard...</p>
                </div>
            </div>
        );
    }

    if (!user) return null;

    // ----------------------------------------------------------------
    // Teacher & Staff Attendance Hub Cards
    // ----------------------------------------------------------------
    const teacherHubCards: HubCard[] = [
        {
            id: 'teachers', title: 'Teachers Directory', description: 'Manage teacher profiles & assignments',
            href: '/manage/teachers', iconComponent: <Users className="w-6 h-6" />,
            gradient: 'from-emerald-100 to-teal-100', textColor: 'text-emerald-700', borderColor: 'border-emerald-200'
        },
        {
            id: 'staff-attendance', title: 'Staff Attendance', description: 'GPS check-in dashboard & logs',
            href: '/manage/staff-attendance', iconComponent: <UserCog className="w-6 h-6" />,
            gradient: 'from-emerald-100 to-green-100', textColor: 'text-emerald-700', borderColor: 'border-emerald-200'
        },
        {
            id: 'staff-leaves', title: 'Staff Leaves', description: 'Approve & manage teacher leave requests',
            href: '/manage/staff-attendance/leaves', iconComponent: <Send className="w-6 h-6" />,
            gradient: 'from-teal-100 to-cyan-100', textColor: 'text-teal-700', borderColor: 'border-teal-200'
        },
        {
            id: 'teacher-reports', title: 'Staff Reports', description: 'Monthly & teacher-wise attendance reports',
            href: '/reports/teachers', iconComponent: <BarChart3 className="w-6 h-6" />,
            gradient: 'from-cyan-100 to-sky-100', textColor: 'text-cyan-700', borderColor: 'border-cyan-200'
        },
    ];

    // ----------------------------------------------------------------
    // Student & Academic Attendance Hub Cards
    // ----------------------------------------------------------------
    const studentHubCards: HubCard[] = [
        {
            id: 'school-setup', title: 'School Setup', description: 'Sessions, Classes, Subjects & Bulk Import',
            href: '/manage/school-setup', iconComponent: <School className="w-6 h-6" />,
            gradient: 'from-blue-100 to-indigo-100', textColor: 'text-blue-700', borderColor: 'border-blue-200'
        },
        {
            id: 'students', title: 'Students Directory', description: 'Student enrollment & profiles',
            href: '/manage/students', iconComponent: <GraduationCap className="w-6 h-6" />,
            gradient: 'from-indigo-100 to-violet-100', textColor: 'text-indigo-700', borderColor: 'border-indigo-200'
        },
        {
            id: 'student-attendance', title: 'Student Attendance', description: 'Mark daily attendance & view records',
            href: '/attendance', iconComponent: <ClipboardCheck className="w-6 h-6" />,
            gradient: 'from-blue-100 to-sky-100', textColor: 'text-blue-700', borderColor: 'border-blue-200'
        },
        {
            id: 'holidays', title: 'Holidays Calendar', description: 'Manage school holidays & events',
            href: '/holidays', iconComponent: <CalendarDays className="w-6 h-6" />,
            gradient: 'from-rose-100 to-pink-100', textColor: 'text-rose-700', borderColor: 'border-rose-200'
        },
        {
            id: 'exams-marks', title: 'Exams & Marks', description: 'Exam schedules, grading & results',
            href: '/manage/exams-marks', iconComponent: <ClipboardList className="w-6 h-6" />,
            gradient: 'from-orange-100 to-amber-100', textColor: 'text-orange-700', borderColor: 'border-orange-200'
        },
        {
            id: 'finance', title: 'Finance', description: 'Fee collection, salary, reports & setup',
            href: '/manage/finance', iconComponent: <IndianRupee className="w-6 h-6" />,
            gradient: 'from-green-100 to-emerald-100', textColor: 'text-green-700', borderColor: 'border-green-200'
        },
        {
            id: 'student-reports', title: 'Student Reports', description: 'Analytics & attendance reports',
            href: '/reports/students', iconComponent: <BarChart3 className="w-6 h-6" />,
            gradient: 'from-sky-100 to-blue-100', textColor: 'text-sky-700', borderColor: 'border-sky-200'
        },
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Mobile Sidebar */}
            <MobileSidebar
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                user={user}
                onLogout={handleLogout}
            />

            {/* Navbar */}
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">

                {/* Hero / Welcome Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-8 mb-8 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>

                    <div className="relative z-10">
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-bold mb-2">
                                    Hello, {user.firstName}! <span className="inline-block animate-wave">👋</span>
                                </h1>
                                <p className="text-blue-100 text-sm max-w-xl">
                                    Welcome to the <span className="font-semibold text-white">School Management System</span>. You have full administrative access to manage the entire institution.
                                </p>
                            </div>
                            <School className="hidden sm:block w-12 h-12 text-blue-200 opacity-80" />
                        </div>

                        <div className="mt-8 flex flex-wrap gap-3">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-medium backdrop-blur-md">
                                <UserCog className="w-4 h-4" />
                                ADMINISTRATOR
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-medium backdrop-blur-md">
                                <CalendarDays className="w-4 h-4" />
                                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ===== HUB 1: Teacher & Staff Attendance ===== */}
                <div className="mb-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-xl bg-emerald-100">
                            <UserCog className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800">Teacher & Staff Attendance</h2>
                            <p className="text-xs text-gray-500">GPS check-in, leave management & staff reports</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        {teacherHubCards.map((card) => (
                            <HubCardComponent key={card.id} card={card} onClick={() => router.push(card.href)} />
                        ))}
                    </div>
                </div>

                {/* ===== HUB 2: Student & Academic Attendance ===== */}
                <div className="mb-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-xl bg-blue-100">
                            <GraduationCap className="w-5 h-5 text-blue-700" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800">Student & Academic System</h2>
                            <p className="text-xs text-gray-500">Attendance, holidays, exams, marks & report cards</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                        {studentHubCards.map((card) => (
                            <HubCardComponent key={card.id} card={card} onClick={() => router.push(card.href)} />
                        ))}
                    </div>
                </div>

                {/* Quick Admin Row */}
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => router.push('/manage/accounts')}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold text-sm rounded-xl hover:border-blue-300 hover:text-blue-700 transition-all shadow-sm"
                    >
                        <Users className="w-4 h-4" /> User Accounts
                    </button>
                    <button
                        onClick={() => router.push('/manage/bulk-import')}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold text-sm rounded-xl hover:border-violet-300 hover:text-violet-700 transition-all shadow-sm"
                    >
                        <Sparkles className="w-4 h-4" /> Bulk Configurator
                    </button>
                    <button
                        onClick={() => router.push('/settings')}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold text-sm rounded-xl hover:border-gray-400 hover:text-gray-900 transition-all shadow-sm"
                    >
                        <Settings className="w-4 h-4" /> Settings & Config
                    </button>
                    <button
                        onClick={() => router.push('/reports')}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold text-sm rounded-xl hover:border-blue-300 hover:text-blue-700 transition-all shadow-sm"
                    >
                        <BarChart3 className="w-4 h-4" /> All Reports
                    </button>
                </div>

            </main>
        </div>
    );
}

// Reusable Hub Card component
function HubCardComponent({ card, onClick }: { card: HubCard; onClick: () => void }) {
    return (
        <div
            onClick={card.comingSoon ? undefined : onClick}
            className={`group relative bg-white p-4 sm:p-5 rounded-2xl shadow-sm border ${card.borderColor} transition-all duration-300 overflow-hidden ${card.comingSoon ? 'opacity-60 cursor-default' : 'hover:shadow-lg hover:-translate-y-1 cursor-pointer'}`}
        >
            {/* Decorative gradient blob */}
            <div className={`absolute -right-8 -top-8 w-24 h-24 rounded-full bg-gradient-to-br ${card.gradient} opacity-20 group-hover:scale-150 transition-transform duration-500`}></div>

            {/* Coming Soon badge */}
            {card.comingSoon && (
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-gray-900/80 text-white text-[10px] font-bold uppercase tracking-wider z-10">
                    Coming Soon
                </div>
            )}

            <div className="relative flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${card.gradient} ${card.textColor}`}>
                    {card.iconComponent}
                </div>
                {!card.comingSoon && (
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
