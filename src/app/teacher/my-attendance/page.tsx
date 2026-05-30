'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    ArrowLeft, CalendarDays, CheckCircle, XCircle, Clock, Loader2,
    ChevronLeft, ChevronRight, Briefcase, TrendingUp, MapPin,
    ShieldAlert, Lock, Navigation, AlertTriangle
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

    // Check-in/out state
    const [checkInStatus, setCheckInStatus] = useState<{checked_in: boolean, check_in_time?: string, check_out_time?: string, status?: string} | null>(null);
    const [checkingIn, setCheckingIn] = useState(false);
    const [locationError, setLocationError] = useState('');
    const [isHoliday, setIsHoliday] = useState(false);
    const [holidayName, setHolidayName] = useState('');

    // Modal states
    const [showPreModal, setShowPreModal] = useState(false);
    const [showBlockedModal, setShowBlockedModal] = useState(false);
    const [showDeniedModal, setShowDeniedModal] = useState(false);
    const [showOutOfRangeModal, setShowOutOfRangeModal] = useState(false);
    const [pendingAction, setPendingAction] = useState<'check_in' | 'check_out' | null>(null);
    const [distanceInfo, setDistanceInfo] = useState<{distance: number, allowed: number} | null>(null);

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
        fetchTodayStatus();
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

    const fetchTodayStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            const todayDate = new Date();
            const isSunday = todayDate.getDay() === 0;

            // Check holidays
            if (isSunday) {
                setIsHoliday(true);
                setHolidayName('Sunday');
            } else {
                try {
                    const holidayRes = await fetch(`/api/holidays?month=${todayDate.getMonth() + 1}&year=${todayDate.getFullYear()}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (holidayRes.ok) {
                        const holidayData = await holidayRes.json();
                        const holidays = holidayData.holidays || [];
                        const todayHoliday = holidays.find((h: any) => h.date === today || h.date?.split('T')[0] === today);
                        if (todayHoliday) {
                            setIsHoliday(true);
                            setHolidayName(todayHoliday.name || 'School Holiday');
                        }
                    }
                } catch { /* silent */ }
            }

            // Fetch today's check-in status
            const statusRes = await fetch(`/api/staff-attendance?date=${today}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (statusRes.ok) {
                const statusData = await statusRes.json();
                const myRecord = statusData.records?.find((r: any) => r.user_id === user?.id);
                if (myRecord) {
                    setCheckInStatus({
                        checked_in: !!myRecord.check_in_time,
                        check_in_time: myRecord.check_in_time,
                        check_out_time: myRecord.check_out_time,
                        status: myRecord.status
                    });
                } else {
                    setCheckInStatus({ checked_in: false });
                }
            }
        } catch { /* silent */ }
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    // ===== Check-In / Check-Out Flow =====
    const initiateCheckIn = (action: 'check_in' | 'check_out') => {
        setPendingAction(action);
        setLocationError('');
        setDistanceInfo(null);

        const isSecure = typeof window !== 'undefined' && window.isSecureContext;
        const hasGeolocation = typeof navigator !== 'undefined' && navigator.geolocation;

        if (!hasGeolocation || !isSecure) {
            setShowBlockedModal(true);
            return;
        }

        // Check permission state first
        if (navigator.permissions) {
            navigator.permissions.query({ name: 'geolocation' }).then((result) => {
                if (result.state === 'denied') {
                    setShowDeniedModal(true);
                } else if (result.state === 'prompt') {
                    setShowPreModal(true);
                } else {
                    // Already granted, proceed directly
                    triggerActualCheckIn(action);
                }
            }).catch(() => {
                // Fallback: show pre-modal
                setShowPreModal(true);
            });
        } else {
            setShowPreModal(true);
        }
    };

    const triggerActualCheckIn = async (actionOverride?: 'check_in' | 'check_out') => {
        const action = actionOverride || pendingAction;
        if (!action) return;
        setShowPreModal(false);
        setShowDeniedModal(false);
        setCheckingIn(true);
        setLocationError('');
        setDistanceInfo(null);

        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0
                });
            });
            const { latitude, longitude } = position.coords;
            const token = localStorage.getItem('token');
            const res = await fetch('/api/staff-attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ latitude, longitude, action })
            });
            const data = await res.json();
            if (!res.ok) {
                // Check if it's an out-of-range error
                if (data.distance && data.allowed) {
                    setDistanceInfo({ distance: data.distance, allowed: data.allowed });
                    setShowOutOfRangeModal(true);
                } else {
                    setLocationError(data.error || 'Failed to mark attendance');
                }
            } else {
                setCheckInStatus({
                    checked_in: true,
                    check_in_time: data.record?.check_in_time || new Date().toISOString(),
                    check_out_time: action === 'check_out' ? (data.record?.check_out_time || new Date().toISOString()) : checkInStatus?.check_out_time,
                    status: data.record?.status
                });
                setLocationError('');
                // Refresh attendance data
                fetchAttendance();
            }
        } catch (err: any) {
            if (err.code === 1) {
                setShowDeniedModal(true);
            }
            else if (err.code === 2) setLocationError('Unable to determine your location. Please try again.');
            else if (err.code === 3) setLocationError('Location request timed out. Please try again.');
            else setLocationError('Failed to get location. Please try again.');
        }
        setCheckingIn(false);
    };

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
    const halfDays = records.filter(r => r.status === 'half_day').length;
    const totalWorking = presentDays + lateDays + absentDays + leaveDays + halfDays;
    const attendancePct = totalWorking > 0 ? (((presentDays + lateDays + halfDays) / totalWorking) * 100).toFixed(1) : '0.0';

    // Calendar grid
    const [year, month] = selectedMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1).getDay();
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
        if (dayOfWeek === 0) return 'weekend';
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
            case 'half_day': return 'bg-orange-500';
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
            case 'half_day': return <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold">Half Day</span>;
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
                        <p className="text-emerald-200 text-sm">Check-in, check-out, and track your monthly attendance.</p>
                    </div>
                </div>

                {/* ===== CHECK-IN / CHECK-OUT CARD ===== */}
                <div className="mb-6 bg-white rounded-2xl border border-emerald-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl ${
                                isHoliday ? 'bg-rose-100 text-rose-600' :
                                checkInStatus?.status === 'on_leave' ? 'bg-blue-100 text-blue-600' :
                                checkInStatus?.checked_in ? 'bg-emerald-100 text-emerald-600' :
                                'bg-amber-100 text-amber-600'
                            }`}>
                                <MapPin className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">Today&apos;s Attendance</h3>
                                <p className="text-xs text-gray-500">
                                    {isHoliday
                                        ? `🏖️ Today is ${holidayName} — attendance marking is disabled`
                                        : checkInStatus?.status === 'on_leave'
                                            ? 'You are on approved leave today'
                                            : checkInStatus?.checked_in && checkInStatus.check_in_time
                                                ? `Checked in at ${new Date(checkInStatus.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}${checkInStatus.check_out_time ? ` · Out at ${new Date(checkInStatus.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : ''}`
                                                : 'Not checked in yet'
                                    }
                                </p>
                            </div>
                        </div>
                        {checkInStatus?.status && !isHoliday && (
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                checkInStatus.status === 'present' ? 'bg-emerald-100 text-emerald-700' :
                                checkInStatus.status === 'late' ? 'bg-amber-100 text-amber-700' :
                                checkInStatus.status === 'on_leave' ? 'bg-blue-100 text-blue-700' :
                                checkInStatus.status === 'half_day' ? 'bg-orange-100 text-orange-700' :
                                'bg-gray-100 text-gray-700'
                            }`}>
                                {checkInStatus.status === 'present' ? '✓ On Time' :
                                 checkInStatus.status === 'late' ? '⚠ Late' :
                                 checkInStatus.status === 'on_leave' ? '✈ On Leave' :
                                 checkInStatus.status === 'half_day' ? '½ Half Day' :
                                 checkInStatus.status}
                            </span>
                        )}
                        {isHoliday && (
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                                🏖️ Holiday
                            </span>
                        )}
                    </div>

                    {locationError && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{locationError}</span>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        {isHoliday ? (
                            <div className="flex-1 py-4 bg-rose-50 text-rose-600 font-semibold rounded-xl text-sm text-center border border-rose-100 flex items-center justify-center gap-2">
                                🏖️ Holiday — Check-in Disabled
                            </div>
                        ) : checkInStatus?.status === 'on_leave' ? (
                            <div className="flex-1 py-4 bg-blue-50 text-blue-600 font-semibold rounded-xl text-sm text-center border border-blue-100 flex items-center justify-center gap-2">
                                ✈️ On Approved Leave
                            </div>
                        ) : !checkInStatus?.checked_in ? (
                            <button onClick={() => initiateCheckIn('check_in')} disabled={checkingIn}
                                className="flex-1 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer">
                                {checkingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                                {checkingIn ? 'Getting Location...' : '📍 Check In'}
                            </button>
                        ) : !checkInStatus?.check_out_time ? (
                            <button onClick={() => initiateCheckIn('check_out')} disabled={checkingIn}
                                className="flex-1 py-4 bg-gradient-to-r from-rose-500 to-red-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer">
                                {checkingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                                {checkingIn ? 'Getting Location...' : '📍 Check Out'}
                            </button>
                        ) : (
                            <div className="flex-1 py-4 bg-gray-50 text-gray-500 font-medium rounded-xl text-sm text-center border border-gray-100">
                                ✅ Attendance completed for today
                            </div>
                        )}
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
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
                            <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-3 text-center">
                                <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                                <div className="text-xl font-bold text-emerald-700">{presentDays}</div>
                                <div className="text-[10px] text-emerald-600 font-medium">Present</div>
                            </div>
                            <div className="bg-amber-50 rounded-2xl border border-amber-100 p-3 text-center">
                                <Clock className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                                <div className="text-xl font-bold text-amber-700">{lateDays}</div>
                                <div className="text-[10px] text-amber-600 font-medium">Late</div>
                            </div>
                            <div className="bg-orange-50 rounded-2xl border border-orange-100 p-3 text-center">
                                <Clock className="w-4 h-4 text-orange-500 mx-auto mb-1" />
                                <div className="text-xl font-bold text-orange-700">{halfDays}</div>
                                <div className="text-[10px] text-orange-600 font-medium">Half Day</div>
                            </div>
                            <div className="bg-red-50 rounded-2xl border border-red-100 p-3 text-center">
                                <XCircle className="w-4 h-4 text-red-500 mx-auto mb-1" />
                                <div className="text-xl font-bold text-red-700">{absentDays}</div>
                                <div className="text-[10px] text-red-600 font-medium">Absent</div>
                            </div>
                            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-3 text-center">
                                <Briefcase className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                                <div className="text-xl font-bold text-blue-700">{leaveDays}</div>
                                <div className="text-[10px] text-blue-600 font-medium">Leave</div>
                            </div>
                            <div className="bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl border border-emerald-200 p-3 text-center">
                                <TrendingUp className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                                <div className="text-xl font-bold text-emerald-700">{attendancePct}%</div>
                                <div className="text-[10px] text-emerald-600 font-medium">Attendance</div>
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
                                <div className="flex items-center gap-1.5 text-xs text-gray-500"><div className="w-2 h-2 rounded-full bg-orange-500" /> Half Day</div>
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

            {/* ===== MODAL: Pre-Permission Request ===== */}
            {showPreModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 flex flex-col items-center text-center animate-scale-in">
                        <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 mb-4 ring-8 ring-blue-50/50">
                            <MapPin className="w-7 h-7 animate-pulse" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Location Permission Required</h3>
                        <p className="text-sm text-gray-500 leading-relaxed mb-6">
                            We need your device&apos;s location to verify you are within the school boundary. Your browser will ask for permission when you proceed.
                        </p>
                        <div className="flex flex-col gap-2 w-full">
                            <button
                                type="button"
                                onClick={() => triggerActualCheckIn()}
                                className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-bold transition-all shadow-md cursor-pointer hover:shadow-lg"
                            >
                                ✅ Enable Location & Proceed
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowPreModal(false)}
                                className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold transition-all border border-gray-150 cursor-pointer"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== MODAL: GPS Access Restricted (Non-Secure HTTP) ===== */}
            {showBlockedModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 flex flex-col items-center text-center animate-scale-in">
                        <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mb-4 ring-8 ring-amber-50/50">
                            <ShieldAlert className="w-7 h-7 animate-bounce" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">GPS Access Restricted</h3>
                        <p className="text-sm text-gray-500 leading-relaxed mb-4">
                            Mobile browsers require a secure <strong>HTTPS</strong> connection to access device location. Because you are on a non-secure connection, location access is blocked.
                        </p>
                        <p className="text-xs text-amber-600 mb-6 leading-normal">
                            💡 Please contact the Super Admin for a secure HTTPS link or mark your attendance from a secure desktop browser.
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowBlockedModal(false)}
                            className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-sm font-bold transition-all shadow-md cursor-pointer"
                        >
                            Okay, Got It
                        </button>
                    </div>
                </div>
            )}

            {/* ===== MODAL: Permission Denied ===== */}
            {showDeniedModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 flex flex-col items-center text-center animate-scale-in">
                        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4 ring-8 ring-red-50/50">
                            <Lock className="w-7 h-7" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Location Permission Denied</h3>
                        <p className="text-sm text-gray-500 leading-relaxed mb-2">
                            Location permission was denied by your browser. To enable it:
                        </p>
                        <div className="text-left w-full mb-6 bg-gray-50 rounded-xl p-4 text-xs text-gray-600 space-y-1.5">
                            <p>📱 <strong>Mobile:</strong> Go to Browser Settings → Site Settings → Location → Allow</p>
                            <p>💻 <strong>Desktop:</strong> Click the 🔒 icon in the address bar → Location → Allow</p>
                        </div>
                        <div className="flex flex-col gap-2 w-full">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowDeniedModal(false);
                                    triggerActualCheckIn();
                                }}
                                className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-bold transition-all shadow-md cursor-pointer"
                            >
                                🔄 Retry After Enabling
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowDeniedModal(false)}
                                className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold transition-all border border-gray-150 cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== MODAL: Out of Range ===== */}
            {showOutOfRangeModal && distanceInfo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 flex flex-col items-center text-center animate-scale-in">
                        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4 ring-8 ring-red-50/50">
                            <Navigation className="w-7 h-7" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">You&apos;re Out of Range</h3>
                        <p className="text-sm text-gray-500 leading-relaxed mb-4">
                            You are too far from the school to mark attendance.
                        </p>

                        {/* Distance Visual */}
                        <div className="w-full bg-gray-50 rounded-2xl p-5 mb-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="text-left">
                                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Your Distance</p>
                                    <p className="text-2xl font-bold text-red-600">{distanceInfo.distance}m</p>
                                </div>
                                <div className="w-px h-12 bg-gray-200"></div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Allowed Range</p>
                                    <p className="text-2xl font-bold text-emerald-600">{distanceInfo.allowed}m</p>
                                </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-400 transition-all"
                                    style={{ width: `${Math.min((distanceInfo.allowed / distanceInfo.distance) * 100, 100)}%` }}
                                />
                            </div>
                            <p className="text-xs text-gray-500">
                                You need to be <strong className="text-red-600">{distanceInfo.distance - distanceInfo.allowed}m closer</strong> to the school
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowOutOfRangeModal(false)}
                            className="w-full py-3.5 bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-xl text-sm font-bold transition-all shadow-md cursor-pointer"
                        >
                            Okay, Got It
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
