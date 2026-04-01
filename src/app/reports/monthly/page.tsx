'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Calendar, TrendingUp, TrendingDown, BarChart3, Filter, ChevronDown, AlertCircle, BookOpen, Users, FileText, FileSpreadsheet, FileDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';
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

interface MonthlyStats {
    month: string;
    totalDays: number;
    totalSessions: number;
    totalPresent: number;
    totalAbsent: number;
    totalRecords: number;
    averageAttendance: number;
    highestAttendance: number;
    lowestAttendance: number;
}

interface DailyBreakdown {
    date: string;
    total: number;
    present: number;
    absent: number;
    late: number;
    percentage: number;
}

interface SubjectStat {
    id: string;
    name: string;
    code: string;
    paperCode?: string | null;
    semester: string;
    totalRecords: number;
    present: number;
    absent: number;
    percentage: number;
}

export default function MonthlyReportPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [selectedSemester, setSelectedSemester] = useState('');
    const [selectedStream, setSelectedStream] = useState('all');
    const [stats, setStats] = useState<MonthlyStats | null>(null);
    const [dailyBreakdown, setDailyBreakdown] = useState<DailyBreakdown[]>([]);
    const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'daily' | 'subjects'>('daily');

    // Sorting state for daily table
    const [sortField, setSortField] = useState<'date' | 'total' | 'present' | 'absent' | 'percentage'>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.replace('/login');
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
        router.replace('/login');
    };

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token && user) {
            fetchMonthlyReport(token);
        }
    }, [selectedMonth, selectedDepartmentId, selectedSemester, selectedStream, user]);

    const getCachedDepartments = () => {
        try {
            const lCache = localStorage.getItem('offline_departments');
            if (lCache) {
                const parsed = JSON.parse(lCache);
                if (parsed.data && Array.isArray(parsed.data)) return parsed.data;
            }
            const sCache = sessionStorage.getItem('cache_departments');
            if (sCache) {
                const parsed = JSON.parse(sCache);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch { /* ignore */ }
        return null;
    };

    const fetchDepartments = async (token: string) => {
        const cached = getCachedDepartments();
        if (cached && cached.length > 0) setDepartments(cached);

        try {
            const res = await fetch('/api/departments', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            const depts = data.departments || [];
            setDepartments(depts);
            try { sessionStorage.setItem('cache_departments', JSON.stringify(depts)); } catch {}
        } catch (err) {
            console.error('Error fetching departments:', err);
        }
    };

    const fetchTeacherDepartments = async (token: string, teacherId: string) => {
        const cached = getCachedDepartments();
        if (cached && cached.length > 0) setDepartments(cached);

        try {
            const res = await fetch('/api/me/departments', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            const depts = data.departments || [];
            if (depts.length > 0) {
                setDepartments(depts);
                try {
                    localStorage.setItem('offline_departments', JSON.stringify({
                        timestamp: Date.now(),
                        data: depts
                    }));
                } catch { /* ignore */ }
            }
        } catch (err) {
            console.error('Error fetching teacher departments:', err);
        }
    };

    const fetchMonthlyReport = async (token: string) => {
        setLoading(true);
        try {
            let url = `/api/reports/monthly?month=${selectedMonth}`;
            if (selectedDepartmentId) url += `&departmentId=${selectedDepartmentId}`;
            if (selectedSemester) url += `&semester=${selectedSemester}`;
            if (selectedStream && selectedStream !== 'all') url += `&stream=${selectedStream}`;

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.replace('/login');
                return;
            }
            const data = await res.json();
            if (data.stats) setStats(data.stats);
            if (data.dailyBreakdown) setDailyBreakdown(data.dailyBreakdown);
            if (data.subjectStats) setSubjectStats(data.subjectStats);
        } catch (err) {
            console.error('Error fetching monthly report:', err);
        }
        setLoading(false);
    };

    const formatMonth = (monthStr: string) => {
        const date = new Date(monthStr + '-01');
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
    };

    const getProgressColor = (percentage: number) => {
        if (percentage >= 75) return 'text-emerald-500';
        if (percentage >= 60) return 'text-amber-500';
        return 'text-red-500';
    };

    const getBarColor = (percentage: number) => {
        if (percentage >= 75) return 'bg-emerald-500';
        if (percentage >= 60) return 'bg-amber-500';
        return 'bg-red-500';
    };

    const getBadgeColor = (percentage: number) => {
        if (percentage >= 75) return 'bg-emerald-100 text-emerald-800';
        if (percentage >= 60) return 'bg-amber-100 text-amber-800';
        return 'bg-red-100 text-red-800';
    };

    const getRowBg = (percentage: number) => {
        if (percentage < 60) return 'bg-red-50/50';
        if (percentage < 75) return 'bg-amber-50/30';
        return '';
    };

    // Sorting
    const handleSort = (field: typeof sortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder(field === 'date' ? 'asc' : 'desc');
        }
    };

    const sortedDaily = [...dailyBreakdown].sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (typeof valA === 'string') return sortOrder === 'asc' ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA);
        return sortOrder === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    const SortIcon = ({ field }: { field: typeof sortField }) => {
        if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />;
        return sortOrder === 'asc' 
            ? <ArrowUpRight className="w-3 h-3 text-purple-600" />
            : <ArrowDownRight className="w-3 h-3 text-purple-600" />;
    };

    // Export functions
    const exportReport = (format: 'csv' | 'excel' | 'pdf') => {
        if (!stats) return;

        const filename = `monthly_attendance_${selectedMonth}`;

        if (activeTab === 'daily') {
            const headers = ['Date', 'Total Records', 'Present', 'Absent', 'Late', 'Attendance %'];
            const rows = sortedDaily.map(d => [
                formatDate(d.date),
                d.total.toString(),
                d.present.toString(),
                d.absent.toString(),
                d.late.toString(),
                `${d.percentage}%`
            ]);

            if (format === 'csv') {
                downloadCSV(headers, rows, filename);
            } else if (format === 'excel') {
                downloadExcel(headers, rows, filename, 'Daily Breakdown');
            } else {
                downloadPDF(headers, rows, filename, 'Daily Attendance Breakdown');
            }
        } else {
            const headers = ['Subject', 'Paper / Subject Code', 'Semester', 'Total', 'Present', 'Absent', 'Attendance %'];
            const rows = subjectStats.map(s => [
                s.name,
                s.paperCode || s.code,
                s.semester || '-',
                s.totalRecords.toString(),
                s.present.toString(),
                s.absent.toString(),
                `${s.percentage}%`
            ]);

            if (format === 'csv') {
                downloadCSV(headers, rows, filename + '_subjects');
            } else if (format === 'excel') {
                downloadExcel(headers, rows, filename + '_subjects', 'Subject-wise');
            } else {
                downloadPDF(headers, rows, filename + '_subjects', 'Subject-wise Attendance Breakdown');
            }
        }
    };

    const downloadCSV = (headers: string[], rows: string[][], filename: string) => {
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
    };

    const downloadExcel = (headers: string[], rows: string[][], filename: string, sheetName: string) => {
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        XLSX.writeFile(workbook, `${filename}.xlsx`);
    };

    const downloadPDF = (headers: string[], rows: string[][], filename: string, title: string) => {
        const printContent = `
<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <style>
        body { font-family: 'Inter', Arial, sans-serif; padding: 30px; color: #1e293b; }
        .header { border-bottom: 3px solid #7c3aed; padding-bottom: 16px; margin-bottom: 24px; }
        .header h1 { color: #1e3a8a; font-size: 22px; margin: 0 0 4px; }
        .header p { color: #64748b; font-size: 13px; margin: 0; }
        .meta { display: flex; gap: 24px; margin-bottom: 20px; font-size: 13px; color: #475569; }
        .meta strong { color: #1e293b; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
        .summary-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
        .summary-item .val { font-size: 24px; font-weight: 700; color: #1e3a8a; }
        .summary-item .lbl { font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #7c3aed; color: white; padding: 10px 8px; text-align: left; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
        td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) { background-color: #f8fafc; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 50px; font-size: 10px; font-weight: 700; }
        .good { background: #dcfce7; color: #166534; }
        .warning { background: #fef3c7; color: #b45309; }
        .critical { background: #fee2e2; color: #991b1b; }
        .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 15mm; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 ${title}</h1>
        <p>Yogoda Satsanga Mahavidyalaya — Attendance Report</p>
    </div>
    <div class="meta">
        <div><strong>Month:</strong> ${formatMonth(selectedMonth)}</div>
        <div><strong>Generated:</strong> ${new Date().toLocaleDateString()}</div>
        ${stats ? `<div><strong>Avg Attendance:</strong> ${stats.averageAttendance}%</div>` : ''}
    </div>
    ${stats ? `
    <div class="summary">
        <div class="summary-item"><div class="val">${stats.totalDays}</div><div class="lbl">Working Days</div></div>
        <div class="summary-item"><div class="val">${stats.totalSessions}</div><div class="lbl">Sessions</div></div>
        <div class="summary-item"><div class="val" style="color: #059669">${stats.totalPresent}</div><div class="lbl">Present</div></div>
        <div class="summary-item"><div class="val" style="color: #dc2626">${stats.totalAbsent}</div><div class="lbl">Absent</div></div>
    </div>` : ''}
    <table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>
            ${rows.map(row => {
                const pctStr = row[row.length - 1];
                const pct = parseInt(pctStr);
                const badgeClass = pct >= 75 ? 'good' : pct >= 60 ? 'warning' : 'critical';
                return `<tr>${row.map((cell, i) => 
                    i === row.length - 1 
                        ? `<td><span class="badge ${badgeClass}">${cell}</span></td>` 
                        : `<td>${cell}</td>`
                ).join('')}</tr>`;
            }).join('')}
        </tbody>
    </table>
    <div class="footer">Generated by College Attendance System — ${new Date().toLocaleString()}</div>
    <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); }</script>
</body>
</html>`;
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(printContent);
            printWindow.document.close();
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {user && (
                <MobileSidebar
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    user={{ ...user, role: user.role }}
                    onLogout={handleLogout}
                />
            )}

            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} />

            <main className="flex-1 pt-20 pb-8 px-4 max-w-7xl mx-auto w-full">
                {/* Hero / Welcome Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">


                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-emerald-400 font-semibold tracking-wide uppercase text-sm">Reports</span>
                            </div>
                            <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                                Monthly Summary <span className="inline-block animate-wave">📈</span>
                            </h1>
                            <p className="text-emerald-100 text-sm max-w-xl">
                                Analyze attendance trends, identify patterns, and <span className="font-semibold text-white">monitor overall performance</span>.
                            </p>
                        </div>

                        {/* Export Buttons in Hero */}
                        <div className="flex gap-2 bg-white/10 p-1.5 rounded-xl backdrop-blur-md border border-white/20 self-start sm:self-auto">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20 hover:text-white h-8 px-3 transition-colors"
                                onClick={() => exportReport('pdf')}
                            >
                                <FileText className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">PDF</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20 hover:text-white h-8 px-3 transition-colors"
                                onClick={() => exportReport('excel')}
                            >
                                <FileSpreadsheet className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Excel</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20 hover:text-white h-8 px-3 transition-colors"
                                onClick={() => exportReport('csv')}
                            >
                                <FileDown className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">CSV</span>
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Overlapping Advanced Filters Section */}
                <div className="relative z-20 mb-8">
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Filter className="w-4 h-4 text-emerald-500" />
                            <h3 className="text-sm font-bold text-gray-700">Advanced Filters</h3>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 items-end">
                            <div className="w-full">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Month</label>
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-emerald-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all cursor-pointer font-medium shadow-sm"
                                />
                            </div>

                            {(user?.role === 'super_admin' || departments.length > 1) && (
                                <div className="w-full">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Department</label>
                                    <div className="relative">
                                        <select
                                            value={selectedDepartmentId}
                                            onChange={(e) => setSelectedDepartmentId(e.target.value)}
                                            className="w-full pl-4 pr-10 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-emerald-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none appearance-none transition-all cursor-pointer font-medium shadow-sm"
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

                            <div className="w-full">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Semester</label>
                                <div className="relative">
                                    <select
                                        value={selectedSemester}
                                        onChange={(e) => setSelectedSemester(e.target.value)}
                                        className="w-full pl-4 pr-10 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-emerald-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none appearance-none transition-all cursor-pointer font-medium shadow-sm"
                                    >
                                        <option value="">All Semesters</option>
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                                            <option key={sem} value={sem}>Semester {sem}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                                </div>
                            </div>

                            {(() => {
                                const activeDept = selectedDepartmentId
                                    ? departments.find(d => d.id === selectedDepartmentId)
                                    : departments.length === 1 ? departments[0] : null;
                                const showStream = activeDept && activeDept.code?.toUpperCase() === 'IT';
                                if (!showStream) return null;
                                return (
                                    <div className="w-full">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Stream</label>
                                        <div className="relative">
                                            <select
                                                value={selectedStream}
                                                onChange={(e) => setSelectedStream(e.target.value)}
                                                className="w-full pl-4 pr-10 py-2.5 bg-gray-50/50 border border-gray-200 hover:border-emerald-300 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none appearance-none transition-all cursor-pointer font-medium shadow-sm"
                                            >
                                                <option value="all">All Streams</option>
                                                <option value="BCA">BCA</option>
                                                <option value="BSCIT">BSc IT</option>
                                            </select>
                                            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="w-full lg:w-auto">
                                <Button 
                                    variant="outline"
                                    className="w-full lg:w-auto mt-6 bg-white hover:bg-red-50 text-gray-600 hover:text-red-600 border-gray-200 hover:border-red-200 rounded-xl transition-colors h-[42px]"
                                    onClick={() => {
                                        setSelectedSemester('');
                                        setSelectedDepartmentId('');
                                        setSelectedStream('all');
                                        setSelectedMonth(new Date().toISOString().slice(0, 7));
                                    }}
                                >
                                    Reset Filters
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="w-full">
                    {loading ? (
                        <div className="shadow-sm bg-white rounded-2xl">
                            <div className="p-12 text-center">
                                <div className="animate-spin w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-4"></div>
                                <p className="text-gray-500">Loading monthly stats...</p>
                            </div>
                        </div>
                    ) : !stats ? (
                        <div className="shadow-sm bg-white rounded-2xl">
                            <div className="p-12 text-center">
                                <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertCircle className="w-8 h-8 text-gray-400" />
                                </div>
                                <h3 className="text-lg font-medium text-gray-900">No data available</h3>
                                <p className="text-gray-500 mt-1">Try selecting a different month or filter to see analytics.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Top Row: Circular Progress + Stats Grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Circular Progress */}
                                <div className="shadow-md bg-white overflow-hidden relative rounded-2xl">
                                    <div className="p-8">
                                        <div className="flex flex-col items-center justify-center text-center">
                                            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Average Attendance</h2>
                                            <div className="relative w-40 h-40 flex items-center justify-center mb-4">
                                                <svg className="w-full h-full transform -rotate-90">
                                                    <circle cx="80" cy="80" r="72" stroke="#f3f4f6" strokeWidth="10" fill="transparent" />
                                                    <circle
                                                        cx="80" cy="80" r="72"
                                                        stroke="currentColor"
                                                        strokeWidth="10"
                                                        fill="transparent"
                                                        strokeDasharray={452}
                                                        strokeDashoffset={452 - (452 * stats.averageAttendance) / 100}
                                                        className={`${getProgressColor(stats.averageAttendance)} transition-all duration-1000 ease-out`}
                                                        strokeLinecap="round"
                                                    />
                                                </svg>
                                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                    <span className={`text-4xl font-bold ${getProgressColor(stats.averageAttendance)}`}>
                                                        {stats.averageAttendance}%
                                                    </span>
                                                    <span className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Overall</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Stats Grid (2x3) */}
                                <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-3 gap-4">
                                    {/* Working Days Card */}
                                    <div className="group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-purple-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Working Days</p>
                                            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                                                <Calendar className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-bold text-gray-900">{stats.totalDays}</h3>
                                    </div>

                                    {/* Total Sessions Card */}
                                    <div className="group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-blue-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Total Sessions</p>
                                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                                <BarChart3 className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-bold text-gray-900">{stats.totalSessions}</h3>
                                    </div>

                                    {/* Total Present Card */}
                                    <div className="group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-emerald-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Total Present</p>
                                            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                                <Users className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-bold text-emerald-600">{stats.totalPresent}</h3>
                                    </div>

                                    {/* Total Absent Card */}
                                    <div className="group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-red-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Total Absent</p>
                                            <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                                                <AlertCircle className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-bold text-rose-600">{stats.totalAbsent}</h3>
                                    </div>

                                    {/* Highest Day Card */}
                                    <div className="group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-emerald-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Highest Day</p>
                                            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                                <TrendingUp className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-bold text-emerald-600">{stats.highestAttendance}%</h3>
                                    </div>

                                    {/* Lowest Day Card */}
                                    <div className="group relative bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-red-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                                        <div className="flex justify-between items-start mb-2">
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Lowest Day</p>
                                            <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                                                <TrendingDown className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-bold text-red-600">{stats.lowestAttendance}%</h3>
                                    </div>
                                </div>
                            </div>

                            {/* Mini Bar Chart (Visual Trend) */}
                            {dailyBreakdown.length > 0 && (
                                <div className="shadow-sm bg-white rounded-2xl">
                                    <div className="p-6">
                                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Daily Attendance Trend</h3>
                                        <div className="flex items-end gap-1 h-24">
                                            {dailyBreakdown.map((day, i) => (
                                                <div
                                                    key={day.date}
                                                    className="flex-1 group relative"
                                                    title={`${formatDate(day.date)}: ${day.percentage}%`}
                                                >
                                                    <div
                                                        className={`w-full rounded-t-sm ${getBarColor(day.percentage)} transition-all duration-300 hover:opacity-80 cursor-pointer`}
                                                        style={{ height: `${Math.max(day.percentage, 4)}%` }}
                                                    ></div>
                                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                                        {day.percentage}%
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex justify-between mt-2 text-[10px] text-gray-400">
                                            <span>{dailyBreakdown.length > 0 ? formatDate(dailyBreakdown[0].date) : ''}</span>
                                            <span>{dailyBreakdown.length > 0 ? formatDate(dailyBreakdown[dailyBreakdown.length - 1].date) : ''}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Tabs: Daily / Subject-wise */}
                            {/* Tabs: Daily / Subject-wise */}
                            <div className="flex gap-3 mb-2">
                                <button
                                    onClick={() => setActiveTab('daily')}
                                    className={`group flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all duration-300 ${
                                        activeTab === 'daily'
                                            ? 'bg-purple-50 text-purple-700 shadow-sm border border-purple-100'
                                            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-100'
                                    }`}
                                >
                                    <Calendar className={`w-4 h-4 transition-transform ${activeTab === 'daily' ? 'scale-110' : 'group-hover:scale-110'}`} />
                                    <span>Day-by-Day</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs transition-colors ${activeTab === 'daily' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600 group-hover:bg-purple-100 group-hover:text-purple-600'}`}>
                                        {dailyBreakdown.length}
                                    </span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('subjects')}
                                    className={`group flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all duration-300 ${
                                        activeTab === 'subjects'
                                            ? 'bg-purple-50 text-purple-700 shadow-sm border border-purple-100'
                                            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-100'
                                    }`}
                                >
                                    <BookOpen className={`w-4 h-4 transition-transform ${activeTab === 'subjects' ? 'scale-110' : 'group-hover:scale-110'}`} />
                                    <span>Subject-wise</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs transition-colors ${activeTab === 'subjects' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600 group-hover:bg-purple-100 group-hover:text-purple-600'}`}>
                                        {subjectStats.length}
                                    </span>
                                </button>
                            </div>

                            {/* Tab Content */}
                            <div className="shadow-xl bg-white overflow-hidden rounded-2xl">
                                <div className="p-0">
                                    {/* Daily Breakdown Tab */}
                                    {activeTab === 'daily' && (
                                        <>
                                            {dailyBreakdown.length === 0 ? (
                                                <div className="p-12 text-center">
                                                    <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                                                    <p className="text-gray-500">No daily records found for this month.</p>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Desktop Table */}
                                                    <div className="hidden md:block overflow-x-auto">
                                                        <table className="w-full table-auto">
                                                            <thead className="bg-gray-50/80 backdrop-blur-sm border-b border-gray-100">
                                                                <tr>
                                                                    {[
                                                                        { key: 'date' as const, label: 'Date' },
                                                                        { key: 'total' as const, label: 'Total Records' },
                                                                        { key: 'present' as const, label: 'Present' },
                                                                        { key: 'absent' as const, label: 'Absent' },
                                                                        { key: 'percentage' as const, label: 'Attendance' },
                                                                    ].map(col => (
                                                                        <th
                                                                            key={col.key}
                                                                            onClick={() => handleSort(col.key)}
                                                                            className={`px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-purple-600 transition-colors select-none ${
                                                                                col.key !== 'date' ? 'text-center' : ''
                                                                            }`}
                                                                        >
                                                                            <div className={`flex items-center gap-1 ${col.key !== 'date' ? 'justify-center' : ''}`}>
                                                                                {col.label}
                                                                                <SortIcon field={col.key} />
                                                                            </div>
                                                                        </th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-50">
                                                                {sortedDaily.map((day) => (
                                                                    <tr key={day.date} className={`hover:bg-gray-50/50 transition-colors ${getRowBg(day.percentage)}`}>
                                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                                            <div className="text-sm font-medium text-gray-900">{formatDate(day.date)}</div>
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600">{day.total}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-emerald-600">{day.present}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-red-600">{day.absent}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                            <div className="flex items-center justify-center gap-3">
                                                                                <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                                    <div className={`h-full rounded-full ${getBarColor(day.percentage)}`} style={{ width: `${Math.min(day.percentage, 100)}%` }}></div>
                                                                                </div>
                                                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${getBadgeColor(day.percentage)}`}>
                                                                                    {day.percentage}%
                                                                                </span>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    {/* Mobile Cards */}
                                                    <div className="md:hidden p-4 space-y-3">
                                                        {sortedDaily.map((day) => (
                                                            <div key={day.date} className={`bg-white border border-gray-100 rounded-xl p-4 shadow-sm ${getRowBg(day.percentage)}`}>
                                                                <div className="flex justify-between items-start mb-3">
                                                                    <div className="font-semibold text-gray-900 text-sm">{formatDate(day.date)}</div>
                                                                    <span className={`text-xs font-bold px-2 py-1 rounded ${getBadgeColor(day.percentage)}`}>
                                                                        {day.percentage}%
                                                                    </span>
                                                                </div>
                                                                <div className="flex gap-4 text-xs text-gray-500 mb-3">
                                                                    <span>Total: <span className="font-medium text-gray-700">{day.total}</span></span>
                                                                    <span>Present: <span className="font-medium text-emerald-600">{day.present}</span></span>
                                                                    <span>Absent: <span className="font-medium text-red-600">{day.absent}</span></span>
                                                                </div>
                                                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div className={`h-full rounded-full ${getBarColor(day.percentage)}`} style={{ width: `${Math.min(day.percentage, 100)}%` }}></div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}

                                    {/* Subject-wise Tab */}
                                    {activeTab === 'subjects' && (
                                        <>
                                            {subjectStats.length === 0 ? (
                                                <div className="p-12 text-center">
                                                    <BookOpen className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                                                    <p className="text-gray-500">No subject data found for this month.</p>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Desktop Table */}
                                                    <div className="hidden md:block overflow-x-auto">
                                                        <table className="w-full table-auto">
                                                            <thead className="bg-gray-50/80 border-b border-gray-100">
                                                                <tr>
                                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Subject</th>
                                                                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Semester</th>
                                                                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                                                                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Present</th>
                                                                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Absent</th>
                                                                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Attendance</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-50">
                                                                {subjectStats.map((sub) => (
                                                                    <tr key={sub.id} className={`hover:bg-gray-50/50 transition-colors ${getRowBg(sub.percentage)}`}>
                                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                                            <div className="text-sm font-medium text-gray-900">{sub.name}</div>
                                                                            <div className="text-xs text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded inline-block mt-0.5">{sub.paperCode || sub.code}</div>
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                            <span className="px-2 py-0.5 bg-purple-100 rounded-full text-xs text-purple-600 font-medium">
                                                                                Sem {sub.semester || '-'}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600">{sub.totalRecords}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-emerald-600">{sub.present}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-red-600">{sub.absent}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                            <div className="flex items-center justify-center gap-3">
                                                                                <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                                                    <div className={`h-full rounded-full ${getBarColor(sub.percentage)}`} style={{ width: `${Math.min(sub.percentage, 100)}%` }}></div>
                                                                                </div>
                                                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${getBadgeColor(sub.percentage)}`}>
                                                                                    {sub.percentage}%
                                                                                </span>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    {/* Mobile Cards */}
                                                    <div className="md:hidden p-4 space-y-3">
                                                        {subjectStats.map((sub) => (
                                                            <div key={sub.id} className={`bg-white border border-gray-100 rounded-xl p-4 shadow-sm ${getRowBg(sub.percentage)}`}>
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <div>
                                                                        <div className="font-semibold text-gray-900 text-sm">{sub.name}</div>
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            <span className="text-xs text-gray-500 font-mono bg-gray-50 px-1.5 py-0.5 rounded">{sub.paperCode || sub.code}</span>
                                                                            <span className="px-2 py-0.5 bg-purple-100 rounded-full text-xs text-purple-600 font-medium">Sem {sub.semester || '-'}</span>
                                                                        </div>
                                                                    </div>
                                                                    <span className={`text-xs font-bold px-2 py-1 rounded ${getBadgeColor(sub.percentage)}`}>
                                                                        {sub.percentage}%
                                                                    </span>
                                                                </div>
                                                                <div className="flex gap-4 text-xs text-gray-500 mb-3">
                                                                    <span>Total: <span className="font-medium text-gray-700">{sub.totalRecords}</span></span>
                                                                    <span>Present: <span className="font-medium text-emerald-600">{sub.present}</span></span>
                                                                    <span>Absent: <span className="font-medium text-red-600">{sub.absent}</span></span>
                                                                </div>
                                                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div className={`h-full rounded-full ${getBarColor(sub.percentage)}`} style={{ width: `${Math.min(sub.percentage, 100)}%` }}></div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
