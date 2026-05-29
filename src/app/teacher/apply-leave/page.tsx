'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    ArrowLeft, Send, Loader2, CalendarDays, FileText,
    CheckCircle, XCircle, Clock, AlertCircle
} from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: string; }
interface LeaveRequest {
    id: string; user_id: string; leave_type: string; from_date: string; to_date: string;
    reason: string; status: string; reviewer_name?: string; remarks?: string;
    created_at: string;
}

export default function TeacherApplyLeavePage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    // Form state
    const [leaveType, setLeaveType] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [reason, setReason] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'teacher') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchLeaveRequests(token);
    }, [router]);

    const fetchLeaveRequests = async (token: string) => {
        setLoading(true);
        try {
            const res = await fetch('/api/leave-requests', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setLeaveRequests(data.requests || []);
            }
        } catch { /* silent */ }
        setLoading(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSuccessMsg('');
        setErrorMsg('');

        if (!leaveType || !fromDate || !toDate || !reason.trim()) {
            setErrorMsg('Please fill in all fields.');
            return;
        }

        if (new Date(toDate) < new Date(fromDate)) {
            setErrorMsg('End date cannot be before start date.');
            return;
        }

        setSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/leave-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ leave_type: leaveType, from_date: fromDate, to_date: toDate, reason: reason.trim() })
            });
            const data = await res.json();
            if (!res.ok) {
                setErrorMsg(data.error || 'Failed to submit leave request.');
            } else {
                setSuccessMsg('Leave request submitted successfully!');
                setLeaveType('');
                setFromDate('');
                setToDate('');
                setReason('');
                // Refresh list
                const token2 = localStorage.getItem('token');
                if (token2) fetchLeaveRequests(token2);
            }
        } catch {
            setErrorMsg('Network error. Please try again.');
        }
        setSubmitting(false);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending': return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                    <Clock className="w-3 h-3" /> Pending
                </span>
            );
            case 'approved': return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                    <CheckCircle className="w-3 h-3" /> Approved
                </span>
            );
            case 'rejected': return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                    <XCircle className="w-3 h-3" /> Rejected
                </span>
            );
            default: return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">
                    {status}
                </span>
            );
        }
    };

    const getLeaveTypeBadge = (type: string) => {
        const colors: Record<string, string> = {
            'sick': 'bg-rose-100 text-rose-700 border-rose-200',
            'casual': 'bg-blue-100 text-blue-700 border-blue-200',
            'personal': 'bg-violet-100 text-violet-700 border-violet-200',
            'other': 'bg-gray-100 text-gray-700 border-gray-200',
        };
        const labels: Record<string, string> = {
            'sick': 'Sick Leave',
            'casual': 'Casual Leave',
            'personal': 'Personal',
            'other': 'Other',
        };
        const cls = colors[type] || colors['other'];
        return <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${cls}`}>{labels[type] || type}</span>;
    };

    const formatDateRange = (from: string, to: string) => {
        const f = new Date(from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const t = new Date(to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        return from === to ? f : `${f} — ${t}`;
    };

    const countDays = (from: string, to: string) => {
        const diff = (new Date(to).getTime() - new Date(from).getTime()) / 86400000;
        const days = Math.max(1, Math.round(diff) + 1);
        return `${days} day${days !== 1 ? 's' : ''}`;
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-3xl mx-auto px-4 py-8 mt-16">
                {/* Hero Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-7 mb-7 shadow-xl">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-violet-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
                    <div className="relative z-10">
                        <button onClick={() => router.push('/teacher/dashboard')}
                            className="flex items-center gap-1.5 text-violet-300 hover:text-white text-sm font-medium mb-3 transition-colors">
                            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                        </button>
                        <h1 className="text-xl font-bold mb-1">Apply for Leave ✍️</h1>
                        <p className="text-violet-200 text-sm">Submit a leave request and track its approval status.</p>
                    </div>
                </div>

                {/* Leave Application Form */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8 shadow-sm">
                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-5">New Leave Request</h2>

                    {successMsg && (
                        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 flex-shrink-0" /> {successMsg}
                        </div>
                    )}
                    {errorMsg && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {errorMsg}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Leave Type</label>
                            <select value={leaveType} onChange={e => setLeaveType(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all">
                                <option value="">Select leave type...</option>
                                <option value="sick">Sick Leave</option>
                                <option value="casual">Casual Leave</option>
                                <option value="personal">Personal</option>
                                <option value="other">Other</option>
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">From Date</label>
                                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">To Date</label>
                                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Reason</label>
                            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Describe your reason for leave..."
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all resize-none" />
                        </div>

                        <button type="submit" disabled={submitting}
                            className="w-full py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 transition-all text-sm flex items-center justify-center gap-2">
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {submitting ? 'Submitting...' : 'Submit Leave Request'}
                        </button>
                    </form>
                </div>

                {/* Leave History */}
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">My Leave History</h2>
                {loading ? (
                    <div className="flex flex-col items-center py-12 gap-3">
                        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                        <p className="text-gray-400 text-sm">Loading leave history...</p>
                    </div>
                ) : leaveRequests.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                        <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No leave requests yet.</p>
                        <p className="text-gray-400 text-sm mt-1">Your submitted leave requests will appear here.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {leaveRequests
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map(request => (
                                <div key={request.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {getLeaveTypeBadge(request.leave_type)}
                                            <span className="text-xs text-gray-400">•</span>
                                            <span className="text-sm font-medium text-gray-700">{countDays(request.from_date, request.to_date)}</span>
                                        </div>
                                        {getStatusBadge(request.status)}
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                                        <CalendarDays className="w-4 h-4 text-gray-400" />
                                        {formatDateRange(request.from_date, request.to_date)}
                                    </div>
                                    <p className="text-sm text-gray-600 leading-relaxed">{request.reason}</p>
                                    {(request.reviewer_name || request.remarks) && (
                                        <div className="mt-3 pt-3 border-t border-gray-100">
                                            {request.reviewer_name && (
                                                <p className="text-xs text-gray-500">
                                                    Reviewed by <span className="font-semibold text-gray-700">{request.reviewer_name}</span>
                                                </p>
                                            )}
                                            {request.remarks && (
                                                <p className="text-xs text-gray-500 mt-1 italic">&ldquo;{request.remarks}&rdquo;</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                    </div>
                )}
            </main>
        </div>
    );
}
