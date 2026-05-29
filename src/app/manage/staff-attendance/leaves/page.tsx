'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    ArrowLeft, Loader2, CheckCircle, XCircle,
    Clock, CalendarDays, MessageSquare, User,
    Filter, Plane, AlertCircle, X
} from 'lucide-react';

interface UserData {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'super_admin' | 'teacher' | 'accountant' | 'student';
}

interface LeaveRequest {
    id: string;
    user_id: string;
    first_name: string;
    last_name: string;
    role: string;
    leave_type: string;
    from_date: string;
    to_date: string;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    reviewed_by_name?: string;
    reviewed_at?: string;
    review_remarks?: string;
    created_at: string;
}

export default function LeaveManagementPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');

    // Action modal state
    const [actionModal, setActionModal] = useState<{ requestId: string; action: 'approved' | 'rejected' } | null>(null);
    const [actionRemarks, setActionRemarks] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchLeaveRequests(token);
    }, []);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const fetchLeaveRequests = async (token?: string) => {
        setLoading(true);
        const t = token || localStorage.getItem('token')!;
        try {
            const res = await fetch('/api/leave-requests', {
                headers: { Authorization: `Bearer ${t}` }
            });
            const data = await res.json();
            setRequests(data.requests || []);
        } catch (err) {
            console.error('Failed to fetch leave requests:', err);
            setRequests([]);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async () => {
        if (!actionModal) return;
        setActionLoading(true);
        try {
            const token = localStorage.getItem('token')!;
            const res = await fetch('/api/leave-requests', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    requestId: actionModal.requestId,
                    action: actionModal.action,
                    remarks: actionRemarks
                })
            });
            const data = await res.json();
            if (!res.ok) {
                setToast({ type: 'error', message: data.error || 'Failed to update leave request' });
            } else {
                setToast({ type: 'success', message: `Leave request ${actionModal.action} successfully` });
                setActionModal(null);
                setActionRemarks('');
                fetchLeaveRequests();
            }
        } catch {
            setToast({ type: 'error', message: 'Server error. Please try again.' });
        } finally {
            setActionLoading(false);
        }
    };

    const filteredRequests = requests.filter(r => r.status === activeTab);

    const calculateDays = (start: string, end: string) => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        const diff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        return diff;
    };

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch { return dateStr; }
    };

    const getLeaveTypeBadge = (type: string) => {
        switch (type?.toLowerCase()) {
            case 'sick': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800">Sick</span>;
            case 'casual': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800">Casual</span>;
            case 'personal': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800">Personal</span>;
            case 'earned': return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800">Earned</span>;
            default: return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700">{type}</span>;
        }
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'teacher': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700">Teacher</span>;
            case 'student': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700">Student</span>;
            case 'accountant': return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">Accountant</span>;
            default: return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600">{role?.replace('_', ' ')}</span>;
        }
    };

    const tabs = [
        { key: 'pending' as const, label: 'Pending', count: requests.filter(r => r.status === 'pending').length, icon: Clock, color: 'amber' },
        { key: 'approved' as const, label: 'Approved', count: requests.filter(r => r.status === 'approved').length, icon: CheckCircle, color: 'emerald' },
        { key: 'rejected' as const, label: 'Rejected', count: requests.filter(r => r.status === 'rejected').length, icon: XCircle, color: 'red' },
    ];

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 mt-16">

                {/* Hero Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-sky-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10">
                        <button
                            onClick={() => router.push('/manage/staff-attendance')}
                            className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white mb-4 transition-colors"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            Back to Staff Attendance
                        </button>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-sky-400 font-semibold tracking-wide uppercase text-sm">HR</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold mb-2 flex items-center gap-3">
                            Leave Requests <span className="inline-block">✈️</span>
                        </h1>
                        <p className="text-sky-100 text-sm max-w-xl">
                            Review, approve, or reject staff leave applications. Manage all leave requests in one place.
                        </p>
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

                {/* Tabs */}
                <div className="flex items-center gap-2 mb-6 bg-white rounded-2xl p-1.5 border border-gray-150 shadow-sm">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                                activeTab === tab.key
                                    ? tab.color === 'amber' ? 'bg-amber-50 text-amber-800 border border-amber-200 shadow-sm'
                                    : tab.color === 'emerald' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm'
                                    : 'bg-red-50 text-red-800 border border-red-200 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 border border-transparent'
                            }`}
                        >
                            <tab.icon className="w-3.5 h-3.5" />
                            {tab.label}
                            {tab.count > 0 && (
                                <span className={`min-w-[18px] text-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    activeTab === tab.key
                                        ? tab.color === 'amber' ? 'bg-amber-200 text-amber-900'
                                        : tab.color === 'emerald' ? 'bg-emerald-200 text-emerald-900'
                                        : 'bg-red-200 text-red-900'
                                        : 'bg-gray-200 text-gray-600'
                                }`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
                        <p className="text-gray-500 font-medium">Loading leave requests...</p>
                    </div>
                ) : filteredRequests.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm">
                        <Plane className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No {activeTab} leave requests.</p>
                        <p className="text-gray-400 text-xs mt-1">All clear! Check other tabs for more requests.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredRequests.map((request) => (
                            <div key={request.id} className="bg-white rounded-2xl border border-gray-150 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                                <div className="p-5">
                                    {/* Header */}
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-sm font-bold text-sky-700">
                                                {request.first_name?.[0]}{request.last_name?.[0]}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-bold text-gray-900">{request.first_name} {request.last_name}</p>
                                                    {getRoleBadge(request.role)}
                                                </div>
                                                <p className="text-[10px] text-gray-400 mt-0.5">
                                                    Applied: {formatDate(request.created_at)}
                                                </p>
                                            </div>
                                        </div>
                                        {getLeaveTypeBadge(request.leave_type)}
                                    </div>

                                    {/* Date Range */}
                                    <div className="flex items-center gap-4 mb-3 bg-gray-50 rounded-xl p-3">
                                        <div className="flex items-center gap-2">
                                            <CalendarDays className="w-4 h-4 text-sky-500" />
                                            <div>
                                                <p className="text-[10px] text-gray-400 font-medium uppercase">From</p>
                                                <p className="text-xs font-semibold text-gray-800">{formatDate(request.from_date)}</p>
                                            </div>
                                        </div>
                                        <div className="text-gray-300">→</div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-medium uppercase">To</p>
                                            <p className="text-xs font-semibold text-gray-800">{formatDate(request.to_date)}</p>
                                        </div>
                                        <div className="ml-auto">
                                            <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-1 rounded-full">
                                                {calculateDays(request.from_date, request.to_date)} day{calculateDays(request.from_date, request.to_date) !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Reason */}
                                    <div className="mb-4">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Reason</p>
                                        <p className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 leading-relaxed">{request.reason || 'No reason provided'}</p>
                                    </div>

                                    {/* Action Buttons (for pending) */}
                                    {request.status === 'pending' && (
                                        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                                            <button
                                                onClick={() => { setActionModal({ requestId: request.id, action: 'approved' }); setActionRemarks(''); }}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                                            >
                                                <CheckCircle className="w-3.5 h-3.5" />
                                                Approve
                                            </button>
                                            <button
                                                onClick={() => { setActionModal({ requestId: request.id, action: 'rejected' }); setActionRemarks(''); }}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                                            >
                                                <XCircle className="w-3.5 h-3.5" />
                                                Reject
                                            </button>
                                        </div>
                                    )}

                                    {/* Review info (for approved/rejected) */}
                                    {(request.status === 'approved' || request.status === 'rejected') && (
                                        <div className={`mt-2 pt-3 border-t ${
                                            request.status === 'approved' ? 'border-emerald-100' : 'border-red-100'
                                        }`}>
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <User className="w-3.5 h-3.5" />
                                                <span>
                                                    {request.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                                                    <strong className="text-gray-700">{request.reviewed_by_name || 'Admin'}</strong>
                                                    {request.reviewed_at && <> on {formatDate(request.reviewed_at)}</>}
                                                </span>
                                            </div>
                                            {request.review_remarks && (
                                                <div className="flex items-start gap-2 mt-2 text-xs text-gray-500">
                                                    <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                    <span className="italic">&ldquo;{request.review_remarks}&rdquo;</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Action Modal */}
            {actionModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm overflow-hidden">
                        <div className={`px-5 py-4 flex items-center justify-between text-white ${
                            actionModal.action === 'approved' ? 'bg-emerald-600' : 'bg-red-600'
                        }`}>
                            <h3 className="text-sm font-bold flex items-center gap-2">
                                {actionModal.action === 'approved' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                {actionModal.action === 'approved' ? 'Approve Leave' : 'Reject Leave'}
                            </h3>
                            <button
                                onClick={() => setActionModal(null)}
                                className="text-white/80 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="text-xs text-gray-600 font-medium block mb-1.5">Remarks (optional)</label>
                                <textarea
                                    value={actionRemarks}
                                    onChange={(e) => setActionRemarks(e.target.value)}
                                    placeholder="Add a note for the applicant..."
                                    rows={3}
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-xs bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setActionModal(null)}
                                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAction}
                                    disabled={actionLoading}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold text-white transition-colors flex items-center justify-center gap-1.5 ${
                                        actionModal.action === 'approved'
                                            ? 'bg-emerald-600 hover:bg-emerald-700'
                                            : 'bg-red-600 hover:bg-red-700'
                                    }`}
                                >
                                    {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                    {actionModal.action === 'approved' ? 'Confirm Approve' : 'Confirm Reject'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
