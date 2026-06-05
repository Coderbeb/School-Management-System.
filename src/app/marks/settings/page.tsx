'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import {
    Settings2, Plus, Trash2, ChevronDown, Loader2, AlertCircle, CheckCircle,
    GripVertical, FileText, FlaskConical, Layers, PenLine, Link2, Unlink2,
    BarChart3, ArrowLeft
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface Session { id: string; name: string; is_current: boolean; }
interface ExamOption { id: string; name: string; exam_category: string; is_teacher_test: boolean; generates_report_card: boolean; weightage: number; start_date: string; }
interface ExamGroup {
    id: string; name: string; description: string; aggregation_method: string;
    best_of_count: number | null; generates_report_card: boolean; display_order: number;
    exam_count: number; total_weightage: number;
}
interface GroupMember {
    id: string; exam_id: string; exam_name: string; weightage: number; display_order: number;
    exam_category: string; is_teacher_test: boolean; generates_report_card: boolean;
    subject_count: number; submitted_count: number;
}
interface MarkComponent { id: string; name: string; short_name: string; school_id: string | null; }

const RESULT_PRESETS = [
    { value: 'standard', label: 'Standard', desc: 'Fail >2 subjects = FAIL, 1-2 failed = COMPARTMENT' },
    { value: 'strict', label: 'Strict', desc: 'Any subject failed = FAIL (no compartment)' },
    { value: 'grade_only', label: 'Grade Only', desc: 'No pass/fail — only grades shown (ideal for junior classes)' },
    { value: 'percentage_only', label: 'Percentage Only', desc: 'Simple pass/fail by percentage, no grades' },
];

const AGGREGATION_METHODS = [
    { value: 'weighted_sum', label: 'Weighted Sum', desc: 'Each exam contributes based on its weightage %' },
    { value: 'average', label: 'Simple Average', desc: 'Average marks across all exams' },
    { value: 'best_of_n', label: 'Best of N', desc: 'Pick the best N exam scores' },
    { value: 'latest', label: 'Latest Only', desc: 'Only the most recent exam counts' },
];

export default function MarksSettingsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [activeTab, setActiveTab] = useState<'exams' | 'groups' | 'components' | 'rules'>('exams');

    // Data
    const [sessions, setSessions] = useState<Session[]>([]);
    const [selectedSession, setSelectedSession] = useState('');
    const [exams, setExams] = useState<ExamOption[]>([]);
    const [examGroups, setExamGroups] = useState<ExamGroup[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
    const [markComponents, setMarkComponents] = useState<MarkComponent[]>([]);
    const [resultPreset, setResultPreset] = useState('standard');

    // Form state
    const [showCreateExam, setShowCreateExam] = useState(false);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [showCreateComponent, setShowCreateComponent] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [saving, setSaving] = useState(false);

    // Form fields
    const [newExamName, setNewExamName] = useState('');
    const [newExamCategory, setNewExamCategory] = useState('term_exam');
    const [newExamReportCard, setNewExamReportCard] = useState(true);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupDesc, setNewGroupDesc] = useState('');
    const [newGroupMethod, setNewGroupMethod] = useState('weighted_sum');
    const [newGroupBestOf, setNewGroupBestOf] = useState('');
    const [newComponentName, setNewComponentName] = useState('');
    const [newComponentShort, setNewComponentShort] = useState('');
    const [addMemberExam, setAddMemberExam] = useState('');
    const [addMemberWeight, setAddMemberWeight] = useState('100');

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    useEffect(() => {
        const t = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!t || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (!['super_admin', 'developer'].includes(parsed.role)) { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchSessions(t);
        fetchComponents(t);
        fetchResultPreset(t);
        setLoading(false);
    }, [router]);

    const fetchSessions = async (t: string) => {
        try {
            const res = await fetch('/api/sessions', { headers: { Authorization: `Bearer ${t}` } });
            const data = await res.json();
            const list = data.sessions || [];
            setSessions(list);
            const current = list.find((s: Session) => s.is_current);
            if (current) setSelectedSession(current.id);
        } catch { /* ignore */ }
    };

    const fetchExams = useCallback(async (sessionId: string) => {
        if (!token) return;
        try {
            const res = await fetch(`/api/exams?sessionId=${sessionId}&includeTeacherTests=true`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            setExams(data.exams || []);
        } catch { /* ignore */ }
    }, [token]);

    const fetchGroups = useCallback(async (sessionId: string) => {
        if (!token) return;
        try {
            const res = await fetch(`/api/exam-groups?sessionId=${sessionId}`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            setExamGroups(data.groups || []);
        } catch { /* ignore */ }
    }, [token]);

    const fetchGroupMembers = async (groupId: string) => {
        if (!token) return;
        try {
            const res = await fetch(`/api/exam-groups?id=${groupId}`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            setGroupMembers(data.members || []);
        } catch { /* ignore */ }
    };

    const fetchComponents = async (t: string) => {
        try {
            const res = await fetch('/api/marks/components', { headers: { Authorization: `Bearer ${t}` } });
            const data = await res.json();
            setMarkComponents(data.components || []);
        } catch { /* ignore */ }
    };

    const fetchResultPreset = async (t: string) => {
        try {
            const res = await fetch('/api/settings', { headers: { Authorization: `Bearer ${t}` } });
            const data = await res.json();
            // Try to find result_preset from school data
            if (data.school?.result_preset) setResultPreset(data.school.result_preset);
        } catch { /* ignore */ }
    };

    useEffect(() => {
        if (selectedSession) {
            fetchExams(selectedSession);
            fetchGroups(selectedSession);
        }
    }, [selectedSession, fetchExams, fetchGroups]);

    useEffect(() => {
        if (selectedGroup) fetchGroupMembers(selectedGroup);
    }, [selectedGroup]);

    const handleCreateExam = async () => {
        if (!newExamName.trim() || !selectedSession || !token) return;
        setSaving(true); setError('');
        try {
            const res = await fetch('/api/exams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    name: newExamName, examCategory: newExamCategory, sessionId: selectedSession,
                    generatesReportCard: newExamReportCard,
                }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed'); } else {
                setSuccess('Exam created!'); setShowCreateExam(false); setNewExamName('');
                fetchExams(selectedSession);
            }
        } catch { setError('Network error'); }
        setSaving(false);
    };

    const handleDeleteExam = async (examId: string) => {
        if (!token || !confirm('Delete this exam?')) return;
        try {
            const res = await fetch(`/api/exams?id=${examId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) setError(data.error || 'Failed to delete');
            else fetchExams(selectedSession);
        } catch { setError('Network error'); }
    };

    const handleToggleExamReportCard = async (exam: ExamOption) => {
        if (!token) return;
        try {
            await fetch('/api/exams', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ id: exam.id, generatesReportCard: !exam.generates_report_card }),
            });
            fetchExams(selectedSession);
        } catch { /* ignore */ }
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim() || !selectedSession || !token) return;
        setSaving(true); setError('');
        try {
            const res = await fetch('/api/exam-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    action: 'create_group', name: newGroupName, description: newGroupDesc,
                    sessionId: selectedSession, aggregationMethod: newGroupMethod,
                    bestOfCount: newGroupMethod === 'best_of_n' ? parseInt(newGroupBestOf) || 3 : null,
                }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed'); } else {
                setSuccess('Group created!'); setShowCreateGroup(false); setNewGroupName(''); setNewGroupDesc('');
                fetchGroups(selectedSession);
            }
        } catch { setError('Network error'); }
        setSaving(false);
    };

    const handleDeleteGroup = async (groupId: string) => {
        if (!token || !confirm('Delete this exam group?')) return;
        try {
            await fetch(`/api/exam-groups?groupId=${groupId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            fetchGroups(selectedSession);
            if (selectedGroup === groupId) { setSelectedGroup(null); setGroupMembers([]); }
        } catch { setError('Network error'); }
    };

    const handleAddMember = async () => {
        if (!addMemberExam || !selectedGroup || !token) return;
        setSaving(true); setError('');
        try {
            const res = await fetch('/api/exam-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    action: 'add_member', examGroupId: selectedGroup,
                    examId: addMemberExam, weightage: parseFloat(addMemberWeight) || 100,
                }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed'); } else {
                setSuccess('Exam added to group!'); setShowAddMember(false); setAddMemberExam('');
                fetchGroupMembers(selectedGroup); fetchGroups(selectedSession);
            }
        } catch { setError('Network error'); }
        setSaving(false);
    };

    const handleRemoveMember = async (memberId: string) => {
        if (!token || !selectedGroup) return;
        try {
            await fetch(`/api/exam-groups?memberId=${memberId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            fetchGroupMembers(selectedGroup); fetchGroups(selectedSession);
        } catch { setError('Network error'); }
    };

    const handleUpdateMemberWeight = async (memberId: string, weightage: number) => {
        if (!token) return;
        try {
            await fetch('/api/exam-groups', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ action: 'update_member', memberId, weightage }),
            });
            if (selectedGroup) { fetchGroupMembers(selectedGroup); fetchGroups(selectedSession); }
        } catch { /* ignore */ }
    };

    const handleCreateComponent = async () => {
        if (!newComponentName.trim() || !newComponentShort.trim() || !token) return;
        setSaving(true); setError('');
        try {
            const res = await fetch('/api/marks/components', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name: newComponentName, shortName: newComponentShort }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed'); } else {
                setSuccess('Component created!'); setShowCreateComponent(false);
                setNewComponentName(''); setNewComponentShort('');
                fetchComponents(token);
            }
        } catch { setError('Network error'); }
        setSaving(false);
    };

    const handleDeleteComponent = async (id: string) => {
        if (!token || !confirm('Delete this component?')) return;
        try {
            const res = await fetch(`/api/marks/components?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) setError(data.error || 'Failed to delete');
            else fetchComponents(token);
        } catch { setError('Network error'); }
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    // Clear messages after 4s
    useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t); } }, [success]);
    useEffect(() => { if (error) { const t = setTimeout(() => setError(''), 6000); return () => clearTimeout(t); } }, [error]);

    const formalExams = exams.filter(e => !e.is_teacher_test);
    const teacherTests = exams.filter(e => e.is_teacher_test);
    const availableForGroup = formalExams.filter(e => !groupMembers.find(m => m.exam_id === e.id));
    const totalWeight = groupMembers.reduce((s, m) => s + m.weightage, 0);

    if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-violet-500" /></div>;

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-6xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-violet-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-fuchsia-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10">
                        <button onClick={() => router.push('/marks/overview')} className="flex items-center gap-1 text-violet-300 hover:text-white text-sm mb-3 transition-colors">
                            <ArrowLeft className="w-4 h-4" /> Back to Marks Overview
                        </button>
                        <span className="text-violet-400 font-semibold tracking-wide uppercase text-sm">Examination Setup</span>
                        <h1 className="text-2xl font-bold mt-1 mb-2 flex items-center gap-3">
                            Exam Pattern & Configuration <Settings2 className="w-6 h-6 text-violet-400" />
                        </h1>
                        <p className="text-violet-100 text-sm max-w-xl">
                            Configure your school's examination structure — create exams, group them into terms, set result rules, and manage mark components.
                        </p>
                    </div>
                </div>

                {/* Session Selector */}
                <div className="flex items-center gap-3 mb-6">
                    <label className="text-sm font-bold text-gray-600">Session:</label>
                    <div className="relative">
                        <select value={selectedSession} onChange={e => setSelectedSession(e.target.value)}
                            className="pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-violet-500 outline-none appearance-none shadow-sm">
                            {sessions.map(s => <option key={s.id} value={s.id}>{s.name} {s.is_current ? '(Current)' : ''}</option>)}
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-2.5 pointer-events-none" />
                    </div>
                </div>

                {/* Messages */}
                {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
                {success && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2"><CheckCircle className="w-4 h-4 shrink-0" /> {success}</div>}

                {/* Tabs */}
                <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm mb-6 overflow-x-auto">
                    {[
                        { key: 'exams' as const, label: '📝 Exams', icon: PenLine },
                        { key: 'groups' as const, label: '📁 Exam Groups', icon: Layers },
                        { key: 'components' as const, label: '🧩 Components', icon: FlaskConical },
                        { key: 'rules' as const, label: '📊 Result Rules', icon: BarChart3 },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.key ? 'bg-violet-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ============ TAB: EXAMS ============ */}
                {activeTab === 'exams' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">Exams in this Session</h2>
                            <Button onClick={() => setShowCreateExam(true)} className="bg-violet-600 hover:bg-violet-700 text-white gap-2 text-xs h-9">
                                <Plus className="w-4 h-4" /> Create Exam
                            </Button>
                        </div>

                        {/* Create Exam Form */}
                        {showCreateExam && (
                            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 space-y-3">
                                <h3 className="font-bold text-violet-900 text-sm">Create New Exam</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Exam Name *</label>
                                        <input value={newExamName} onChange={e => setNewExamName(e.target.value)} placeholder="e.g., Unit Test 1"
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Category</label>
                                        <input value={newExamCategory} onChange={e => setNewExamCategory(e.target.value)} placeholder="e.g., unit_test, term_exam"
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
                                    </div>
                                    <div className="flex items-end gap-3">
                                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                            <input type="checkbox" checked={newExamReportCard} onChange={e => setNewExamReportCard(e.target.checked)}
                                                className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500" />
                                            Report Card
                                        </label>
                                    </div>
                                </div>
                                <div className="flex gap-2 pt-1">
                                    <Button onClick={handleCreateExam} disabled={saving || !newExamName.trim()} className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-8 gap-1.5">
                                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Create
                                    </Button>
                                    <Button onClick={() => setShowCreateExam(false)} variant="outline" className="text-xs h-8">Cancel</Button>
                                </div>
                            </div>
                        )}

                        {/* Formal Exams List */}
                        {formalExams.length > 0 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase">Formal Exams ({formalExams.length})</h3>
                                </div>
                                <div className="divide-y divide-gray-50">
                                    {formalExams.map(exam => (
                                        <div key={exam.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <GripVertical className="w-4 h-4 text-gray-300" />
                                                <div>
                                                    <div className="font-medium text-gray-900 text-sm">{exam.name}</div>
                                                    <div className="text-xs text-gray-400 flex items-center gap-2">
                                                        <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{exam.exam_category}</span>
                                                        {exam.start_date && <span>{new Date(exam.start_date).toLocaleDateString('en-IN')}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => handleToggleExamReportCard(exam)}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${exam.generates_report_card ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                                                    <FileText className="w-3 h-3 inline mr-1" />
                                                    {exam.generates_report_card ? 'Report ✓' : 'No Report'}
                                                </button>
                                                <button onClick={() => handleDeleteExam(exam.id)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                                <PenLine className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500 text-sm">No exams created yet. Click "Create Exam" to get started.</p>
                            </div>
                        )}

                        {/* Teacher Tests */}
                        {teacherTests.length > 0 && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-5 py-3 border-b border-gray-100 bg-amber-50">
                                    <h3 className="text-xs font-bold text-amber-600 uppercase">Teacher Tests ({teacherTests.length})</h3>
                                    <p className="text-xs text-amber-500 mt-0.5">Informal tests created by teachers — not included in formal results</p>
                                </div>
                                <div className="divide-y divide-gray-50">
                                    {teacherTests.map(exam => (
                                        <div key={exam.id} className="px-5 py-3 flex items-center justify-between">
                                            <div>
                                                <div className="font-medium text-gray-900 text-sm">{exam.name}</div>
                                                <div className="text-xs text-gray-400">{exam.exam_category}</div>
                                            </div>
                                            <span className="px-2 py-0.5 bg-amber-100 text-amber-600 rounded-full text-xs font-bold">Teacher Test</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ============ TAB: EXAM GROUPS ============ */}
                {activeTab === 'groups' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Exam Groups (Consolidation)</h2>
                                <p className="text-xs text-gray-500 mt-0.5">Group exams into terms for consolidated report cards with weighted marks</p>
                            </div>
                            <Button onClick={() => setShowCreateGroup(true)} className="bg-violet-600 hover:bg-violet-700 text-white gap-2 text-xs h-9">
                                <Plus className="w-4 h-4" /> Create Group
                            </Button>
                        </div>

                        {/* Create Group Form */}
                        {showCreateGroup && (
                            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 space-y-3">
                                <h3 className="font-bold text-violet-900 text-sm">Create Exam Group</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Group Name *</label>
                                        <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g., Term 1, Final Year Result"
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Aggregation Method</label>
                                        <select value={newGroupMethod} onChange={e => setNewGroupMethod(e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none appearance-none">
                                            {AGGREGATION_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                {newGroupMethod === 'best_of_n' && (
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Best of how many?</label>
                                        <input type="number" min="1" value={newGroupBestOf} onChange={e => setNewGroupBestOf(e.target.value)} placeholder="e.g., 3"
                                            className="w-32 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
                                    </div>
                                )}
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Description (optional)</label>
                                    <input value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)} placeholder="e.g., Combines all periodic tests and half yearly"
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
                                </div>
                                <div className="flex gap-2 pt-1">
                                    <Button onClick={handleCreateGroup} disabled={saving || !newGroupName.trim()} className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-8 gap-1.5">
                                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Create
                                    </Button>
                                    <Button onClick={() => setShowCreateGroup(false)} variant="outline" className="text-xs h-8">Cancel</Button>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Groups List */}
                            <div className="space-y-3">
                                {examGroups.length > 0 ? examGroups.map(group => (
                                    <div key={group.id}
                                        onClick={() => setSelectedGroup(group.id)}
                                        className={`bg-white rounded-2xl border p-4 shadow-sm cursor-pointer transition-all
                                            ${selectedGroup === group.id ? 'border-violet-400 ring-2 ring-violet-100' : 'border-gray-100 hover:border-violet-200'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="font-bold text-gray-900">{group.name}</h3>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                                                className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        {group.description && <p className="text-xs text-gray-400 mb-2">{group.description}</p>}
                                        <div className="flex items-center gap-3 text-xs">
                                            <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full font-bold">
                                                {AGGREGATION_METHODS.find(m => m.value === group.aggregation_method)?.label || group.aggregation_method}
                                            </span>
                                            <span className="text-gray-500">{group.exam_count} exams</span>
                                            <span className={`font-bold ${Math.abs(group.total_weightage - 100) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                {group.total_weightage}% total
                                            </span>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                                        <Layers className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                        <p className="text-gray-500 text-sm">No exam groups yet.</p>
                                        <p className="text-gray-400 text-xs mt-1">Groups let you combine multiple exams into consolidated results.</p>
                                    </div>
                                )}
                            </div>

                            {/* Group Members (right side) */}
                            {selectedGroup && (
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                    <div className="px-5 py-3 border-b border-gray-100 bg-violet-50 flex items-center justify-between">
                                        <div>
                                            <h3 className="text-sm font-bold text-violet-900">Exams in Group</h3>
                                            <p className="text-xs text-violet-600">
                                                Total weightage: <span className={`font-bold ${Math.abs(totalWeight - 100) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>{totalWeight}%</span>
                                                {Math.abs(totalWeight - 100) >= 0.01 && <span className="text-amber-600 ml-1">(should be 100%)</span>}
                                            </p>
                                        </div>
                                        <Button onClick={() => setShowAddMember(true)} className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5 text-xs h-8">
                                            <Link2 className="w-3.5 h-3.5" /> Add Exam
                                        </Button>
                                    </div>

                                    {/* Add Member Form */}
                                    {showAddMember && (
                                        <div className="p-4 bg-violet-50 border-b border-violet-100 space-y-2">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-xs font-bold text-gray-500 mb-1 block">Exam</label>
                                                    <select value={addMemberExam} onChange={e => setAddMemberExam(e.target.value)}
                                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none appearance-none">
                                                        <option value="">Select exam...</option>
                                                        {availableForGroup.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-gray-500 mb-1 block">Weightage (%)</label>
                                                    <input type="number" min="0" max="100" value={addMemberWeight} onChange={e => setAddMemberWeight(e.target.value)}
                                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none" />
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button onClick={handleAddMember} disabled={saving || !addMemberExam} className="bg-violet-600 text-white text-xs h-7 gap-1">
                                                    <Plus className="w-3 h-3" /> Add
                                                </Button>
                                                <Button onClick={() => setShowAddMember(false)} variant="outline" className="text-xs h-7">Cancel</Button>
                                            </div>
                                        </div>
                                    )}

                                    {groupMembers.length > 0 ? (
                                        <div className="divide-y divide-gray-50">
                                            {groupMembers.map(member => (
                                                <div key={member.id} className="px-5 py-3 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <GripVertical className="w-4 h-4 text-gray-300" />
                                                        <div>
                                                            <div className="font-medium text-gray-900 text-sm">{member.exam_name}</div>
                                                            <div className="text-xs text-gray-400">
                                                                {member.subject_count} subjects · {member.submitted_count} submitted
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <input type="number" min="0" max="100" step="0.5"
                                                            value={member.weightage}
                                                            onChange={e => handleUpdateMemberWeight(member.id, parseFloat(e.target.value))}
                                                            className="w-16 px-2 py-1 text-center text-sm font-bold border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none" />
                                                        <span className="text-xs text-gray-400">%</span>
                                                        <button onClick={() => handleRemoveMember(member.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                                                            <Unlink2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-gray-400 text-sm">
                                            No exams in this group yet. Click "Add Exam" above.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ============ TAB: COMPONENTS ============ */}
                {activeTab === 'components' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Mark Components</h2>
                                <p className="text-xs text-gray-500 mt-0.5">Define marking components like Theory, Practical, Internal Assessment, etc.</p>
                            </div>
                            <Button onClick={() => setShowCreateComponent(true)} className="bg-violet-600 hover:bg-violet-700 text-white gap-2 text-xs h-9">
                                <Plus className="w-4 h-4" /> Add Component
                            </Button>
                        </div>

                        {/* Create Component Form */}
                        {showCreateComponent && (
                            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 space-y-3">
                                <h3 className="font-bold text-violet-900 text-sm">Add Mark Component</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Name *</label>
                                        <input value={newComponentName} onChange={e => setNewComponentName(e.target.value)} placeholder="e.g., Lab Work"
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Short Name *</label>
                                        <input value={newComponentShort} onChange={e => setNewComponentShort(e.target.value)} placeholder="e.g., LAB"
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
                                    </div>
                                </div>
                                <div className="flex gap-2 pt-1">
                                    <Button onClick={handleCreateComponent} disabled={saving || !newComponentName.trim() || !newComponentShort.trim()} className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-8 gap-1.5">
                                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
                                    </Button>
                                    <Button onClick={() => setShowCreateComponent(false)} variant="outline" className="text-xs h-8">Cancel</Button>
                                </div>
                            </div>
                        )}

                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="divide-y divide-gray-50">
                                {markComponents.map(comp => (
                                    <div key={comp.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center text-sm font-bold text-violet-700">
                                                {comp.short_name}
                                            </div>
                                            <div>
                                                <div className="font-medium text-gray-900 text-sm">{comp.name}</div>
                                                <div className="text-xs text-gray-400">
                                                    {comp.school_id ? 'Custom (this school)' : 'Global default'}
                                                </div>
                                            </div>
                                        </div>
                                        {comp.school_id && (
                                            <button onClick={() => handleDeleteComponent(comp.id)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ============ TAB: RESULT RULES ============ */}
                {activeTab === 'rules' && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-bold text-gray-900">Result Computation Rules</h2>
                        <p className="text-sm text-gray-500">Choose how your school calculates pass/fail results:</p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {RESULT_PRESETS.map(preset => (
                                <div key={preset.value}
                                    onClick={async () => {
                                        setResultPreset(preset.value);
                                        if (token) {
                                            try {
                                                await fetch('/api/settings', {
                                                    method: 'PUT',
                                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                    body: JSON.stringify({ key: 'result_preset', value: preset.value }),
                                                });
                                                setSuccess(`Result rule set to "${preset.label}"`);
                                            } catch { setError('Failed to save'); }
                                        }
                                    }}
                                    className={`bg-white rounded-2xl border p-5 cursor-pointer transition-all
                                        ${resultPreset === preset.value ? 'border-violet-400 ring-2 ring-violet-100 bg-violet-50' : 'border-gray-100 hover:border-violet-200'}`}>
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
                                            ${resultPreset === preset.value ? 'border-violet-500 bg-violet-500' : 'border-gray-300'}`}>
                                            {resultPreset === preset.value && <div className="w-2 h-2 bg-white rounded-full"></div>}
                                        </div>
                                        <h3 className="font-bold text-gray-900 text-sm">{preset.label}</h3>
                                    </div>
                                    <p className="text-xs text-gray-500 ml-8">{preset.desc}</p>
                                </div>
                            ))}
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mt-4">
                            <p className="text-sm text-amber-800 font-medium">💡 This rule applies to all class results and report cards generated for this school.</p>
                            <p className="text-xs text-amber-600 mt-1">Currently active: <strong>{RESULT_PRESETS.find(p => p.value === resultPreset)?.label || resultPreset}</strong></p>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
