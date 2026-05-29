'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    ArrowLeft, Calendar, Download, Loader2,
    ChevronDown, ChevronUp, BarChart3, Users
} from 'lucide-react';

interface UserData {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'super_admin' | 'teacher' | 'accountant' | 'student';
}

interface StaffReport {
    user_id: string;
    first_name: string;
    last_name: string;
    role: string;
    total_present: number;
    total_late: number;
    total_absent: number;
    total_leave: number;
    total_half_day: number;
    total_hours: number;
    attendance_percentage: number;
    daily_records: DailyRecord[];
}

interface DailyRecord {
    date: string;
    status: 'present' | 'late' | 'absent' | 'on_leave' | 'half_day' | 'weekend' | 'holiday' | null;
    check_in_time: string | null;
    check_out_time: string | null;
}

export default function StaffAttendanceReportsPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [reports, setReports] = useState<StaffReport[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchReports(token, selectedMonth);
    }, []);

    const fetchReports = async (token?: string, month?: string) => {
        setLoading(true);
        const t = token || localStorage.getItem('token')!;
        const m = month || selectedMonth;
        try {
            const res = await fetch(`/api/staff-attendance/reports?month=${m}`, {
                headers: { Authorization: `Bearer ${t}` }
            });
            const data = await res.json();
            setReports(data.reports || []);
        } catch (err) {
            console.error('Failed to fetch reports:', err);
            setReports([]);
        } finally {
            setLoading(false);
        }
    };

    const handleMonthChange = (month: string) => {
        setSelectedMonth(month);
        setExpandedUserId(null);
        fetchReports(undefined, month);
    };

    const getDayStatusDot = (status: string | null) => {
        switch (status) {
            case 'present': return { color: 'bg-emerald-500', label: 'P' };
            case 'late': return { color: 'bg-amber-500', label: 'L' };
            case 'absent': return { color: 'bg-red-500', label: 'A' };
            case 'on_leave': return { color: 'bg-blue-500', label: 'V' };
            case 'half_day': return { color: 'bg-orange-500', label: 'H' };
            case 'weekend': return { color: 'bg-gray-300', label: 'W' };
            case 'holiday': return { color: 'bg-purple-400', label: 'H' };
            default: return { color: 'bg-gray-200', label: '—' };
        }
    };

    const getDaysInMonth = (monthStr: string) => {
        const [year, month] = monthStr.split('-').map(Number);
        return new Date(year, month, 0).getDate();
    };

    const exportCSV = () => {
        if (reports.length === 0) return;

        const headers = ['Name', 'Role', 'Present', 'Late', 'Absent', 'Leave', 'Half Day', 'Total Hours', 'Attendance %'];
        const rows = reports.map(r => [
            `${r.first_name} ${r.last_name}`,
            r.role?.replace('_', ' '),
            r.total_present,
            r.total_late,
            r.total_absent,
            r.total_leave,
            r.total_half_day,
            r.total_hours?.toFixed(1),
            `${r.attendance_percentage?.toFixed(1)}%`
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `staff-attendance-${selectedMonth}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    if (!user) return null;

    const daysCount = getDaysInMonth(selectedMonth);

    return (
        <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 mt-16">

                {/* Hero Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-violet-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-indigo-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10">
                        <button
                            onClick={() => router.push('/manage/staff-attendance')}
                            className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white mb-4 transition-colors"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            Back to Staff Attendance
                        </button>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-violet-400 font-semibold tracking-wide uppercase text-sm">Analytics</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold mb-2 flex items-center gap-3">
                            Monthly Attendance Reports <span className="inline-block">📅</span>
                        </h1>
                        <p className="text-violet-100 text-sm max-w-xl">
                            Detailed breakdown of staff attendance by month with day-by-day analysis and export options.
                        </p>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => handleMonthChange(e.target.value)}
                            className="h-9 rounded-xl border border-gray-200 px-3 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                        />
                    </div>
                    <button
                        onClick={exportCSV}
                        disabled={reports.length === 0}
                        className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Export CSV
                    </button>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 mb-6">
                    {[
                        { color: 'bg-emerald-500', label: 'Present' },
                        { color: 'bg-amber-500', label: 'Late' },
                        { color: 'bg-red-500', label: 'Absent' },
                        { color: 'bg-blue-500', label: 'On Leave' },
                        { color: 'bg-orange-500', label: 'Half Day' },
                        { color: 'bg-gray-300', label: 'Weekend' },
                    ].map(item => (
                        <div key={item.label} className="flex items-center gap-1.5">
                            <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                            <span className="text-[10px] text-gray-500 font-medium">{item.label}</span>
                        </div>
                    ))}
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
                        <p className="text-gray-500 font-medium">Loading reports...</p>
                    </div>
                ) : reports.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm">
                        <BarChart3 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No attendance data for this month.</p>
                        <p className="text-gray-400 text-xs mt-1">Select a different month or check if attendance tracking is enabled.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Summary Table */}
                        <div className="bg-white rounded-2xl border border-gray-150 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gray-50/80 border-b border-gray-100">
                                            <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Staff Member</th>
                                            <th className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-3">Present</th>
                                            <th className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-3">Late</th>
                                            <th className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-3">Absent</th>
                                            <th className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-3">Leave</th>
                                            <th className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-3">Half Day</th>
                                            <th className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-3">Hours</th>
                                            <th className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-3">%</th>
                                            <th className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reports.map((report) => (
                                            <>
                                                <tr key={report.user_id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700">
                                                                {report.first_name?.[0]}{report.last_name?.[0]}
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-semibold text-gray-900">{report.first_name} {report.last_name}</p>
                                                                <p className="text-[10px] text-gray-400 capitalize">{report.role?.replace('_', ' ')}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className="text-sm font-bold text-emerald-700">{report.total_present}</span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className="text-sm font-bold text-amber-700">{report.total_late}</span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className="text-sm font-bold text-red-700">{report.total_absent}</span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className="text-sm font-bold text-blue-700">{report.total_leave}</span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className="text-sm font-bold text-orange-700">{report.total_half_day}</span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className="text-xs font-mono text-gray-600">{report.total_hours?.toFixed(1) || '0.0'}</span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                                            report.attendance_percentage >= 90
                                                                ? 'bg-emerald-100 text-emerald-800'
                                                                : report.attendance_percentage >= 75
                                                                    ? 'bg-amber-100 text-amber-800'
                                                                    : 'bg-red-100 text-red-800'
                                                        }`}>
                                                            {report.attendance_percentage?.toFixed(0)}%
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <button
                                                            onClick={() => setExpandedUserId(expandedUserId === report.user_id ? null : report.user_id)}
                                                            className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
                                                        >
                                                            {expandedUserId === report.user_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                        </button>
                                                    </td>
                                                </tr>

                                                {/* Day-by-day breakdown */}
                                                {expandedUserId === report.user_id && (
                                                    <tr key={`${report.user_id}-details`}>
                                                        <td colSpan={9} className="px-4 py-4 bg-gray-50/50">
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                                                                Day-by-Day Breakdown
                                                            </p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {Array.from({ length: daysCount }, (_, i) => {
                                                                    const day = i + 1;
                                                                    const dayStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
                                                                    const record = report.daily_records?.find(d => d.date === dayStr);
                                                                    const { color, label } = getDayStatusDot(record?.status || null);
                                                                    const dayOfWeek = new Date(dayStr).getDay();
                                                                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                                                                    const finalColor = !record?.status && isWeekend ? 'bg-gray-300' : color;

                                                                    return (
                                                                        <div
                                                                            key={day}
                                                                            className="flex flex-col items-center"
                                                                            title={`${dayStr}: ${record?.status || (isWeekend ? 'Weekend' : 'No data')}`}
                                                                        >
                                                                            <span className="text-[9px] text-gray-400 font-medium mb-0.5">{day}</span>
                                                                            <div className={`w-6 h-6 rounded-md ${finalColor} flex items-center justify-center`}>
                                                                                <span className="text-[8px] text-white font-bold">
                                                                                    {!record?.status && isWeekend ? 'W' : label}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
