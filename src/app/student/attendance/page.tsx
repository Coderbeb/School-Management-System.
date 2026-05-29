'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { CalendarDays, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: 'super_admin' | 'teacher' | 'accountant' | 'student'; }
interface AttendanceDay { date: string; status: string; subject_name: string; period_number: number; remarks: string | null; }

export default function StudentAttendancePage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [records, setRecords] = useState<AttendanceDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'student') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchAttendance(token, month);
    }, []);

    const fetchAttendance = async (token: string, m: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/sms/student-attendance?month=${m}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setRecords(data.records || []);
            }
        } catch (err) {
            console.error('Failed to load attendance', err);
        } finally {
            setLoading(false);
        }
    };

    const handleMonthChange = (newMonth: string) => {
        setMonth(newMonth);
        const token = localStorage.getItem('token')!;
        fetchAttendance(token, newMonth);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'present': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
            case 'absent': return <XCircle className="w-4 h-4 text-red-500" />;
            case 'late': return <Clock className="w-4 h-4 text-amber-500" />;
            case 'excused': return <AlertCircle className="w-4 h-4 text-blue-500" />;
            default: return null;
        }
    };

    const getStatusBg = (status: string) => {
        switch (status) {
            case 'present': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
            case 'absent': return 'bg-red-50 border-red-200 text-red-700';
            case 'late': return 'bg-amber-50 border-amber-200 text-amber-700';
            case 'excused': return 'bg-blue-50 border-blue-200 text-blue-700';
            default: return 'bg-gray-50 border-gray-200 text-gray-700';
        }
    };

    // Calculate stats
    const total = records.length;
    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const late = records.filter(r => r.status === 'late').length;
    const percentage = total > 0 ? ((present + late) / total * 100).toFixed(1) : '0.0';

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-3xl mx-auto px-4 py-8 mt-16">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <CalendarDays className="w-6 h-6 text-emerald-600" /> My Attendance
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">Your attendance records for the selected month.</p>
                    </div>
                    <input
                        type="month"
                        value={month}
                        onChange={e => handleMonthChange(e.target.value)}
                        className="h-10 rounded-xl border border-gray-200 px-3 text-sm bg-white"
                    />
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-4 gap-3 mb-6">
                    {[
                        { label: 'Present', value: present, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
                        { label: 'Absent', value: absent, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
                        { label: 'Late', value: late, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
                        { label: 'Overall', value: `${percentage}%`, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
                    ].map(stat => (
                        <div key={stat.label} className={`rounded-2xl border p-4 text-center ${stat.bg}`}>
                            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                        </div>
                    ))}
                </div>

                {/* Records */}
                {loading ? (
                    <div className="text-center py-12 text-gray-400">Loading attendance records...</div>
                ) : records.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No attendance records found for this month.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {records.map((r, i) => (
                            <div key={i} className={`flex items-center justify-between p-4 rounded-xl border ${getStatusBg(r.status)}`}>
                                <div className="flex items-center gap-3">
                                    {getStatusIcon(r.status)}
                                    <div>
                                        <p className="font-semibold text-sm">{new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                                        <p className="text-xs opacity-70">{r.subject_name || 'General'} · Period {r.period_number}</p>
                                    </div>
                                </div>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold capitalize bg-white/60 border">
                                    {r.status}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
