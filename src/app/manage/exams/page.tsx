'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClipboardList, Plus, Pencil, Trash2, Lock, Unlock, Eye, EyeOff, BookOpen, CheckCircle, Clock, AlertCircle, ChevronDown, FileText } from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface Session { id: string; name: string; start_date: string; end_date: string; is_current: boolean; }
interface GradingScale { id: string; name: string; description: string; is_default: boolean; }
interface Exam {
    id: string; name: string; exam_category: string; session_id: string; grading_scale_id: string | null;
    start_date: string | null; end_date: string | null; weightage: number;
    is_entry_open: boolean; is_published: boolean; is_locked: boolean;
    description: string | null; session_name: string; grading_scale_name: string | null;
    subject_count: number; submitted_count: number; total_submissions: number;
    created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
    unit_test: 'Unit Test', term_exam: 'Term Exam', practice_test: 'Practice Test',
    board_exam: 'Board Exam', other: 'Other',
};
const CATEGORY_COLORS: Record<string, string> = {
    unit_test: 'bg-blue-100 text-blue-700', term_exam: 'bg-purple-100 text-purple-700',
    practice_test: 'bg-amber-100 text-amber-700', board_exam: 'bg-red-100 text-red-700',
    other: 'bg-gray-100 text-gray-700',
};

export default function ManageExamsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [exams, setExams] = useState<Exam[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [gradingScales, setGradingScales] = useState<GradingScale[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [filterSession, setFilterSession] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    const [form, setForm] = useState({
        name: '', examCategory: 'term_exam', sessionId: '', gradingScaleId: '',
        startDate: '', endDate: '', weightage: '100', description: '',
    });

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin' && parsed.role !== 'developer') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchAll(token);
    }, [router]);

    const fetchAll = async (token: string) => {
        setLoading(true);
        try {
            const [examsRes, sessionsRes, gradingRes] = await Promise.all([
                fetch('/api/exams', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/manage/sessions', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/grading', { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            const [examsData, sessionsData, gradingData] = await Promise.all([examsRes.json(), sessionsRes.json(), gradingRes.json()]);
            setExams(examsData.exams || []);
            setSessions(sessionsData.sessions || []);
            setGradingScales(gradingData.gradingScales || []);
            // Auto-select current session for filter
            const current = (sessionsData.sessions || []).find((s: Session) => s.is_current);
            if (current && !filterSession) setFilterSession(current.id);
        } catch { /* ignore */ }
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true); setError('');
        const token = localStorage.getItem('token')!;
        const method = editingId ? 'PUT' : 'POST';
        const body = {
            ...(editingId ? { id: editingId } : {}),
            name: form.name, examCategory: form.examCategory, sessionId: form.sessionId,
            gradingScaleId: form.gradingScaleId || null, startDate: form.startDate || null,
            endDate: form.endDate || null, weightage: parseFloat(form.weightage) || 100,
            description: form.description || null,
        };
        try {
            const res = await fetch('/api/exams', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to save'); setSaving(false); return; }
            resetForm(); fetchAll(token);
        } catch { setError('Network error'); }
        setSaving(false);
    };

    const toggleExamState = async (examId: string, field: 'isEntryOpen' | 'isPublished' | 'isLocked', value: boolean) => {
        const token = localStorage.getItem('token')!;
        await fetch('/api/exams', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ id: examId, [field]: value }),
        });
        fetchAll(token);
    };

    const deleteExam = async (id: string) => {
        const token = localStorage.getItem('token')!;
        const res = await fetch(`/api/exams?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Failed to delete'); }
        setDeleteConfirm(null);
        fetchAll(token);
    };

    const startEdit = (exam: Exam) => {
        setEditingId(exam.id);
        setForm({
            name: exam.name, examCategory: exam.exam_category, sessionId: exam.session_id,
            gradingScaleId: exam.grading_scale_id || '', startDate: exam.start_date?.split('T')[0] || '',
            endDate: exam.end_date?.split('T')[0] || '', weightage: String(exam.weightage),
            description: exam.description || '',
        });
        setShowForm(true);
    };

    const resetForm = () => {
        setShowForm(false); setEditingId(null); setError('');
        const currentSession = sessions.find(s => s.is_current);
        setForm({ name: '', examCategory: 'term_exam', sessionId: currentSession?.id || '', gradingScaleId: '', startDate: '', endDate: '', weightage: '100', description: '' });
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const filteredExams = filterSession ? exams.filter(e => e.session_id === filterSession) : exams;

    const getStatusBadge = (exam: Exam) => {
        if (exam.is_published) return <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1"><Eye className="w-3 h-3" /> Published</span>;
        if (exam.is_locked) return <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1"><Lock className="w-3 h-3" /> Locked</span>;
        if (exam.is_entry_open) return <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center gap-1"><Unlock className="w-3 h-3" /> Entry Open</span>;
        return <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center gap-1"><Clock className="w-3 h-3" /> Draft</span>;
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-5xl mx-auto px-4 py-8 mt-16">
                {/* Hero Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-purple-400 font-semibold tracking-wide uppercase text-sm">Marks Management</span>
                            </div>
                            <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                                Exam Management <span className="inline-block animate-wave">📝</span>
                            </h1>
                            <p className="text-purple-100 text-sm max-w-xl">
                                Create exams, configure subjects & marks, and control the <span className="font-semibold text-white">marks entry portal</span> for teachers.
                            </p>
                        </div>
                        <Button onClick={() => { resetForm(); setShowForm(true); }} className="bg-purple-500 hover:bg-purple-600 text-white gap-2 h-9 text-xs shadow-lg">
                            <Plus className="w-4 h-4" /> New Exam
                        </Button>
                    </div>
                </div>

                {/* Session Filter */}
                <div className="flex items-center gap-3 mb-6">
                    <Label className="text-sm font-bold text-gray-600 whitespace-nowrap">Session:</Label>
                    <div className="relative">
                        <select value={filterSession} onChange={e => setFilterSession(e.target.value)}
                            className="pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-purple-500 outline-none appearance-none cursor-pointer shadow-sm">
                            <option value="">All Sessions</option>
                            {sessions.map(s => <option key={s.id} value={s.id}>{s.name} {s.is_current ? '(Current)' : ''}</option>)}
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-2.5 pointer-events-none" />
                    </div>
                    <span className="text-xs text-gray-400 ml-auto">{filteredExams.length} exam{filteredExams.length !== 1 ? 's' : ''}</span>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                        <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
                    </div>
                )}

                {/* Create/Edit Form */}
                {showForm && (
                    <div className="bg-white border border-purple-100 rounded-2xl p-6 mb-6 shadow-md">
                        <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-purple-500" />
                            {editingId ? 'Edit Exam' : 'Create New Exam'}
                        </h2>
                        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="sm:col-span-2 lg:col-span-3">
                                <Label>Exam Name *</Label>
                                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Half Yearly Exam 2026" required className="mt-1" />
                            </div>
                            <div>
                                <Label>Category</Label>
                                <select value={form.examCategory} onChange={e => setForm(f => ({ ...f, examCategory: e.target.value }))}
                                    className="w-full mt-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Academic Session *</Label>
                                <select value={form.sessionId} onChange={e => setForm(f => ({ ...f, sessionId: e.target.value }))} required
                                    className="w-full mt-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                                    <option value="">Select session</option>
                                    {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Grading Scale</Label>
                                <select value={form.gradingScaleId} onChange={e => setForm(f => ({ ...f, gradingScaleId: e.target.value }))}
                                    className="w-full mt-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                                    <option value="">Default (CBSE)</option>
                                    {gradingScales.map(g => <option key={g.id} value={g.id}>{g.name} {g.is_default ? '(Default)' : ''}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Start Date</Label>
                                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="mt-1" />
                            </div>
                            <div>
                                <Label>End Date</Label>
                                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className="mt-1" />
                            </div>
                            <div>
                                <Label>Weightage (%)</Label>
                                <Input type="number" min="0" max="100" value={form.weightage} onChange={e => setForm(f => ({ ...f, weightage: e.target.value }))} className="mt-1" />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3">
                                <Label>Description (optional)</Label>
                                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Any additional notes..."
                                    className="w-full mt-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none" />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3 flex gap-3">
                                <Button type="submit" disabled={saving} className="bg-purple-600 hover:bg-purple-700 text-white">
                                    {saving ? 'Saving...' : editingId ? 'Update Exam' : 'Create Exam'}
                                </Button>
                                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Exams List */}
                {loading ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                        <p className="text-gray-400 text-sm">Loading exams...</p>
                    </div>
                ) : filteredExams.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No exams found. Create your first exam to get started.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredExams.map(exam => (
                            <div key={exam.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                                <div className="p-5">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        {/* Left: Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <h3 className="font-bold text-gray-900 text-base truncate">{exam.name}</h3>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${CATEGORY_COLORS[exam.exam_category] || CATEGORY_COLORS.other}`}>
                                                    {CATEGORY_LABELS[exam.exam_category] || 'Other'}
                                                </span>
                                                {getStatusBadge(exam)}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                                                <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {exam.subject_count} subject{exam.subject_count !== 1 ? 's' : ''} configured</span>
                                                {exam.start_date && <span>📅 {new Date(exam.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} {exam.end_date ? `→ ${new Date(exam.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</span>}
                                                {exam.grading_scale_name && <span>📊 {exam.grading_scale_name}</span>}
                                                {exam.total_submissions > 0 && (
                                                    <span className="flex items-center gap-1">
                                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                                        {exam.submitted_count}/{exam.total_submissions} submitted
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right: Actions */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {/* Toggle Entry Open */}
                                            <button onClick={() => toggleExamState(exam.id, 'isEntryOpen', !exam.is_entry_open)}
                                                title={exam.is_entry_open ? 'Close Entry' : 'Open Entry'}
                                                className={`p-2 rounded-lg transition-colors text-xs font-medium ${exam.is_entry_open ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}>
                                                {exam.is_entry_open ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                            </button>
                                            {/* Toggle Published */}
                                            <button onClick={() => toggleExamState(exam.id, 'isPublished', !exam.is_published)}
                                                title={exam.is_published ? 'Unpublish' : 'Publish Results'}
                                                className={`p-2 rounded-lg transition-colors ${exam.is_published ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}>
                                                {exam.is_published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                            </button>
                                            {/* Toggle Locked */}
                                            <button onClick={() => toggleExamState(exam.id, 'isLocked', !exam.is_locked)}
                                                title={exam.is_locked ? 'Unlock Marks' : 'Lock Marks'}
                                                className={`p-2 rounded-lg transition-colors ${exam.is_locked ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}>
                                                {exam.is_locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                                            </button>
                                            <div className="w-px h-6 bg-gray-200 mx-1" />
                                            {/* Configure Subjects */}
                                            <button onClick={() => router.push(`/manage/exams/${exam.id}/subjects`)}
                                                title="Configure Subjects"
                                                className="p-2 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors">
                                                <BookOpen className="w-4 h-4" />
                                            </button>
                                            {/* Edit */}
                                            <button onClick={() => startEdit(exam)} title="Edit Exam"
                                                className="p-2 rounded-lg bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            {/* Delete */}
                                            {deleteConfirm === exam.id ? (
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => deleteExam(exam.id)} className="px-2 py-1 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600">Yes</button>
                                                    <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 bg-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-300">No</button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setDeleteConfirm(exam.id)} title="Delete"
                                                    className="p-2 rounded-lg bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
