'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, X, Users, BookOpen, TrendingUp, Filter, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';

interface User {
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

interface TeacherAttendance {
    id: string;
    name: string;
    email: string;
    department: string;
    subjects: string;
    totalSessions: number;
    averageAttendance: number;
}

interface TeacherDetail {
    teacher: {
        id: string;
        name: string;
        email: string;
        department: string;
    };
    filters: {
        departments: { id: string; name: string; code: string }[];
        semesters: number[];
    };
    summary: {
        totalSessions: number;
        totalStudents: number;
        presentCount: number;
        absentCount: number;
        averageAttendance: number;
    };
    subjects: {
        id: string;
        name: string;
        code: string;
        semester: number;
        department: string;
        sessions: number;
        students: number;
        attendance: number;
    }[];
    monthlyTrend: {
        month: string;
        sessions: number;
        attendance: number;
    }[];
}

export default function TeacherReportPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [teachers, setTeachers] = useState<TeacherAttendance[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    // Detail popup state
    const [selectedTeacher, setSelectedTeacher] = useState<TeacherDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);

    // Popup filters
    const [popupDeptFilter, setPopupDeptFilter] = useState('');
    const [popupSemesterFilter, setPopupSemesterFilter] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.push('/login');
            return;
        }
        const parsedUser = JSON.parse(userData);
        setUser({
            ...parsedUser,
            lastName: parsedUser.lastName || '',
            email: parsedUser.email || '',
            firstName: parsedUser.firstName || 'User'
        });

        if (parsedUser.role === 'super_admin') {
            fetchDepartments(token);
        }
    }, [router]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token && user) {
            fetchTeacherReport(token);
        }
    }, [selectedDepartmentId, user]);

    // Re-fetch teacher detail when popup filters change
    useEffect(() => {
        if (selectedTeacherId) {
            fetchTeacherDetail(selectedTeacherId, popupDeptFilter, popupSemesterFilter);
        }
    }, [popupDeptFilter, popupSemesterFilter]);

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

    const fetchTeacherReport = async (token: string) => {
        setLoading(true);
        try {
            let url = '/api/reports/teachers';
            if (selectedDepartmentId) {
                url += `?departmentId=${selectedDepartmentId}`;
            }

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.push('/login');
                return;
            }
            const data = await res.json();
            if (data.teachers) {
                setTeachers(data.teachers);
            }
        } catch (err) {
            console.error('Error fetching teacher report:', err);
        }
        setLoading(false);
    };

    const fetchTeacherDetail = async (teacherId: string, deptId?: string, semester?: string) => {
        setLoadingDetail(true);
        try {
            const token = localStorage.getItem('token');
            let url = `/api/reports/teachers/${teacherId}`;
            const params = new URLSearchParams();
            if (deptId) params.append('departmentId', deptId);
            if (semester) params.append('semester', semester);
            if (params.toString()) url += '?' + params.toString();

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.push('/login');
                return;
            }
            const data = await res.json();
            setSelectedTeacher(data);
        } catch (err) {
            console.error('Error fetching teacher detail:', err);
        }
        setLoadingDetail(false);
    };

    const openTeacherDetail = (teacherId: string) => {
        setSelectedTeacherId(teacherId);
        setPopupDeptFilter('');
        setPopupSemesterFilter('');
        fetchTeacherDetail(teacherId);
    };

    const closePopup = () => {
        setSelectedTeacher(null);
        setSelectedTeacherId(null);
        setPopupDeptFilter('');
        setPopupSemesterFilter('');
    };

    const filteredTeachers = teachers.filter(teacher =>
        teacher.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacher.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacher.department.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getAttendanceColor = (percentage: number) => {
        if (percentage >= 85) return 'bg-green-500';
        if (percentage >= 75) return 'bg-lime-500';
        if (percentage >= 60) return 'bg-yellow-500';
        if (percentage >= 40) return 'bg-orange-500';
        return 'bg-red-500';
    };

    const getAttendanceBadgeColor = (percentage: number) => {
        if (percentage >= 75) return 'bg-green-100 text-green-800';
        if (percentage >= 50) return 'bg-yellow-100 text-yellow-800';
        return 'bg-red-100 text-red-800';
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Mobile Sidebar */}
            {user && (
                <MobileSidebar
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    user={user}
                    onLogout={handleLogout}
                />
            )}

            {/* Navbar */}
            <Navbar
                user={user as any}
                onMenuClick={() => setSidebarOpen(true)}
                backUrl="/reports"
                backLabel="Reports"
            />

            {/* Page Header */}
            <div className="bg-white shadow-sm border-b border-gray-200 mt-16">
                <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-violet-100 text-violet-700 rounded-lg">
                            <Users className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Teacher Reports</h1>
                            <p className="text-gray-500 text-sm">Analyze teacher attendance and performance.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="hidden md:flex flex-1 max-w-7xl mx-auto px-4 py-8 w-full flex-col">
                <Card className="mb-4">
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-lg">Filters</CardTitle>
                    </CardHeader>
                    <CardContent className="py-3 px-4">
                        <div className="flex flex-col sm:flex-row gap-3 items-end">
                            {user?.role === 'super_admin' && (
                                <div className="w-full sm:w-auto">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                                    <select
                                        value={selectedDepartmentId}
                                        onChange={(e) => setSelectedDepartmentId(e.target.value)}
                                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:min-w-[200px]"
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

                            <div className="flex-1 w-full">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                                    <Input
                                        type="text"
                                        placeholder="Search by name, email, or department..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-9 bg-white w-full text-sm h-10"
                                    />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="flex flex-col flex-1 min-h-0 overflow-hidden shadow-lg border-none">
                    <CardHeader className="py-3 px-4 bg-gray-50 border-b">
                        <CardTitle className="text-lg">Teacher Attendance Overview</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 flex flex-col flex-1 min-h-0 overflow-hidden">
                        {loading ? (
                            <div className="flex items-center justify-center p-8">Loading...</div>
                        ) : filteredTeachers.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">No teachers found.</div>
                        ) : (
                            <div className="overflow-auto flex-1">
                                <table className="w-full border-collapse min-w-[600px]">
                                    <thead className="sticky top-0 z-10 bg-gray-100 shadow-sm">
                                        <tr>
                                            <th className="border-b p-3 text-center w-12 text-xs sm:text-sm font-bold text-gray-900 bg-gray-100">#</th>
                                            <th className="border-b p-3 text-left text-xs sm:text-sm font-bold text-gray-900 bg-gray-100 sticky left-0 z-20 w-48 sm:w-64 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Teacher Name</th>
                                            <th className="border-b p-3 text-left text-xs sm:text-sm font-bold text-gray-900 bg-gray-100">Department</th>
                                            <th className="border-b p-3 text-left text-xs sm:text-sm font-bold text-gray-900 bg-gray-100 max-w-[200px]">Subjects</th>
                                            <th className="border-b p-3 text-center text-xs sm:text-sm font-bold text-gray-900 bg-gray-100 w-24">Sessions</th>
                                            <th className="border-b p-3 text-center w-40 text-xs sm:text-sm font-bold text-gray-900 bg-gray-100">Avg. Attendance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {filteredTeachers.map((teacher, index) => (
                                            <tr key={teacher.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="p-3 text-center text-sm font-medium text-gray-500 bg-white">{index + 1}</td>
                                                <td className="p-3 bg-white sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] border-r border-gray-100">
                                                    <button
                                                        onClick={() => openTeacherDetail(teacher.id)}
                                                        className="text-left w-full hover:text-blue-600 group"
                                                    >
                                                        <p className="font-semibold text-gray-900 group-hover:text-blue-600 text-sm truncate">{teacher.name}</p>
                                                        <p className="text-xs text-gray-500 truncate max-w-[180px]">{teacher.email}</p>
                                                    </button>
                                                </td>
                                                <td className="p-3 text-sm text-gray-700 bg-white">{teacher.department}</td>
                                                <td className="p-3 text-xs text-gray-600 bg-white max-w-[200px] truncate" title={teacher.subjects}>
                                                    {teacher.subjects || '-'}
                                                </td>
                                                <td className="p-3 text-center text-sm font-semibold text-gray-700 bg-white">{teacher.totalSessions}</td>
                                                <td className="p-3 bg-white">
                                                    <div className="flex items-center gap-2 justify-center">
                                                        <div className="flex-1 h-2 max-w-[80px] bg-gray-100 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full ${getAttendanceColor(teacher.averageAttendance)}`}
                                                                style={{ width: `${teacher.averageAttendance}%` }}
                                                            />
                                                        </div>
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold min-w-[40px] text-center ${getAttendanceBadgeColor(teacher.averageAttendance)}`}>
                                                            {teacher.averageAttendance}%
                                                        </span>
                                                    </div>
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

            {/* Mobile Content */}
            {/* Mobile Content */}
            <div className="md:hidden px-4 py-4">
                {loading ? (
                    <div className="bg-white rounded-2xl p-8 text-center text-gray-500">Loading...</div>
                ) : filteredTeachers.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 text-center text-gray-500">No teachers found.</div>
                ) : (
                    <div className="space-y-3">
                        {filteredTeachers.map((teacher) => (
                            <button
                                key={teacher.id}
                                onClick={() => openTeacherDetail(teacher.id)}
                                className={`w-full bg-white rounded-2xl p-4 shadow-sm border-l-4 text-left ${teacher.averageAttendance >= 75 ? 'border-green-500' :
                                    teacher.averageAttendance >= 50 ? 'border-yellow-500' : 'border-red-500'
                                    }`}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                                {teacher.department}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getAttendanceBadgeColor(teacher.averageAttendance)}`}>
                                                {teacher.averageAttendance}%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <h3 className="font-semibold text-gray-900">{teacher.name}</h3>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                                            <span>{teacher.totalSessions} sessions</span>
                                            <span>•</span>
                                            <span className="truncate max-w-[150px]">{teacher.subjects || 'No subjects'}</span>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-gray-400 mt-2" />
                                </div>
                                <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${getAttendanceColor(teacher.averageAttendance)}`}
                                        style={{ width: `${teacher.averageAttendance}%` }}
                                    />
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Teacher Detail Popup - Responsive */}
            {
                (selectedTeacher || loadingDetail) && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-2 sm:p-4 z-50 backdrop-blur-sm">
                        <Card className="w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                            <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b bg-white rounded-t-lg shrink-0">
                                <CardTitle className="text-lg">Teacher Details</CardTitle>
                                <Button variant="ghost" size="sm" onClick={closePopup} className="h-8 w-8 p-0 rounded-full">
                                    <X className="h-4 w-4" />
                                </Button>
                            </CardHeader>
                            <CardContent className="overflow-y-auto p-4 flex-1">
                                {loadingDetail && !selectedTeacher ? (
                                    <div className="flex items-center justify-center h-40">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    </div>
                                ) : selectedTeacher && (
                                    <div className="space-y-6">
                                        {/* Teacher Info */}
                                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 rounded-xl shadow-md">
                                            <h3 className="text-xl font-bold">{selectedTeacher.teacher?.name || 'Unknown Teacher'}</h3>
                                            <p className="text-blue-100 text-sm">{selectedTeacher.teacher?.email || 'No Email'}</p>
                                            <div className="mt-2 inline-flex items-center px-2 py-1 bg-white/20 rounded text-xs backdrop-blur-sm">
                                                {selectedTeacher.teacher?.department || 'No Department'}
                                            </div>
                                        </div>

                                        {/* Filter Section */}
                                        {selectedTeacher.filters && (selectedTeacher.filters.departments?.length > 1 || selectedTeacher.filters.semesters?.length > 1) && (
                                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <Filter className="h-4 w-4 text-gray-500" />
                                                    <span className="font-semibold text-sm text-gray-700">Filter Data</span>
                                                </div>
                                                <div className="flex flex-col sm:flex-row gap-3">
                                                    {selectedTeacher.filters.departments?.length > 1 && (
                                                        <div className="flex-1">
                                                            <label className="block text-xs text-gray-500 mb-1">Department</label>
                                                            <select
                                                                value={popupDeptFilter}
                                                                onChange={(e) => setPopupDeptFilter(e.target.value)}
                                                                className="w-full px-3 py-2 border rounded-md text-sm bg-white"
                                                            >
                                                                <option value="">All Departments</option>
                                                                {selectedTeacher.filters.departments.map((dept) => (
                                                                    <option key={dept.id} value={dept.id}>
                                                                        {dept.name} ({dept.code})
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                    {selectedTeacher.filters.semesters?.length > 1 && (
                                                        <div className="flex-1">
                                                            <label className="block text-xs text-gray-500 mb-1">Semester</label>
                                                            <select
                                                                value={popupSemesterFilter}
                                                                onChange={(e) => setPopupSemesterFilter(e.target.value)}
                                                                className="w-full px-3 py-2 border rounded-md text-sm bg-white"
                                                            >
                                                                <option value="">All Semesters</option>
                                                                {selectedTeacher.filters.semesters.map((sem) => (
                                                                    <option key={sem} value={sem}>
                                                                        Semester {sem}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Summary Cards */}
                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                            <div className="bg-blue-50 p-3 rounded-lg text-center border border-blue-100">
                                                <BookOpen className="h-4 w-4 mx-auto text-blue-600 mb-1" />
                                                <p className="text-xl font-bold text-blue-700">{selectedTeacher.summary.totalSessions}</p>
                                                <p className="text-xs text-blue-600 font-medium">Sessions</p>
                                            </div>
                                            <div className="bg-purple-50 p-3 rounded-lg text-center border border-purple-100">
                                                <Users className="h-4 w-4 mx-auto text-purple-600 mb-1" />
                                                <p className="text-xl font-bold text-purple-700">{selectedTeacher.summary.totalStudents}</p>
                                                <p className="text-xs text-purple-600 font-medium">Students</p>
                                            </div>
                                            <div className="bg-green-50 p-3 rounded-lg text-center border border-green-100">
                                                <p className="text-lg mb-0 text-green-600">✓</p>
                                                <p className="text-xl font-bold text-green-700">{selectedTeacher.summary.presentCount}</p>
                                                <p className="text-xs text-green-600 font-medium">Present</p>
                                            </div>
                                            <div className="bg-red-50 p-3 rounded-lg text-center border border-red-100">
                                                <p className="text-lg mb-0 text-red-600">✗</p>
                                                <p className="text-xl font-bold text-red-700">{selectedTeacher.summary.absentCount}</p>
                                                <p className="text-xs text-red-600 font-medium">Absent</p>
                                            </div>
                                        </div>

                                        {/* Attendance Progress */}
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-semibold text-gray-700 text-sm">Overall Attendance</span>
                                                <span className={`text-xl font-bold ${selectedTeacher.summary.averageAttendance >= 75 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {selectedTeacher.summary.averageAttendance}%
                                                </span>
                                            </div>
                                            <div className="h-3 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                                                <div
                                                    className={`h-full rounded-full ${selectedTeacher.summary.averageAttendance >= 75 ? 'bg-green-500' : 'bg-red-500'} transition-all duration-500`}
                                                    style={{ width: `${selectedTeacher.summary.averageAttendance}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Subject Breakdown - Mobile Cards */}
                                        {selectedTeacher.subjects.length > 0 && (
                                            <div>
                                                <h4 className="font-semibold mb-3 text-sm text-gray-700">Subject-wise Breakdown</h4>
                                                <div className="space-y-2">
                                                    {selectedTeacher.subjects.map((subj) => (
                                                        <div key={subj.id} className="bg-gray-50 p-3 rounded-lg">
                                                            <div className="flex justify-between items-center mb-1">
                                                                <div>
                                                                    <span className="font-medium text-sm text-gray-800">{subj.name}</span>
                                                                    <span className="text-xs text-gray-500 ml-2">Sem {subj.semester}</span>
                                                                </div>
                                                                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getAttendanceBadgeColor(subj.attendance)}`}>
                                                                    {subj.attendance}%
                                                                </span>
                                                            </div>
                                                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full ${getAttendanceColor(subj.attendance)}`}
                                                                    style={{ width: `${subj.attendance}%` }}
                                                                />
                                                            </div>
                                                            <p className="text-xs text-gray-500 mt-1">{subj.sessions} sessions</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Monthly Trend */}
                                        {selectedTeacher.monthlyTrend.length > 0 && (
                                            <div>
                                                <h4 className="font-semibold mb-3 text-sm text-gray-700">Monthly Trend</h4>
                                                <div className="flex gap-2 overflow-x-auto pb-2">
                                                    {selectedTeacher.monthlyTrend.map((month) => (
                                                        <div key={month.month} className="flex-shrink-0 bg-white border p-2 rounded-lg text-center min-w-[70px] shadow-sm">
                                                            <p className="text-xs text-gray-500">{month.month}</p>
                                                            <p className={`text-sm font-bold ${month.attendance >= 75 ? 'text-green-600' : 'text-red-600'}`}>
                                                                {month.attendance}%
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )
            }
        </div >
    );
}
