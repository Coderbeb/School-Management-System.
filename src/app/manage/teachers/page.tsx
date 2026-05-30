'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
    Users, Plus, Search, X, Check, Trash2, 
    BookOpen, ChevronDown, ChevronUp, Edit2, ShieldAlert,
    Upload, Download, Loader2, CheckCircle
} from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: 'super_admin' | 'teacher' | 'accountant' | 'student'; }
interface Teacher { id: string; first_name: string; last_name: string; email: string; phone: string | null; is_active: boolean; password?: string; }
interface Session { id: string; name: string; is_current: boolean; }
interface ClassSection { id: string; display_name: string; }
interface Subject { id: string; name: string; code: string; }
interface Assignment { id: string; class_section_name: string; subject_name: string; subject_code: string; is_class_teacher: boolean; }

export default function TeachersPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    
    // Add & Edit modal state
    const [showAddForm, setShowAddForm] = useState(false);
    const [showEditForm, setShowEditForm] = useState<Teacher | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [assignments, setAssignments] = useState<Record<string, Assignment[]>>({});

    // Assignment form state
    const [sessions, setSessions] = useState<Session[]>([]);
    const [classSections, setClassSections] = useState<ClassSection[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [assignForm, setAssignForm] = useState({ teacherId: '', sessionId: '', classSectionId: '', subjectId: '', isClassTeacher: false });
    const [showAssignForm, setShowAssignForm] = useState<string | null>(null);

    const [newTeacher, setNewTeacher] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });

    // Bulk CSV Importer States
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<any | null>(null);
    const [importError, setImportError] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchTeachers(token);
        loadDropdowns(token);
    }, []);

    const fetchTeachers = async (token?: string, q = '') => {
        setLoading(true);
        const t = token || localStorage.getItem('token')!;
        const params = q ? `?search=${encodeURIComponent(q)}` : '';
        const res = await fetch(`/api/manage/teachers${params}`, { headers: { Authorization: `Bearer ${t}` } });
        const data = await res.json();
        setTeachers(data.teachers || []);
        setLoading(false);
    };

    const loadDropdowns = async (token: string) => {
        const [sessRes, subRes] = await Promise.all([
            fetch('/api/manage/sessions', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
            fetch('/api/manage/subjects', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        ]);
        setSessions(sessRes.sessions || []);
        setSubjects(subRes.subjects || []);
        const curr = (sessRes.sessions || []).find((s: Session) => s.is_current);
        if (curr) {
            setAssignForm(f => ({ ...f, sessionId: curr.id }));
            loadClassSections(curr.id);
        }
    };

    const loadClassSections = async (sessionId: string) => {
        const t = localStorage.getItem('token')!;
        const res = await fetch(`/api/manage/class-sections?sessionId=${sessionId}`, { headers: { Authorization: `Bearer ${t}` } });
        const data = await res.json();
        setClassSections(data.classSections || []);
    };

    const loadAssignments = async (teacherId: string) => {
        if (assignments[teacherId]) return;
        const t = localStorage.getItem('token')!;
        const res = await fetch(`/api/manage/teacher-assignments?teacherId=${teacherId}`, { headers: { Authorization: `Bearer ${t}` } });
        const data = await res.json();
        setAssignments(prev => ({ ...prev, [teacherId]: data.assignments || [] }));
    };

    const toggleExpand = (id: string) => {
        if (expandedId === id) { setExpandedId(null); return; }
        setExpandedId(id);
        loadAssignments(id);
    };

    const handleSearch = (val: string) => {
        setSearch(val);
        fetchTeachers(undefined, val);
    };

    const submitTeacher = async (e: React.FormEvent) => {
        e.preventDefault(); setSaving(true); setError('');
        const t = localStorage.getItem('token')!;
        const res = await fetch('/api/manage/teachers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
            body: JSON.stringify(newTeacher)
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error); setSaving(false); return; }
        setNewTeacher({ firstName: '', lastName: '', email: '', phone: '', password: '' });
        setShowAddForm(false); fetchTeachers(t, search); setSaving(false);
    };

    const handleUpdateTeacher = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showEditForm) return;
        setSaving(true); setError('');
        const t = localStorage.getItem('token')!;
        try {
            const res = await fetch('/api/manage/teachers', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
                body: JSON.stringify({
                    id: showEditForm.id,
                    firstName: showEditForm.first_name,
                    lastName: showEditForm.last_name,
                    email: showEditForm.email,
                    phone: showEditForm.phone,
                    isActive: showEditForm.is_active,
                    password: showEditForm.password || undefined
                })
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to update teacher'); setSaving(false); return; }
            setShowEditForm(null);
            fetchTeachers(t, search);
        } catch (err) {
            setError('Server error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const submitAssignment = async (e: React.FormEvent) => {
        e.preventDefault(); setSaving(true); setError('');
        const t = localStorage.getItem('token')!;
        const res = await fetch('/api/manage/teacher-assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
            body: JSON.stringify(assignForm)
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error); setSaving(false); return; }
        setShowAssignForm(null);
        setAssignments(prev => { const copy = { ...prev }; delete copy[assignForm.teacherId]; return copy; });
        loadAssignments(assignForm.teacherId);
        setSaving(false);
    };

    const deleteAssignment = async (assignId: string, teacherId: string) => {
        const t = localStorage.getItem('token')!;
        await fetch(`/api/manage/teacher-assignments?id=${assignId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
        setAssignments(prev => ({ ...prev, [teacherId]: (prev[teacherId] || []).filter(a => a.id !== assignId) }));
    };

    const [importSummary, setImportSummary] = useState<string | null>(null);

    // Client CSV Downloader for teachers
    const downloadTemplate = () => {
        const headers = 'First Name,Last Name,Email,Subject Code,Class,Sections\nJohn,Doe,john@school.com,MATH,10,ALL\nSarah,Connor,sarah@school.com,SCI,9,"A, B"\nMichael,Scott,michael@school.com,ENG,10,C';
        const blob = new Blob([headers], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'teachers_template.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        setImportError('');
        setImportSummary(null);

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const csvText = event.target?.result as string;
                const token = localStorage.getItem('token')!;
                const res = await fetch('/api/bulk-import/teachers', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ csvData: csvText })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Failed to import teachers CSV');
                }

                let summary = `Successfully imported: ${data.summary.teachersCreated} Teachers, ${data.summary.assignmentsCreated} Assignments!`;
                if (data.summary.missingSubjects && data.summary.missingSubjects.length > 0) {
                    summary += ` (Note: ${data.summary.missingSubjects.length} subject codes were not found: ${data.summary.missingSubjects.join(', ')})`;
                }
                if (data.summary.missingClassrooms && data.summary.missingClassrooms.length > 0) {
                    summary += ` (Note: ${data.summary.missingClassrooms.length} classroom mappings were not found: ${data.summary.missingClassrooms.join(', ')})`;
                }
                setImportSummary(summary);
                fetchTeachers(token, search);
            } catch (err: any) {
                setImportError(err.message || 'An error occurred during import');
            } finally {
                setImporting(false);
            }
        };
        reader.readAsText(file);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 mt-16">
                
                {/* Hero / Welcome Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-rose-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-rose-400 font-semibold tracking-wide uppercase text-sm">Directory</span>
                            </div>
                            <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                                Teachers & Staff <span className="inline-block animate-wave">👨‍🏫</span>
                            </h1>
                            <p className="text-rose-100 text-sm max-w-xl">
                                Manage teacher accounts, class assignments, and import bulk staff data.
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
                            <Button onClick={() => setShowAddForm(true)} className="bg-rose-500 hover:bg-rose-600 text-white gap-1.5 text-xs h-9">
                                <Plus className="w-3.5 h-3.5" /> Add Teacher
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

                {importError && (
                    <div className="bg-red-50 border border-red-100 text-red-800 rounded-xl p-3.5 mb-6 text-xs flex items-center gap-2 shadow-sm animate-fade-in">
                        <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                        <span>{importError}</span>
                    </div>
                )}

                {/* Add Teacher Form */}
                {showAddForm && (
                    <div className="bg-white border border-rose-100 rounded-3xl p-6 mb-5 shadow-sm">
                        <h2 className="font-bold text-gray-800 mb-4">Add New Teacher Account</h2>
                        <form onSubmit={submitTeacher} className="grid grid-cols-2 gap-4">
                            <div><Label>First Name *</Label><Input value={newTeacher.firstName} onChange={e => setNewTeacher(f => ({ ...f, firstName: e.target.value }))} required className="mt-1 rounded-lg" /></div>
                            <div><Label>Last Name *</Label><Input value={newTeacher.lastName} onChange={e => setNewTeacher(f => ({ ...f, lastName: e.target.value }))} required className="mt-1 rounded-lg" /></div>
                            <div><Label>Email *</Label><Input type="email" value={newTeacher.email} onChange={e => setNewTeacher(f => ({ ...f, email: e.target.value }))} required className="mt-1 rounded-lg" /></div>
                            <div><Label>Phone</Label><Input value={newTeacher.phone} onChange={e => setNewTeacher(f => ({ ...f, phone: e.target.value }))} className="mt-1 rounded-lg" /></div>
                            <div className="col-span-2"><Label>Password *</Label><Input type="password" value={newTeacher.password} onChange={e => setNewTeacher(f => ({ ...f, password: e.target.value }))} required className="mt-1 rounded-lg" placeholder="Set login password" /></div>
                            {error && <p className="col-span-2 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
                            <div className="col-span-2 flex gap-3 mt-2">
                                <Button type="submit" disabled={saving} className="bg-rose-600 text-white rounded-lg">{saving ? 'Saving...' : 'Create Teacher Account'}</Button>
                                <Button type="button" variant="outline" onClick={() => { setShowAddForm(false); setError(''); }} className="rounded-lg">Cancel</Button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Search */}
                <div className="relative mb-6">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <Input 
                        value={search} 
                        onChange={e => handleSearch(e.target.value)} 
                        placeholder="Search teachers by name or email..." 
                        className="pl-10 rounded-xl border-gray-200" 
                    />
                </div>

                {/* Teachers List */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                        <div className="w-12 h-12 border-4 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-gray-500 font-medium">Loading teachers list...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {teachers.length === 0 && (
                            <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm">
                                <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                                <p className="text-gray-500 font-medium">No teachers yet. Add your first teacher.</p>
                            </div>
                        )}
                        {teachers.map(t => (
                            <div key={t.id} className={`bg-white rounded-3xl border transition-all duration-300 shadow-sm overflow-hidden flex flex-col ${t.is_active ? 'border-gray-150' : 'border-red-100 bg-red-50/10'}`}>
                                <div className="p-5 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-xl bg-rose-100 flex items-center justify-center font-bold text-rose-700 shadow-inner">
                                            {t.first_name[0]}{t.last_name[0]}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-gray-900">{t.first_name} {t.last_name}</p>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                    t.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                    {t.is_active ? 'Active' : 'Suspended'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-400">{t.email}{t.phone ? ` • ${t.phone}` : ''}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-1">
                                        <button 
                                            onClick={() => { setShowAssignForm(t.id); setAssignForm(f => ({ ...f, teacherId: t.id })); }} 
                                            className="p-2 hover:bg-blue-50 rounded-xl text-gray-400 hover:text-blue-600 transition-colors" 
                                            title="Assign to class"
                                        >
                                            <BookOpen className="w-4.5 h-4.5" />
                                        </button>
                                        <button 
                                            onClick={() => setShowEditForm(t)} 
                                            className="p-2 hover:bg-emerald-50 rounded-xl text-gray-400 hover:text-emerald-600 transition-colors" 
                                            title="Edit Teacher details"
                                        >
                                            <Edit2 className="w-4.5 h-4.5" />
                                        </button>
                                        <button 
                                            onClick={() => toggleExpand(t.id)} 
                                            className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 hover:text-gray-800 transition-colors"
                                        >
                                            {expandedId === t.id ? <ChevronUp className="w-4.5 h-4.5" /> : <ChevronDown className="w-4.5 h-4.5" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Assignment Form */}
                                {showAssignForm === t.id && (
                                    <div className="border-t border-blue-50 bg-blue-50/20 p-5">
                                        <p className="font-bold text-sm text-blue-900 mb-4">Assign to Class & Subject</p>
                                        <form onSubmit={submitAssignment} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <Label className="text-gray-700 font-medium">Academic Year / Session</Label>
                                                <select 
                                                    value={assignForm.sessionId} 
                                                    onChange={e => { setAssignForm(f => ({ ...f, sessionId: e.target.value, classSectionId: '' })); loadClassSections(e.target.value); }} 
                                                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-xs bg-white text-gray-800"
                                                >
                                                    <option value="">Select Session</option>
                                                    {sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (Current)' : ''}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <Label className="text-gray-700 font-medium">Classroom & Section</Label>
                                                <select 
                                                    value={assignForm.classSectionId} 
                                                    onChange={e => setAssignForm(f => ({ ...f, classSectionId: e.target.value }))} 
                                                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-xs bg-white text-gray-800"
                                                    disabled={!assignForm.sessionId}
                                                >
                                                    <option value="">Select Classroom</option>
                                                    {classSections.map(cs => <option key={cs.id} value={cs.id}>{cs.display_name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <Label className="text-gray-700 font-medium">Subject</Label>
                                                <select 
                                                    value={assignForm.subjectId} 
                                                    onChange={e => setAssignForm(f => ({ ...f, subjectId: e.target.value }))} 
                                                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-xs bg-white text-gray-800"
                                                >
                                                    <option value="">Select Subject</option>
                                                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                                                </select>
                                            </div>
                                            <div className="flex items-center gap-2 pt-6">
                                                <label className="flex items-center gap-1.5 text-xs text-gray-700 font-medium cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={assignForm.isClassTeacher} 
                                                        onChange={e => setAssignForm(f => ({ ...f, isClassTeacher: e.target.checked }))} 
                                                        className="rounded border-gray-300 focus:ring-blue-500" 
                                                    />
                                                    Assign as Class Teacher
                                                </label>
                                            </div>
                                            {error && <p className="col-span-1 sm:col-span-2 text-xs text-red-600 bg-red-50 p-2.5 rounded-lg">{error}</p>}
                                            <div className="col-span-1 sm:col-span-2 flex gap-3 pt-2">
                                                <Button type="submit" size="sm" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs">{saving ? 'Saving...' : 'Assign Subject'}</Button>
                                                <Button type="button" size="sm" variant="outline" onClick={() => { setShowAssignForm(null); setError(''); }} className="text-xs rounded-lg">Cancel</Button>
                                            </div>
                                        </form>
                                    </div>
                                )}

                                {/* Expanded assignments */}
                                {expandedId === t.id && (
                                    <div className="border-t border-gray-100 p-5 bg-gray-50/30">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Active Subjects & Classrooms</p>
                                        {!assignments[t.id] ? (
                                            <p className="text-xs text-gray-400">Loading assignments...</p>
                                        ) : assignments[t.id].length === 0 ? (
                                            <p className="text-xs text-gray-400">This teacher has not been assigned any subject classes yet.</p>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {assignments[t.id].map(a => (
                                                    <div key={a.id} className="flex items-center justify-between py-2 px-3 bg-white rounded-xl border border-gray-150 shadow-inner">
                                                        <div className="flex items-center gap-2 overflow-hidden">
                                                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-100 rounded-md font-bold shrink-0">{a.subject_code}</span>
                                                            <span className="text-xs font-semibold text-gray-800 truncate" title={a.subject_name}>{a.subject_name}</span>
                                                            <span className="text-gray-300">|</span>
                                                            <span className="text-xs text-blue-700 font-bold shrink-0">{a.class_section_name}</span>
                                                            {a.is_class_teacher && <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-100 px-1 rounded font-black shrink-0">Class Teacher</span>}
                                                        </div>
                                                        <button onClick={() => deleteAssignment(a.id, t.id)} className="p-1 hover:bg-red-50 rounded-lg text-gray-350 hover:text-red-650 transition-colors ml-2 shrink-0">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Edit Teacher Modal */}
            {showEditForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 w-full max-w-md overflow-hidden">
                        <div className="bg-rose-600 px-6 py-4 flex items-center justify-between text-white">
                            <h2 className="text-lg font-bold">Edit Teacher Profile</h2>
                            <button onClick={() => setShowEditForm(null)} className="text-white/80 hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateTeacher} className="p-6 space-y-4">
                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl flex items-center gap-2">
                                    <ShieldAlert className="w-5 h-5 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-gray-750 font-medium">First Name</Label>
                                    <Input
                                        required
                                        value={showEditForm.first_name}
                                        onChange={(e) => setShowEditForm({ ...showEditForm, first_name: e.target.value })}
                                        className="mt-1 rounded-lg border-gray-200"
                                    />
                                </div>
                                <div>
                                    <Label className="text-gray-750 font-medium">Last Name</Label>
                                    <Input
                                        required
                                        value={showEditForm.last_name}
                                        onChange={(e) => setShowEditForm({ ...showEditForm, last_name: e.target.value })}
                                        className="mt-1 rounded-lg border-gray-200"
                                    />
                                </div>
                            </div>

                            <div>
                                <Label className="text-gray-750 font-medium">Email Address</Label>
                                <Input
                                    type="email"
                                    required
                                    value={showEditForm.email}
                                    onChange={(e) => setShowEditForm({ ...showEditForm, email: e.target.value })}
                                    className="mt-1 rounded-lg border-gray-200"
                                />
                            </div>

                            <div>
                                <Label className="text-gray-750 font-medium">Phone Number</Label>
                                <Input
                                    value={showEditForm.phone || ''}
                                    onChange={(e) => setShowEditForm({ ...showEditForm, phone: e.target.value })}
                                    className="mt-1 rounded-lg border-gray-200"
                                />
                            </div>

                            <div>
                                <Label className="text-gray-750 font-medium">Change Password (leave blank to keep current)</Label>
                                <Input
                                    type="password"
                                    value={showEditForm.password || ''}
                                    onChange={(e) => setShowEditForm({ ...showEditForm, password: e.target.value })}
                                    className="mt-1 rounded-lg border-gray-200"
                                    placeholder="Enter new password"
                                />
                            </div>

                            <div>
                                <Label className="text-gray-750 font-medium">Account Status</Label>
                                <select
                                    value={showEditForm.is_active ? 'active' : 'suspended'}
                                    onChange={(e) => setShowEditForm({ ...showEditForm, is_active: e.target.value === 'active' })}
                                    className="mt-1 w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white text-gray-800"
                                >
                                    <option value="active">Active Staff Member</option>
                                    <option value="suspended">Suspended / Inactive</option>
                                </select>
                            </div>

                            <div className="pt-2 flex items-center justify-end gap-3 border-t border-gray-100">
                                <Button type="button" variant="outline" onClick={() => setShowEditForm(null)} className="rounded-xl border-gray-200">
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={saving} className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md">
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
