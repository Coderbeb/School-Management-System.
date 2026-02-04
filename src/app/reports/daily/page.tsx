'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Users, UserCheck, UserX, ArrowLeft, Filter, Search, ChevronDown, CheckCircle, XCircle, AlertCircle, FileText, FileSpreadsheet, FileDown, ChevronRight, CalendarDays } from 'lucide-react';
import * as XLSX from 'xlsx';
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

interface Subject {
    id: string;
    code: string;
    name: string;
    semester: number;
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
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [selectedSemester, setSelectedSemester] = useState('');
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
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
            fetchDailyReport(token);
        }
    }, [selectedDate, selectedDepartmentId, selectedSemester, selectedSubjectId, user]);

    // Fetch subjects when semester changes
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            fetchSubjects(token);
        }
    }, [selectedSemester]);

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
                // Add primary department
                if (teacher.department_id && teacher.department_name) {
                    allDepts.push({
                        id: teacher.department_id,
                        name: teacher.department_name,
                        code: teacher.department_code || ''
                    });
                }
                // Add additional departments
                if (teacher.departments && Array.isArray(teacher.departments)) {
                    teacher.departments.forEach((dept: any) => {
                        if (!allDepts.find(d => d.id === dept.id)) {
                            allDepts.push({ id: dept.id, name: dept.name, code: dept.code || '' });
                        }
                    });
                }
                // Only set if more than 1 department
                if (allDepts.length > 1) {
                    setDepartments(allDepts);
                }
            }
        } catch (err) {
            console.error('Error fetching teacher departments:', err);
        }
    };

    // Fetch subjects based on selected semester
    const fetchSubjects = async (token: string) => {
        try {
            let url = '/api/subjects';
            if (selectedSemester) {
                url += `?semester=${selectedSemester}`;
            }
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setSubjects(data.subjects || []);
            // Reset subject selection when semester changes
            setSelectedSubjectId('');
        } catch (err) {
            console.error('Error fetching subjects:', err);
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
            if (selectedSubjectId) {
                url += `&subjectId=${selectedSubjectId}`;
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

    // Get selected subject name for export
    const getSelectedSubjectName = () => {
        if (!selectedSubjectId) return 'All Subjects';
        const subject = subjects.find(s => s.id === selectedSubjectId);
        return subject ? `${subject.code} - ${subject.name}` : 'All Subjects';
    };

    // Export Daily Report with detailed student records
    const exportReport = async (format: 'csv' | 'excel' | 'pdf') => {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            // Fetch detailed data with student names and roll numbers
            let url = `/api/reports/daily?date=${selectedDate}&detailed=true`;
            if (selectedDepartmentId) {
                url += `&departmentId=${selectedDepartmentId}`;
            }
            if (selectedSemester) {
                url += `&semester=${selectedSemester}`;
            }
            if (selectedSubjectId) {
                url += `&subjectId=${selectedSubjectId}`;
            }

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            
            if (res.status === 401) {
                router.push('/login');
                return;
            }
            
            const data = await res.json();
            const detailedRecords = data.detailedRecords || [];

            if (detailedRecords.length === 0) {
                alert('No attendance records found for the selected date and filters.');
                return;
            }

            const headers = ['S.No', 'Student ID', 'Roll Number', 'Student Name', 'Subject Code', 'Subject Name', 'Lecture', 'Status'];
            const rows = detailedRecords.map((r: any, index: number) => [
                (index + 1).toString(),
                r.studentId,
                r.rollNumber,
                r.studentName,
                r.subjectCode,
                r.subjectName,
                `Lecture ${r.lectureNumber}`,
                r.status.charAt(0).toUpperCase() + r.status.slice(1)
            ]);

            const filename = `daily_attendance_detailed_${selectedDate}`;

            if (format === 'csv') {
                const csvContent = [
                    headers.join(','),
                    ...rows.map((row: string[]) => row.map(cell => `"${cell}"`).join(','))
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
                // Set column widths
                worksheet['!cols'] = [
                    { wch: 5 },  // S.No
                    { wch: 15 }, // Student ID
                    { wch: 15 }, // Roll Number
                    { wch: 25 }, // Student Name
                    { wch: 12 }, // Subject Code
                    { wch: 30 }, // Subject Name
                    { wch: 10 }, // Lecture
                    { wch: 10 }  // Status
                ];
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Daily Attendance');
                XLSX.writeFile(workbook, `${filename}.xlsx`);
            } else if (format === 'pdf') {
                // Group students by status for summary
                const presentCount = detailedRecords.filter((r: any) => r.status === 'present').length;
                const absentCount = detailedRecords.filter((r: any) => r.status === 'absent').length;
                const lateCount = detailedRecords.filter((r: any) => r.status === 'late').length;
                const totalEntries = detailedRecords.length;
                const attendancePercentage = totalEntries > 0 ? Math.round((presentCount / totalEntries) * 100) : 0;

                const printContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Daily Attendance Report - ${formatDateDisplay(selectedDate)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; background: #fff; color: #1f2937; font-size: 12px; }
        .container { max-width: 100%; margin: 0 auto; }
        .header { text-align: center; border-bottom: 3px solid #6366f1; padding-bottom: 15px; margin-bottom: 20px; }
        .college-name { font-size: 24px; font-weight: bold; color: #4f46e5; margin-bottom: 5px; }
        .report-title { font-size: 18px; color: #6b7280; margin-top: 8px; }
        .report-date { font-size: 14px; color: #374151; margin-top: 6px; font-weight: 600; }
        .summary-cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px; }
        .summary-card { background: #f9fafb; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; }
        .summary-value { font-size: 22px; font-weight: bold; }
        .summary-label { font-size: 10px; color: #6b7280; margin-top: 4px; text-transform: uppercase; }
        .blue { color: #2563eb; }
        .green { color: #16a34a; }
        .red { color: #dc2626; }
        .orange { color: #ea580c; }
        .purple { color: #7c3aed; }
        .section-title { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; }
        .filters-info { background: #f3f4f6; padding: 12px; border-radius: 8px; margin-bottom: 15px; font-size: 11px; color: #4b5563; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
        th { background: #4f46e5; color: white; padding: 8px 6px; text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; }
        td { padding: 8px 6px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) { background-color: #f9fafb; }
        .status-present { color: #16a34a; background: #dcfce7; padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        .status-absent { color: #dc2626; background: #fee2e2; padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        .status-late { color: #ea580c; background: #fff7ed; padding: 3px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
        .footer { margin-top: 25px; padding-top: 15px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
        .role-badge { display: inline-block; background: #4f46e5; color: white; padding: 4px 10px; border-radius: 20px; font-size: 10px; margin-top: 8px; }
        @media print { 
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; padding: 20px; } 
            .container { max-width: 100%; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="college-name">YSM College of Engineering</div>
            <div class="report-title">DAILY ATTENDANCE REPORT - DETAILED</div>
            <div class="report-date">📅 ${formatDateDisplay(selectedDate)}</div>
            <div class="role-badge">${user?.role?.replace('_', ' ').toUpperCase() || 'USER'}</div>
        </div>
        <div class="filters-info">
            <strong>Filters Applied:</strong> 
            Subject: ${getSelectedSubjectName()} | 
            Semester: ${selectedSemester || 'All'} | 
            Department: ${selectedDepartmentId ? departments.find(d => d.id === selectedDepartmentId)?.name || 'Selected' : 'All'}
        </div>
        <div class="summary-cards">
            <div class="summary-card">
                <div class="summary-value blue">${totalEntries}</div>
                <div class="summary-label">Total Entries</div>
            </div>
            <div class="summary-card">
                <div class="summary-value green">${presentCount}</div>
                <div class="summary-label">Present</div>
            </div>
            <div class="summary-card">
                <div class="summary-value red">${absentCount}</div>
                <div class="summary-label">Absent</div>
            </div>
            <div class="summary-card">
                <div class="summary-value orange">${lateCount}</div>
                <div class="summary-label">Late</div>
            </div>
            <div class="summary-card">
                <div class="summary-value purple">${attendancePercentage}%</div>
                <div class="summary-label">Attendance</div>
            </div>
        </div>
        <div class="section-title">Student-wise Attendance Details (${detailedRecords.length} records)</div>
        <table>
            <thead>
                <tr>${headers.map((h: string) => `<th>${h}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${rows.map((row: string[]) => {
                    const status = row[7].toLowerCase();
                    const statusClass = status === 'present' ? 'status-present' : status === 'absent' ? 'status-absent' : 'status-late';
                    return `<tr>${row.map((cell: string, i: number) => i === 7 ? `<td><span class="${statusClass}">${cell}</span></td>` : `<td>${cell}</td>`).join('')}</tr>`;
                }).join('')}
            </tbody>
        </table>
        <div class="footer">
            Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()} | YSM Attendance System<br>
            <strong>Generated by:</strong> ${user?.firstName} ${user?.lastName} (${user?.role?.replace('_', ' ').toUpperCase()})
        </div>
    </div>
</body>
</html>`;
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                    printWindow.document.write(printContent);
                    printWindow.document.close();
                    printWindow.onload = () => { printWindow.print(); };
                }
            }
        } catch (err) {
            console.error('Error exporting report:', err);
            alert('Failed to export report. Please try again.');
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
                                    Daily Report <span className="inline-block animate-wave">📅</span>
                                </h1>
                                <p className="text-blue-100 text-lg max-w-xl">
                                    View attendance records by date, analyze daily trends, and export summaries.
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 self-start items-end">
                                {/* Date Picker */}
                                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-1 flex items-center border border-white/20">
                                    <input
                                        type="date"
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        className="bg-transparent text-white border-0 focus:ring-0 cursor-pointer [&::-webkit-calendar-picker-indicator]:invert p-1"
                                    />
                                </div>
                                
                                {/* Export Buttons */}
                                <div className="flex gap-2 bg-white/10 p-1.5 rounded-xl backdrop-blur-sm border border-white/10">
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
                </div>
                {/* Stats Summary Cards - Unified White Design */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <Card className="border-0 shadow-md bg-white hover:shadow-lg transition-shadow">
                        <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-full mb-2">
                                <Users className="w-5 h-5" />
                            </div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</p>
                            <p className="text-2xl font-bold text-gray-900">{totals.students}</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-md bg-white hover:shadow-lg transition-shadow">
                        <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full mb-2">
                                <UserCheck className="w-5 h-5" />
                            </div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Present</p>
                            <p className="text-2xl font-bold text-emerald-600">{totals.present}</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-md bg-white hover:shadow-lg transition-shadow">
                        <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                            <div className="p-3 bg-red-50 text-red-600 rounded-full mb-2">
                                <UserX className="w-5 h-5" />
                            </div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Absent</p>
                            <p className="text-2xl font-bold text-red-600">{totals.absent}</p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-md bg-white hover:shadow-lg transition-shadow">
                        <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                            <div className={`p-3 rounded-full mb-2 ${avgPercentage >= 75 ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                                <CheckCircle className="w-5 h-5" />
                            </div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Average</p>
                            <p className={`text-2xl font-bold ${avgPercentage >= 75 ? 'text-emerald-600' : 'text-orange-600'}`}>
                                {avgPercentage}%
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Filters Sidebar - Cleaner Look */}
                    <div className="lg:col-span-1 space-y-4">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sticky top-24">
                            <div className="flex items-center gap-2 mb-4 text-gray-800 font-semibold border-b pb-2">
                                <Filter className="w-4 h-4 text-purple-600" />
                                Filters
                            </div>
                            
                            <div className="space-y-4">
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

                                {/* Subject Filter */}
                                {subjects.length > 0 && (
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase mb-1.5 block">Subject</label>
                                        <div className="relative">
                                            <select
                                                value={selectedSubjectId}
                                                onChange={(e) => setSelectedSubjectId(e.target.value)}
                                                className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none appearance-none transition-all"
                                            >
                                                <option value="">All Subjects</option>
                                                {subjects.map((subject) => (
                                                    <option key={subject.id} value={subject.id}>
                                                        {subject.code} - {subject.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                                        </div>
                                    </div>
                                )}

                                <Button 
                                    className="w-full bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200"
                                    onClick={() => {
                                        setSelectedSemester('');
                                        setSelectedDepartmentId('');
                                        setSelectedSubjectId('');
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
                                        <p className="text-gray-500">Loading daily records...</p>
                                    </div>
                                ) : records.length === 0 ? (
                                    <div className="p-12 text-center">
                                        <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <AlertCircle className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900">No records found</h3>
                                        <p className="text-gray-500 mt-1">Try adjusting the date or filters to see attendance data.</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Desktop Table View */}
                                        <div className="hidden md:block overflow-x-auto">
                                            <table className="w-full table-auto">
                                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                                    <tr>
                                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date & Session</th>
                                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Present</th>
                                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Absent</th>
                                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {records.map((record, index) => (
                                                        <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="text-sm font-medium text-gray-900">{formatDateDisplay(record.date)}</div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                                                                {record.totalStudents}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                <span className="text-emerald-600 font-medium">{record.present}</span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                <span className="text-red-500 font-medium">{record.absent}</span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                <div className="flex flex-col items-center gap-1">
                                                                    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                        <div 
                                                                            className={`h-full rounded-full ${
                                                                                record.attendancePercentage >= 75 ? 'bg-emerald-500' : 'bg-red-500'
                                                                            }`}
                                                                            style={{ width: `${Math.min(record.attendancePercentage, 100)}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className={`text-xs font-bold ${
                                                                        record.attendancePercentage >= 75 ? 'text-emerald-600' : 'text-red-600'
                                                                    }`}>
                                                                        {record.attendancePercentage}%
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Mobile Card View */}
                                        <div className="md:hidden p-4 space-y-4">
                                            {records.map((record, index) => (
                                                <div key={index} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                                                    <div className="flex justify-between items-center mb-3">
                                                        <span className="font-semibold text-gray-900">{formatDateDisplay(record.date)}</span>
                                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                                                            record.attendancePercentage >= 75 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                                                        }`}>
                                                            {record.attendancePercentage}%
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                                                        <div className="p-2 bg-gray-50 rounded-lg">
                                                            <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Total</p>
                                                            <p className="font-bold">{record.totalStudents}</p>
                                                        </div>
                                                        <div className="p-2 bg-emerald-50/50 rounded-lg">
                                                            <p className="text-emerald-600 text-xs uppercase tracking-wide mb-1">Present</p>
                                                            <p className="font-bold text-emerald-700">{record.present}</p>
                                                        </div>
                                                        <div className="p-2 bg-red-50/50 rounded-lg">
                                                            <p className="text-red-600 text-xs uppercase tracking-wide mb-1">Absent</p>
                                                            <p className="font-bold text-red-700">{record.absent}</p>
                                                        </div>
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
            </main>
        </div>
    );
}
