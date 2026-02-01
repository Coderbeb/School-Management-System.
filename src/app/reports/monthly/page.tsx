'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
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
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Monthly Summary</h1>
                            <p className="text-sm text-gray-500">Attendance statistics overview</p>
                        </div>
                    </div>
                    {/* Mobile Month Picker */}
                    <div className="md:hidden flex items-center gap-2 bg-white rounded-xl p-3 shadow-sm border border-gray-100 w-full">
                        <Calendar className="w-5 h-5 text-green-500" />
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="flex-1 bg-transparent text-sm font-medium focus:outline-none"
                        />
                    </div>
                </div>

                <main className="max-w-7xl mx-auto px-4 py-4 md:py-8">
                    {/* Desktop Filters */}
                    <Card className="hidden md:block mb-6">
                        <CardHeader>
                            <CardTitle>Filters</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-4 items-end">
                                {/* Month Filter */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                                    <input
                                        type="month"
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                {/* Department Filter - For super_admin or teachers with multiple depts */}
                                {(user?.role === 'super_admin' || departments.length > 1) && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                                        <select
                                            value={selectedDepartmentId}
                                            onChange={(e) => setSelectedDepartmentId(e.target.value)}
                                            className="px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
                                        >
                                            <option value="">All Departments</option>
                                            {departments.map((dept) => (
                                                <option key={dept.id} value={dept.id}>
                                                    {dept.name} ({dept.code})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Semester Filter - For all roles */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
                                    <select
                                        value={selectedSemester}
                                        onChange={(e) => setSelectedSemester(e.target.value)}
                                        className="px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">All Semesters</option>
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                                            <option key={sem} value={sem}>
                                                Semester {sem}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Mobile Filters */}
                    <div className="md:hidden flex gap-2 mb-4">
                        {(user?.role === 'super_admin' || departments.length > 1) && (
                            <select
                                value={selectedDepartmentId}
                                onChange={(e) => setSelectedDepartmentId(e.target.value)}
                                className="flex-1 px-3 py-2 bg-white border rounded-xl text-sm"
                            >
                                <option value="">All Depts</option>
                                {departments.map((dept) => (
                                    <option key={dept.id} value={dept.id}>{dept.code}</option>
                                ))}
                            </select>
                        )}
                        <select
                            value={selectedSemester}
                            onChange={(e) => setSelectedSemester(e.target.value)}
                            className="flex-1 px-3 py-2 bg-white border rounded-xl text-sm"
                        >
                            <option value="">All Sem</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                                <option key={sem} value={sem}>Sem {sem}</option>
                            ))}
                        </select>
                    </div>

                    {/* Mobile Stats */}
                    <div className="md:hidden">
                        {loading ? (
                            <div className="bg-white rounded-2xl p-8 text-center text-gray-500">Loading...</div>
                        ) : !stats ? (
                            <div className="bg-white rounded-2xl p-8 text-center text-gray-500">
                                No data available for this month.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Main Stat Card */}
                                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-6 text-white shadow-lg">
                                    <p className="text-green-100 text-sm mb-1">Average Attendance</p>
                                    <p className="text-5xl font-bold">{stats.averageAttendance}%</p>
                                    <p className="text-green-100 text-sm mt-2">{formatMonth(selectedMonth)}</p>
                                </div>

                                {/* Secondary Stats */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-white rounded-2xl p-4 shadow-sm">
                                        <BarChart3 className="w-6 h-6 text-blue-500 mb-2" />
                                        <p className="text-2xl font-bold text-blue-600">{stats.totalSessions}</p>
                                        <p className="text-xs text-gray-500">Total Sessions</p>
                                    </div>
                                    <div className="bg-white rounded-2xl p-4 shadow-sm">
                                        <Calendar className="w-6 h-6 text-purple-500 mb-2" />
                                        <p className="text-2xl font-bold text-purple-600">{stats.totalDays}</p>
                                        <p className="text-xs text-gray-500">Working Days</p>
                                    </div>
                                    <div className="bg-white rounded-2xl p-4 shadow-sm">
                                        <TrendingUp className="w-6 h-6 text-emerald-500 mb-2" />
                                        <p className="text-2xl font-bold text-emerald-600">{stats.highestAttendance}%</p>
                                        <p className="text-xs text-gray-500">Highest</p>
                                    </div>
                                    <div className="bg-white rounded-2xl p-4 shadow-sm">
                                        <TrendingDown className="w-6 h-6 text-red-500 mb-2" />
                                        <p className="text-2xl font-bold text-red-600">{stats.lowestAttendance}%</p>
                                        <p className="text-xs text-gray-500">Lowest</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Desktop Stats */}
                    <Card className="hidden md:block">
                        <CardHeader>
                            <CardTitle>Summary for {selectedMonth}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <p>Loading...</p>
                            ) : !stats ? (
                                <p className="text-gray-500">No data available for this month.</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-blue-50 p-4 rounded-lg">
                                        <p className="text-sm text-gray-600">Total Sessions</p>
                                        <p className="text-3xl font-bold text-blue-600">{stats.totalSessions}</p>
                                    </div>
                                    <div className="bg-green-50 p-4 rounded-lg">
                                        <p className="text-sm text-gray-600">Average Attendance</p>
                                        <p className="text-3xl font-bold text-green-600">{stats.averageAttendance}%</p>
                                    </div>
                                    <div className="bg-purple-50 p-4 rounded-lg">
                                        <p className="text-sm text-gray-600">Working Days</p>
                                        <p className="text-3xl font-bold text-purple-600">{stats.totalDays}</p>
                                    </div>
                                    <div className="bg-emerald-50 p-4 rounded-lg">
                                        <p className="text-sm text-gray-600">Highest Attendance</p>
                                        <p className="text-3xl font-bold text-emerald-600">{stats.highestAttendance}%</p>
                                    </div>
                                    <div className="bg-red-50 p-4 rounded-lg">
                                        <p className="text-sm text-gray-600">Lowest Attendance</p>
                                        <p className="text-3xl font-bold text-red-600">{stats.lowestAttendance}%</p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </main>
            </div>
        </div>
    );
}
