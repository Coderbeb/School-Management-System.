'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Layers, Plus, Pencil, Trash2, BookOpen, Link, Upload, Download, Loader2, CheckCircle } from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: 'super_admin' | 'teacher' | 'accountant' | 'student'; }
interface SchoolClass { id: string; name: string; display_order: number; is_active: boolean; }
interface Section { id: string; name: string; }
interface Session { id: string; name: string; is_current: boolean; }
interface ClassSection { id: string; class_id: string; section_id: string; session_id: string; display_name: string; class_name: string; section_name: string; capacity: number; room_number: string | null; }

type ActiveTab = 'classes' | 'sections' | 'classrooms';

export default function ClassesPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<ActiveTab>('classes');
    const [classes, setClasses] = useState<SchoolClass[]>([]);
    const [sections, setSections] = useState<Section[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [classrooms, setClassrooms] = useState<ClassSection[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [classForm, setClassForm] = useState({ name: '', displayOrder: '' });
    const [sectionForm, setSectionForm] = useState({ name: '' });
    const [classroomForm, setClassroomForm] = useState({ classId: '', sectionId: '', sessionId: '', capacity: '40', roomNumber: '' });
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const [importing, setImporting] = useState(false);
    const [importSummary, setImportSummary] = useState<string | null>(null);

    const downloadTemplate = () => {
        const headers = 'Class Name,Sections\n1,"A, B, C, D"\n2,"A, B"\n3,\nClass 9,"A, B, C"\nClass 10,"A, B, C, D"';
        const blob = new Blob([headers], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'classes_template.csv');
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
                const res = await fetch('/api/bulk-import/classes', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ csvData: csvText })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Failed to import classes CSV');
                }

                setImportSummary(`Successfully imported: ${data.summary.classesCreated} Classes, ${data.summary.sectionsCreated} Sections, ${data.summary.classSectionsCreated} Classrooms!`);
                loadAll();
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
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin') { router.replace('/dashboard'); return; }
        setUser(parsed);
        loadAll();
    }, []);

    const loadAll = async () => {
        setLoading(true);
        const t = localStorage.getItem('token')!;
        const [c, s, sess] = await Promise.all([
            fetch('/api/manage/classes', { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
            fetch('/api/manage/sections', { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
            fetch('/api/manage/sessions', { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
        ]);
        setClasses(c.classes || []);
        setSections(s.sections || []);
        setSessions(sess.sessions || []);
        const currentSession = (sess.sessions || []).find((s: Session) => s.is_current);
        if (currentSession) {
            const cs = await fetch(`/api/manage/class-sections?sessionId=${currentSession.id}`, { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json());
            setClassrooms(cs.classSections || []);
            setClassroomForm(f => ({ ...f, sessionId: currentSession.id }));
        }
        setLoading(false);
    };

    const deleteClass = async (id: string) => {
        if (!confirm('Delete this class? This will also remove all associated classrooms.')) return;
        const t = localStorage.getItem('token')!;
        await fetch(`/api/manage/classes?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
        loadAll();
    };

    const deleteSection = async (id: string) => {
        if (!confirm('Delete this section?')) return;
        const t = localStorage.getItem('token')!;
        await fetch(`/api/manage/sections?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
        loadAll();
    };

    const deleteClassroom = async (id: string) => {
        if (!confirm('Remove this classroom?')) return;
        const t = localStorage.getItem('token')!;
        await fetch(`/api/manage/class-sections?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
        loadAll();
    };

    const submitClass = async (e: React.FormEvent) => {
        e.preventDefault(); setSaving(true); setError('');
        const t = localStorage.getItem('token')!;
        const res = await fetch('/api/manage/classes', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ name: classForm.name, displayOrder: parseInt(classForm.displayOrder) || 0 }) });
        const data = await res.json();
        if (!res.ok) { setError(data.error); setSaving(false); return; }
        setClassForm({ name: '', displayOrder: '' }); setShowForm(false); loadAll(); setSaving(false);
    };

    const submitSection = async (e: React.FormEvent) => {
        e.preventDefault(); setSaving(true); setError('');
        const t = localStorage.getItem('token')!;
        const res = await fetch('/api/manage/sections', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ name: sectionForm.name }) });
        const data = await res.json();
        if (!res.ok) { setError(data.error); setSaving(false); return; }
        setSectionForm({ name: '' }); setShowForm(false); loadAll(); setSaving(false);
    };

    const submitClassroom = async (e: React.FormEvent) => {
        e.preventDefault(); setSaving(true); setError('');
        const t = localStorage.getItem('token')!;
        const res = await fetch('/api/manage/class-sections', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ classId: classroomForm.classId, sectionId: classroomForm.sectionId, sessionId: classroomForm.sessionId, capacity: parseInt(classroomForm.capacity), roomNumber: classroomForm.roomNumber || null }) });
        const data = await res.json();
        if (!res.ok) { setError(data.error); setSaving(false); return; }
        setClassroomForm(f => ({ ...f, classId: '', sectionId: '', roomNumber: '' })); setShowForm(false); loadAll(); setSaving(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };
    const tabs: { key: ActiveTab; label: string; icon: React.ReactNode }[] = [
        { key: 'classes', label: 'Classes', icon: <Layers className="w-4 h-4" /> },
        { key: 'sections', label: 'Sections', icon: <BookOpen className="w-4 h-4" /> },
        { key: 'classrooms', label: 'Classrooms', icon: <Link className="w-4 h-4" /> },
    ];

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-4xl mx-auto px-4 py-8 mt-16">
                {/* Hero / Welcome Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-indigo-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-blue-400 font-semibold tracking-wide uppercase text-sm">Directory</span>
                            </div>
                            <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                                Classes & Sections <span className="inline-block animate-wave">🏫</span>
                            </h1>
                            <p className="text-blue-100 text-sm max-w-xl">
                                Manage grade levels, sections, and combine them into classrooms.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={downloadTemplate} variant="outline" className="gap-1.5 text-xs h-9 bg-white/10 text-white hover:bg-white/20 border-white/20">
                                <Download className="w-3.5 h-3.5" /> Template
                            </Button>
                            <label className={`cursor-pointer bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition-colors h-9 ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
                                {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                {importing ? 'Importing...' : 'Import CSV'}
                                <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
                            </label>
                            <Button onClick={() => { setShowForm(true); setError(''); }} className="bg-indigo-500 hover:bg-indigo-600 text-white gap-1.5 text-xs h-9">
                                <Plus className="w-3.5 h-3.5" /> Add New
                            </Button>
                        </div>
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
                    {tabs.map(tab => (
                        <button key={tab.key} onClick={() => { setActiveTab(tab.key); setShowForm(false); setError(''); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {/* CLASSES TAB */}
                {activeTab === 'classes' && (
                    <>
                        {showForm && (
                            <form onSubmit={submitClass} className="bg-white border border-blue-100 rounded-2xl p-5 mb-4 shadow-sm">
                                <p className="font-bold text-gray-800 mb-3">Add New Class</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><Label>Class Name</Label><Input value={classForm.name} onChange={e => setClassForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Class 10" required className="mt-1" /></div>
                                    <div><Label>Display Order</Label><Input type="number" value={classForm.displayOrder} onChange={e => setClassForm(f => ({ ...f, displayOrder: e.target.value }))} placeholder="e.g. 13" className="mt-1" /></div>
                                </div>
                                {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
                                <div className="flex gap-2 mt-3"><Button type="submit" disabled={saving} className="bg-blue-600 text-white">{saving ? 'Saving...' : 'Add Class'}</Button><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button></div>
                            </form>
                        )}
                        {loading ? <div className="text-center py-8 text-gray-400">Loading...</div> : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {classes.map(c => (
                                    <div key={c.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm hover:shadow transition-all">
                                        <div><p className="font-bold text-gray-900">{c.name}</p><p className="text-xs text-gray-400">Order: {c.display_order}</p></div>
                                        <button onClick={() => deleteClass(c.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* SECTIONS TAB */}
                {activeTab === 'sections' && (
                    <>
                        {showForm && (
                            <form onSubmit={submitSection} className="bg-white border border-blue-100 rounded-2xl p-5 mb-4 shadow-sm">
                                <p className="font-bold text-gray-800 mb-3">Add New Section</p>
                                <div><Label>Section Name</Label><Input value={sectionForm.name} onChange={e => setSectionForm({ name: e.target.value })} placeholder="e.g. A" required className="mt-1" /></div>
                                {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
                                <div className="flex gap-2 mt-3"><Button type="submit" disabled={saving} className="bg-blue-600 text-white">{saving ? 'Saving...' : 'Add Section'}</Button><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button></div>
                            </form>
                        )}
                        <div className="flex gap-3 flex-wrap">
                            {sections.map(s => (
                                <div key={s.id} className="bg-white border border-gray-100 rounded-xl px-6 py-4 flex items-center gap-3 shadow-sm">
                                    <span className="text-2xl font-bold text-blue-700">{s.name}</span>
                                    <button onClick={() => deleteSection(s.id)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* CLASSROOMS TAB */}
                {activeTab === 'classrooms' && (
                    <>
                        {showForm && (
                            <form onSubmit={submitClassroom} className="bg-white border border-blue-100 rounded-2xl p-5 mb-4 shadow-sm">
                                <p className="font-bold text-gray-800 mb-3">Create Classroom (Class + Section)</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label>Session</Label>
                                        <select value={classroomForm.sessionId} onChange={e => setClassroomForm(f => ({ ...f, sessionId: e.target.value }))} className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3 text-sm" required>
                                            <option value="">Select Session</option>
                                            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (Current)' : ''}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <Label>Class</Label>
                                        <select value={classroomForm.classId} onChange={e => setClassroomForm(f => ({ ...f, classId: e.target.value }))} className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3 text-sm" required>
                                            <option value="">Select Class</option>
                                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <Label>Section</Label>
                                        <select value={classroomForm.sectionId} onChange={e => setClassroomForm(f => ({ ...f, sectionId: e.target.value }))} className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3 text-sm" required>
                                            <option value="">Select Section</option>
                                            {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div><Label>Capacity</Label><Input type="number" value={classroomForm.capacity} onChange={e => setClassroomForm(f => ({ ...f, capacity: e.target.value }))} className="mt-1" /></div>
                                    <div className="col-span-2"><Label>Room Number (optional)</Label><Input value={classroomForm.roomNumber} onChange={e => setClassroomForm(f => ({ ...f, roomNumber: e.target.value }))} placeholder="e.g. Room 201" className="mt-1" /></div>
                                </div>
                                {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
                                <div className="flex gap-2 mt-3"><Button type="submit" disabled={saving} className="bg-blue-600 text-white">{saving ? 'Saving...' : 'Create Classroom'}</Button><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button></div>
                            </form>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {classrooms.map(cs => (
                                <div key={cs.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between shadow-sm hover:shadow transition-all">
                                    <div>
                                        <p className="font-bold text-gray-900">{cs.display_name}</p>
                                        <p className="text-xs text-gray-400">Capacity: {cs.capacity}{cs.room_number ? ` | Room ${cs.room_number}` : ''}</p>
                                    </div>
                                    <button onClick={() => deleteClassroom(cs.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
