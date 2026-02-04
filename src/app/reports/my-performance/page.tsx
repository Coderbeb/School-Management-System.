'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Calendar, TrendingUp, BookOpen, Clock } from 'lucide-react';
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
    semester: number;
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
            router.push('/login');
            return;
        }
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        fetchMyPerformance(token, parsedUser.id);
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    const fetchMyPerformance = async (token: string, userId: string) => {
        setLoading(true);
        try {
            // Use existing teacher detail API with current user's ID
            const res = await fetch(`/api/reports/teachers/${userId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.push('/login');
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

            <div className="flex-1 pt-20 px-4 max-w-7xl mx-auto w-full">
                {/* Page Header */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                        <TrendingUp className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">My Performance</h1>
                        <p className="text-sm text-gray-500">Your teaching statistics and attendance overview</p>
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
                            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-4 text-white">
                                <h2 className="text-lg font-semibold">{data.teacher.name}</h2>
                                <p className="text-purple-200 text-sm">{data.teacher.email}</p>
                                <p className="text-purple-200 text-sm mt-1">{data.teacher.department}</p>
                            </div>
                        </div>

                        {/* Summary Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                            <Card className="bg-white">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                            <Calendar className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold">{data.summary.totalSessions}</p>
                                            <p className="text-xs text-gray-500">Total Sessions</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-white">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                                            <Users className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold">{data.summary.totalStudents}</p>
                                            <p className="text-xs text-gray-500">Students</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-white">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                            <TrendingUp className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold">{data.summary.averageAttendance}%</p>
                                            <p className="text-xs text-gray-500">Avg Attendance</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-white">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                                            <BookOpen className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold">{data.subjects.length}</p>
                                            <p className="text-xs text-gray-500">Subjects</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Subject-wise Performance */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <BookOpen className="w-5 h-5" />
                                    Subject-wise Performance
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {data.subjects.length === 0 ? (
                                    <p className="text-gray-500 text-center py-4">No subjects assigned yet.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {data.subjects.map((subject) => (
                                            <div key={subject.id} className="p-4 bg-gray-50 rounded-xl">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <h3 className="font-semibold text-gray-900">{subject.code} - {subject.name}</h3>
                                                        <p className="text-sm text-gray-500">Semester {subject.semester} • {subject.sessions} sessions</p>
                                                    </div>
                                                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getAttendanceColor(subject.attendance)}`}>
                                                        {subject.attendance}%
                                                    </span>
                                                </div>
                                                <div className="w-full bg-gray-200 rounded-full h-2">
                                                    <div
                                                        className={`h-2 rounded-full ${getProgressColor(subject.attendance)}`}
                                                        style={{ width: `${subject.attendance}%` }}
                                                    />
                                                </div>
                                                <div className="flex justify-between mt-2 text-xs text-gray-500">
                                                    <span>{subject.students} students</span>
                                                    <span>{subject.sessions} classes conducted</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Monthly Trend */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Clock className="w-5 h-5" />
                                    Monthly Trend (Last 6 Months)
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {data.monthlyTrend.length === 0 ? (
                                    <p className="text-gray-500 text-center py-4">No attendance data recorded yet.</p>
                                ) : (
                                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                                        {data.monthlyTrend.map((month) => (
                                            <div key={month.month} className="text-center p-3 bg-gray-50 rounded-xl">
                                                <p className="text-xs text-gray-500 mb-1">{formatMonth(month.month)}</p>
                                                <p className={`text-lg font-bold ${month.attendance >= 75 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {month.attendance}%
                                                </p>
                                                <p className="text-xs text-gray-400">{month.sessions} sessions</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Quick Tips - Only show if no data */}
                        {data.summary.totalSessions === 0 && (
                            <Card className="bg-blue-50 border-blue-200">
                                <CardContent className="p-4">
                                    <h3 className="font-semibold text-blue-900 mb-2">💡 Getting Started</h3>
                                    <ul className="text-sm text-blue-800 space-y-1">
                                        <li>• Go to Attendance section to mark your first class</li>
                                        <li>• Your performance stats will appear here after marking attendance</li>
                                        <li>• Track your monthly progress and subject-wise performance</li>
                                    </ul>
                                </CardContent>
                            </Card>
                        )}
                    </main>
                )}
            </div>
        </div>
    );
}
