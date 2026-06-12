'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import {
    UserPlus, Search, Loader2, Phone, Calendar, CheckCircle, XCircle, Clock,
    Eye, Filter, Plus, X, Users, TrendingUp, AlertCircle, FileText,
    Link2, ClipboardList, Award, BarChart3, ExternalLink, Copy, ChevronDown
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; schoolId?: string; }
interface ClassItem { id: string; name: string; display_order: number; }
interface Session { id: string; name: string; is_current: boolean; }

interface RegWindow {
    id: string; title: string; session_name: string; open_date: string; close_date: string;
    classes_offered: string[]; registration_fee: number; max_registrations: number;
    is_active: boolean; slug: string; registration_count: number; selected_count: number; admitted_count: number;
    created_at: string;
}

interface Registration {
    id: string; registration_number: string; student_name: string; date_of_birth: string;
    gender: string; father_name: string; guardian_phone: string; class_name: string;
    session_name: string; status: string; entrance_score: number; merit_rank: number;
    window_title: string; created_at: string; previous_school: string;
}

interface EntranceTest {
    id: string; test_name: string; test_date: string; test_time: string; venue: string;
    max_marks: number; passing_marks: number; class_name: string; window_title: string;
    status: string; score_count: number; appeared_count: number;
}

interface TestStudent {
    registration_id: string; registration_number: string; student_name: string;
    father_name: string; guardian_phone: string; status: string; entrance_score: number;
    merit_rank: number; marks_obtained: number; attendance: string;
}

const statusColors: Record<string, string> = {
    registered: 'bg-blue-100 text-blue-700', test_scheduled: 'bg-cyan-100 text-cyan-700',
    test_appeared: 'bg-indigo-100 text-indigo-700', test_absent: 'bg-gray-100 text-gray-600',
    selected: 'bg-emerald-100 text-emerald-700', waitlisted: 'bg-purple-100 text-purple-700',
    rejected: 'bg-red-100 text-red-700', admitted: 'bg-teal-100 text-teal-700',
    cancelled: 'bg-gray-100 text-gray-600', scheduled: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
};

const statusLabel = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Standalone input to prevent focus loss
function StableInput({ value, onChange, placeholder, className, type = 'text', ...props }: {
    value: string; onChange: (v: string) => void; placeholder?: string;
    className?: string; type?: string; [k: string]: unknown;
}) {
    const ref = useRef<HTMLInputElement>(null);
    return (
        <input ref={ref} type={type} value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} className={className || 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-blue-300 focus:border-transparent outline-none'}
            {...props} />
    );
}

function StableTextarea({ value, onChange, placeholder, className, ...props }: {
    value: string; onChange: (v: string) => void; placeholder?: string;
    className?: string; [k: string]: unknown;
}) {
    return (
        <textarea value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} className={className || 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-blue-300 focus:border-transparent outline-none'}
            rows={3} {...props} />
    );
}

function StableSelect({ value, onChange, children, className }: {
    value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string;
}) {
    return (
        <select value={value} onChange={e => onChange(e.target.value)}
            className={className || 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-blue-300 focus:border-transparent outline-none'}>
            {children}
        </select>
    );
}

type TabType = 'windows' | 'registrations' | 'entrance' | 'admissions' | 'analytics';

export default function AdmissionsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [tab, setTab] = useState<TabType>('windows');
    const [loading, setLoading] = useState(true);

    // Shared
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    // Windows
    const [windows, setWindows] = useState<RegWindow[]>([]);
    const [showCreateWindow, setShowCreateWindow] = useState(false);
    const [windowForm, setWindowForm] = useState({ title: '', sessionId: '', openDate: '', closeDate: '', classesOffered: [] as string[], registrationFee: '0', maxRegistrations: '', description: '' });

    // Registrations
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [regStats, setRegStats] = useState<Record<string, number>>({});
    const [regWindowFilter, setRegWindowFilter] = useState('');
    const [regClassFilter, setRegClassFilter] = useState('');
    const [regStatusFilter, setRegStatusFilter] = useState('');
    const searchRef = useRef('');
    const [searchDisplay, setSearchDisplay] = useState('');

    // Entrance Tests
    const [tests, setTests] = useState<EntranceTest[]>([]);
    const [showCreateTest, setShowCreateTest] = useState(false);
    const [testForm, setTestForm] = useState({ windowId: '', classId: '', testName: 'Entrance Test', testDate: '', testTime: '', venue: '', maxMarks: '100', passingMarks: '33', instructions: '' });
    const [selectedTest, setSelectedTest] = useState<string>('');
    const [testStudents, setTestStudents] = useState<TestStudent[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [testInfo, setTestInfo] = useState<any>(null);
    const [scoreEdits, setScoreEdits] = useState<Record<string, { marks: string; attendance: string }>>({});

    // Admissions (selected students ready to enroll)
    const [selectedStudents, setSelectedStudents] = useState<Registration[]>([]);
    const [classSections, setClassSections] = useState<{ id: string; class_name: string; section_name: string; class_id: string }[]>([]);

    // Auth check
    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (!stored) { router.push('/login'); return; }
        const u = JSON.parse(stored);
        if (!['developer', 'super_admin'].includes(u.role)) { router.push('/dashboard'); return; }
        setUser(u);
    }, [router]);

    // Load classes & sessions
    useEffect(() => {
        if (!user) return;
        const headers: Record<string, string> = { 'x-user-id': user.id, 'x-user-role': user.role };
        if (user.schoolId) headers['x-school-id'] = user.schoolId;

        Promise.all([
            fetch('/api/classes', { headers }).then(r => r.json()),
            fetch('/api/sessions', { headers }).then(r => r.json()),
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

    // ===================== LOAD DATA =====================

    const loadWindows = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const res = await fetch('/api/admissions/registrations?list=windows', { headers: getHeaders() });
            const data = await res.json();
            setWindows(data.windows || []);
        } catch { /* */ }
        setLoading(false);
    }, [user, getHeaders]);

    const loadRegistrations = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (regWindowFilter) params.set('windowId', regWindowFilter);
            if (regClassFilter) params.set('classId', regClassFilter);
            if (regStatusFilter) params.set('status', regStatusFilter);
            if (searchRef.current) params.set('search', searchRef.current);
            const res = await fetch(`/api/admissions/registrations?${params}`, { headers: getHeaders() });
            const data = await res.json();
            setRegistrations(data.registrations || []);
            setRegStats(data.stats || {});
        } catch { /* */ }
        setLoading(false);
    }, [user, getHeaders, regWindowFilter, regClassFilter, regStatusFilter]);

    const loadTests = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const res = await fetch('/api/admissions/entrance-test', { headers: getHeaders() });
            const data = await res.json();
            setTests(data.tests || []);
        } catch { /* */ }
        setLoading(false);
    }, [user, getHeaders]);

    const loadTestScores = useCallback(async (testId: string) => {
        if (!user) return;
        try {
            const res = await fetch(`/api/admissions/entrance-test?testId=${testId}`, { headers: getHeaders() });
            const data = await res.json();
            setTestInfo(data.test);
            setTestStudents(data.students || []);
            const edits: Record<string, { marks: string; attendance: string }> = {};
            for (const s of (data.students || [])) {
                edits[s.registration_id] = { marks: s.marks_obtained?.toString() || '', attendance: s.attendance || 'present' };
            }
            setScoreEdits(edits);
        } catch { /* */ }
    }, [user, getHeaders]);

    const loadSelectedStudents = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const res = await fetch('/api/admissions/registrations?status=selected', { headers: getHeaders() });
            const data = await res.json();
            setSelectedStudents(data.registrations || []);

            // Load class sections for the current session
            const currentSession = sessions.find(s => s.is_current);
            if (currentSession) {
                const csRes = await fetch(`/api/class-sections?sessionId=${currentSession.id}`, { headers: getHeaders() });
                const csData = await csRes.json();
                setClassSections(csData.classSections || []);
            }
        } catch { /* */ }
        setLoading(false);
    }, [user, getHeaders, sessions]);

    useEffect(() => {
        if (!user) return;
        if (tab === 'windows') loadWindows();
        else if (tab === 'registrations') loadRegistrations();
        else if (tab === 'entrance') loadTests();
        else if (tab === 'admissions') loadSelectedStudents();
    }, [tab, user, loadWindows, loadRegistrations, loadTests, loadSelectedStudents]);

    // ===================== ACTIONS =====================

    const createWindow = async () => {
        if (!windowForm.title || !windowForm.sessionId || !windowForm.openDate || !windowForm.closeDate) {
            setError('Fill all required fields'); return;
        }
        try {
            const res = await fetch('/api/admissions/registrations', {
                method: 'POST', headers: getHeaders(),
                body: JSON.stringify(windowForm),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            setSuccess(`Registration window created! Link slug: ${data.slug}`);
            setShowCreateWindow(false);
            setWindowForm({ title: '', sessionId: '', openDate: '', closeDate: '', classesOffered: [], registrationFee: '0', maxRegistrations: '', description: '' });
            loadWindows();
        } catch { setError('Failed to create window'); }
    };

    const createTest = async () => {
        if (!testForm.windowId || !testForm.classId || !testForm.testDate) { setError('Fill all required fields'); return; }
        try {
            const res = await fetch('/api/admissions/entrance-test', {
                method: 'POST', headers: getHeaders(),
                body: JSON.stringify(testForm),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            setSuccess('Entrance test scheduled!');
            setShowCreateTest(false);
            loadTests();
        } catch { setError('Failed to create test'); }
    };

    const saveScores = async () => {
        if (!selectedTest) return;
        try {
            const scores = Object.entries(scoreEdits).map(([registrationId, { marks, attendance }]) => ({
                registrationId, marksObtained: marks ? parseFloat(marks) : null, attendance,
            }));
            const res = await fetch('/api/admissions/registrations', {
                method: 'PUT', headers: getHeaders(),
                body: JSON.stringify({ action: 'save_scores', testId: selectedTest, scores }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            setSuccess('Scores saved & merit list generated!');
            loadTestScores(selectedTest);
        } catch { setError('Failed to save scores'); }
    };

    const updateStatus = async (ids: string[], status: string) => {
        try {
            const res = await fetch('/api/admissions/registrations', {
                method: 'PUT', headers: getHeaders(),
                body: JSON.stringify({ action: 'update_status', registrationIds: ids, status }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            setSuccess(`${data.count} student(s) updated to "${statusLabel(status)}"`);
            if (tab === 'registrations') loadRegistrations();
            if (tab === 'entrance') { if (selectedTest) loadTestScores(selectedTest); }
            if (tab === 'admissions') loadSelectedStudents();
        } catch { setError('Failed to update status'); }
    };

    const enrollStudent = async (reg: Registration, classSectionId: string) => {
        try {
            // Create application from registration, then enroll
            const appRes = await fetch('/api/admissions/applications', {
                method: 'POST', headers: getHeaders(),
                body: JSON.stringify({
                    sessionId: sessions.find(s => s.is_current)?.id,
                    classId: reg.class_name ? classes.find(c => c.name === reg.class_name)?.id : '',
                    studentName: reg.student_name, dateOfBirth: reg.date_of_birth,
                    gender: reg.gender, guardianPhone: reg.guardian_phone,
                    fatherName: reg.father_name, previousSchool: reg.previous_school,
                }),
            });
            const appData = await appRes.json();
            if (!appRes.ok) { setError(appData.error); return; }

            // Approve & Enroll
            const appId = appData.application?.id;
            await fetch(`/api/admissions/applications/${appId}/review`, {
                method: 'PUT', headers: getHeaders(),
                body: JSON.stringify({ status: 'approved', remarks: 'Selected via entrance test' }),
            });

            const enrollRes = await fetch(`/api/admissions/applications/${appId}/enroll`, {
                method: 'POST', headers: getHeaders(),
                body: JSON.stringify({ classSectionId }),
            });
            const enrollData = await enrollRes.json();
            if (!enrollRes.ok) { setError(enrollData.error); return; }

            // Mark registration as admitted
            await updateStatus([reg.id], 'admitted');
            setSuccess(`${reg.student_name} enrolled successfully! Admission No: ${enrollData.admissionNumber}`);
            loadSelectedStudents();
        } catch { setError('Failed to enroll student'); }
    };

    const doSearch = useCallback(() => { loadRegistrations(); }, [loadRegistrations]);

    if (!user) return null;

    const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
        { key: 'windows', label: 'Registration Windows', icon: <Link2 size={16} /> },
        { key: 'registrations', label: 'Registrations', icon: <ClipboardList size={16} /> },
        { key: 'entrance', label: 'Entrance Test', icon: <FileText size={16} /> },
        { key: 'admissions', label: 'Admissions', icon: <UserPlus size={16} /> },
        { key: 'analytics', label: 'Analytics', icon: <BarChart3 size={16} /> },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} />
            <MobileSidebar user={user} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <main className="max-w-7xl mx-auto px-4 py-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">🎓 Admissions Management</h1>
                        <p className="text-sm text-gray-500">Registration → Entrance Test → Merit → Admission → Enroll</p>
                    </div>
                </div>

                {/* Alerts */}
                {success && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700 text-sm">
                        <CheckCircle size={16} />{success}
                        <button onClick={() => setSuccess('')} className="ml-auto"><X size={14} /></button>
                    </div>
                )}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                        <AlertCircle size={16} />{error}
                        <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-white/80 backdrop-blur rounded-xl border border-gray-200 mb-6 overflow-x-auto">
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                                tab === t.key ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
                            }`}>
                            {t.icon}{t.label}
                        </button>
                    ))}
                </div>

                {/* ===================== TAB: REGISTRATION WINDOWS ===================== */}
                {tab === 'windows' && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-gray-800">Registration Windows</h2>
                            <Button onClick={() => setShowCreateWindow(true)} className="bg-blue-600 hover:bg-blue-700">
                                <Plus size={16} className="mr-1" />New Window
                            </Button>
                        </div>

                        {/* Create Window Modal */}
                        {showCreateWindow && (
                            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                                <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-bold">Create Registration Window</h3>
                                        <button onClick={() => setShowCreateWindow(false)}><X size={20} /></button>
                                    </div>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs font-medium text-gray-600">Title *</label>
                                            <StableInput value={windowForm.title} onChange={v => setWindowForm(f => ({ ...f, title: v }))} placeholder="e.g. Admission 2026-27" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600">Session *</label>
                                            <StableSelect value={windowForm.sessionId} onChange={v => setWindowForm(f => ({ ...f, sessionId: v }))}>
                                                <option value="">Select Session</option>
                                                {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                            </StableSelect>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs font-medium text-gray-600">Open Date *</label>
                                                <StableInput type="date" value={windowForm.openDate} onChange={v => setWindowForm(f => ({ ...f, openDate: v }))} />
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium text-gray-600">Close Date *</label>
                                                <StableInput type="date" value={windowForm.closeDate} onChange={v => setWindowForm(f => ({ ...f, closeDate: v }))} />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600">Classes Offered</label>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {classes.map(c => (
                                                    <label key={c.id} className="flex items-center gap-1 text-xs bg-gray-50 px-2 py-1 rounded border cursor-pointer">
                                                        <input type="checkbox" checked={windowForm.classesOffered.includes(c.id)}
                                                            onChange={e => setWindowForm(f => ({
                                                                ...f, classesOffered: e.target.checked
                                                                    ? [...f.classesOffered, c.id]
                                                                    : f.classesOffered.filter(x => x !== c.id)
                                                            }))} />
                                                        {c.name}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs font-medium text-gray-600">Registration Fee</label>
                                                <StableInput type="number" value={windowForm.registrationFee} onChange={v => setWindowForm(f => ({ ...f, registrationFee: v }))} />
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium text-gray-600">Max Registrations</label>
                                                <StableInput type="number" value={windowForm.maxRegistrations} onChange={v => setWindowForm(f => ({ ...f, maxRegistrations: v }))} placeholder="Unlimited" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600">Description</label>
                                            <StableTextarea value={windowForm.description} onChange={v => setWindowForm(f => ({ ...f, description: v }))} placeholder="Instructions for parents..." />
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-4">
                                        <Button onClick={createWindow} className="bg-blue-600 hover:bg-blue-700 flex-1">Create Window</Button>
                                        <Button variant="outline" onClick={() => setShowCreateWindow(false)}>Cancel</Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Windows List */}
                        {loading ? (
                            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
                        ) : windows.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                                <Link2 size={40} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500">No registration windows created yet</p>
                                <p className="text-sm text-gray-400 mt-1">Create a window to start accepting registrations</p>
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                                {windows.map(w => {
                                    const isOpen = new Date(w.open_date) <= new Date() && new Date(w.close_date) >= new Date() && w.is_active;
                                    const regLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/admissions/register?slug=${w.slug}`;
                                    return (
                                        <div key={w.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h3 className="font-bold text-gray-900">{w.title}</h3>
                                                    <p className="text-xs text-gray-500">{w.session_name}</p>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isOpen ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                    {isOpen ? '● Open' : '○ Closed'}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 mb-3">
                                                <div className="text-center p-2 bg-blue-50 rounded-lg">
                                                    <div className="text-lg font-bold text-blue-700">{w.registration_count}</div>
                                                    <div className="text-[10px] text-blue-600">Registered</div>
                                                </div>
                                                <div className="text-center p-2 bg-emerald-50 rounded-lg">
                                                    <div className="text-lg font-bold text-emerald-700">{w.selected_count}</div>
                                                    <div className="text-[10px] text-emerald-600">Selected</div>
                                                </div>
                                                <div className="text-center p-2 bg-teal-50 rounded-lg">
                                                    <div className="text-lg font-bold text-teal-700">{w.admitted_count}</div>
                                                    <div className="text-[10px] text-teal-600">Admitted</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                                                <Calendar size={12} />{new Date(w.open_date).toLocaleDateString('en-IN')} — {new Date(w.close_date).toLocaleDateString('en-IN')}
                                                {w.registration_fee > 0 && <span className="ml-auto">₹{w.registration_fee} fee</span>}
                                            </div>
                                            {w.slug && (
                                                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-xs">
                                                    <ExternalLink size={12} className="text-blue-600 flex-shrink-0" />
                                                    <span className="truncate text-blue-600">{regLink}</span>
                                                    <button onClick={() => { navigator.clipboard.writeText(regLink); setSuccess('Link copied!'); }}
                                                        className="ml-auto flex-shrink-0 text-gray-500 hover:text-blue-600">
                                                        <Copy size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ===================== TAB: REGISTRATIONS ===================== */}
                {tab === 'registrations' && (
                    <div>
                        {/* Stats Row */}
                        <div className="grid grid-cols-4 md:grid-cols-7 gap-2 mb-4">
                            {[
                                { k: 'total', l: 'Total', c: 'bg-gray-50 text-gray-700' },
                                { k: 'registered', l: 'Registered', c: 'bg-blue-50 text-blue-700' },
                                { k: 'test_appeared', l: 'Appeared', c: 'bg-indigo-50 text-indigo-700' },
                                { k: 'selected', l: 'Selected', c: 'bg-emerald-50 text-emerald-700' },
                                { k: 'waitlisted_count', l: 'Waitlisted', c: 'bg-purple-50 text-purple-700' },
                                { k: 'rejected', l: 'Rejected', c: 'bg-red-50 text-red-700' },
                                { k: 'admitted', l: 'Admitted', c: 'bg-teal-50 text-teal-700' },
                            ].map(s => (
                                <div key={s.k} className={`text-center py-2 px-1 rounded-lg ${s.c}`}>
                                    <div className="text-lg font-bold">{regStats[s.k] || 0}</div>
                                    <div className="text-[10px]">{s.l}</div>
                                </div>
                            ))}
                        </div>

                        {/* Filters */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            <div className="flex-1 min-w-[200px]">
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <StableInput value={searchDisplay} onChange={v => { setSearchDisplay(v); searchRef.current = v; }}
                                        placeholder="Search by name, phone, reg number..."
                                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                                </div>
                            </div>
                            <Button variant="outline" onClick={doSearch} className="px-4"><Search size={14} /></Button>
                            <StableSelect value={regWindowFilter} onChange={setRegWindowFilter} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm min-w-[140px]">
                                <option value="">All Windows</option>
                                {windows.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
                            </StableSelect>
                            <StableSelect value={regStatusFilter} onChange={setRegStatusFilter} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm min-w-[120px]">
                                <option value="">All Status</option>
                                {['registered', 'test_appeared', 'test_absent', 'selected', 'waitlisted', 'rejected', 'admitted'].map(s =>
                                    <option key={s} value={s}>{statusLabel(s)}</option>
                                )}
                            </StableSelect>
                        </div>

                        {/* Table */}
                        {loading ? (
                            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
                        ) : (
                            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 border-b">
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Reg No</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Class</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Phone</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Score</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Rank</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {registrations.length === 0 ? (
                                            <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No registrations found</td></tr>
                                        ) : registrations.map(r => (
                                            <tr key={r.id} className="border-b hover:bg-blue-50/30">
                                                <td className="px-4 py-3 font-mono text-xs text-blue-600">{r.registration_number}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-gray-900">{r.student_name}</div>
                                                    <div className="text-xs text-gray-500">{r.father_name}</div>
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">{r.class_name}</td>
                                                <td className="px-4 py-3 text-gray-600"><Phone size={12} className="inline mr-1" />{r.guardian_phone}</td>
                                                <td className="px-4 py-3 text-gray-600">{r.entrance_score ?? '-'}</td>
                                                <td className="px-4 py-3">{r.merit_rank ? <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold">#{r.merit_rank}</span> : '-'}</td>
                                                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[r.status] || 'bg-gray-100'}`}>{statusLabel(r.status)}</span></td>
                                                <td className="px-4 py-3">
                                                    <div className="flex gap-1">
                                                        {r.status === 'test_appeared' && (
                                                            <>
                                                                <button onClick={() => updateStatus([r.id], 'selected')} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200">Select</button>
                                                                <button onClick={() => updateStatus([r.id], 'rejected')} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200">Reject</button>
                                                            </>
                                                        )}
                                                        {r.status === 'waitlisted' && (
                                                            <button onClick={() => updateStatus([r.id], 'selected')} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200">Select</button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ===================== TAB: ENTRANCE TEST ===================== */}
                {tab === 'entrance' && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold text-gray-800">Entrance Tests</h2>
                            <Button onClick={() => setShowCreateTest(true)} className="bg-blue-600 hover:bg-blue-700">
                                <Plus size={16} className="mr-1" />Schedule Test
                            </Button>
                        </div>

                        {/* Create Test Modal */}
                        {showCreateTest && (
                            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                                <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-bold">Schedule Entrance Test</h3>
                                        <button onClick={() => setShowCreateTest(false)}><X size={20} /></button>
                                    </div>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs font-medium text-gray-600">Registration Window *</label>
                                            <StableSelect value={testForm.windowId} onChange={v => setTestForm(f => ({ ...f, windowId: v }))}>
                                                <option value="">Select Window</option>
                                                {windows.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
                                            </StableSelect>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600">Class *</label>
                                            <StableSelect value={testForm.classId} onChange={v => setTestForm(f => ({ ...f, classId: v }))}>
                                                <option value="">Select Class</option>
                                                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </StableSelect>
                                        </div>
                                        <div><label className="text-xs font-medium text-gray-600">Test Name</label>
                                            <StableInput value={testForm.testName} onChange={v => setTestForm(f => ({ ...f, testName: v }))} /></div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-xs font-medium text-gray-600">Date *</label>
                                                <StableInput type="date" value={testForm.testDate} onChange={v => setTestForm(f => ({ ...f, testDate: v }))} /></div>
                                            <div><label className="text-xs font-medium text-gray-600">Time</label>
                                                <StableInput value={testForm.testTime} onChange={v => setTestForm(f => ({ ...f, testTime: v }))} placeholder="10:00 AM" /></div>
                                        </div>
                                        <div><label className="text-xs font-medium text-gray-600">Venue</label>
                                            <StableInput value={testForm.venue} onChange={v => setTestForm(f => ({ ...f, venue: v }))} placeholder="School Hall" /></div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-xs font-medium text-gray-600">Max Marks</label>
                                                <StableInput type="number" value={testForm.maxMarks} onChange={v => setTestForm(f => ({ ...f, maxMarks: v }))} /></div>
                                            <div><label className="text-xs font-medium text-gray-600">Passing Marks</label>
                                                <StableInput type="number" value={testForm.passingMarks} onChange={v => setTestForm(f => ({ ...f, passingMarks: v }))} /></div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-4">
                                        <Button onClick={createTest} className="bg-blue-600 hover:bg-blue-700 flex-1">Schedule Test</Button>
                                        <Button variant="outline" onClick={() => setShowCreateTest(false)}>Cancel</Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tests List */}
                        {loading ? (
                            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
                        ) : tests.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                                <FileText size={40} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500">No entrance tests scheduled</p>
                            </div>
                        ) : !selectedTest ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                {tests.map(t => (
                                    <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
                                        onClick={() => { setSelectedTest(t.id); loadTestScores(t.id); }}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="font-bold text-gray-900">{t.test_name}</h3>
                                                <p className="text-xs text-gray-500">{t.class_name} • {t.window_title}</p>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[t.status] || 'bg-gray-100'}`}>{statusLabel(t.status)}</span>
                                        </div>
                                        <div className="flex gap-4 text-xs text-gray-500 mt-2">
                                            <span><Calendar size={12} className="inline mr-1" />{new Date(t.test_date).toLocaleDateString('en-IN')}</span>
                                            {t.test_time && <span><Clock size={12} className="inline mr-1" />{t.test_time}</span>}
                                            <span><Users size={12} className="inline mr-1" />{t.appeared_count}/{t.score_count} appeared</span>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">Max: {t.max_marks} | Pass: {t.passing_marks}{t.venue ? ` | ${t.venue}` : ''}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            /* Score Entry View */
                            <div>
                                <button onClick={() => setSelectedTest('')} className="text-sm text-blue-600 hover:underline mb-3 flex items-center gap-1">
                                    ← Back to tests
                                </button>
                                {testInfo && (
                                    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
                                        <h3 className="font-bold text-gray-900">{testInfo.test_name} — {testInfo.class_name}</h3>
                                        <p className="text-xs text-gray-500">Max: {testInfo.max_marks} | Pass: {testInfo.passing_marks} | Date: {new Date(testInfo.test_date).toLocaleDateString('en-IN')}</p>
                                    </div>
                                )}
                                <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 border-b">
                                                <th className="px-4 py-3 text-left font-medium text-gray-600">Reg No</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-600">Phone</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-600">Attendance</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-600">Marks</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-600">Rank</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {testStudents.map(s => (
                                                <tr key={s.registration_id} className="border-b hover:bg-blue-50/30">
                                                    <td className="px-4 py-2 font-mono text-xs">{s.registration_number}</td>
                                                    <td className="px-4 py-2">
                                                        <div className="font-medium text-gray-900">{s.student_name}</div>
                                                        <div className="text-xs text-gray-500">{s.father_name}</div>
                                                    </td>
                                                    <td className="px-4 py-2 text-gray-600">{s.guardian_phone}</td>
                                                    <td className="px-4 py-2">
                                                        <select value={scoreEdits[s.registration_id]?.attendance || 'present'}
                                                            onChange={e => setScoreEdits(p => ({ ...p, [s.registration_id]: { ...p[s.registration_id], attendance: e.target.value } }))}
                                                            className="px-2 py-1 rounded border text-xs">
                                                            <option value="present">Present</option>
                                                            <option value="absent">Absent</option>
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input type="number" value={scoreEdits[s.registration_id]?.marks || ''}
                                                            onChange={e => setScoreEdits(p => ({ ...p, [s.registration_id]: { ...p[s.registration_id], marks: e.target.value } }))}
                                                            className="w-20 px-2 py-1 rounded border text-sm"
                                                            max={testInfo?.max_marks || 100} min={0}
                                                            disabled={scoreEdits[s.registration_id]?.attendance === 'absent'} />
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        {s.merit_rank ? <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold">#{s.merit_rank}</span> : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex justify-end mt-4">
                                    <Button onClick={saveScores} className="bg-blue-600 hover:bg-blue-700">
                                        <Award size={16} className="mr-1" />Save Scores & Generate Merit List
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ===================== TAB: ADMISSIONS ===================== */}
                {tab === 'admissions' && (
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">
                            Selected Students — Ready to Enroll ({selectedStudents.length})
                        </h2>
                        {loading ? (
                            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
                        ) : selectedStudents.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                                <UserPlus size={40} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500">No students ready for admission</p>
                                <p className="text-sm text-gray-400 mt-1">Students must pass entrance test and be selected first</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {selectedStudents.map(r => (
                                    <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
                                        <div className="flex-1">
                                            <div className="font-bold text-gray-900">{r.student_name}</div>
                                            <div className="text-xs text-gray-500">{r.registration_number} • {r.class_name} • Score: {r.entrance_score ?? '-'} • Rank: #{r.merit_rank || '-'}</div>
                                            <div className="text-xs text-gray-400 mt-0.5"><Phone size={10} className="inline mr-1" />{r.guardian_phone}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <select id={`cs-${r.id}`} className="px-2 py-1.5 rounded-lg border text-xs min-w-[160px]">
                                                <option value="">Select Section</option>
                                                {classSections.map(cs => (
                                                    <option key={cs.id} value={cs.id}>{cs.class_name} - {cs.section_name}</option>
                                                ))}
                                            </select>
                                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                                                onClick={() => {
                                                    const csId = (document.getElementById(`cs-${r.id}`) as HTMLSelectElement)?.value;
                                                    if (!csId) { setError('Select a class section'); return; }
                                                    enrollStudent(r, csId);
                                                }}>
                                                Enroll
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ===================== TAB: ANALYTICS ===================== */}
                {tab === 'analytics' && (
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Admission Analytics</h2>
                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="bg-white rounded-xl border border-gray-200 p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="bg-blue-100 p-2 rounded-lg"><Users size={20} className="text-blue-600" /></div>
                                    <div>
                                        <div className="text-xs text-gray-500">Total Registrations</div>
                                        <div className="text-2xl font-bold text-gray-900">{regStats.total || 0}</div>
                                    </div>
                                </div>
                                <div className="text-xs text-gray-500">Across all registration windows</div>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-200 p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="bg-emerald-100 p-2 rounded-lg"><CheckCircle size={20} className="text-emerald-600" /></div>
                                    <div>
                                        <div className="text-xs text-gray-500">Students Admitted</div>
                                        <div className="text-2xl font-bold text-gray-900">{regStats.admitted || 0}</div>
                                    </div>
                                </div>
                                <div className="text-xs text-gray-500">Successfully enrolled in classes</div>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-200 p-5">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="bg-amber-100 p-2 rounded-lg"><TrendingUp size={20} className="text-amber-600" /></div>
                                    <div>
                                        <div className="text-xs text-gray-500">Conversion Rate</div>
                                        <div className="text-2xl font-bold text-gray-900">
                                            {regStats.total ? Math.round(((regStats.admitted || 0) / Number(regStats.total)) * 100) : 0}%
                                        </div>
                                    </div>
                                </div>
                                <div className="text-xs text-gray-500">Registration → Admission</div>
                            </div>
                        </div>

                        {/* Funnel Visualization */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
                            <h3 className="font-semibold text-gray-800 mb-4">Admission Funnel</h3>
                            {[
                                { label: 'Registered', value: Number(regStats.total || 0), color: 'bg-blue-500' },
                                { label: 'Test Appeared', value: Number(regStats.test_appeared || 0), color: 'bg-indigo-500' },
                                { label: 'Selected', value: Number(regStats.selected || 0), color: 'bg-emerald-500' },
                                { label: 'Admitted', value: Number(regStats.admitted || 0), color: 'bg-teal-500' },
                            ].map((s, i) => {
                                const max = Number(regStats.total || 1);
                                const pct = Math.round((s.value / max) * 100);
                                return (
                                    <div key={i} className="mb-3">
                                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                                            <span>{s.label}</span>
                                            <span className="font-bold">{s.value} ({pct}%)</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-6">
                                            <div className={`${s.color} h-6 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
