'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import {
    ArrowUpCircle, Search, Loader2, CheckCircle, X, Users, Calendar,
    AlertCircle, History, BarChart3, Undo2, GraduationCap, ArrowRight,
    Download, Clock, FileText, Eye, Repeat, ChevronDown
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; schoolId?: string; }
interface Session { id: string; name: string; is_current: boolean; }
interface ClassItem { id: string; name: string; display_order: number; }
interface ClassSection { id: string; class_name: string; section_name: string; class_id: string; }

interface PreviewStudent {
    student_id: string; student_name: string; admission_number: string; photo_url: string;
    class_section_id: string; class_name: string; section_name: string; class_id: string;
    roll_number: number; status: string;
}

interface PromotionAction {
    studentId: string; fromClassSectionId: string; toClassSectionId: string;
    action: 'promoted' | 'retained' | 'graduated' | 'tc_issued' | 'withdrawn'; remarks: string;
}

interface HistoryEvent {
    id: string; event_type: string; event_date: string; from_class: string; to_class: string;
    from_session: string; to_session: string; details: Record<string, string>;
    student_name: string; admission_number: string; session_name: string;
    recorded_by_name: string; created_at: string;
}

interface PromotionBatch {
    batch_id: string; promoted_at: string; total_students: number;
    promoted_count: number; retained_count: number; graduated_count: number; left_count: number;
    from_session_name: string; to_session_name: string; promoted_by_name: string;
}

interface SnapshotStudent {
    student_id: string; student_name: string; admission_number: string; guardian_name: string;
    guardian_phone: string; class_name: string; section_name: string; session_name: string;
    roll_number: number; enrollment_status: string;
}

const eventIcons: Record<string, string> = {
    admission: '🟢', promotion: '🔵', promoted: '🔵', retained: '🟡', graduated: '🎓',
    tc_issued: '📄', certificate_issued: '📜', section_change: '🔄', withdrawal: '🔴',
    promotion_undone: '↩️', re_admission: '🔁',
};

const eventColors: Record<string, string> = {
    admission: 'border-green-500', promoted: 'border-blue-500', retained: 'border-yellow-500',
    graduated: 'border-purple-500', tc_issued: 'border-red-500', certificate_issued: 'border-cyan-500',
    promotion_undone: 'border-orange-500',
};

type TabType = 'promote' | 'history' | 'log' | 'reports';

function StableInput({ value, onChange, ...props }: { value: string; onChange: (v: string) => void; [k: string]: unknown }) {
    return <input value={value} onChange={e => onChange(e.target.value)} {...props} />;
}

export default function PromotionsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [tab, setTab] = useState<TabType>('promote');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    // Shared
    const [sessions, setSessions] = useState<Session[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);

    // Promote Tab
    const [fromSessionId, setFromSessionId] = useState('');
    const [toSessionId, setToSessionId] = useState('');
    const [fromClassFilter, setFromClassFilter] = useState('');
    const [students, setStudents] = useState<PreviewStudent[]>([]);
    const [targetSections, setTargetSections] = useState<ClassSection[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [classMappings, setClassMappings] = useState<any[]>([]);
    const [actions, setActions] = useState<Record<string, PromotionAction>>({});
    const [promoting, setPromoting] = useState(false);

    // History Tab
    const [historySearch, setHistorySearch] = useState('');
    const [historyStudentId, setHistoryStudentId] = useState('');
    const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [historySearchResults, setHistorySearchResults] = useState<any[]>([]);
    const [historyStudentName, setHistoryStudentName] = useState('');

    // Log Tab
    const [batches, setBatches] = useState<PromotionBatch[]>([]);

    // Reports Tab
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
    const [reportClassId, setReportClassId] = useState('');
    const [reportData, setReportData] = useState<SnapshotStudent[]>([]);
    const [reportLoading, setReportLoading] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (!stored) { router.push('/login'); return; }
        const u = JSON.parse(stored);
        if (!['developer', 'super_admin'].includes(u.role)) { router.push('/dashboard'); return; }
        setUser(u);
    }, [router]);

    useEffect(() => {
        if (!user) return;
        const h: Record<string, string> = { 'x-user-id': user.id, 'x-user-role': user.role };
        if (user.schoolId) h['x-school-id'] = user.schoolId;
        Promise.all([
            fetch('/api/classes', { headers: h }).then(r => r.json()),
            fetch('/api/sessions', { headers: h }).then(r => r.json()),
        ]).then(([cData, sData]) => {
            setClasses(cData.classes || []);
            setSessions(sData.sessions || []);
        });
    }, [user]);

    const getHeaders = useCallback(() => {
        if (!user) return {};
        const h: Record<string, string> = { 'x-user-id': user.id, 'x-user-role': user.role, 'Content-Type': 'application/json' };
        if (user.schoolId) h['x-school-id'] = user.schoolId;
        return h;
    }, [user]);

    // ===================== PROMOTE TAB =====================

    const loadPreview = useCallback(async () => {
        if (!fromSessionId) return;
        setLoading(true);
        try {
            const params = new URLSearchParams({ fromSessionId });
            if (toSessionId) params.set('toSessionId', toSessionId);
            if (fromClassFilter) params.set('fromClassSectionId', fromClassFilter);
            const res = await fetch(`/api/promotions/preview?${params}`, { headers: getHeaders() });
            const data = await res.json();
            setStudents(data.students || []);
            setTargetSections(data.targetSections || []);
            setClassMappings(data.classMappings || []);

            // Auto-set default actions
            const defaultActions: Record<string, PromotionAction> = {};
            for (const s of (data.students || [])) {
                const nextClass = (data.classMappings || []).find((m: { id: string }) => m.id === s.class_id);
                const nextClassId = nextClass?.next_class_id;
                const targetSection = nextClassId
                    ? (data.targetSections || []).find((ts: ClassSection) => ts.class_id === nextClassId)
                    : null;

                defaultActions[s.student_id] = {
                    studentId: s.student_id,
                    fromClassSectionId: s.class_section_id,
                    toClassSectionId: targetSection?.id || '',
                    action: nextClassId ? 'promoted' : 'graduated',
                    remarks: '',
                };
            }
            setActions(defaultActions);
        } catch { /* */ }
        setLoading(false);
    }, [fromSessionId, toSessionId, fromClassFilter, getHeaders]);

    useEffect(() => {
        if (tab === 'promote' && fromSessionId) loadPreview();
    }, [tab, fromSessionId, toSessionId, fromClassFilter, loadPreview]);

    const executePromotions = async () => {
        const promotionList = Object.values(actions).filter(a => a.action === 'promoted' ? a.toClassSectionId : true);
        if (!promotionList.length) { setError('No students selected'); return; }
        setPromoting(true);
        try {
            const res = await fetch('/api/promotions', {
                method: 'POST', headers: getHeaders(),
                body: JSON.stringify({ fromSessionId, toSessionId, promotions: promotionList }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); setPromoting(false); return; }
            setSuccess(`Promotion complete! ${data.summary.promoted} promoted, ${data.summary.retained} retained, ${data.summary.graduated} graduated. Batch: ${data.batchId?.slice(0, 8)}`);
            loadPreview();
        } catch { setError('Failed to execute promotions'); }
        setPromoting(false);
    };

    // ===================== HISTORY TAB =====================

    const searchHistoryStudents = useCallback(async (q: string) => {
        if (!user || q.length < 2) { setHistorySearchResults([]); return; }
        try {
            const res = await fetch(`/api/students?search=${encodeURIComponent(q)}&limit=10`, { headers: getHeaders() });
            const data = await res.json();
            setHistorySearchResults(data.students || []);
        } catch { /* */ }
    }, [user, getHeaders]);

    useEffect(() => {
        const timer = setTimeout(() => searchHistoryStudents(historySearch), 300);
        return () => clearTimeout(timer);
    }, [historySearch, searchHistoryStudents]);

    const loadHistory = useCallback(async (studentId: string) => {
        if (!user) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/student-history?studentId=${studentId}`, { headers: getHeaders() });
            const data = await res.json();
            setHistoryEvents(data.history || []);
        } catch { /* */ }
        setLoading(false);
    }, [user, getHeaders]);

    // ===================== LOG TAB =====================

    const loadBatches = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const res = await fetch('/api/promotions?listBatches=true', { headers: getHeaders() });
            const data = await res.json();
            setBatches(data.batches || []);
        } catch { /* */ }
        setLoading(false);
    }, [user, getHeaders]);

    const undoBatch = async (batchId: string) => {
        if (!confirm('Are you sure you want to undo this entire promotion batch? This will reverse all changes.')) return;
        try {
            const res = await fetch(`/api/promotions?batchId=${batchId}`, { method: 'DELETE', headers: getHeaders() });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            setSuccess(data.message);
            loadBatches();
        } catch { setError('Failed to undo'); }
    };

    // ===================== REPORTS TAB =====================

    const loadReport = async () => {
        if (!reportDate) return;
        setReportLoading(true);
        try {
            const params = new URLSearchParams({ date: reportDate });
            if (reportClassId) params.set('classId', reportClassId);
            const res = await fetch(`/api/student-history?${params}`, { headers: getHeaders() });
            const data = await res.json();
            setReportData(data.snapshot || []);
        } catch { /* */ }
        setReportLoading(false);
    };

    const downloadCSV = () => {
        if (!reportData.length) return;
        const headers = ['Student Name', 'Admission No', 'Class', 'Section', 'Session', 'Roll No', 'Guardian', 'Phone', 'Status'];
        const rows = reportData.map(s => [
            s.student_name, s.admission_number, s.class_name, s.section_name,
            s.session_name, s.roll_number, s.guardian_name, s.guardian_phone, s.enrollment_status
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c || ''}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `students-report-${reportDate}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    useEffect(() => {
        if (tab === 'log' && user) loadBatches();
    }, [tab, user, loadBatches]);

    if (!user) return null;

    const tabsConfig: { key: TabType; label: string; icon: React.ReactNode }[] = [
        { key: 'promote', label: 'Promote Students', icon: <ArrowUpCircle size={16} /> },
        { key: 'history', label: 'Student History', icon: <History size={16} /> },
        { key: 'log', label: 'Promotion Log', icon: <FileText size={16} /> },
        { key: 'reports', label: 'Reports', icon: <BarChart3 size={16} /> },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} />
            <MobileSidebar user={user} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <main className="max-w-7xl mx-auto px-4 py-6">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">📋 Promotions & Student History</h1>
                    <p className="text-sm text-gray-500">Promote students, view permanent history, manage class progression (Nursery → Class 12)</p>
                </div>

                {success && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700 text-sm">
                        <CheckCircle size={16} />{success}<button onClick={() => setSuccess('')} className="ml-auto"><X size={14} /></button>
                    </div>
                )}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                        <AlertCircle size={16} />{error}<button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-white/80 backdrop-blur rounded-xl border border-gray-200 mb-6 overflow-x-auto">
                    {tabsConfig.map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                                tab === t.key ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
                            }`}>
                            {t.icon}{t.label}
                        </button>
                    ))}
                </div>

                {/* ===================== TAB: PROMOTE ===================== */}
                {tab === 'promote' && (
                    <div>
                        {/* Session selectors */}
                        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1 block">From Session *</label>
                                    <select value={fromSessionId} onChange={e => setFromSessionId(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                                        <option value="">Select Session</option>
                                        {sessions.map(s => <option key={s.id} value={s.id}>{s.name} {s.is_current ? '(Current)' : ''}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1 block">To Session *</label>
                                    <select value={toSessionId} onChange={e => setToSessionId(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                                        <option value="">Select Session</option>
                                        {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1 block">Filter Class</label>
                                    <select value={fromClassFilter} onChange={e => setFromClassFilter(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                                        <option value="">All Classes</option>
                                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Students Table */}
                        {loading ? (
                            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
                        ) : students.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                                <Users size={40} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500">{fromSessionId ? 'No active students found in this session' : 'Select a session to load students'}</p>
                            </div>
                        ) : (
                            <>
                                <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto mb-4">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 border-b">
                                                <th className="px-3 py-3 text-left font-medium text-gray-600">Student</th>
                                                <th className="px-3 py-3 text-left font-medium text-gray-600">Current Class</th>
                                                <th className="px-3 py-3 text-left font-medium text-gray-600">Action</th>
                                                <th className="px-3 py-3 text-left font-medium text-gray-600">Target Section</th>
                                                <th className="px-3 py-3 text-left font-medium text-gray-600">Remarks</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {students.map(s => {
                                                const act = actions[s.student_id];
                                                const nextClassId = classMappings.find((m: { id: string }) => m.id === s.class_id)?.next_class_id;
                                                const isLastClass = !nextClassId;

                                                return (
                                                    <tr key={s.student_id} className="border-b hover:bg-blue-50/30">
                                                        <td className="px-3 py-2">
                                                            <div className="font-medium text-gray-900">{s.student_name}</div>
                                                            <div className="text-xs text-gray-500">{s.admission_number}</div>
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-600">{s.class_name} - {s.section_name}</td>
                                                        <td className="px-3 py-2">
                                                            <select
                                                                value={act?.action || 'promoted'}
                                                                onChange={e => setActions(prev => ({
                                                                    ...prev,
                                                                    [s.student_id]: {
                                                                        ...prev[s.student_id],
                                                                        action: e.target.value as PromotionAction['action']
                                                                    }
                                                                }))}
                                                                className="px-2 py-1 rounded border text-xs">
                                                                <option value="promoted">✅ Promote</option>
                                                                <option value="retained">🔄 Retain</option>
                                                                {isLastClass && <option value="graduated">🎓 Graduate</option>}
                                                                <option value="tc_issued">📄 TC Issued</option>
                                                                <option value="withdrawn">❌ Withdrawn</option>
                                                            </select>
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            {act?.action === 'promoted' && (
                                                                <select
                                                                    value={act.toClassSectionId}
                                                                    onChange={e => setActions(prev => ({
                                                                        ...prev,
                                                                        [s.student_id]: { ...prev[s.student_id], toClassSectionId: e.target.value }
                                                                    }))}
                                                                    className="px-2 py-1 rounded border text-xs min-w-[140px]">
                                                                    <option value="">Select</option>
                                                                    {targetSections.map(ts => (
                                                                        <option key={ts.id} value={ts.id}>{ts.class_name} - {ts.section_name}</option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                            {act?.action === 'retained' && <span className="text-xs text-gray-500">Same class</span>}
                                                            {act?.action === 'graduated' && <span className="text-xs text-purple-600">🎓 Pass Out</span>}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <input
                                                                value={act?.remarks || ''}
                                                                onChange={e => setActions(prev => ({
                                                                    ...prev,
                                                                    [s.student_id]: { ...prev[s.student_id], remarks: e.target.value }
                                                                }))}
                                                                className="px-2 py-1 rounded border text-xs w-full"
                                                                placeholder="Optional" />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Summary & Execute */}
                                <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                                    <div className="flex gap-4 text-sm">
                                        <span className="text-blue-600 font-medium">
                                            ✅ {Object.values(actions).filter(a => a.action === 'promoted').length} Promote
                                        </span>
                                        <span className="text-yellow-600 font-medium">
                                            🔄 {Object.values(actions).filter(a => a.action === 'retained').length} Retain
                                        </span>
                                        <span className="text-purple-600 font-medium">
                                            🎓 {Object.values(actions).filter(a => a.action === 'graduated').length} Graduate
                                        </span>
                                    </div>
                                    <Button onClick={executePromotions} disabled={promoting || !toSessionId}
                                        className="bg-blue-600 hover:bg-blue-700">
                                        {promoting ? <Loader2 className="animate-spin mr-2" size={16} /> : <ArrowUpCircle size={16} className="mr-1" />}
                                        Execute Promotions
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ===================== TAB: STUDENT HISTORY ===================== */}
                {tab === 'history' && (
                    <div>
                        {/* Search */}
                        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <StableInput value={historySearch} onChange={v => { setHistorySearch(v); setHistoryStudentId(''); setHistoryEvents([]); }}
                                    placeholder="Search student by name or admission number..."
                                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                            </div>
                            {historySearchResults.length > 0 && !historyStudentId && (
                                <div className="mt-2 border rounded-lg divide-y max-h-48 overflow-y-auto">
                                    {historySearchResults.map((s: { id: string; name: string; admission_number: string; class_name: string }) => (
                                        <div key={s.id} onClick={() => {
                                            setHistoryStudentId(s.id); setHistoryStudentName(s.name);
                                            setHistorySearchResults([]); setHistorySearch(s.name);
                                            loadHistory(s.id);
                                        }} className="px-4 py-3 hover:bg-blue-50 cursor-pointer">
                                            <div className="font-medium text-sm">{s.name}</div>
                                            <div className="text-xs text-gray-500">{s.admission_number} • {s.class_name}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Timeline */}
                        {loading ? (
                            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
                        ) : historyStudentId && historyEvents.length > 0 ? (
                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <h3 className="font-semibold text-gray-800 mb-4">
                                    📋 Timeline for {historyStudentName}
                                </h3>
                                <div className="relative">
                                    {/* Vertical line */}
                                    <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />
                                    <div className="space-y-6">
                                        {historyEvents.map(ev => (
                                            <div key={ev.id} className="relative flex gap-4">
                                                <div className={`relative z-10 w-12 h-12 rounded-full bg-white border-2 ${eventColors[ev.event_type] || 'border-gray-300'} flex items-center justify-center text-lg flex-shrink-0`}>
                                                    {eventIcons[ev.event_type] || '📌'}
                                                </div>
                                                <div className="flex-1 bg-gray-50 rounded-lg p-3 border border-gray-100">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <span className="font-semibold text-gray-900 text-sm">
                                                                {ev.event_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                                            </span>
                                                            {ev.from_class && (
                                                                <span className="text-xs text-gray-500 ml-2">
                                                                    {ev.from_class}{ev.to_class ? ` → ${ev.to_class}` : ''}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-gray-400">{new Date(ev.event_date).toLocaleDateString('en-IN')}</span>
                                                    </div>
                                                    {ev.from_session && (
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            Session: {ev.from_session}{ev.to_session ? ` → ${ev.to_session}` : ''}
                                                        </div>
                                                    )}
                                                    {ev.details && Object.keys(ev.details).length > 0 && (
                                                        <div className="text-xs text-gray-400 mt-1">
                                                            {Object.entries(ev.details).filter(([k]) => k !== 'batch_id').map(([k, v]) => (
                                                                <span key={k} className="mr-2">{k.replace(/_/g, ' ')}: {v}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {ev.recorded_by_name && (
                                                        <div className="text-xs text-gray-400 mt-1">by {ev.recorded_by_name}</div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : historyStudentId ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                                <History size={40} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500">No history events found for this student</p>
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                                <Search size={40} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500">Search for a student to view their complete history timeline</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ===================== TAB: PROMOTION LOG ===================== */}
                {tab === 'log' && (
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Promotion Batches</h2>
                        {loading ? (
                            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
                        ) : batches.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                                <FileText size={40} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500">No promotion batches found</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {batches.map(b => (
                                    <div key={b.batch_id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
                                        <div className="flex items-center justify-between mb-2">
                                            <div>
                                                <div className="font-bold text-gray-900">
                                                    {b.from_session_name} <ArrowRight size={14} className="inline mx-1" /> {b.to_session_name}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {new Date(b.promoted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    {' '}by {b.promoted_by_name}
                                                </div>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={() => undoBatch(b.batch_id)}
                                                className="text-red-600 border-red-200 hover:bg-red-50">
                                                <Undo2 size={14} className="mr-1" />Undo
                                            </Button>
                                        </div>
                                        <div className="grid grid-cols-4 gap-2 mt-3">
                                            <div className="text-center p-2 bg-gray-50 rounded-lg">
                                                <div className="text-lg font-bold text-gray-700">{b.total_students}</div>
                                                <div className="text-[10px] text-gray-500">Total</div>
                                            </div>
                                            <div className="text-center p-2 bg-blue-50 rounded-lg">
                                                <div className="text-lg font-bold text-blue-700">{b.promoted_count}</div>
                                                <div className="text-[10px] text-blue-500">Promoted</div>
                                            </div>
                                            <div className="text-center p-2 bg-yellow-50 rounded-lg">
                                                <div className="text-lg font-bold text-yellow-700">{b.retained_count}</div>
                                                <div className="text-[10px] text-yellow-500">Retained</div>
                                            </div>
                                            <div className="text-center p-2 bg-purple-50 rounded-lg">
                                                <div className="text-lg font-bold text-purple-700">{b.graduated_count}</div>
                                                <div className="text-[10px] text-purple-500">Graduated</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ===================== TAB: REPORTS ===================== */}
                {tab === 'reports' && (
                    <div>
                        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
                            <h3 className="font-semibold text-gray-800 mb-3">📊 Date-Based Student Report</h3>
                            <p className="text-xs text-gray-500 mb-4">
                                View which students were in which class on any given date. Download as CSV for records.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1 block">Report Date *</label>
                                    <StableInput type="date" value={reportDate} onChange={setReportDate}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1 block">Class Filter</label>
                                    <select value={reportClassId} onChange={e => setReportClassId(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm">
                                        <option value="">All Classes</option>
                                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-end gap-2">
                                    <Button onClick={loadReport} disabled={reportLoading} className="bg-blue-600 hover:bg-blue-700 flex-1">
                                        {reportLoading ? <Loader2 className="animate-spin mr-1" size={14} /> : <Search size={14} className="mr-1" />}
                                        Generate Report
                                    </Button>
                                    {reportData.length > 0 && (
                                        <Button variant="outline" onClick={downloadCSV}>
                                            <Download size={14} className="mr-1" />CSV
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {reportData.length > 0 && (
                            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                                <div className="px-4 py-3 border-b bg-gray-50 flex justify-between items-center">
                                    <span className="text-sm font-medium text-gray-700">
                                        Students as of {new Date(reportDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </span>
                                    <span className="text-xs text-gray-500">{reportData.length} students found</span>
                                </div>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 border-b">
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">#</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Admission No</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Class</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Session</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Guardian</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Phone</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportData.map((s, i) => (
                                            <tr key={s.student_id} className="border-b hover:bg-blue-50/30">
                                                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                                                <td className="px-4 py-2 font-medium text-gray-900">{s.student_name}</td>
                                                <td className="px-4 py-2 text-gray-600">{s.admission_number}</td>
                                                <td className="px-4 py-2 text-gray-600">{s.class_name} - {s.section_name}</td>
                                                <td className="px-4 py-2 text-gray-600">{s.session_name}</td>
                                                <td className="px-4 py-2 text-gray-600">{s.guardian_name}</td>
                                                <td className="px-4 py-2 text-gray-600">{s.guardian_phone}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
