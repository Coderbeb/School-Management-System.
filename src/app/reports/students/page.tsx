'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, X, BookOpen, CheckCircle, TrendingUp, GraduationCap, ChevronRight, FileText, FileSpreadsheet, FileDown, Calendar, Filter, ChevronDown, User, AlertCircle, Eye, CalendarDays } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Input } from '@/components/ui/input';
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

interface StudentAttendance {
    id: string;
    rollNumber: string;
    name: string;
    totalClasses: number;
    attended: number;
    percentage: number;
}

interface StudentDetail {
    student: {
        id: string;
        rollNumber: string;
        name: string;
        email: string;
        department: string;
        semester: number;
    };
    summary: {
        totalClasses: number;
        attended: number;
        attendancePercentage: number;
    };
    subjects: {
        id: string;
        name: string;
        code: string;
        totalClasses: number;
        attended: number;
        attendance: number;
    }[];
    monthlyTrend: {
        month: string;
        totalClasses: number;
        attended: number;
        attendance: number;
    }[];
    dailyBreakdown?: {
        date: string;
        subjectCode: string;
        subjectName: string;
        lectureNumber: number;
        status: string;
    }[];
    dateRange?: {
        startDate: string;
        endDate: string;
    } | null;
}

export default function StudentReportPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const statusParam = searchParams.get('status');
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [students, setStudents] = useState<StudentAttendance[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [selectedSemester, setSelectedSemester] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Detail popup state
    const [selectedStudent, setSelectedStudent] = useState<StudentDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    
    // Date range filter states for student detail
    const [popupStartDate, setPopupStartDate] = useState('');
    const [popupEndDate, setPopupEndDate] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.push('/login');
            return;
        }
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);

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
            fetchStudentReport(token);
        }
    }, [selectedDepartmentId, selectedSemester, user]);

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

    const fetchStudentReport = async (token: string) => {
        setLoading(true);
        try {
            let url = '/api/reports/students';
            const params = new URLSearchParams();
            if (selectedDepartmentId) params.append('departmentId', selectedDepartmentId);
            if (selectedSemester) params.append('semester', selectedSemester);
            if (params.toString()) url += '?' + params.toString();

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.push('/login');
                return;
            }
            const data = await res.json();
            if (data.students) {
                setStudents(data.students);
            }
        } catch (err) {
            console.error('Error fetching student report:', err);
        }
        setLoading(false);
    };

    const fetchStudentDetail = async (studentId: string, startDate?: string, endDate?: string) => {
        setLoadingDetail(true);
        setSelectedStudentId(studentId);
        try {
            const token = localStorage.getItem('token');
            let url = `/api/reports/students/${studentId}`;
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (params.toString()) url += '?' + params.toString();
            
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.push('/login');
                return;
            }
            const data = await res.json();
            setSelectedStudent(data);
        } catch (err) {
            console.error('Error fetching student detail:', err);
        }
        setLoadingDetail(false);
    };

    // Handle date filter apply in popup
    const applyDateFilter = () => {
        if (selectedStudentId) {
            fetchStudentDetail(selectedStudentId, popupStartDate, popupEndDate);
        }
    };

    // Clear date filter
    const clearDateFilter = () => {
        setPopupStartDate('');
        setPopupEndDate('');
        if (selectedStudentId) {
            fetchStudentDetail(selectedStudentId);
        }
    };

    // Close popup and reset states
    const closePopup = () => {
        setSelectedStudent(null);
        setSelectedStudentId(null);
        setPopupStartDate('');
        setPopupEndDate('');
    };

    // Download Report Card as PDF
    const downloadReportCard = () => {
        if (!selectedStudent || !user) return;

        const student = selectedStudent.student;
        const summary = selectedStudent.summary;
        const subjects = selectedStudent.subjects;
        const dateRange = selectedStudent.dateRange;
        
        const getStatus = (pct: number) => {
            if (pct >= 75) return { text: 'GOOD STANDING', color: '#16a34a' };
            if (pct >= 60) return { text: 'WARNING', color: '#ca8a04' };
            return { text: 'CRITICAL', color: '#dc2626' };
        };
        const status = getStatus(summary.attendancePercentage);

        const reportHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Report Card - ${student.name}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; background: #fff; color: #1f2937; }
        .container { max-width: 800px; margin: 0 auto; }
        .header { text-align: center; border-bottom: 3px solid #6366f1; padding-bottom: 20px; margin-bottom: 30px; }
        .college-name { font-size: 28px; font-weight: bold; color: #4f46e5; margin-bottom: 5px; }
        .report-title { font-size: 20px; color: #6b7280; margin-top: 10px; }
        .student-info { background: #f9fafb; border: 1px solid #e5e7eb; padding: 25px; border-radius: 12px; margin-bottom: 25px; }
        .student-name { font-size: 24px; font-weight: bold; margin-bottom: 15px; color: #111827; }
        .student-details { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; font-size: 14px; }
        .detail-item strong { color: #6b7280; display: block; font-size: 12px; text-transform: uppercase; margin-bottom: 2px; }
        .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px; }
        .summary-card { background: #fff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 10px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .summary-value { font-size: 32px; font-weight: bold; color: #4f46e5; }
        .summary-label { font-size: 12px; color: #6b7280; margin-top: 5px; text-transform: uppercase; letter-spacing: 0.5px; }
        .section-title { font-size: 16px; font-weight: 600; color: #374151; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        th { background: #f9fafb; color: #6b7280; padding: 12px 15px; text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
        td { padding: 12px 15px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
        td:last-child { text-align: center; font-weight: 600; }
        .status-box { padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 25px; background: #fff; }
        .status-text { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 12px; color: #9ca3af; }
        @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="college-name">YSM College of Engineering</div>
            <div class="report-title">ATTENDANCE REPORT CARD</div>
        </div>
        <div class="student-info">
            <div class="student-name">${student.name}</div>
            <div class="student-details">
                <div class="detail-item"><strong>Roll Number</strong> ${student.rollNumber}</div>
                <div class="detail-item"><strong>Department</strong> ${student.department}</div>
                <div class="detail-item"><strong>Semester</strong> Semester ${student.semester}</div>
                <div class="detail-item"><strong>Report Period</strong> ${dateRange ? `${dateRange.startDate} to ${dateRange.endDate}` : 'All Time'}</div>
            </div>
        </div>
        <div class="summary-cards">
            <div class="summary-card">
                <div class="summary-value" style="color: #1f2937;">${summary.totalClasses}</div>
                <div class="summary-label">Total Classes</div>
            </div>
            <div class="summary-card">
                <div class="summary-value" style="color: #059669;">${summary.attended}</div>
                <div class="summary-label">Classes Attended</div>
            </div>
            <div class="summary-card">
                <div class="summary-value" style="color: ${status.color};">${summary.attendancePercentage}%</div>
                <div class="summary-label">Attendance Rate</div>
            </div>
        </div>
        <div class="section-title">Subject-wise Breakdown</div>
        <table>
            <thead>
                <tr>
                    <th>Subject Name</th>
                    <th>Code</th>
                    <th style="text-align: center;">Total</th>
                    <th style="text-align: center;">Attended</th>
                    <th style="text-align: center;">%</th>
                </tr>
            </thead>
            <tbody>
                ${subjects.map(sub => `
                    <tr>
                        <td>${sub.name}</td>
                        <td><span style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${sub.code}</span></td>
                        <td style="text-align: center;">${sub.totalClasses}</td>
                        <td style="text-align: center;">${sub.attended}</td>
                        <td style="color: ${sub.attendance >= 75 ? '#16a34a' : sub.attendance >= 60 ? '#ca8a04' : '#dc2626'}">${sub.attendance}%</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <div class="status-box" style="border: 1px solid ${status.color}; background: ${status.color}05;">
            <div class="status-text" style="color: ${status.color};">${status.text}</div>
            <div style="color: #6b7280; font-size: 14px;">
                ${summary.attendancePercentage >= 75 ? 'Student maintains good attendance.' : summary.attendancePercentage >= 60 ? 'Attendance needs improvement.' : 'Critical attendance shortage.'}
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

    const filteredStudents = students.filter(student => {
        const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (student.rollNumber && String(student.rollNumber).toLowerCase().includes(searchTerm.toLowerCase()));
        
        if (!matchesSearch) return false;

        if (statusParam === 'critical') {
            return student.percentage < 60;
        }
        if (statusParam === 'warning') {
            return student.percentage >= 60 && student.percentage < 75;
        }

        return true;
    });

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

    const getStatusText = (percentage: number) => {
        if (percentage >= 75) return 'Good Standing';
        if (percentage >= 60) return 'Warning';
        return 'Critical';
    };

    const exportReport = (format: 'csv' | 'excel' | 'pdf') => {
        const headers = ['Roll Number', 'Name', 'Total Classes', 'Attended', 'Percentage', 'Status'];
        const rows = filteredStudents.map(s => {
            const status = s.percentage >= 75 ? 'Good Standing' : s.percentage >= 60 ? 'Warning' : 'Critical';
            return [
                s.rollNumber,
                s.name,
                s.totalClasses.toString(),
                s.attended.toString(),
                `${Math.round(s.percentage)}%`,
                status
            ];
        });

        const filename = `student_attendance_report_${new Date().toISOString().split('T')[0]}`;

        if (format === 'csv') {
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${filename}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else if (format === 'excel') {
            const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Student Report");
            XLSX.writeFile(workbook, `${filename}.xlsx`);
        } else if (format === 'pdf') {
            // Simple table print for export
            const printContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Student Attendance Report</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #1a365d; border-bottom: 2px solid #4f46e5; padding-bottom: 10px; }
        .meta { color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background-color: #4f46e5; color: white; padding: 12px 8px; text-align: left; }
        td { padding: 10px 8px; border-bottom: 1px solid #ddd; }
        tr:nth-child(even) { background-color: #f8f9fa; }
        .good { color: #047857; background-color: #d1fae5; }
        .warning { color: #b45309; background-color: #fef3c7; }
        .critical { color: #b91c1c; background-color: #fee2e2; }
        .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
</head>
<body>
    <h1>📊 Student Attendance Report</h1>
    <p class="meta">Generated on: ${new Date().toLocaleDateString()} | Total Students: ${filteredStudents.length}</p>
    <table>
        <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
            ${rows.map(row => {
                const status = row[5];
                const statusClass = status === 'Good Standing' ? 'good' : status === 'Warning' ? 'warning' : 'critical';
                return `<tr>${row.map((cell, i) => i === 5 ? `<td><span class="status-badge ${statusClass}">${cell}</span></td>` : `<td>${cell}</td>`).join('')}</tr>`;
            }).join('')}
        </tbody>
    </table>
</body>
</html>`;
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(printContent);
                printWindow.document.close();
                printWindow.onload = () => { printWindow.print(); };
            }
        }
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
                                    Student Reports <span className="inline-block animate-wave">🎓</span>
                                </h1>
                                <p className="text-blue-100 text-lg max-w-xl">
                                    View individual attendance records, track performance, and download detailed report cards.
                                </p>
                            </div>

                             {/* Export Buttons */}
                             <div className="flex gap-2 bg-white/10 p-1.5 rounded-xl backdrop-blur-sm border border-white/10 self-start">
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-white hover:bg-white/20 h-8 px-2"
                                    onClick={() => exportReport('pdf')}
                                    title="Export PDF"
                                >
                                    <FileText className="w-4 h-4" />
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-white hover:bg-white/20 h-8 px-2"
                                    onClick={() => exportReport('excel')}
                                    title="Export Excel"
                                >
                                    <FileSpreadsheet className="w-4 h-4" />
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-white hover:bg-white/20 h-8 px-2"
                                    onClick={() => exportReport('csv')}
                                    title="Export CSV"
                                >
                                    <FileDown className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
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
                                    <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block">Search Student</label>
                                    <div className="relative">
                                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                                        <input
                                            type="text"
                                            placeholder="Name or Roll No."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Department Filter */}
                                {(user?.role === 'super_admin' || departments.length > 1) && (
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

                                {/* Semester Filter */}
                                <div>
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
                                    onClick={() => {
                                        setSelectedSemester('');
                                        setSelectedDepartmentId('');
                                        setSearchTerm('');
                                        router.push('/reports/students');
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
                                        <p className="text-gray-500">Loading student records...</p>
                                    </div>
                                ) : filteredStudents.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <AlertCircle className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900">No students found</h3>
                                        <p className="text-gray-500 mt-1">Try adjusting your filters or search terms.</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Desktop View */}
                                        <div className="hidden md:block overflow-x-auto">
                                            <table className="w-full table-auto">
                                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                                    <tr>
                                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Classes</th>
                                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Attended</th>
                                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Attendance Rate</th>
                                                        <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {filteredStudents.map((student) => (
                                                        <tr key={student.id} className="hover:bg-gray-50/50 transition-colors group">
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="flex items-center">
                                                                    <div className="flex-shrink-0 h-10 w-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 font-bold text-sm">
                                                                        {student.name.charAt(0)}
                                                                    </div>
                                                                    <div className="ml-4">
                                                                        <div className="text-sm font-medium text-gray-900 group-hover:text-purple-600 transition-colors cursor-pointer" onClick={() => fetchStudentDetail(student.id)}>
                                                                            {student.name}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded inline-block mt-0.5">
                                                                            {student.rollNumber}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600">
                                                                {student.totalClasses}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">
                                                                {student.attended}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap align-middle">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex-1 w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                        <div 
                                                                            className={`h-full rounded-full ${getAttendanceColor(student.percentage)}`}
                                                                            style={{ width: `${Math.min(student.percentage, 100)}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${getAttendanceBadgeColor(student.percentage)}`}>
                                                                        {student.percentage}%
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="sm"
                                                                    onClick={() => fetchStudentDetail(student.id)}
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
                                            {filteredStudents.map((student) => (
                                                <div 
                                                    key={student.id} 
                                                    onClick={() => fetchStudentDetail(student.id)}
                                                    className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm active:scale-[0.99] transition-transform"
                                                >
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-10 w-10 bg-purple-50 rounded-full flex items-center justify-center text-purple-600 font-bold text-sm">
                                                                {student.name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <div className="font-semibold text-gray-900 text-sm">{student.name}</div>
                                                                <div className="text-xs text-gray-500 font-mono bg-gray-50 px-1.5 py-0.5 rounded inline-block">
                                                                    {student.rollNumber}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <span className={`text-xs font-bold px-2 py-1 rounded ${getAttendanceBadgeColor(student.percentage)}`}>
                                                            {student.percentage}%
                                                        </span>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                                                        <span className="flex items-center gap-1">
                                                            <BookOpen className="w-3 h-3" /> {student.totalClasses} Classes
                                                        </span>
                                                        <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                                        <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                                            <CheckCircle className="w-3 h-3" /> {student.attended} Present
                                                        </span>
                                                    </div>

                                                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full ${getAttendanceColor(student.percentage)}`}
                                                            style={{ width: `${Math.min(student.percentage, 100)}%` }}
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

                {/* Detail Popup Modal */}
                {/* Note: In a real app, use a proper Dialog component. Using fixed overlay for valid single-file requirement. */}
                {(selectedStudent || loadingDetail) && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
                            {/* Modal Header */}
                            <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <User className="w-5 h-5 text-purple-600" />
                                    Student Details
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
                                ) : selectedStudent && (
                                    <div className="space-y-8">
                                        {/* Profile Card */}
                                        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-100">
                                            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center text-2xl font-bold text-purple-600 border border-purple-100">
                                                        {selectedStudent.student.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <h2 className="text-xl font-bold text-gray-900">{selectedStudent.student.name}</h2>
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                            <span className="px-2 py-0.5 bg-white text-gray-600 text-xs font-mono rounded border border-gray-200">
                                                                {selectedStudent.student.rollNumber}
                                                            </span>
                                                            <span className="px-2 py-0.5 bg-white text-gray-600 text-xs rounded border border-gray-200">
                                                                {selectedStudent.student.department}
                                                            </span>
                                                            <span className="px-2 py-0.5 bg-white text-gray-600 text-xs rounded border border-gray-200">
                                                                Sem {selectedStudent.student.semester}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex gap-2">
                                                    <Button size="sm" onClick={downloadReportCard} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                                        <FileText className="w-4 h-4 mr-2" /> Download Report
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 gap-4 mt-6">
                                                <div className="bg-white p-4 rounded-xl shadow-sm border border-purple-100 text-center">
                                                    <div className="text-xs uppercase text-gray-500 font-semibold tracking-wider mb-1">Total Classes</div>
                                                    <div className="text-2xl font-bold text-gray-900">{selectedStudent.summary.totalClasses}</div>
                                                </div>
                                                <div className="bg-white p-4 rounded-xl shadow-sm border border-emerald-100 text-center">
                                                    <div className="text-xs uppercase text-gray-500 font-semibold tracking-wider mb-1">Attended</div>
                                                    <div className="text-2xl font-bold text-emerald-600">{selectedStudent.summary.attended}</div>
                                                </div>
                                                <div className={`bg-white p-4 rounded-xl shadow-sm border text-center ${
                                                    selectedStudent.summary.attendancePercentage >= 75 ? 'border-emerald-100' : 'border-amber-100'
                                                }`}>
                                                    <div className="text-xs uppercase text-gray-500 font-semibold tracking-wider mb-1">Attendance</div>
                                                    <div className={`text-2xl font-bold ${
                                                        selectedStudent.summary.attendancePercentage >= 75 ? 'text-emerald-600' : 
                                                        selectedStudent.summary.attendancePercentage >= 60 ? 'text-amber-600' : 'text-red-600'
                                                    }`}>
                                                        {selectedStudent.summary.attendancePercentage}%
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Filters for Detail */}
                                        <div className="bg-gray-50 p-4 rounded-xl flex flex-wrap items-center gap-3 border border-gray-100">
                                            <span className="text-sm font-medium text-gray-700">Filter Range:</span>
                                            <Input 
                                                type="date" 
                                                value={popupStartDate} 
                                                onChange={(e) => setPopupStartDate(e.target.value)}
                                                className="w-auto h-9 bg-white"
                                            />
                                            <span className="text-gray-400">-</span>
                                            <Input 
                                                type="date" 
                                                value={popupEndDate} 
                                                onChange={(e) => setPopupEndDate(e.target.value)}
                                                className="w-auto h-9 bg-white"
                                            />
                                            <Button size="sm" variant="secondary" onClick={applyDateFilter}>Apply</Button>
                                            {(popupStartDate || popupEndDate) && (
                                                <Button size="sm" variant="ghost" onClick={clearDateFilter}>Clear</Button>
                                            )}
                                        </div>

                                        {/* Subject Wise List */}
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
                                                            <th className="px-4 py-3 text-center">Total</th>
                                                            <th className="px-4 py-3 text-center">Attended</th>
                                                            <th className="px-4 py-3 text-center">Percentage</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y">
                                                        {selectedStudent.subjects.map((sub) => (
                                                            <tr key={sub.id} className="bg-white hover:bg-gray-50/50">
                                                                <td className="px-4 py-3">
                                                                    <div className="font-medium text-gray-900">{sub.name}</div>
                                                                    <div className="text-xs text-gray-500 font-mono">{sub.code}</div>
                                                                </td>
                                                                <td className="px-4 py-3 text-center text-gray-600">{sub.totalClasses}</td>
                                                                <td className="px-4 py-3 text-center text-gray-600">{sub.attended}</td>
                                                                <td className="px-4 py-3 text-center">
                                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${getAttendanceBadgeColor(sub.attendance)}`}>
                                                                        {sub.attendance}%
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* Monthly Trend (Simplified Bar) */}
                                        {selectedStudent.monthlyTrend.length > 0 && (
                                            <div>
                                                 <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                                    <TrendingUp className="w-4 h-4 text-purple-600" />
                                                    Monthly Trend
                                                </h4>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                                    {selectedStudent.monthlyTrend.map((trend) => (
                                                        <div key={trend.month} className="bg-white border rounded-lg p-3 text-center shadow-sm">
                                                            <div className="text-xs text-gray-500 mb-1">{trend.month}</div>
                                                            <div className={`text-lg font-bold ${
                                                                trend.attendance >= 75 ? 'text-emerald-600' : 'text-red-500'
                                                            }`}>
                                                                {trend.attendance}%
                                                            </div>
                                                            <div className="text-xs text-gray-400 mt-1">
                                                                {trend.attended}/{trend.totalClasses}
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
