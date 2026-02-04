'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, X, Users, BookOpen, TrendingUp, Filter, ChevronRight, FileDown, ArrowLeft, ChevronDown, CheckCircle, AlertCircle, Eye } from 'lucide-react';
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

    // Download Teacher Report Card as PDF
    const downloadTeacherReportCard = () => {
        if (!selectedTeacher || !user) return;

        const teacher = selectedTeacher.teacher;
        const summary = selectedTeacher.summary;
        const subjects = selectedTeacher.subjects;
        const monthlyTrend = selectedTeacher.monthlyTrend;

        const getStatus = (pct: number) => {
            if (pct >= 75) return { text: 'EXCELLENT PERFORMANCE', color: '#16a34a' };
            if (pct >= 60) return { text: 'GOOD PERFORMANCE', color: '#ca8a04' };
            return { text: 'NEEDS IMPROVEMENT', color: '#dc2626' };
        };
        const status = getStatus(summary.averageAttendance);

        const reportHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Teacher Report - ${teacher.name}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; background: #fff; color: #1f2937; }
        .container { max-width: 800px; margin: 0 auto; }
        .header { text-align: center; border-bottom: 3px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
        .college-name { font-size: 28px; font-weight: bold; color: #4f46e5; margin-bottom: 5px; }
        .report-title { font-size: 20px; color: #6b7280; margin-top: 10px; }
        .teacher-info { background: #f9fafb; border: 1px solid #e5e7eb; padding: 25px; border-radius: 12px; margin-bottom: 25px; }
        .teacher-name { font-size: 24px; font-weight: bold; margin-bottom: 5px; color: #111827; }
        .teacher-email { font-size: 14px; color: #6b7280; margin-bottom: 15px; display: block; }
        .teacher-details { display: flex; gap: 20px; flex-wrap: wrap; font-size: 14px; }
        .teacher-details span { background: #fff; border: 1px solid #e5e7eb; padding: 6px 14px; border-radius: 6px; font-weight: 500; color: #374151; }
        .summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; }
        .summary-card { background: #fff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 10px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .summary-value { font-size: 28px; font-weight: bold; color: #4f46e5; }
        .summary-label { font-size: 11px; color: #6b7280; margin-top: 5px; text-transform: uppercase; letter-spacing: 0.5px; }
        .section-title { font-size: 16px; font-weight: 600; color: #374151; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        th { background: #f9fafb; color: #6b7280; padding: 12px 15px; text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
        td { padding: 12px 15px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
        td:last-child { text-align: center; font-weight: 600; }
        .status-box { padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 25px; background: #fff; }
        .status-text { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 12px; color: #9ca3af; }
        .trend-container { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 25px; }
        .trend-item { background: #fff; border: 1px solid #e5e7eb; padding: 10px 15px; border-radius: 8px; text-align: center; min-width: 80px; }
        .trend-month { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
        .trend-value { font-size: 16px; font-weight: bold; }
        @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="college-name">YSM College of Engineering</div>
            <div class="report-title">TEACHER PERFORMANCE REPORT</div>
        </div>
        <div class="teacher-info">
            <div class="teacher-name">${teacher.name}</div>
            <span class="teacher-email">${teacher.email}</span>
            <div class="teacher-details">
                <span>Department: ${teacher.department}</span>
                <span>Subjects: ${subjects.length}</span>
                <span>Total Sessions: ${summary.totalSessions}</span>
            </div>
        </div>
        <div class="summary-cards">
            <div class="summary-card">
                <div class="summary-value" style="color: #4f46e5;">${summary.totalSessions}</div>
                <div class="summary-label">Sessions</div>
            </div>
            <div class="summary-card">
                <div class="summary-value" style="color: #7c3aed;">${summary.totalStudents}</div>
                <div class="summary-label">Students</div>
            </div>
            <div class="summary-card">
                <div class="summary-value" style="color: #059669;">${summary.presentCount}</div>
                <div class="summary-label">Present</div>
            </div>
            <div class="summary-card">
                <div class="summary-value" style="color: #dc2626;">${summary.absentCount}</div>
                <div class="summary-label">Absent</div>
            </div>
        </div>
        <div class="section-title">Subject-wise Performance</div>
        <table>
            <thead>
                <tr>
                    <th>Subject</th>
                    <th>Code</th>
                    <th>Semester</th>
                    <th style="text-align: center;">Sessions</th>
                    <th style="text-align: center;">Attendance %</th>
                </tr>
            </thead>
            <tbody>
                ${subjects.map(sub => `
                    <tr>
                        <td>${sub.name}</td>
                        <td>${sub.code}</td>
                        <td>Sem ${sub.semester}</td>
                        <td style="text-align: center;">${sub.sessions}</td>
                        <td style="color: ${sub.attendance >= 75 ? '#059669' : sub.attendance >= 60 ? '#d97706' : '#dc2626'}">${sub.attendance}%</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${monthlyTrend.length > 0 ? `
            <div class="section-title">Monthly Trend</div>
            <div class="trend-container">
                ${monthlyTrend.map(m => `
                    <div class="trend-item">
                        <div class="trend-month">${m.month}</div>
                        <div class="trend-value" style="color: ${m.attendance >= 75 ? '#059669' : '#dc2626'};">${m.attendance}%</div>
                    </div>
                `).join('')}
            </div>
        ` : ''}
        <div class="status-box" style="border: 1px solid ${status.color}; background: ${status.color}05;">
            <div class="status-text" style="color: ${status.color};">${status.text}</div>
            <div style="color: #6b7280; font-size: 14px;">
                Overall Attendance Rate: ${summary.averageAttendance}%
            </div>
        </div>
        <div class="footer">
            <div>Generated on ${new Date().toLocaleDateString()}</div>
            <div>Approved by: ${user.firstName} ${user.lastName}</div>
        </div>
    </div>
</body>
</html>`;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(reportHTML);
            printWindow.document.close();
            printWindow.onload = () => { printWindow.print(); };
        }
    };

    const filteredTeachers = teachers.filter(teacher =>
        teacher.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacher.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacher.department.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getAttendanceColor = (percentage: number) => {
        if (percentage >= 85) return 'bg-emerald-500';
        if (percentage >= 75) return 'bg-emerald-400';
        if (percentage >= 60) return 'bg-amber-500';
        if (percentage >= 40) return 'bg-amber-600';
        return 'bg-red-500';
    };

    const getAttendanceBadgeColor = (percentage: number) => {
        if (percentage >= 75) return 'bg-emerald-100 text-emerald-800';
        if (percentage >= 60) return 'bg-amber-100 text-amber-800';
        return 'bg-red-100 text-red-800';
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col pt-16 font-sans">
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

            {/* Consistent Purple Gradient Header */}
            <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white relative overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/2"></div>
                </div>
                
                <div className="max-w-7xl mx-auto px-4 py-8 relative">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center space-x-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push('/reports')}
                                className="text-white/90 hover:bg-white/20 hover:text-white"
                            >
                                <ArrowLeft className="w-4 h-4 mr-1" />
                                Back
                            </Button>
                            <div>
                                <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
                                    <Users className="w-6 h-6 md:w-8 md:h-8 opacity-90" />
                                    Teacher Reports
                                </h1>
                                <p className="text-purple-100 mt-1 opacity-90">Analyze teacher attendance & performance</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full -mt-8 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Filters Sidebar */}
                    <div className="lg:col-span-1 space-y-4">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sticky top-24">
                            <div className="flex items-center gap-2 mb-4 text-gray-800 font-semibold border-b pb-2">
                                <Filter className="w-4 h-4 text-purple-600" />
                                Filters
                            </div>
                            
                            <div className="space-y-4">
                                {/* Search */}
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block">Search Teacher</label>
                                    <div className="relative">
                                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                                        <input
                                            type="text"
                                            placeholder="Name, Email or Dept..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Department Filter */}
                                {user?.role === 'super_admin' && (
                                    <div>
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

                                <Button 
                                    className="w-full bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200"
                                    onClick={() => {
                                        setSelectedDepartmentId('');
                                        setSearchTerm('');
                                    }}
                                >
                                    Reset Filters
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Report Data */}
                    <div className="lg:col-span-3">
                        <Card className="border-0 shadow-sm border-gray-100 bg-white overflow-hidden">
                            <CardContent className="p-0">
                                {loading ? (
                                    <div className="p-12 text-center">
                                        <div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-4"></div>
                                        <p className="text-gray-500">Loading teacher reports...</p>
                                    </div>
                                ) : filteredTeachers.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <AlertCircle className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900">No teachers found</h3>
                                        <p className="text-gray-500 mt-1">Try adjusting your filters or search terms.</p>
                                    </div>
                                ) : (
                                    <>
                                         {/* Desktop View */}
                                         <div className="hidden md:block overflow-x-auto">
                                            <table className="w-full table-auto">
                                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                                    <tr>
                                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Teacher</th>
                                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Sessions</th>
                                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg. Attendance</th>
                                                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {filteredTeachers.map((teacher) => (
                                                        <tr key={teacher.id} className="hover:bg-gray-50/50 transition-colors group">
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex items-center">
                                                                    <div className="flex-shrink-0 h-10 w-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 font-bold text-sm">
                                                                        {teacher.name.charAt(0)}
                                                                    </div>
                                                                    <div className="ml-4">
                                                                        <div className="text-sm font-medium text-gray-900 group-hover:text-purple-600 transition-colors cursor-pointer" onClick={() => openTeacherDetail(teacher.id)}>
                                                                            {teacher.name}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500">{teacher.email}</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                                {teacher.department}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">
                                                                {teacher.totalSessions}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap align-middle">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex-1 w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                        <div 
                                                                            className={`h-full rounded-full ${getAttendanceColor(teacher.averageAttendance)}`}
                                                                            style={{ width: `${Math.min(teacher.averageAttendance, 100)}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${getAttendanceBadgeColor(teacher.averageAttendance)}`}>
                                                                        {teacher.averageAttendance}%
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="sm"
                                                                    onClick={() => openTeacherDetail(teacher.id)}
                                                                    className="text-gray-400 hover:text-purple-600 hover:bg-purple-50"
                                                                >
                                                                    <Eye className="w-4 h-4" />
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Mobile View */}
                                        <div className="md:hidden p-4 space-y-4">
                                            {filteredTeachers.map((teacher) => (
                                                <div 
                                                    key={teacher.id} 
                                                    onClick={() => openTeacherDetail(teacher.id)}
                                                    className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm active:scale-[0.99] transition-transform"
                                                >
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 font-bold text-sm">
                                                                {teacher.name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <div className="font-semibold text-gray-900 text-sm">{teacher.name}</div>
                                                                <div className="text-xs text-gray-500">{teacher.department}</div>
                                                            </div>
                                                        </div>
                                                        <span className={`text-xs font-bold px-2 py-1 rounded ${getAttendanceBadgeColor(teacher.averageAttendance)}`}>
                                                            {teacher.averageAttendance}%
                                                        </span>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                                                        <span className="flex items-center gap-1">
                                                            <BookOpen className="w-3 h-3" /> {teacher.totalSessions} Sessions
                                                        </span>
                                                    </div>

                                                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full ${getAttendanceColor(teacher.averageAttendance)}`}
                                                            style={{ width: `${Math.min(teacher.averageAttendance, 100)}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Teacher Detail Popup */}
                {(selectedTeacher || loadingDetail) && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
                             {/* Modal Header */}
                             <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-purple-600" />
                                    Teacher Details
                                </h3>
                                <Button variant="ghost" size="icon" onClick={closePopup} className="h-8 w-8 rounded-full">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                                {loadingDetail ? (
                                    <div className="flex flex-col items-center justify-center py-12">
                                        <div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full mb-4"></div>
                                        <p className="text-sm text-gray-500">Loading details...</p>
                                    </div>
                                ) : selectedTeacher && (
                                    <div className="space-y-8">
                                         {/* Profile Card */}
                                         <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-100">
                                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center text-2xl font-bold text-purple-600 border border-purple-100">
                                                        {selectedTeacher.teacher.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <h2 className="text-xl font-bold text-gray-900">{selectedTeacher.teacher.name}</h2>
                                                        <p className="text-sm text-gray-500">{selectedTeacher.teacher.email}</p>
                                                        <div className="flex flex-wrap gap-2 mt-2">
                                                            <span className="px-2 py-0.5 bg-white text-gray-600 text-xs rounded border border-gray-200">
                                                                {selectedTeacher.teacher.department}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex gap-2">
                                                    <Button size="sm" onClick={downloadTeacherReportCard} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                                        <FileDown className="w-4 h-4 mr-2" /> Download Report
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                                                <div className="bg-white p-4 rounded-xl shadow-sm border border-purple-100 text-center">
                                                    <div className="text-xs uppercase text-gray-500 font-semibold tracking-wider mb-1">Total Sessions</div>
                                                    <div className="text-2xl font-bold text-gray-900">{selectedTeacher.summary.totalSessions}</div>
                                                </div>
                                                <div className="bg-white p-4 rounded-xl shadow-sm border border-purple-100 text-center">
                                                    <div className="text-xs uppercase text-gray-500 font-semibold tracking-wider mb-1">Total Students</div>
                                                    <div className="text-2xl font-bold text-purple-600">{selectedTeacher.summary.totalStudents}</div>
                                                </div>
                                                 <div className="bg-white p-4 rounded-xl shadow-sm border border-emerald-100 text-center">
                                                    <div className="text-xs uppercase text-gray-500 font-semibold tracking-wider mb-1">Present</div>
                                                    <div className="text-2xl font-bold text-emerald-600">{selectedTeacher.summary.presentCount}</div>
                                                </div>
                                                <div className="bg-white p-4 rounded-xl shadow-sm border border-red-100 text-center">
                                                    <div className="text-xs uppercase text-gray-500 font-semibold tracking-wider mb-1">Absent</div>
                                                    <div className="text-2xl font-bold text-red-600">{selectedTeacher.summary.absentCount}</div>
                                                </div>
                                            </div>

                                            <div className="mt-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                                                <span className="font-semibold text-gray-700 text-sm">Overall Attendance Rate</span>
                                                <span className={`text-xl font-bold ${getAttendanceBadgeColor(selectedTeacher.summary.averageAttendance).split(' ')[1]}`}>
                                                    {selectedTeacher.summary.averageAttendance}%
                                                </span>
                                            </div>
                                        </div>

                                        {/* Filters for Detail (Department/Semester if applicable) */}
                                        {((selectedTeacher.filters.departments && selectedTeacher.filters.departments.length > 1) || 
                                          (selectedTeacher.filters.semesters && selectedTeacher.filters.semesters.length > 1)) && (
                                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                                <div className="text-xs font-semibold text-gray-500 uppercase mb-3">Filter Details</div>
                                                <div className="flex flex-col sm:flex-row gap-3">
                                                    {selectedTeacher.filters.departments?.length > 1 && (
                                                        <select
                                                            value={popupDeptFilter}
                                                            onChange={(e) => setPopupDeptFilter(e.target.value)}
                                                            className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                                                        >
                                                            <option value="">All Departments</option>
                                                            {selectedTeacher.filters.departments.map((dept) => (
                                                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    {selectedTeacher.filters.semesters?.length > 1 && (
                                                        <select
                                                            value={popupSemesterFilter}
                                                            onChange={(e) => setPopupSemesterFilter(e.target.value)}
                                                            className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                                                        >
                                                            <option value="">All Semesters</option>
                                                            {selectedTeacher.filters.semesters.map((sem) => (
                                                                <option key={sem} value={sem}>Semester {sem}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Subject Breakdown */}
                                        {selectedTeacher.subjects.length > 0 && (
                                            <div>
                                                 <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                                    <BookOpen className="w-4 h-4 text-purple-600" />
                                                    Subject Performance
                                                </h4>
                                                <div className="border rounded-xl overflow-hidden shadow-sm">
                                                    <table className="w-full text-sm text-left">
                                                        <thead className="bg-gray-50 text-gray-500 font-semibold border-b">
                                                            <tr>
                                                                <th className="px-4 py-3">Subject</th>
                                                                <th className="px-4 py-3 text-center">Sessions</th>
                                                                <th className="px-4 py-3 text-center">Attendance</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y">
                                                            {selectedTeacher.subjects.map((subj) => (
                                                                <tr key={subj.id} className="bg-white hover:bg-gray-50/50">
                                                                    <td className="px-4 py-3">
                                                                        <div className="font-medium text-gray-900">{subj.name}</div>
                                                                        <div className="text-xs text-gray-500">Sem {subj.semester} • {subj.code}</div>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-center text-gray-600">{subj.sessions}</td>
                                                                    <td className="px-4 py-3 text-center">
                                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${getAttendanceBadgeColor(subj.attendance)}`}>
                                                                            {subj.attendance}%
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* Monthly Trend */}
                                         {selectedTeacher.monthlyTrend.length > 0 && (
                                            <div>
                                                 <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                                    <TrendingUp className="w-4 h-4 text-purple-600" />
                                                    Monthly Trend
                                                </h4>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                                                    {selectedTeacher.monthlyTrend.map((trend) => (
                                                        <div key={trend.month} className="bg-white border rounded-lg p-3 text-center shadow-sm">
                                                            <div className="text-xs text-gray-500 mb-1">{trend.month}</div>
                                                            <div className={`text-lg font-bold ${
                                                                trend.attendance >= 75 ? 'text-emerald-600' : 'text-red-500'
                                                            }`}>
                                                                {trend.attendance}%
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
