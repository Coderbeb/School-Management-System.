'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Users, UserCheck, UserX } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';

interface User {
    id: string; // Add id
    role: 'super_admin' | 'hod' | 'teacher';
    firstName: string;
    lastName: string; // Add lastName
    email: string;   // Add email
    departmentId?: string;
}

interface Department {
    id: string;
    name: string;
    code: string;
}

interface AttendanceRecord {
    date: string;
    totalStudents: number;
    present: number;
    absent: number;
    attendancePercentage: number;
}

export default function DailyReportPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [selectedSemester, setSelectedSemester] = useState('');
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
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

        // Fetch departments for super_admin
        if (parsedUser.role === 'super_admin') {
            fetchDepartments(token);
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
            fetchDailyReport(token);
        }
    }, [selectedDate, selectedDepartmentId, selectedSemester, user]);

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

    const fetchDailyReport = async (token: string) => {
        setLoading(true);
        try {
            let url = `/api/reports/daily?date=${selectedDate}`;
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
            if (data.records) {
                setRecords(data.records);
            }
        } catch (err) {
            console.error('Error fetching daily report:', err);
        }
        setLoading(false);
    };

    // Format date for display
    const formatDateDisplay = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    // Calculate totals
    const totals = records.reduce((acc, r) => ({
        students: acc.students + r.totalStudents,
        present: acc.present + r.present,
        absent: acc.absent + r.absent
    }), { students: 0, present: 0, absent: 0 });

    const avgPercentage = totals.students > 0 ? Math.round((totals.present / totals.students) * 100) : 0;

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
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                            <Calendar className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Daily Attendance</h1>
                            <p className="text-sm text-gray-500">View attendance records by date</p>
                        </div>
                    </div>
                    {/* Mobile Date Picker (hidden on desktop, visible on mobile) */}
                    <div className="md:hidden flex items-center gap-2 bg-white rounded-xl p-3 shadow-sm border border-gray-100 w-full">
                        <Calendar className="w-5 h-5 text-blue-500" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
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
                                {/* Date Filter */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                    <input
                                        type="date"
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        className="px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                {/* Department Filter - Only for super_admin */}
                                {user?.role === 'super_admin' && (
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
                        {user?.role === 'super_admin' && (
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

                    {/* Mobile Stats Summary */}
                    <div className="md:hidden grid grid-cols-4 gap-2 mb-4">
                        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                            <Users className="w-5 h-5 mx-auto text-blue-500 mb-1" />
                            <p className="text-lg font-bold">{totals.students}</p>
                            <p className="text-xs text-gray-500">Total</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                            <UserCheck className="w-5 h-5 mx-auto text-green-500 mb-1" />
                            <p className="text-lg font-bold text-green-600">{totals.present}</p>
                            <p className="text-xs text-gray-500">Present</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                            <UserX className="w-5 h-5 mx-auto text-red-500 mb-1" />
                            <p className="text-lg font-bold text-red-600">{totals.absent}</p>
                            <p className="text-xs text-gray-500">Absent</p>
                        </div>
                        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                            <p className="text-lg font-bold text-purple-600">{avgPercentage}%</p>
                            <p className="text-xs text-gray-500">Avg</p>
                        </div>
                    </div>

                    {/* Mobile Records */}
                    <div className="md:hidden space-y-3">
                        {loading ? (
                            <div className="bg-white rounded-2xl p-8 text-center text-gray-500">Loading...</div>
                        ) : records.length === 0 ? (
                            <div className="bg-white rounded-2xl p-8 text-center text-gray-500">
                                No attendance records found for this date.
                            </div>
                        ) : (
                            records.map((record, index) => (
                                <div
                                    key={index}
                                    className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 ${record.attendancePercentage >= 75 ? 'border-green-500' : 'border-red-500'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-sm font-medium text-gray-900">{record.date}</span>
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${record.attendancePercentage >= 75
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-red-100 text-red-800'
                                            }`}>
                                            {record.attendancePercentage}%
                                        </span>
                                    </div>
                                    <div className="flex gap-4 text-sm">
                                        <span className="text-gray-600">
                                            <span className="font-medium">{record.totalStudents}</span> students
                                        </span>
                                        <span className="text-green-600">
                                            <span className="font-medium">{record.present}</span> present
                                        </span>
                                        <span className="text-red-600">
                                            <span className="font-medium">{record.absent}</span> absent
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Desktop Table */}
                    <Card className="hidden md:block">
                        <CardHeader>
                            <CardTitle>Attendance for {selectedDate}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <p>Loading...</p>
                            ) : records.length === 0 ? (
                                <p className="text-gray-500">No attendance records found for this date.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="bg-gray-100">
                                                <th className="border p-3 text-left">Session</th>
                                                <th className="border p-3 text-center">Total Students</th>
                                                <th className="border p-3 text-center">Present</th>
                                                <th className="border p-3 text-center">Absent</th>
                                                <th className="border p-3 text-center">Attendance %</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {records.map((record, index) => (
                                                <tr key={index} className="hover:bg-gray-50">
                                                    <td className="border p-3">{record.date}</td>
                                                    <td className="border p-3 text-center">{record.totalStudents}</td>
                                                    <td className="border p-3 text-center text-green-600 font-semibold">{record.present}</td>
                                                    <td className="border p-3 text-center text-red-600 font-semibold">{record.absent}</td>
                                                    <td className="border p-3 text-center">
                                                        <span className={`px-2 py-1 rounded ${record.attendancePercentage >= 75 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                            {record.attendancePercentage}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </main>
            </div>
        </div>
    );
}
