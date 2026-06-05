'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    ArrowLeft, Bell, Send, Loader2, CheckCircle, XCircle,
    AlertTriangle, BarChart3, Mail, MessageSquare, Clock,
    GraduationCap, CreditCard, CalendarDays, FileText,
    ChevronDown, RefreshCw
} from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: string; }

interface NotificationLog {
    id: string; event_type: string; channel: string; recipient_phone: string;
    recipient_email: string; message_body: string; status: string; error_message: string;
    student_name: string; admission_number: string; created_at: string; sent_at: string;
}

interface LogStats {
    total: string; sent: string; failed: string; mock: string;
    whatsapp: string; email: string;
}

export default function NotificationCenterPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Trigger state
    const [triggerLoading, setTriggerLoading] = useState<string | null>(null);
    const [triggerResult, setTriggerResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Log state
    const [logs, setLogs] = useState<NotificationLog[]>([]);
    const [stats, setStats] = useState<LogStats | null>(null);
    const [logLoading, setLogLoading] = useState(true);
    const [logFilter, setLogFilter] = useState<{ event_type: string; channel: string; status: string }>({
        event_type: '', channel: '', status: ''
    });

    // Result publish form
    const [exams, setExams] = useState<any[]>([]);
    const [selectedExam, setSelectedExam] = useState('');
    const [classSections, setClassSections] = useState<any[]>([]);
    const [selectedCS, setSelectedCS] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchLogs(token);
        fetchExams(token);
        fetchClassSections(token);
    }, [router]);

    useEffect(() => {
        if (triggerResult) { const t = setTimeout(() => setTriggerResult(null), 6000); return () => clearTimeout(t); }
    }, [triggerResult]);

    const fetchLogs = async (token?: string) => {
        setLogLoading(true);
        const t = token || localStorage.getItem('token')!;
        try {
            const params = new URLSearchParams();
            if (logFilter.event_type) params.set('event_type', logFilter.event_type);
            if (logFilter.channel) params.set('channel', logFilter.channel);
            if (logFilter.status) params.set('status', logFilter.status);
            params.set('limit', '100');

            const res = await fetch(`/api/notifications/log?${params}`, {
                headers: { Authorization: `Bearer ${t}` }
            });
            const data = await res.json();
            setLogs(data.logs || []);
            setStats(data.stats || null);
        } catch { setLogs([]); }
        setLogLoading(false);
    };

    const fetchExams = async (token: string) => {
        try {
            const res = await fetch('/api/marks/exams', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const d = await res.json(); setExams(d.exams || []); }
        } catch { /* silent */ }
    };

    const fetchClassSections = async (token: string) => {
        try {
            const res = await fetch('/api/classes/sections', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) { const d = await res.json(); setClassSections(d.classSections || []); }
        } catch { /* silent */ }
    };

    const triggerAction = async (endpoint: string, body: any, actionKey: string) => {
        setTriggerLoading(actionKey);
        setTriggerResult(null);
        try {
            const token = localStorage.getItem('token')!;
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (res.ok) {
                setTriggerResult({ type: 'success', message: data.message || 'Notifications sent successfully!' });
                fetchLogs();
            } else {
                setTriggerResult({ type: 'error', message: data.error || 'Failed to send notifications' });
            }
        } catch {
            setTriggerResult({ type: 'error', message: 'Network error. Please try again.' });
        }
        setTriggerLoading(null);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const getEventBadge = (event: string) => {
        const map: Record<string, { bg: string; icon: any; label: string }> = {
            fee_receipt: { bg: 'bg-emerald-100 text-emerald-800', icon: CreditCard, label: 'Fee Receipt' },
            result_published: { bg: 'bg-purple-100 text-purple-800', icon: GraduationCap, label: 'Result' },
            low_attendance: { bg: 'bg-orange-100 text-orange-800', icon: AlertTriangle, label: 'Attendance' },
            fee_overdue: { bg: 'bg-red-100 text-red-800', icon: CreditCard, label: 'Fee Overdue' },
        };
        const entry = map[event] || { bg: 'bg-gray-100 text-gray-700', icon: Bell, label: event };
        const Icon = entry.icon;
        return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${entry.bg}`}><Icon className="w-3 h-3" />{entry.label}</span>;
    };

    const getStatusBadge = (status: string) => {
        const map: Record<string, string> = {
            sent: 'bg-emerald-100 text-emerald-800',
            failed: 'bg-red-100 text-red-800',
            mock: 'bg-blue-100 text-blue-700',
            queued: 'bg-amber-100 text-amber-800',
        };
        return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${map[status] || 'bg-gray-100 text-gray-700'}`}>{status}</span>;
    };

    const formatTime = (d: string) => {
        try { return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
        catch { return d; }
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-5xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-violet-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse" />
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-30" />
                    <div className="relative z-10">
                        <button onClick={() => router.push('/dashboard')} className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white mb-4 transition-colors">
                            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
                        </button>
                        <h1 className="text-2xl sm:text-3xl font-bold mb-2 flex items-center gap-3">
                            Notification Center <Bell className="w-7 h-7 text-violet-400" />
                        </h1>
                        <p className="text-violet-100 text-sm">Send automated WhatsApp & Email notifications to parents.</p>
                    </div>
                </div>

                {/* Toast */}
                {triggerResult && (
                    <div className={`mb-6 flex items-center gap-2 p-4 rounded-xl text-xs font-medium shadow-sm border ${
                        triggerResult.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
                    }`}>
                        {triggerResult.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                        {triggerResult.message}
                    </div>
                )}

                {/* Quick Stats */}
                {stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
                            <div className="text-2xl font-black text-gray-900">{stats.total}</div>
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">Total Sent</div>
                        </div>
                        <div className="bg-emerald-50/50 rounded-2xl border border-emerald-100 p-4 text-center shadow-sm">
                            <div className="text-2xl font-black text-emerald-700">{stats.sent}</div>
                            <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mt-1">Delivered</div>
                        </div>
                        <div className="bg-green-50/50 rounded-2xl border border-green-100 p-4 text-center shadow-sm flex items-center justify-center gap-3">
                            <div className="text-center">
                                <div className="text-lg font-black text-green-700">{stats.whatsapp}</div>
                                <div className="text-[10px] font-bold text-green-500 uppercase">WhatsApp</div>
                            </div>
                            <div className="w-px h-8 bg-green-200" />
                            <div className="text-center">
                                <div className="text-lg font-black text-blue-700">{stats.email}</div>
                                <div className="text-[10px] font-bold text-blue-500 uppercase">Email</div>
                            </div>
                        </div>
                        <div className="bg-red-50/50 rounded-2xl border border-red-100 p-4 text-center shadow-sm">
                            <div className="text-2xl font-black text-red-700">{stats.failed}</div>
                            <div className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-1">Failed</div>
                        </div>
                    </div>
                )}

                {/* ===== Quick Action Triggers ===== */}
                <div className="mb-8">
                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                        {/* Fee Overdue Reminders */}
                        <div className="bg-white rounded-2xl border border-gray-150 shadow-sm p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-xl bg-red-100"><CreditCard className="w-5 h-5 text-red-700" /></div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-800">Fee Overdue Reminders</h3>
                                    <p className="text-[10px] text-gray-400">Notify parents of unpaid fees</p>
                                </div>
                            </div>
                            <button
                                onClick={() => triggerAction('/api/notifications/fee-reminders', {}, 'fee')}
                                disabled={triggerLoading === 'fee'}
                                className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50">
                                {triggerLoading === 'fee' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                Send Reminders
                            </button>
                        </div>

                        {/* Attendance Alerts */}
                        <div className="bg-white rounded-2xl border border-gray-150 shadow-sm p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-xl bg-orange-100"><AlertTriangle className="w-5 h-5 text-orange-700" /></div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-800">Attendance Alerts</h3>
                                    <p className="text-[10px] text-gray-400">Alert parents if &lt;60% attendance</p>
                                </div>
                            </div>
                            <button
                                onClick={() => triggerAction('/api/notifications/attendance-alerts', {}, 'attendance')}
                                disabled={triggerLoading === 'attendance'}
                                className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50">
                                {triggerLoading === 'attendance' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                Send Alerts
                            </button>
                        </div>

                        {/* Publish Exam Results */}
                        <div className="bg-white rounded-2xl border border-gray-150 shadow-sm p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-xl bg-purple-100"><GraduationCap className="w-5 h-5 text-purple-700" /></div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-800">Publish Results</h3>
                                    <p className="text-[10px] text-gray-400">Notify parents of exam results</p>
                                </div>
                            </div>
                            <div className="space-y-2 mb-3">
                                <select value={selectedExam} onChange={e => setSelectedExam(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400">
                                    <option value="">Select Exam...</option>
                                    {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                                <select value={selectedCS} onChange={e => setSelectedCS(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-400">
                                    <option value="">All Classes</option>
                                    {classSections.map((cs: any) => <option key={cs.id} value={cs.id}>{cs.class_name} - {cs.section_name}</option>)}
                                </select>
                            </div>
                            <button
                                onClick={() => {
                                    if (!selectedExam) { setTriggerResult({ type: 'error', message: 'Please select an exam first' }); return; }
                                    triggerAction('/api/notifications/send-results', { examId: selectedExam, classSectionId: selectedCS || undefined }, 'results');
                                }}
                                disabled={triggerLoading === 'results'}
                                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50">
                                {triggerLoading === 'results' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                Send Results
                            </button>
                        </div>
                    </div>
                </div>

                {/* ===== Notification Log ===== */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Notification Log</h2>
                        <button onClick={() => fetchLogs()} className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 transition-colors">
                            <RefreshCw className="w-3.5 h-3.5" /> Refresh
                        </button>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        <select value={logFilter.event_type} onChange={e => { setLogFilter(f => ({ ...f, event_type: e.target.value })); }}
                            className="px-3 py-2 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400">
                            <option value="">All Events</option>
                            <option value="fee_receipt">Fee Receipt</option>
                            <option value="result_published">Results</option>
                            <option value="low_attendance">Attendance</option>
                            <option value="fee_overdue">Fee Overdue</option>
                        </select>
                        <select value={logFilter.channel} onChange={e => { setLogFilter(f => ({ ...f, channel: e.target.value })); }}
                            className="px-3 py-2 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400">
                            <option value="">All Channels</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="email">Email</option>
                        </select>
                        <select value={logFilter.status} onChange={e => { setLogFilter(f => ({ ...f, status: e.target.value })); }}
                            className="px-3 py-2 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400">
                            <option value="">All Status</option>
                            <option value="sent">Sent</option>
                            <option value="failed">Failed</option>
                            <option value="mock">Mock</option>
                        </select>
                        <button onClick={() => fetchLogs()}
                            className="px-4 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 transition-colors">
                            Apply
                        </button>
                    </div>

                    {logLoading ? (
                        <div className="flex flex-col items-center py-16 gap-3">
                            <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
                            <p className="text-gray-400 text-sm">Loading notification log...</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                            <Bell className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                            <p className="text-gray-500 font-medium">No notifications yet.</p>
                            <p className="text-gray-400 text-xs mt-1">Use the Quick Actions above to send your first notifications.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-150 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100">
                                            <th className="px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                                            <th className="px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">Event</th>
                                            <th className="px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">Channel</th>
                                            <th className="px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">Recipient</th>
                                            <th className="px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wider">Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log) => (
                                            <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-gray-800">{log.student_name || '—'}</td>
                                                <td className="px-4 py-3">{getEventBadge(log.event_type)}</td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1 text-gray-600">
                                                        {log.channel === 'whatsapp' ? <MessageSquare className="w-3 h-3 text-green-600" /> : <Mail className="w-3 h-3 text-blue-600" />}
                                                        {log.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-500">{log.recipient_phone || log.recipient_email || '—'}</td>
                                                <td className="px-4 py-3">{getStatusBadge(log.status)}</td>
                                                <td className="px-4 py-3 text-gray-400">{formatTime(log.created_at)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
