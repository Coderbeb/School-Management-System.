'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Calendar, BarChart3, Users, UserCheck, TrendingUp, ChevronRight, AlertTriangle, CheckCircle, Clock, BookOpen, Building2, GraduationCap, LayoutDashboard, UsersRound, CalendarDays } from 'lucide-react';
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
    todayClasses?: number;
    lowAttendanceCount?: number;
    warningAttendanceCount?: number;
    departmentStats?: {
        departmentId: string;
        departmentName: string;
        totalStudents: number;
        avgAttendance: number;
    }[];
}

export default function ReportsPage() {
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
            const cached = sessionStorage.getItem('cache_report_stats');
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
            const res = await fetch('/api/reports/stats', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            if (data.stats) {
                setStats(data.stats);
                try { sessionStorage.setItem('cache_report_stats', JSON.stringify(data.stats)); } catch {}
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

    // Get role-specific greeting message
    const getRoleGreeting = () => {
        if (!user) return '';
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
        const roleLabel = user.role === 'super_admin' ? 'Admin' : user.role === 'hod' ? 'HOD' : 'Teacher';
        return `${greeting}, ${user.firstName}!`;
    };

    if (loading) return <PageSkeleton type="reports" />;

    const reportCards = [
        {
            id: 'daily',
            title: 'Daily Report',
            description: 'View attendance by date',
            icon: Calendar,
            color: 'bg-blue-500',
            gradient: 'from-blue-500 to-blue-600',
            bgLight: 'bg-blue-50',
            href: '/reports/daily'
        },
        {
            id: 'monthly',
            title: 'Monthly Summary',
            description: 'Monthly attendance statistics',
            icon: BarChart3,
            color: 'bg-emerald-500',
            gradient: 'from-emerald-500 to-emerald-600',
            bgLight: 'bg-emerald-50',
            href: '/reports/monthly'
        },
        {
            id: 'students',
            title: 'Student-wise',
            description: 'Individual student attendance',
            icon: Users,
            color: 'bg-purple-500',
            gradient: 'from-purple-500 to-purple-600',
            bgLight: 'bg-purple-50',
            href: '/reports/students'
        },
        // My Performance - for Teachers only (HODs have it in My Reports)
        ...(user?.role === 'teacher' ? [{
            id: 'my-performance',
            title: 'My Performance',
            description: 'Your teaching statistics',
            icon: TrendingUp,
            color: 'bg-indigo-500',
            gradient: 'from-indigo-500 to-indigo-600',
            bgLight: 'bg-indigo-50',
            href: '/reports/my-performance'
        }] : []),
        ...(user && user.role !== 'teacher' ? [{
            id: 'teachers',
            title: 'Teacher-wise',
            description: 'Attendance by teacher',
            icon: UserCheck,
            color: 'bg-orange-500',
            gradient: 'from-orange-500 to-orange-600',
            bgLight: 'bg-orange-50',
            href: '/reports/teachers'
        }] : []),
        // Department Overview - for HOD and Super Admin only
        ...(user && user.role !== 'teacher' ? [{
            id: 'department',
            title: 'Department Overview',
            description: 'Semester & subject analytics',
            icon: Building2,
            color: 'bg-teal-500',
            gradient: 'from-teal-500 to-teal-600',
            bgLight: 'bg-teal-50',
            href: '/reports/department'
        }] : [])
    ];

    // Quick stats for the role
    const getQuickStats = () => {
        const baseStats = [
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

        // Add role-specific stats
        if (user?.role === 'super_admin' || user?.role === 'hod') {
            if (stats.lowAttendanceCount !== undefined) {
                baseStats.push({
                    label: 'Critical (<60%)',
                    value: stats.lowAttendanceCount,
                    gradient: 'from-red-500 to-rose-600',
                    icon: AlertTriangle
                });
            }
        }

        return baseStats;
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
                                    Attendance Analytics <span className="inline-block animate-wave">📊</span>
                                </h1>
                                <p className="text-blue-100 text-sm max-w-xl">
                                    Welcome to your reports dashboard. View detailed statistics, track attendance trends, and <span className="font-semibold text-white">generate insights</span>.
                                </p>
                            </div>
                            <BarChart3 className="hidden sm:block w-12 h-12 text-blue-200 opacity-80" />
                        </div>

                        <div className="mt-5 flex gap-3">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-medium backdrop-blur-md">
                                <UsersRound className="w-4 h-4" />
                                {user?.role ? user.role.replace('_', ' ').toUpperCase() : 'USER'}
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
                    {getQuickStats().map((stat, index) => {
                        const colorMap: Record<string, {bg: string, text: string}> = {
                            'from-blue-500 to-blue-600': { bg: 'bg-blue-50', text: 'text-blue-600' },
                            'from-purple-500 to-purple-600': { bg: 'bg-purple-50', text: 'text-purple-600' },
                            'from-emerald-500 to-emerald-600': { bg: 'bg-emerald-50', text: 'text-emerald-600' },
                            'from-orange-500 to-orange-600': { bg: 'bg-orange-50', text: 'text-orange-600' },
                            'from-red-500 to-rose-600': { bg: 'bg-red-50', text: 'text-red-600' }
                        };
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

                {/* HOD/Admin - Alerts Section */}
                {(user?.role === 'hod' || user?.role === 'super_admin') && (stats.lowAttendanceCount || stats.warningAttendanceCount) ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* Low Attendance Alert */}
                        {(stats.lowAttendanceCount || 0) > 0 && (
                            <div className="shadow-md bg-white hover:shadow-lg transition-shadow rounded-xl">
                                <div className="p-5">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-red-100 rounded-full">
                                            <AlertTriangle className="w-6 h-6 text-red-600" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-gray-900 text-base">Critical Attendance</h3>
                                            <p className="text-xs text-gray-500">Students with less than 60% attendance</p>
                                        </div>
                                        <Button 
                                            variant="outline" 
                                            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                                            onClick={() => router.push('/reports/students?status=critical')}
                                        >
                                            View List
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Warning Alert */}
                        {(stats.warningAttendanceCount || 0) > 0 && (
                            <div className="shadow-md bg-white hover:shadow-lg transition-shadow rounded-xl">
                                <div className="p-5">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-amber-100 rounded-full">
                                            <Clock className="w-6 h-6 text-amber-600" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-gray-900 text-base">Warning Zone</h3>
                                            <p className="text-xs text-gray-500">Students between 60% and 75% attendance</p>
                                        </div>
                                        <Button 
                                            variant="outline" 
                                            className="border-amber-200 text-amber-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300"
                                            onClick={() => router.push('/reports/students?status=warning')}
                                        >
                                            View List
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : null}

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

                {/* Super Admin - Department Overview Table */}
                {user?.role === 'super_admin' && stats.departmentStats && stats.departmentStats.length > 0 && (
                    <div className="shadow-lg bg-white overflow-hidden rounded-2xl">
                        <div className="bg-gray-50 border-b border-gray-100 py-4 px-6">
                            <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-800">
                                <Building2 className="w-5 h-5 text-gray-500" />
                                Department Performance
                            </h3>
                        </div>
                        <div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50/50">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Students</th>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Attendance</th>
                                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {stats.departmentStats.map((dept) => (
                                            <tr key={dept.departmentId} className="hover:bg-gray-50/80 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-medium text-gray-900">{dept.departmentName}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {dept.totalStudents}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-24 bg-gray-100 rounded-full h-2 overflow-hidden">
                                                            <div 
                                                                className={`h-full rounded-full ${
                                                                    dept.avgAttendance >= 75 ? 'bg-emerald-500' : 
                                                                    dept.avgAttendance >= 60 ? 'bg-amber-500' : 'bg-red-500'
                                                                }`}
                                                                style={{ width: `${dept.avgAttendance}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-sm font-bold text-gray-700">{dept.avgAttendance}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                                                        dept.avgAttendance >= 75 
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                                            : dept.avgAttendance >= 60 
                                                                ? 'bg-amber-50 text-amber-700 border-amber-100' 
                                                                : 'bg-red-50 text-red-700 border-red-100'
                                                    }`}>
                                                        {dept.avgAttendance >= 75 ? 'Good' : dept.avgAttendance >= 60 ? 'Average' : 'Critical'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
