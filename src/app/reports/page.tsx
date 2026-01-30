'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, BarChart3, Users, UserCheck, ChevronRight } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';

interface User {
    id: string;
    role: 'super_admin' | 'hod' | 'teacher';
    firstName: string;
    lastName: string;
    email: string;
}

interface AttendanceStats {
    totalStudents: number;
    totalSessions: number;
    averageAttendance: number;
}

export default function ReportsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<AttendanceStats>({
        totalStudents: 0,
        totalSessions: 0,
        averageAttendance: 0,
    });
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.push('/login');
            return;
        }
        setUser(JSON.parse(userData));
        fetchStats(token);
    }, [router]);

    const fetchStats = async (token: string) => {
        try {
            const res = await fetch('/api/reports/stats', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.push('/login');
                return;
            }
            const data = await res.json();
            if (data.stats) {
                setStats(data.stats);
            }
        } catch (err) {
            console.error('Error fetching stats:', err);
        }
        setLoading(false);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

    const reportCards = [
        {
            id: 'daily',
            title: 'Daily Report',
            description: 'View attendance by date',
            icon: Calendar,
            color: 'bg-blue-500',
            bgLight: 'bg-blue-50',
            href: '/reports/daily'
        },
        {
            id: 'monthly',
            title: 'Monthly Summary',
            description: 'Monthly attendance statistics',
            icon: BarChart3,
            color: 'bg-green-500',
            bgLight: 'bg-green-50',
            href: '/reports/monthly'
        },
        {
            id: 'students',
            title: 'Student-wise',
            description: 'Individual student attendance',
            icon: Users,
            color: 'bg-purple-500',
            bgLight: 'bg-purple-50',
            href: '/reports/students'
        },
        ...(user && user.role !== 'teacher' ? [{
            id: 'teachers',
            title: 'Teacher-wise',
            description: 'Attendance by teacher',
            icon: UserCheck,
            color: 'bg-orange-500',
            bgLight: 'bg-orange-50',
            href: '/reports/teachers'
        }] : [])
    ];

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

            {/* Page Header */}
            <div className="bg-white shadow-sm border-b border-gray-200 mt-16">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <span className="p-2 bg-violet-100 text-violet-700 rounded-lg">
                            <BarChart3 className="w-6 h-6" />
                        </span>
                        Reports
                    </h1>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 py-4 flex-1 w-full">
                {/* Stats Cards - Mobile optimized */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
                        <p className="text-2xl sm:text-3xl font-bold text-blue-600">{stats.totalStudents}</p>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">Students</p>
                    </div>
                    <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
                        <p className="text-2xl sm:text-3xl font-bold text-green-600">{stats.totalSessions}</p>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">Sessions</p>
                    </div>
                    <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
                        <p className="text-2xl sm:text-3xl font-bold text-purple-600">{stats.averageAttendance}%</p>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">Avg. Att.</p>
                    </div>
                </div>

                {/* Report Types - Mobile Cards */}
                <div className="md:hidden space-y-3 mb-6">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">Attendance Reports</h2>
                    {reportCards.map((report) => (
                        <button
                            key={report.id}
                            onClick={() => router.push(report.href)}
                            className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow"
                        >
                            <div className={`w-12 h-12 ${report.color} rounded-xl flex items-center justify-center`}>
                                <report.icon className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1 text-left">
                                <p className="font-semibold text-gray-900">{report.title}</p>
                                <p className="text-sm text-gray-500">{report.description}</p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                        </button>
                    ))}
                </div>

                {/* Report Types - Desktop Grid */}
                <Card className="hidden md:block mb-6">
                    <CardHeader className="py-4 px-4 border-b">
                        <CardTitle className="text-lg">Attendance Reports</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {reportCards.map((report) => (
                                <Button
                                    key={report.id}
                                    variant="outline"
                                    className="h-auto py-4 px-4 text-left justify-start whitespace-normal"
                                    onClick={() => router.push(report.href)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 ${report.color} rounded-lg flex items-center justify-center`}>
                                            <report.icon className="w-5 h-5 text-white" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-base mb-0.5">{report.title}</p>
                                            <p className="text-sm text-gray-500 font-normal">{report.description}</p>
                                        </div>
                                    </div>
                                </Button>
                            ))}
                        </div>
                    </CardContent>
                </Card>


            </main>
        </div>
    );
}
