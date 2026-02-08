'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, TrendingUp, TrendingDown, BarChart3, ArrowLeft, Filter, ChevronDown, Clock, Activity, AlertCircle, ChevronRight, CalendarDays } from 'lucide-react';
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

interface Department {
    id: string;
    name: string;
    code: string;
}

interface MonthlyStats {
    month: string;
    totalDays: number;
    totalSessions: number;
    averageAttendance: number;
    highestAttendance: number;
    lowestAttendance: number;
}

export default function MonthlyReportPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [selectedSemester, setSelectedSemester] = useState('');
    const [stats, setStats] = useState<MonthlyStats | null>(null);
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

        // Fetch departments for super_admin or teacher with multiple depts
        if (parsedUser.role === 'super_admin') {
            fetchDepartments(token);
        } else if (parsedUser.role === 'teacher' || parsedUser.role === 'hod') {
            fetchTeacherDepartments(token, parsedUser.id);
        }
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token && user) {
            fetchMonthlyReport(token);
        }
    }, [selectedMonth, selectedDepartmentId, selectedSemester, user]);

    const fetchDepartments = async (token: string) => {
        try {
            const res = await fetch('/api/departments', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setDepartments(data.departments || []);
        } catch (err) {
            console.error('Error fetching departments:', err);
        }
    };

    // Fetch departments for teachers (based on their assignments)
    const fetchTeacherDepartments = async (token: string, teacherId: string) => {
        try {
            const res = await fetch('/api/teachers', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            const teacher = data.teachers?.find((t: any) => t.id === teacherId);
            if (teacher) {
                const allDepts: Department[] = [];
                if (teacher.department_id && teacher.department_name) {
                    allDepts.push({
                        id: teacher.department_id,
                        name: teacher.department_name,
                        code: teacher.department_code || ''
                    });
                }
                if (teacher.departments && Array.isArray(teacher.departments)) {
                    teacher.departments.forEach((dept: any) => {
                        if (!allDepts.find(d => d.id === dept.id)) {
                            allDepts.push({ id: dept.id, name: dept.name, code: dept.code || '' });
                        }
                    });
                }
                if (allDepts.length > 1) {
                    setDepartments(allDepts);
                }
            }
        } catch (err) {
            console.error('Error fetching teacher departments:', err);
        }
    };

    const fetchMonthlyReport = async (token: string) => {
        setLoading(true);
        try {
            let url = `/api/reports/monthly?month=${selectedMonth}`;
            if (selectedDepartmentId) {
                url += `&departmentId=${selectedDepartmentId}`;
            }
            if (selectedSemester) {
                url += `&semester=${selectedSemester}`;
            }

            const res = await fetch(url, {
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
            console.error('Error fetching monthly report:', err);
        }
        setLoading(false);
    };

    // Format month for display
    const formatMonth = (monthStr: string) => {
        const date = new Date(monthStr + '-01');
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const getProgressColor = (percentage: number) => {
        if (percentage >= 75) return 'text-emerald-500';
        if (percentage >= 60) return 'text-amber-500';
        return 'text-red-500';
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
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-8 mb-8 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>

                    <div className="relative z-10">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-blue-400 font-semibold tracking-wide uppercase text-sm">Reports</span>
                                </div>
                                
                                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                                    Monthly Summary <span className="inline-block animate-wave">📊</span>
                                </h1>
                                <p className="text-blue-100 text-lg max-w-xl">
                                    Attendance analytics for <span className="font-semibold text-white">{formatMonth(selectedMonth)}</span>.
                                </p>
                            </div>
                            {/* Visual Icon */}
                            <div className="hidden md:block p-3 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/20">
                                <BarChart3 className="w-8 h-8 text-white" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters Section - Top Bar */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        {/* Month Filter */}
                        <div className="w-full md:w-48">
                            <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block">Month</label>
                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                            />
                        </div>

                        {/* Department Filter */}
                        {(user?.role === 'super_admin' || departments.length > 1) && (
                            <div className="w-full md:w-64">
                                <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block">Department</label>
                                <div className="relative">
                                    <select
                                        value={selectedDepartmentId}
                                        onChange={(e) => setSelectedDepartmentId(e.target.value)}
                                        className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none appearance-none transition-all"
                                    >
                                        <option value="">All Departments</option>
                                        {departments.map((dept) => (
                                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                                </div>
                            </div>
                        )}

                        {/* Semester Filter */}
                        <div className="w-full md:w-48">
                            <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block">Semester</label>
                            <div className="relative">
                                <select
                                    value={selectedSemester}
                                    onChange={(e) => setSelectedSemester(e.target.value)}
                                    className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none appearance-none transition-all"
                                >
                                    <option value="">All Semesters</option>
                                    {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                                        <option key={sem} value={sem}>Semester {sem}</option>
                                    ))}
                                </select>
                                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                            </div>
                        </div>

                        <Button 
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200"
                            onClick={() => {
                                setSelectedSemester('');
                                setSelectedDepartmentId('');
                                setSelectedMonth(new Date().toISOString().slice(0, 7));
                            }}
                        >
                            <Filter className="w-4 h-4 mr-2" />
                            Reset
                        </Button>
                    </div>
                </div>

                <div className="w-full">
                    {/* Report Data */}
                    <div className="lg:col-span-3">
                        {loading ? (
                            <Card className="border-0 shadow-sm bg-white">
                                <CardContent className="p-12 text-center">
                                    <div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-4"></div>
                                    <p className="text-gray-500">Loading monthly stats...</p>
                                </CardContent>
                            </Card>
                        ) : !stats ? (
                            <Card className="border-0 shadow-sm bg-white">
                                <CardContent className="p-12 text-center">
                                    <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <AlertCircle className="w-8 h-8 text-gray-400" />
                                    </div>
                                    <h3 className="text-lg font-medium text-gray-900">No data available</h3>
                                    <p className="text-gray-500 mt-1">Try selecting a different month or filter to see analytics.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-6">
                                {/* Hero Card - Simplified/Clean */}
                                <Card className="border-0 shadow-md bg-white overflow-hidden relative">
                                    <CardContent className="p-8">
                                        <div className="flex flex-col items-center justify-center text-center">
                                            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Average Attendance</h2>
                                            
                                            {/* Simple Circular Progress - Clean Visual */}
                                            <div className="relative w-48 h-48 flex items-center justify-center mb-6">
                                                <svg className="w-full h-full transform -rotate-90">
                                                    <circle
                                                        cx="96"
                                                        cy="96"
                                                        r="88"
                                                        stroke="#f3f4f6"
                                                        strokeWidth="12"
                                                        fill="transparent"
                                                    />
                                                    <circle
                                                        cx="96"
                                                        cy="96"
                                                        r="88"
                                                        stroke="currentColor"
                                                        strokeWidth="12"
                                                        fill="transparent"
                                                        strokeDasharray={552}
                                                        strokeDashoffset={552 - (552 * stats.averageAttendance) / 100}
                                                        className={`${getProgressColor(stats.averageAttendance)} transition-all duration-1000 ease-out`}
                                                        strokeLinecap="round"
                                                    />
                                                </svg>
                                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                    <span className={`text-5xl font-bold ${getProgressColor(stats.averageAttendance)}`}>
                                                        {stats.averageAttendance}%
                                                    </span>
                                                    <span className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Overall</span>
                                                </div>
                                            </div>
                                            
                                            <p className="text-gray-500 text-sm max-w-lg">
                                                This represents the accumulated attendance average for all selected students in 
                                                <span className="font-semibold text-gray-800 ml-1">{formatMonth(selectedMonth)}</span>.
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Secondary Stats Grid - Clean White Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                                    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                                        <CardContent className="p-6">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Sessions</p>
                                                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalSessions}</p>
                                                </div>
                                                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                                                    <BarChart3 className="w-6 h-6" />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                                        <CardContent className="p-6">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Working Days</p>
                                                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalDays}</p>
                                                </div>
                                                <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                                                    <Calendar className="w-6 h-6" />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                                        <CardContent className="p-6">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Highest Attendance</p>
                                                    <p className="text-3xl font-bold text-emerald-600 mt-2">{stats.highestAttendance}%</p>
                                                </div>
                                                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                                                    <TrendingUp className="w-6 h-6" />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                                        <CardContent className="p-6">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lowest Attendance</p>
                                                    <p className="text-3xl font-bold text-red-600 mt-2">{stats.lowestAttendance}%</p>
                                                </div>
                                                <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                                                    <TrendingDown className="w-6 h-6" />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
