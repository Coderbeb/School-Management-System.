'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    Users, Clock, UserCheck, UserX, CalendarOff,
    BarChart3, Calendar, Plane, Settings,
    ChevronDown, ChevronUp, Loader2, CheckCircle,
    XCircle, AlertCircle, Send, ArrowLeft
} from 'lucide-react';

interface UserData {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'super_admin' | 'teacher' | 'accountant' | 'student';
}

interface StaffAttendanceRecord {
    id: string;
    user_id: string;
    first_name: string;
    last_name: string;
    role: string;
    check_in_time: string | null;
    check_out_time: string | null;
    status: 'present' | 'late' | 'absent' | 'half_day' | 'on_leave';
}

interface StaffMember {
    id: string;
    first_name: string;
    last_name: string;
    role: string;
    email: string;
}

export default function StaffAttendanceDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [todayRecords, setTodayRecords] = useState<StaffAttendanceRecord[]>([]);
    const [pendingLeaves, setPendingLeaves] = useState(0);
    const [totalStaff, setTotalStaff] = useState(0);
    const [overviewExpanded, setOverviewExpanded] = useState(false);

    // Manual override state
    const [showManualOverride, setShowManualOverride] = useState(false);
    const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [manualStatus, setManualStatus] = useState<'present' | 'absent'>('present');
    const [manualRemarks, setManualRemarks] = useState('');
    const [submittingManual, setSubmittingManual] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchData(token);
    }, []);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const getTodayDate = () => {
        const now = new Date();
        return now.toISOString().split('T')[0];
    };

    const fetchData = async (token: string) => {
        setLoading(true);
        try {
            const [attendanceRes, leavesRes, staffRes] = await Promise.all([
                fetch(`/api/staff-attendance?date=${getTodayDate()}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }).then(r => r.json()).catch(() => ({ records: [], totalStaff: 0 })),
                fetch('/api/leave-requests?status=pending', {
                    headers: { Authorization: `Bearer ${token}` }
                }).then(r => r.json()).catch(() => ({ requests: [], count: 0 })),
                fetch('/api/manage/teachers', {
                    headers: { Authorization: `Bearer ${token}` }
                }).then(r => r.json()).catch(() => ({ teachers: [] }))
            ]);
            setTodayRecords(attendanceRes.records || []);
            setTotalStaff(attendanceRes.totalStaff || staffRes.teachers?.length || 0);
            setPendingLeaves(leavesRes.count || leavesRes.requests?.length || 0);
            setAllStaff(staffRes.teachers || []);
        } catch (err) {
            console.error('Failed to fetch data:', err);
        } finally {
            setLoading(false);
        }
    };

    const checkedInCount = todayRecords.filter(r => r.status === 'present' || r.status === 'late' || r.status === 'half_day').length;
    const notCheckedIn = totalStaff - checkedInCount;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'present': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">Present</span>;
            case 'late': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">Late</span>;
            case 'absent': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800">Absent</span>;
            case 'half_day': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800">Half Day</span>;
            case 'on_leave': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800">On Leave</span>;
            default: return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600">{status}</span>;
        }
    };

    const formatTime = (timeStr: string | null) => {
        if (!timeStr) return '—';
        try {
            return new Date(timeStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        } catch { return timeStr; }
    };

    const handleManualSubmit = async () => {
        if (!selectedUserId) return;
        setSubmittingManual(true);
        try {
            const token = localStorage.getItem('token')!;
            const res = await fetch('/api/staff-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    latitude: 0,
                    longitude: 0,
                    action: 'manual',
                    userId: selectedUserId,
                    status: manualStatus,
                    remarks: manualRemarks
                })
            });
            const data = await res.json();
            if (!res.ok) {
                setToast({ type: 'error', message: data.error || 'Failed to mark attendance' });
            } else {
                setToast({ type: 'success', message: `Attendance marked as ${manualStatus} successfully` });
                setSelectedUserId('');
                setManualRemarks('');
                setShowManualOverride(false);
                fetchData(token);
            }
        } catch {
            setToast({ type: 'error', message: 'Server error. Please try again.' });
        } finally {
            setSubmittingManual(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    if (!user) return null;

    const statsCards = [
        { label: 'Total Staff', value: totalStaff, icon: Users, gradient: 'from-blue-100 to-indigo-100', text: 'text-blue-700', border: 'border-blue-200', iconColor: 'text-blue-600' },
        { label: 'Checked In Today', value: checkedInCount, icon: UserCheck, gradient: 'from-emerald-100 to-teal-100', text: 'text-emerald-700', border: 'border-emerald-200', iconColor: 'text-emerald-600' },
        { label: 'Not Checked In', value: notCheckedIn, icon: UserX, gradient: 'from-amber-100 to-orange-100', text: 'text-amber-700', border: 'border-amber-200', iconColor: 'text-amber-600' },
        { label: 'Pending Leaves', value: pendingLeaves, icon: CalendarOff, gradient: 'from-rose-100 to-pink-100', text: 'text-rose-700', border: 'border-rose-200', iconColor: 'text-rose-600' },
    ];

    const navCards = [
        {
            emoji: '📊', title: "Today's Overview", description: 'Real-time staff presence',
            action: () => setOverviewExpanded(!overviewExpanded), expandable: true,
        },
        {
            emoji: '📅', title: 'Monthly Reports', description: 'View detailed attendance reports',
            action: () => router.push('/manage/staff-attendance/reports'), expandable: false,
        },
        {
            emoji: '✈️', title: 'Leave Requests', description: 'Approve or reject leave applications',
            action: () => router.push('/manage/staff-attendance/leaves'), expandable: false, badge: pendingLeaves,
        },
        {
            emoji: '⚙️', title: 'Attendance Settings', description: 'Configure location & timings',
            action: () => router.push('/manage/staff-attendance/settings'), expandable: false,
        },
    ];

    return (
        <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">

                {/* Hero Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-8 mb-8 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-teal-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10">
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="inline-flex items-center gap-1.5 text-sm text-emerald-200 hover:text-white mb-4 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Dashboard
                        </button>
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-bold mb-2">Staff Attendance Management</h1>
                                <p className="text-emerald-100 text-sm max-w-xl">
                                    Monitor teacher check-ins, review attendance reports, manage leave requests, and configure attendance settings.
                                </p>
                            </div>
                            <UserCheck className="hidden sm:block w-12 h-12 text-emerald-200 opacity-80" />
                        </div>
                    </div>
                </div>

                {/* Toast */}
                {toast && (
                    <div className={`mb-6 flex items-center gap-2 p-3.5 rounded-xl text-xs font-medium shadow-sm animate-fade-in ${
                        toast.type === 'success' ? 'bg-emerald-50 border border-emerald-100 text-emerald-800' : 'bg-red-50 border border-red-100 text-red-800'
                    }`}>
                        {toast.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" /> : <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                        <span>{toast.message}</span>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                        <p className="text-gray-500 font-medium">Loading attendance data...</p>
                    </div>
                ) : (
                    <>
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            {statsCards.map((stat) => (
                                <div key={stat.label} className={`bg-gradient-to-br ${stat.gradient} rounded-2xl p-4 border ${stat.border} shadow-sm`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                                    </div>
                                    <p className={`text-2xl font-bold ${stat.text}`}>{stat.value}</p>
                                    <p className="text-xs text-gray-600 font-medium mt-0.5">{stat.label}</p>
                                </div>
                            ))}
                        </div>

                        {/* Navigation Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                            {navCards.map((card) => (
                                <button
                                    key={card.title}
                                    onClick={card.action}
                                    className="bg-white rounded-2xl p-5 border border-gray-150 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 text-left group relative"
                                >
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <span className="text-2xl mb-2 block">{card.emoji}</span>
                                            <h3 className="font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">{card.title}</h3>
                                            <p className="text-xs text-gray-500 mt-1">{card.description}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {card.badge !== undefined && card.badge > 0 && (
                                                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                                                    {card.badge}
                                                </span>
                                            )}
                                            {card.expandable && (
                                                overviewExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Today's Overview - Expandable */}
                        {overviewExpanded && (
                            <div className="bg-white rounded-2xl border border-gray-150 shadow-sm overflow-hidden mb-6 animate-fade-in">
                                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-emerald-600" />
                                        Today&apos;s Staff Attendance — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                    </h3>
                                    <button
                                        onClick={() => setShowManualOverride(!showManualOverride)}
                                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        {showManualOverride ? 'Close Override' : '✏️ Manual Override'}
                                    </button>
                                </div>

                                {/* Manual Override Section */}
                                {showManualOverride && (
                                    <div className="px-5 py-4 bg-amber-50/50 border-b border-amber-100">
                                        <p className="text-xs font-bold text-amber-800 mb-3 flex items-center gap-1.5">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            Manual Attendance Override
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                            <div>
                                                <label className="text-xs text-gray-600 font-medium block mb-1">Staff Member</label>
                                                <select
                                                    value={selectedUserId}
                                                    onChange={(e) => setSelectedUserId(e.target.value)}
                                                    className="w-full h-9 rounded-lg border border-gray-200 px-3 text-xs bg-white text-gray-800"
                                                >
                                                    <option value="">Select staff...</option>
                                                    {allStaff.map(s => (
                                                        <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-600 font-medium block mb-1">Status</label>
                                                <select
                                                    value={manualStatus}
                                                    onChange={(e) => setManualStatus(e.target.value as 'present' | 'absent')}
                                                    className="w-full h-9 rounded-lg border border-gray-200 px-3 text-xs bg-white text-gray-800"
                                                >
                                                    <option value="present">Present</option>
                                                    <option value="absent">Absent</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-600 font-medium block mb-1">Remarks</label>
                                                <input
                                                    type="text"
                                                    value={manualRemarks}
                                                    onChange={(e) => setManualRemarks(e.target.value)}
                                                    placeholder="Optional remarks..."
                                                    className="w-full h-9 rounded-lg border border-gray-200 px-3 text-xs bg-white text-gray-800"
                                                />
                                            </div>
                                            <div className="flex items-end">
                                                <button
                                                    onClick={handleManualSubmit}
                                                    disabled={!selectedUserId || submittingManual}
                                                    className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                                                >
                                                    {submittingManual ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                                    Submit
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Attendance Table */}
                                <div className="overflow-x-auto">
                                    {todayRecords.length === 0 ? (
                                        <div className="text-center py-12">
                                            <UserX className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                                            <p className="text-gray-500 text-sm font-medium">No attendance records for today yet.</p>
                                        </div>
                                    ) : (
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-gray-100">
                                                    <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">Name</th>
                                                    <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">Role</th>
                                                    <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">Check-In</th>
                                                    <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">Check-Out</th>
                                                    <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {todayRecords.map((record) => (
                                                    <tr key={record.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                                        <td className="px-5 py-3">
                                                            <div className="flex items-center gap-2.5">
                                                                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
                                                                    {record.first_name?.[0]}{record.last_name?.[0]}
                                                                </div>
                                                                <span className="text-sm font-semibold text-gray-900">{record.first_name} {record.last_name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-5 py-3">
                                                            <span className="text-xs text-gray-500 capitalize">{record.role?.replace('_', ' ')}</span>
                                                        </td>
                                                        <td className="px-5 py-3 text-xs text-gray-600 font-mono">{formatTime(record.check_in_time)}</td>
                                                        <td className="px-5 py-3 text-xs text-gray-600 font-mono">{formatTime(record.check_out_time)}</td>
                                                        <td className="px-5 py-3">{getStatusBadge(record.status)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
