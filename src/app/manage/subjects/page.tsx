'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BookOpen, Plus, Trash2, Link2, Check, Upload, Download, Loader2, CheckCircle } from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: 'super_admin' | 'teacher' | 'accountant' | 'student'; }
interface Subject { id: string; name: string; code: string; description: string | null; }
interface SchoolClass { id: string; name: string; display_order: number; }
interface Session { id: string; name: string; is_current: boolean; }
interface ClassSubject { id: string; class_subject_id: string; name: string; code: string; }

type ActiveTab = 'subjects' | 'assign';

export default function SubjectsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<ActiveTab>('subjects');
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [classes, setClasses] = useState<SchoolClass[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [assignedSubjects, setAssignedSubjects] = useState<ClassSubject[]>([]);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedSessionId, setSelectedSessionId] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({ name: '', code: '', description: '' });
    const [importing, setImporting] = useState(false);
    const [importSummary, setImportSummary] = useState<string | null>(null);

    const downloadTemplate = () => {
        const headers = 'Subject Name,Subject Code,Classes\nMathematics,MATH,"9, 10"\nScience,SCI,"8, 9"\nEnglish,ENG,"1, 2, 3, 4, 5"';
        const blob = new Blob([headers], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'subjects_template.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        setError('');
        setImportSummary(null);

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const csvText = event.target?.result as string;
                const token = localStorage.getItem('token')!;
                const res = await fetch('/api/bulk-import/subjects', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ csvData: csvText })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Failed to import subjects CSV');
                }

                let summary = `Successfully imported: ${data.summary.subjectsCreated} Subjects, ${data.summary.subjectsMapped} Class Mappings!`;
                if (data.summary.missingClasses && data.summary.missingClasses.length > 0) {
                    summary += ` (Note: ${data.summary.missingClasses.length} class names were not found: ${data.summary.missingClasses.join(', ')})`;
                }
                setImportSummary(summary);
                loadInitial(token);
            } catch (err: any) {
                setError(err.message || 'An error occurred during import');
            } finally {
                setImporting(false);
            }
        };
        reader.readAsText(file);
    };

    useEffect(() => {
        const userData = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin') { router.replace('/dashboard'); return; }
        setUser(parsed);
        loadInitial(token);
    }, []);

    const loadInitial = async (token: string) => {
        setLoading(true);
        const [s, c, sess] = await Promise.all([
            fetch('/api/manage/subjects', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
            fetch('/api/manage/classes', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
            fetch('/api/manage/sessions', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        ]);
        setSubjects(s.subjects || []);
        setClasses(c.classes || []);
        setSessions(sess.sessions || []);
        const curr = (sess.sessions || []).find((s: Session) => s.is_current);
        if (curr) setSelectedSessionId(curr.id);
        setLoading(false);
    };

    const loadAssigned = async (classId: string, sessionId: string) => {
        if (!classId || !sessionId) return;
        const token = localStorage.getItem('token')!;
        const res = await fetch(`/api/manage/subjects?classId=${classId}&sessionId=${sessionId}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setAssignedSubjects(data.subjects || []);
    };

    const handleClassChange = (classId: string) => {
        setSelectedClassId(classId);
        loadAssigned(classId, selectedSessionId);
    };

    const isAssigned = (subjectId: string) => assignedSubjects.some(s => s.id === subjectId);

    const toggleAssign = async (subjectId: string) => {
        const token = localStorage.getItem('token')!;
        if (isAssigned(subjectId)) {
            // Remove assignment
            const cs = assignedSubjects.find(s => s.id === subjectId);
            if (!cs) return;
            await fetch(`/api/manage/class-subjects?id=${cs.class_subject_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        } else {
            // Add assignment
            await fetch('/api/manage/class-subjects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ classId: selectedClassId, subjectId, sessionId: selectedSessionId })
            });
        }
        loadAssigned(selectedClassId, selectedSessionId);
    };

    const submitSubject = async (e: React.FormEvent) => {
        e.preventDefault(); setSaving(true); setError('');
        const token = localStorage.getItem('token')!;
        const res = await fetch('/api/manage/subjects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name: form.name, code: form.code, description: form.description || null })
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error); setSaving(false); return; }
        setForm({ name: '', code: '', description: '' }); setShowForm(false);
        loadInitial(token); setSaving(false);
    };

    const deleteSubject = async (id: string) => {
        if (!confirm('Delete this subject?')) return;
        const token = localStorage.getItem('token')!;
        await fetch(`/api/manage/subjects?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        loadInitial(token);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-4xl mx-auto px-4 py-8 mt-16">
                {/* Hero / Welcome Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-violet-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-violet-400 font-semibold tracking-wide uppercase text-sm">Directory</span>
                            </div>
                            <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                                Subjects <span className="inline-block animate-wave">📚</span>
                            </h1>
                            <p className="text-violet-100 text-sm max-w-xl">
                                Create subjects and assign them to specific classes.
                            </p>
                        </div>
                        {activeTab === 'subjects' && (
                            <div className="flex flex-wrap items-center gap-2">
                                <Button onClick={downloadTemplate} variant="outline" className="gap-1.5 text-xs h-9 bg-white/10 text-white hover:bg-white/20 border-white/20">
                                    <Download className="w-3.5 h-3.5" /> Template
                                </Button>
                                <label className={`cursor-pointer bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition-colors h-9 ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
                                    {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                    {importing ? 'Importing...' : 'Import CSV'}
                                    <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
                                </label>
                                <Button onClick={() => { setShowForm(true); setError(''); }} className="bg-violet-500 hover:bg-violet-600 text-white gap-1.5 text-xs h-9">
                                    <Plus className="w-3.5 h-3.5" /> Add Subject
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {importSummary && (
                    <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-3.5 mb-6 text-xs flex items-center gap-2 shadow-sm animate-fade-in">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{importSummary}</span>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
                    {[{ key: 'subjects' as ActiveTab, label: 'Subject Master List', icon: <BookOpen className="w-4 h-4" /> }, { key: 'assign' as ActiveTab, label: 'Assign to Classes', icon: <Link2 className="w-4 h-4" /> }].map(tab => (
                        <button key={tab.key} onClick={() => { setActiveTab(tab.key); setShowForm(false); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.key ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {/* SUBJECTS TAB */}
                {activeTab === 'subjects' && (
                    <>
                        {showForm && (
                            <form onSubmit={submitSubject} className="bg-white border border-violet-100 rounded-2xl p-5 mb-4 shadow-sm">
                                <p className="font-bold text-gray-800 mb-3">Add New Subject</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><Label>Subject Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Mathematics" required className="mt-1" /></div>
                                    <div><Label>Short Code</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. MATH" required className="mt-1" /></div>
                                    <div className="col-span-2"><Label>Description (optional)</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description" className="mt-1" /></div>
                                </div>
                                {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
                                <div className="flex gap-2 mt-3"><Button type="submit" disabled={saving} className="bg-violet-600 text-white">{saving ? 'Saving...' : 'Add Subject'}</Button><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button></div>
                            </form>
                        )}
                        {loading ? <div className="text-center py-8 text-gray-400">Loading...</div> : (
                            <div className="space-y-2">
                                {subjects.map(s => (
                                    <div key={s.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <span className="px-2 py-1 rounded-lg bg-violet-100 text-violet-700 text-xs font-bold font-mono">{s.code}</span>
                                            <div><p className="font-semibold text-gray-900">{s.name}</p>{s.description && <p className="text-xs text-gray-400">{s.description}</p>}</div>
                                        </div>
                                        <button onClick={() => deleteSubject(s.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                ))}
                                {subjects.length === 0 && <div className="text-center py-12 text-gray-400">No subjects yet. Add your first subject.</div>}
                            </div>
                        )}
                    </>
                )}

                {/* ASSIGN TAB */}
                {activeTab === 'assign' && (
                    <div>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div>
                                <Label>Session</Label>
                                <select value={selectedSessionId} onChange={e => { setSelectedSessionId(e.target.value); if (selectedClassId) loadAssigned(selectedClassId, e.target.value); }} className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white">
                                    <option value="">Select Session</option>
                                    {sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (Current)' : ''}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Class</Label>
                                <select value={selectedClassId} onChange={e => handleClassChange(e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white">
                                    <option value="">Select a Class</option>
                                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {!selectedClassId ? (
                            <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">Select a session and class to manage subject assignments.</div>
                        ) : (
                            <div>
                                <p className="text-sm font-semibold text-gray-600 mb-3">Click to toggle subject assignment for the selected class:</p>
                                <div className="space-y-2">
                                    {subjects.map(s => {
                                        const assigned = isAssigned(s.id);
                                        return (
                                            <button key={s.id} onClick={() => toggleAssign(s.id)}
                                                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${assigned ? 'bg-violet-50 border-violet-200' : 'bg-white border-gray-100 hover:border-violet-200'}`}>
                                                <div className="flex items-center gap-3">
                                                    <span className="px-2 py-1 rounded-lg bg-violet-100 text-violet-700 text-xs font-bold font-mono">{s.code}</span>
                                                    <span className="font-semibold text-gray-900">{s.name}</span>
                                                </div>
                                                {assigned ? <div className="flex items-center gap-1.5 text-violet-600 font-semibold text-sm"><Check className="w-4 h-4" /> Assigned</div> : <span className="text-gray-400 text-sm">Click to assign</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
