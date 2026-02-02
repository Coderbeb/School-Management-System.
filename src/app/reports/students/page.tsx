'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, X, BookOpen, CheckCircle, TrendingUp, GraduationCap, ChevronRight, FileText, FileSpreadsheet, FileDown } from 'lucide-react';
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
}

export default function StudentReportPage() {
    const router = useRouter();
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

    const fetchStudentDetail = async (studentId: string) => {
        setLoadingDetail(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/reports/students/${studentId}`, {
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

    const filteredStudents = students.filter(student =>
        student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.rollNumber.toLowerCase().includes(searchTerm.toLowerCase())
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

    const getStatusBadge = (percentage: number) => {
        if (percentage >= 75) return { text: '✓ Good Standing', color: 'text-green-600 bg-green-50' };
        if (percentage >= 60) return { text: '⚠ Warning', color: 'text-yellow-600 bg-yellow-50' };
        return { text: '✗ Critical', color: 'text-red-600 bg-red-50' };
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
            // Generate a printable HTML and trigger print dialog for PDF
            const printContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Student Attendance Report</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #1a365d; border-bottom: 2px solid #4472C4; padding-bottom: 10px; }
        .meta { color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background-color: #4472C4; color: white; padding: 12px 8px; text-align: left; }
        td { padding: 10px 8px; border-bottom: 1px solid #ddd; }
        tr:nth-child(even) { background-color: #f8f9fa; }
        .good { color: #166534; background-color: #dcfce7; }
        .warning { color: #854d0e; background-color: #fef9c3; }
        .critical { color: #991b1b; background-color: #fee2e2; }
        .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
</head>
<body>
    <h1>📊 Student Attendance Report</h1>
    <p class="meta">Generated on: ${new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })} | Total Students: ${filteredStudents.length}</p>
    <table>
        <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
            ${rows.map(row => {
                const status = row[5];
                const statusClass = status === 'Good Standing' ? 'good' : status === 'Warning' ? 'warning' : 'critical';
                return `<tr>
                    ${row.map((cell, i) => i === 5
                    ? `<td><span class="status-badge ${statusClass}">${cell}</span></td>`
                    : `<td>${cell}</td>`
                ).join('')}
                </tr>`;
            }).join('')}
        </tbody>
    </table>
</body>
</html>`;

            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(printContent);
                printWindow.document.close();
                printWindow.onload = () => {
                    printWindow.print();
                };
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

            <div className="flex-1 pt-20 px-4 max-w-7xl mx-auto w-full">
                {/* Page Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                            <GraduationCap className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Student Reports</h1>
                            <p className="text-sm text-gray-500">Individual student attendance records</p>
                        </div>
                    </div>
                </div>

                {/* Mobile Controls (Search + Filters + Export) - moved from old header */}
                <div className="md:hidden space-y-4 mb-6">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowSearch(!showSearch)}
                            className="flex-1 bg-white p-2.5 rounded-xl border border-gray-200 text-gray-600 flex items-center justify-center gap-2 text-sm font-medium shadow-sm"
                        >
                            <Search className="w-4 h-4" />
                            {showSearch ? 'Hide Search' : 'Search Students'}
                        </button>
                    </div>

                    {showSearch && (
                        <Input
                            type="text"
                            placeholder="Search by name or roll..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white"
                        />
                    )}

                    <div className="flex gap-2">
                        {(user?.role === 'super_admin' || departments.length > 1) && (
                            <select
                                value={selectedDepartmentId}
                                onChange={(e) => setSelectedDepartmentId(e.target.value)}
                                className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500"
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
                            className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500"
                        >
                            <option value="">All Sem</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                                <option key={sem} value={sem}>Sem {sem}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={() => exportReport('pdf')}
                            className="flex-1 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-medium flex items-center justify-center gap-1 border border-red-100"
                        >
                            <FileText className="w-4 h-4" /> PDF
                        </button>
                        <button
                            onClick={() => exportReport('excel')}
                            className="flex-1 py-2 bg-green-50 text-green-600 rounded-lg text-xs font-medium flex items-center justify-center gap-1 border border-green-100"
                        >
                            <FileSpreadsheet className="w-4 h-4" /> Excel
                        </button>
                        <button
                            onClick={() => exportReport('csv')}
                            className="flex-1 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium flex items-center justify-center gap-1 border border-blue-100"
                        >
                            <FileDown className="w-4 h-4" /> CSV
                        </button>
                    </div>
                </div>

                {/* Desktop Content */}
                <main className="hidden md:block max-w-7xl mx-auto px-4 py-8">
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>Filters</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-4 items-end">
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

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
                                    <select
                                        value={selectedSemester}
                                        onChange={(e) => setSelectedSemester(e.target.value)}
                                        className="px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">All Semesters</option>
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                                            <option key={sem} value={sem}>Semester {sem}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex-1 min-w-[200px]">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                                        <Input
                                            type="text"
                                            placeholder="Search by name or roll number..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-9 bg-white"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => exportReport('pdf')} title="Export PDF">
                                        <FileText className="w-4 h-4 text-red-600 mr-2" />
                                        PDF
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => exportReport('excel')} title="Export Excel">
                                        <FileSpreadsheet className="w-4 h-4 text-green-600 mr-2" />
                                        Excel
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => exportReport('csv')} title="Export CSV">
                                        <FileDown className="w-4 h-4 text-blue-600 mr-2" />
                                        CSV
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Student Attendance Overview ({filteredStudents.length} students)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <p>Loading...</p>
                            ) : filteredStudents.length === 0 ? (
                                <p className="text-gray-500">No students found.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="bg-gray-100">
                                                <th className="border p-3 text-left">Roll No</th>
                                                <th className="border p-3 text-left">Name</th>
                                                <th className="border p-3 text-center">Classes</th>
                                                <th className="border p-3 text-center">Attended</th>
                                                <th className="border p-3 text-center w-48">Attendance</th>
                                                <th className="border p-3 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredStudents.map((student) => {
                                                const status = getStatusBadge(student.percentage);
                                                return (
                                                    <tr key={student.id} className="hover:bg-gray-50">
                                                        <td className="border p-3 font-mono">{student.rollNumber}</td>
                                                        <td className="border p-3">
                                                            <button
                                                                onClick={() => fetchStudentDetail(student.id)}
                                                                className="text-blue-600 hover:underline font-medium text-left"
                                                            >
                                                                {student.name}
                                                            </button>
                                                        </td>
                                                        <td className="border p-3 text-center">{student.totalClasses}</td>
                                                        <td className="border p-3 text-center font-semibold text-green-600">{student.attended}</td>
                                                        <td className="border p-3">
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full ${getAttendanceColor(student.percentage)} transition-all`}
                                                                        style={{ width: `${student.percentage}%` }}
                                                                    />
                                                                </div>
                                                                <span className={`px-2 py-1 rounded text-xs font-semibold min-w-[50px] text-center ${getAttendanceBadgeColor(student.percentage)}`}>
                                                                    {student.percentage}%
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="border p-3 text-center">
                                                            <span className={`px-2 py-1 rounded text-xs font-semibold ${status.color}`}>
                                                                {status.text}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </main>

                {/* Mobile Content */}
                <main className="md:hidden px-4 py-4">
                    {loading ? (
                        <div className="bg-white rounded-2xl p-8 text-center text-gray-500">Loading...</div>
                    ) : filteredStudents.length === 0 ? (
                        <div className="bg-white rounded-2xl p-8 text-center text-gray-500">No students found.</div>
                    ) : (
                        <div className="space-y-3">
                            {filteredStudents.map((student) => {
                                const status = getStatusBadge(student.percentage);
                                return (
                                    <button
                                        key={student.id}
                                        onClick={() => fetchStudentDetail(student.id)}
                                        className={`w-full bg-white rounded-2xl p-4 shadow-sm border-l-4 text-left ${student.percentage >= 75 ? 'border-green-500' :
                                            student.percentage >= 50 ? 'border-yellow-500' : 'border-red-500'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-mono">
                                                        {student.rollNumber}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getAttendanceBadgeColor(student.percentage)}`}>
                                                        {student.percentage}%
                                                    </span>
                                                </div>
                                                <h3 className="font-semibold text-gray-900">{student.name}</h3>
                                                <p className="text-sm text-gray-500">
                                                    {student.attended}/{student.totalClasses} classes
                                                </p>
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-gray-400 mt-2" />
                                        </div>
                                        {/* Progress bar */}
                                        <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${getAttendanceColor(student.percentage)}`}
                                                style={{ width: `${student.percentage}%` }}
                                            />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </main>

                {/* Student Detail Popup */}
                {(selectedStudent || loadingDetail) && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle>Student Details</CardTitle>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedStudent(null)}>
                                    <X className="h-5 w-5" />
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {loadingDetail ? (
                                    <p className="text-center py-8">Loading...</p>
                                ) : selectedStudent && (
                                    <div className="space-y-6">
                                        {/* Student Info */}
                                        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <GraduationCap className="h-10 w-10" />
                                                <div>
                                                    <h3 className="text-xl font-bold">{selectedStudent.student.name}</h3>
                                                    <p className="text-indigo-100">Roll No: {selectedStudent.student.rollNumber}</p>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2 text-sm">
                                                <span className="bg-white/20 px-2 py-1 rounded">{selectedStudent.student.department}</span>
                                                <span className="bg-white/20 px-2 py-1 rounded">Sem {selectedStudent.student.semester}</span>
                                            </div>
                                        </div>

                                        {/* Summary Cards */}
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="bg-blue-50 p-3 rounded-lg text-center">
                                                <BookOpen className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                                                <p className="text-xl font-bold text-blue-600">{selectedStudent.summary.totalClasses}</p>
                                                <p className="text-xs text-gray-600">Total</p>
                                            </div>
                                            <div className="bg-green-50 p-3 rounded-lg text-center">
                                                <CheckCircle className="h-5 w-5 mx-auto text-green-600 mb-1" />
                                                <p className="text-xl font-bold text-green-600">{selectedStudent.summary.attended}</p>
                                                <p className="text-xs text-gray-600">Present</p>
                                            </div>
                                            <div className={`p-3 rounded-lg text-center ${selectedStudent.summary.attendancePercentage >= 75 ? 'bg-green-50' : 'bg-red-50'}`}>
                                                <TrendingUp className={`h-5 w-5 mx-auto mb-1 ${selectedStudent.summary.attendancePercentage >= 75 ? 'text-green-600' : 'text-red-600'}`} />
                                                <p className={`text-xl font-bold ${selectedStudent.summary.attendancePercentage >= 75 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {selectedStudent.summary.attendancePercentage}%
                                                </p>
                                                <p className="text-xs text-gray-600">Rate</p>
                                            </div>
                                        </div>

                                        {/* Overall Progress */}
                                        <div className="bg-gray-50 p-4 rounded-lg">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-medium text-sm">Overall Attendance</span>
                                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getAttendanceBadgeColor(selectedStudent.summary.attendancePercentage)}`}>
                                                    {selectedStudent.summary.attendancePercentage >= 75 ? '✓ On Track' : '⚠ Needs Improvement'}
                                                </span>
                                            </div>
                                            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${getAttendanceColor(selectedStudent.summary.attendancePercentage)} transition-all`}
                                                    style={{ width: `${selectedStudent.summary.attendancePercentage}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Subject-wise Stats */}
                                        {selectedStudent.subjects.length > 0 && (
                                            <div>
                                                <h4 className="font-semibold mb-3 text-sm">Subject-wise Attendance</h4>
                                                <div className="space-y-2">
                                                    {selectedStudent.subjects.map((subject) => (
                                                        <div key={subject.id} className="bg-gray-50 p-3 rounded-lg">
                                                            <div className="flex justify-between items-center mb-1">
                                                                <span className="font-medium text-sm">{subject.name}</span>
                                                                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getAttendanceBadgeColor(subject.attendance)}`}>
                                                                    {subject.attendance}%
                                                                </span>
                                                            </div>
                                                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full ${getAttendanceColor(subject.attendance)}`}
                                                                    style={{ width: `${subject.attendance}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Monthly Trend */}
                                        {selectedStudent.monthlyTrend.length > 0 && (
                                            <div>
                                                <h4 className="font-semibold mb-3 text-sm">Monthly Trend</h4>
                                                <div className="flex gap-2 overflow-x-auto pb-2">
                                                    {selectedStudent.monthlyTrend.map((month) => (
                                                        <div key={month.month} className="flex-shrink-0 bg-gray-50 p-2 rounded-lg text-center min-w-[70px]">
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
                )}
            </div>
        </div>
    );
}
