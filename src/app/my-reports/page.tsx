'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Calendar, BarChart3, Users, TrendingUp, ChevronRight, BookOpen, UsersRound, CalendarDays } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { PageSkeleton } from '@/components/ui/PageSkeleton';
import { useRealtimeData } from '@/hooks/useRealtimeData';

interface User {
    id: string;
    role: 'super_admin' | 'hod' | 'teacher';
    firstName: string;
    lastName: string;
    email: string;
    departmentId?: string;
}

interface AttendanceStats {
    totalStudents: number;
    totalSessions: number;
    todaySessions: number;
    workingDays: number;
    averageAttendance: number;
}

export default function MyReportsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<AttendanceStats>({
        totalStudents: 0,
        totalSessions: 0,
        todaySessions: 0,
        workingDays: 0,
        averageAttendance: 0,
    });
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.replace('/login');
            return;
        }
        setUser(JSON.parse(userData));

        // Try loading cached data first for instant display
        try {
            const cached = sessionStorage.getItem('cache_myreport_stats');
            if (cached) {
                setStats(JSON.parse(cached));
                setLoading(false);
            }
        } catch { /* ignore cache errors */ }

        fetchStats(token);
    }, [router]);

    // Real-time updates
    useRealtimeData({
        tables: ['attendance_records'],
        onTableChange: useCallback(() => {
            const token = localStorage.getItem('token');
            if (token) fetchStats(token);
        }, []),
    });

    const fetchStats = async (token: string) => {
        try {
            // view=teacher makes the API treat HOD as teacher (only their own data)
            const res = await fetch('/api/reports/stats?view=teacher', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            if (data.stats) {
                setStats(data.stats);
                try { sessionStorage.setItem('cache_myreport_stats', JSON.stringify(data.stats)); } catch {}
            }
        } catch (err) {
            console.error('Error fetching stats:', err);
        }
        setLoading(false);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    if (loading) return <PageSkeleton type="reports" />;

    // Exactly the same cards a teacher sees — but links include ?view=teacher
    const reportCards = [
        {
            id: 'daily',
            title: 'Daily Report',
            description: 'View attendance by date',
            icon: Calendar,
            color: 'bg-blue-500',
            gradient: 'from-blue-500 to-blue-600',
            bgLight: 'bg-blue-50',
            href: '/reports/daily?view=teacher'
        },
        {
            id: 'monthly',
            title: 'Monthly Summary',
            description: 'Monthly attendance statistics',
            icon: BarChart3,
            color: 'bg-emerald-500',
            gradient: 'from-emerald-500 to-emerald-600',
            bgLight: 'bg-emerald-50',
            href: '/reports/monthly?view=teacher'
        },
        {
            id: 'students',
            title: 'Student-wise',
            description: 'Individual student attendance',
            icon: Users,
            color: 'bg-purple-500',
            gradient: 'from-purple-500 to-purple-600',
            bgLight: 'bg-purple-50',
            href: '/reports/students?view=teacher'
        },
        {
            id: 'my-performance',
            title: 'My Performance',
            description: 'Your teaching statistics & syllabus tracker',
            icon: TrendingUp,
            color: 'bg-indigo-500',
            gradient: 'from-indigo-500 to-indigo-600',
            bgLight: 'bg-indigo-50',
            href: '/reports/my-performance'
        },
    ];

    // Quick stats — teacher-scoped (no alerts, no critical counts)
    const quickStats = [
        { 
            label: 'Total Students', 
            value: stats.totalStudents, 
            gradient: 'from-blue-500 to-blue-600',
            icon: Users
        },
        { 
            label: 'Working Days', 
            value: stats.workingDays, 
            gradient: 'from-indigo-500 to-indigo-600',
            icon: CalendarDays
        },
        { 
            label: "Today's Lectures", 
            value: stats.todaySessions, 
            gradient: 'from-purple-500 to-purple-600',
            icon: BookOpen
        },
        { 
            label: 'Avg. Attendance', 
            value: `${stats.averageAttendance}%`, 
            gradient: stats.averageAttendance >= 75 ? 'from-emerald-500 to-emerald-600' : 'from-orange-500 to-orange-600',
            icon: TrendingUp
        },
    ];

    const colorMap: Record<string, {bg: string, text: string}> = {
        'from-blue-500 to-blue-600': { bg: 'bg-blue-50', text: 'text-blue-600' },
        'from-indigo-500 to-indigo-600': { bg: 'bg-indigo-50', text: 'text-indigo-600' },
        'from-purple-500 to-purple-600': { bg: 'bg-purple-50', text: 'text-purple-600' },
        'from-emerald-500 to-emerald-600': { bg: 'bg-emerald-50', text: 'text-emerald-600' },
        'from-orange-500 to-orange-600': { bg: 'bg-orange-50', text: 'text-orange-600' },
    };

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

            <main className="flex-1 pt-20 pb-8 px-4 max-w-7xl mx-auto w-full">
                {/* Hero / Welcome Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">

                    <div className="relative z-10">
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-bold mb-2">
                                    My Reports <span className="inline-block animate-wave">📊</span>
                                </h1>
                                <p className="text-blue-100 text-sm max-w-xl">
                                    Your personal teaching reports. View statistics scoped to <span className="font-semibold text-white">your own classes and subjects</span>.
                                </p>
                            </div>
                            <BarChart3 className="hidden sm:block w-12 h-12 text-blue-200 opacity-80" />
                        </div>

                        <div className="mt-5 flex gap-3">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-medium backdrop-blur-md">
                                <UsersRound className="w-4 h-4" />
                                TEACHER VIEW
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-medium backdrop-blur-md">
                                <CalendarDays className="w-4 h-4" />
                                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {quickStats.map((stat, index) => {
                        const colors = colorMap[stat.gradient] || { bg: 'bg-gray-50', text: 'text-gray-600' };
                        
                        return (
                            <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 group hover:-translate-y-0.5 hover:shadow-md transition-all duration-300">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">{stat.label}</p>
                                        <p className="text-gray-900 text-2xl font-bold">{stat.value}</p>
                                    </div>
                                    <div className={`p-2 ${colors.bg} ${colors.text} rounded-lg`}>
                                        <stat.icon className="w-5 h-5" />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Report Navigation Grid */}
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-purple-600" />
                    Available Reports
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    {reportCards.map((report) => (
                        <div
                            key={report.id}
                            onClick={() => router.push(report.href)}
                            className="group bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-xl hover:border-purple-100 transition-all duration-300 cursor-pointer flex items-start gap-4 relative overflow-hidden"
                        >
                            <div className={`w-12 h-12 rounded-xl ${report.bgLight} flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 transition-transform duration-300`}>
                                <report.icon className={`w-6 h-6 ${report.color.replace('bg-', 'text-')}`} />
                            </div>
                            
                            <div className="flex-1 z-10">
                                <h3 className="font-bold text-gray-900 group-hover:text-purple-700 transition-colors text-base mb-0.5">{report.title}</h3>
                                <p className="text-xs text-gray-500 leading-relaxed">{report.description}</p>
                            </div>
                            
                            <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-purple-500 transform group-hover:translate-x-1 transition-all" />
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}
