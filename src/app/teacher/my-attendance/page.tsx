'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    ArrowLeft, CalendarDays, CheckCircle, XCircle, Clock, Loader2,
    ChevronLeft, ChevronRight, Briefcase, TrendingUp
} from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: string; }
interface AttendanceRecord {
    id: string; user_id: string; date: string; check_in_time: string; check_out_time?: string;
    status: string; hours_worked?: number;
}

export default function TeacherMyAttendancePage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'teacher') { router.replace('/dashboard'); return; }
        setUser(parsed);
    }, [router]);

    useEffect(() => {
        if (!user) return;
        fetchAttendance();
    }, [user, selectedMonth]);

    const fetchAttendance = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/staff-attendance?month=${selectedMonth}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const myRecords = (data.records || []).filter((r: any) => r.user_id === user?.id);
                setRecords(myRecords);
            }
        } catch { /* silent */ }
        setLoading(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const changeMonth = (delta: number) => {
        const [y, m] = selectedMonth.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };

    const monthLabel = (() => {
        const [y, m] = selectedMonth.split('-').map(Number);
        return new Date(y, m - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    })();

    // Summary calculations
    const presentDays = records.filter(r => r.status === 'present').length;
    const lateDays = records.filter(r => r.status === 'late').length;
    const absentDays = records.filter(r => r.status === 'absent').length;
    const leaveDays = records.filter(r => r.status === 'on_leave').length;
    const totalWorking = presentDays + lateDays + absentDays + leaveDays;
    const attendancePct = totalWorking > 0 ? (((presentDays + lateDays) / totalWorking) * 100).toFixed(1) : '0.0';

    // Calendar grid
    const [year, month] = selectedMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const recordMap = new Map<string, AttendanceRecord>();
    records.forEach(r => {
        const dateKey = r.date.split('T')[0];
        recordMap.set(dateKey, r);
    });

    const getDayStatus = (day: number): string => {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (dateStr > todayStr) return 'future';
        const dayOfWeek = new Date(year, month - 1, day).getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) return 'weekend'; // Sunday or Saturday
        const record = recordMap.get(dateStr);
        if (record) return record.status;
        if (dateStr < todayStr) return 'absent';
        return 'today';
    };

    const getDotColor = (status: string) => {
        switch (status) {
            case 'present': return 'bg-emerald-500';
            case 'late': return 'bg-amber-500';
            case 'absent': return 'bg-red-500';
            case 'on_leave': return 'bg-blue-500';
            case 'weekend': return 'bg-gray-300';
            default: return '';
        }
    };

    const formatHours = (checkIn?: string, checkOut?: string) => {
        if (!checkIn || !checkOut) return '—';
        const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
        if (diff <= 0) return '—';
        const hrs = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        return `${hrs}h ${mins}m`;
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'present': return <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">Present</span>;
            case 'late': return <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">Late</span>;
            case 'absent': return <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">Absent</span>;
            case 'on_leave': return <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">On Leave</span>;
            default: return <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">{status}</span>;
        }
    };

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-4xl mx-auto px-4 py-8 mt-16">
                {/* Hero Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-7 mb-7 shadow-xl">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
                    <div className="relative z-10">
                        <button onClick={() => router.push('/teacher/dashboard')}
                            className="flex items-center gap-1.5 text-emerald-300 hover:text-white text-sm font-medium mb-3 transition-colors">
                            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                        </button>
                        <h1 className="text-xl font-bold mb-1">My Attendance 📋</h1>
                        <p className="text-emerald-200 text-sm">Track your daily attendance, check-in times, and monthly summary.</p>
                    </div>
                </div>

                {/* Month Selector */}
                <div className="flex items-center justify-between mb-6">
                    <button onClick={() => changeMonth(-1)} className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
                        <ChevronLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <h2 className="text-lg font-bold text-gray-900">{monthLabel}</h2>
                    <button onClick={() => changeMonth(1)} className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                        <p className="text-gray-400 text-sm">Loading attendance data...</p>
                    </div>
                ) : (
                    <>
                        {/* Monthly Summary */}
                        <div className="grid grid-cols-5 gap-2 mb-6">
                            <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4 text-center">
                                <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                                <div className="text-2xl font-bold text-emerald-700">{presentDays}</div>
                                <div className="text-xs text-emerald-600 font-medium">Present</div>
                            </div>
                            <div className="bg-amber-50 rounded-2xl border border-amber-100 p-4 text-center">
                                <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                                <div className="text-2xl font-bold text-amber-700">{lateDays}</div>
                                <div className="text-xs text-amber-600 font-medium">Late</div>
                            </div>
                            <div className="bg-red-50 rounded-2xl border border-red-100 p-4 text-center">
                                <XCircle className="w-5 h-5 text-red-500 mx-auto mb-1" />
                                <div className="text-2xl font-bold text-red-700">{absentDays}</div>
                                <div className="text-xs text-red-600 font-medium">Absent</div>
                            </div>
                            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-4 text-center">
                                <Briefcase className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                                <div className="text-2xl font-bold text-blue-700">{leaveDays}</div>
                                <div className="text-xs text-blue-600 font-medium">Leave</div>
                            </div>
                            <div className="bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl border border-emerald-200 p-4 text-center">
                                <TrendingUp className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                                <div className="text-2xl font-bold text-emerald-700">{attendancePct}%</div>
                                <div className="text-xs text-emerald-600 font-medium">Attendance</div>
                            </div>
                        </div>

                        {/* Calendar View */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 shadow-sm">
                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">Calendar View</h3>
                            <div className="grid grid-cols-7 gap-1 mb-2">
                                {dayNames.map(d => (
                                    <div key={d} className="text-center text-xs font-bold text-gray-400 py-1">{d}</div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 gap-1">
                                {Array.from({ length: firstDay }, (_, i) => (
                                    <div key={`empty-${i}`} className="h-10" />
                                ))}
                                {Array.from({ length: daysInMonth }, (_, i) => {
                                    const day = i + 1;
                                    const status = getDayStatus(day);
                                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    const isToday = dateStr === todayStr;
                                    return (
                                        <div key={day}
                                            className={`h-10 rounded-xl flex flex-col items-center justify-center text-sm transition-all
                                                ${isToday ? 'ring-2 ring-blue-400 bg-blue-50 font-bold text-blue-700' : 'text-gray-700'}
                                                ${status === 'weekend' ? 'bg-gray-50 text-gray-400' : ''}
                                                ${status === 'future' ? 'text-gray-300' : ''}
                                            `}>
                                            <span className="text-xs">{day}</span>
                                            {status !== 'future' && status !== 'today' && (
                                                <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${getDotColor(status)}`} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Legend */}
                            <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-gray-100">
                                <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Present</div>
                                <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-2 h-2 rounded-full bg-amber-500" /> Late</div>
                                <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-2 h-2 rounded-full bg-red-500" /> Absent</div>
                                <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-2 h-2 rounded-full bg-blue-500" /> On Leave</div>
                                <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-2 h-2 rounded-full bg-gray-300" /> Weekend</div>
                            </div>
                        </div>

                        {/* Daily Log Table */}
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100">
                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Daily Log</h3>
                            </div>
                            {records.length === 0 ? (
                                <div className="text-center py-12">
                                    <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 font-medium">No attendance records for this month.</p>
                                    <p className="text-gray-400 text-sm mt-1">Records will appear here as you check in.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 text-left">
                                                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase">Date</th>
                                                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase">Day</th>
                                                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase">Check-In</th>
                                                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase">Check-Out</th>
                                                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase">Hours</th>
                                                <th className="px-5 py-3 text-xs font-bold text-gray-500 uppercase">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {records
                                                .sort((a, b) => b.date.localeCompare(a.date))
                                                .map(record => {
                                                    const d = new Date(record.date);
                                                    const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' });
                                                    const dateLabel = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                                                    return (
                                                        <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                                                            <td className="px-5 py-3 font-medium text-gray-900">{dateLabel}</td>
                                                            <td className="px-5 py-3 text-gray-500">{dayName}</td>
                                                            <td className="px-5 py-3 text-gray-700">
                                                                {record.check_in_time
                                                                    ? new Date(record.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
                                                                    : '—'}
                                                            </td>
                                                            <td className="px-5 py-3 text-gray-700">
                                                                {record.check_out_time
                                                                    ? new Date(record.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
                                                                    : '—'}
                                                            </td>
                                                            <td className="px-5 py-3 text-gray-700 font-medium">
                                                                {formatHours(record.check_in_time, record.check_out_time)}
                                                            </td>
                                                            <td className="px-5 py-3">{getStatusBadge(record.status)}</td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
