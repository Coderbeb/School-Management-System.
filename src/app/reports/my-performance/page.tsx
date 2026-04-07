'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Users, Calendar, TrendingUp, BookOpen, Clock, ChevronRight, CalendarDays } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';

interface User {
    id: string;
    role: 'super_admin' | 'hod' | 'teacher';
    firstName: string;
    lastName: string;
    email: string;
    departmentId?: string;
}

interface SubjectStat {
    id: string;
    name: string;
    code: string;
    paperCode?: string;
    semester: string | number;
    department: string;
    sessions: number;
    students: number;
    attendance: number;
}

interface MonthlyTrend {
    month: string;
    sessions: number;
    attendance: number;
}

interface PerformanceData {
    teacher: {
        id: string;
        name: string;
        email: string;
        department: string;
    };
    summary: {
        totalSessions: number;
        workingDays: number;
        totalStudents: number;
        presentCount: number;
        absentCount: number;
        averageAttendance: number;
    };
    subjects: SubjectStat[];
    monthlyTrend: MonthlyTrend[];
}

export default function MyPerformancePage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<PerformanceData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.replace('/login');
            return;
        }
        const parsedUser = JSON.parse(userData);

        // Only HODs should access this page
        if (parsedUser.role !== 'hod') {
            router.push('/reports');
            return;
        }

        setUser(parsedUser);
        fetchMyPerformance(token, parsedUser.id);
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    const fetchMyPerformance = async (token: string, userId: string) => {
        setLoading(true);
        try {
            // Use existing teacher detail API with current user's ID
            const res = await fetch(`/api/reports/teachers/${userId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            if (res.ok) {
                const result = await res.json();
                setData(result);
            }
        } catch (err) {
            console.error('Error fetching performance data:', err);
        }
        setLoading(false);
    };

    // Get attendance color based on percentage
    const getAttendanceColor = (percentage: number) => {
        if (percentage >= 85) return 'text-green-600 bg-green-100';
        if (percentage >= 75) return 'text-lime-600 bg-lime-100';
        if (percentage >= 60) return 'text-yellow-600 bg-yellow-100';
        if (percentage >= 40) return 'text-orange-600 bg-orange-100';
        return 'text-red-600 bg-red-100';
    };

    // Get progress bar color
    const getProgressColor = (percentage: number) => {
        if (percentage >= 85) return 'bg-green-500';
        if (percentage >= 75) return 'bg-lime-500';
        if (percentage >= 60) return 'bg-yellow-500';
        if (percentage >= 40) return 'bg-orange-500';
        return 'bg-red-500';
    };

    // Format month for display
    const formatMonth = (monthStr: string) => {
        const [year, month] = monthStr.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
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
            <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl mt-4">


                <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-indigo-400 font-semibold tracking-wide uppercase text-sm">Reports</span>
                        </div>
                        <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                            My Performance <span className="inline-block animate-bounce">📈</span>
                        </h1>
                        <p className="text-indigo-100 text-sm max-w-xl">
                            Track your teaching statistics, attendance trends, and <span className="font-semibold text-white">subject-wise performance</span>.
                        </p>
                    </div>
                </div>
            </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="text-gray-500">Loading your performance data...</div>
                    </div>
                ) : !data ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="text-gray-500">No performance data available yet. Start marking attendance to see your stats!</div>
                    </div>
                ) : (
                    <main className="space-y-6 pb-8">
                        {/* Teacher Info Card - Mobile */}
                        <div className="md:hidden">
                            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 text-gray-900">
                                <h2 className="text-lg font-bold text-gray-900">{data.teacher.name}</h2>
                                <p className="text-gray-500 text-sm">{data.teacher.email}</p>
                                <p className="text-gray-500 text-sm mt-1">{data.teacher.department}</p>
                            </div>
                        </div>

                        {/* Summary Stats */}
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
                            <div className="border border-gray-100 shadow-sm bg-white overflow-hidden relative group hover:shadow-md transition-shadow rounded-xl">
                                <div className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Working Days</p>
                                            <p className="text-gray-900 text-2xl font-bold mt-1">{data.summary.workingDays}</p>
                                        </div>
                                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                            <CalendarDays className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="border border-gray-100 shadow-sm bg-white overflow-hidden relative group hover:shadow-md transition-shadow rounded-xl">
                                <div className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Total Sessions</p>
                                            <p className="text-gray-900 text-2xl font-bold mt-1">{data.summary.totalSessions}</p>
                                        </div>
                                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                            <Calendar className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="border border-gray-100 shadow-sm bg-white overflow-hidden relative group hover:shadow-md transition-shadow rounded-xl">
                                <div className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Students</p>
                                            <p className="text-gray-900 text-2xl font-bold mt-1">{data.summary.totalStudents}</p>
                                        </div>
                                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                            <Users className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="border border-gray-100 shadow-sm bg-white overflow-hidden relative group hover:shadow-md transition-shadow rounded-xl">
                                <div className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Avg Attendance</p>
                                            <p className="text-gray-900 text-2xl font-bold mt-1">{data.summary.averageAttendance}%</p>
                                        </div>
                                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                                            <TrendingUp className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="border border-gray-100 shadow-sm bg-white overflow-hidden relative group hover:shadow-md transition-shadow rounded-xl">
                                <div className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-gray-500 text-xs uppercase tracking-wide font-bold">Subjects</p>
                                            <p className="text-gray-900 text-2xl font-bold mt-1">{data.subjects.length}</p>
                                        </div>
                                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                                            <BookOpen className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Subject-wise Performance */}
                        <div className="shadow-md bg-white rounded-2xl">
                            <div className="p-5 border-b border-gray-100">
                                <h3 className="font-semibold text-base flex items-center gap-2">
                                    <BookOpen className="w-5 h-5" />
                                    Subject-wise Performance
                                </h3>
                            </div>
                            <div className="p-5">
                                {data.subjects.length === 0 ? (
                                    <p className="text-gray-500 text-center py-4">No subjects assigned yet.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {data.subjects.map((subject, idx) => (
                                            <div key={`${subject.id}-${idx}`} className="p-5 bg-gradient-to-r from-gray-50 to-white rounded-2xl border border-gray-100 hover:shadow-md transition-shadow">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <h3 className="font-bold text-gray-900">{subject.paperCode || subject.code} - {subject.name}</h3>
                                                        <p className="text-xs font-medium text-gray-500 mt-0.5">({subject.code}) Sem {subject.semester} • {subject.sessions} sessions</p>
                                                    </div>
                                                    <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${getAttendanceColor(subject.attendance)}`}>
                                                        {subject.attendance}%
                                                    </span>
                                                </div>
                                                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${getProgressColor(subject.attendance)}`}
                                                        style={{ width: `${subject.attendance}%` }}
                                                    />
                                                </div>
                                                <div className="flex justify-between mt-3 text-xs font-medium text-gray-500">
                                                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {subject.students} students</span>
                                                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {subject.sessions} classes</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Monthly Trend */}
                        <div className="shadow-md bg-white rounded-2xl">
                            <div className="p-5 border-b border-gray-100">
                                <h3 className="font-semibold text-base flex items-center gap-2">
                                    <Clock className="w-5 h-5" />
                                    Monthly Trend (Last 6 Months)
                                </h3>
                            </div>
                            <div className="p-5">
                                {data.monthlyTrend.length === 0 ? (
                                    <p className="text-gray-500 text-center py-4">No attendance data recorded yet.</p>
                                ) : (
                                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                                        {data.monthlyTrend.map((month) => (
                                            <div key={month.month} className="text-center p-4 bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl hover:-translate-y-1 hover:shadow-md transition-all duration-300">
                                                <p className="text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{formatMonth(month.month)}</p>
                                                <p className={`text-xl font-bold mb-1 ${month.attendance >= 75 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                    {month.attendance}%
                                                </p>
                                                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-medium">
                                                    <Calendar className="w-3 h-3" /> {month.sessions}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Quick Tips - Only show if no data */}
                        {data.summary.totalSessions === 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl">
                                <div className="p-4">
                                    <h3 className="font-semibold text-blue-900 mb-2">💡 Getting Started</h3>
                                    <ul className="text-sm text-blue-800 space-y-1">
                                        <li>• Go to Attendance section to mark your first class</li>
                                        <li>• Your performance stats will appear here after marking attendance</li>
                                        <li>• Track your monthly progress and subject-wise performance</li>
                                    </ul>
                                </div>
                            </div>
                        )}
                    </main>
                )}
            </main>
        </div>
    );
}
