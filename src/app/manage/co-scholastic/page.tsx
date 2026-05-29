'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { Award, ChevronDown, Save, AlertCircle, CheckCircle, Loader2, Plus, Trash2, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface ExamOption { id: string; name: string; }
interface ClassSectionOption { id: string; class_name: string; section_name: string; }
interface CoArea { id: string; name: string; description: string; display_order: number; is_active: boolean; }
interface StudentRow { student_id: string; student_name: string; roll_number: number | null; }

export default function CoScholasticPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'areas' | 'grades'>('areas');

    // Areas Management
    const [areas, setAreas] = useState<CoArea[]>([]);
    const [loadingAreas, setLoadingAreas] = useState(true);
    const [savingArea, setSavingArea] = useState(false);
    const [showAreaForm, setShowAreaForm] = useState(false);
    const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
    const [areaForm, setAreaForm] = useState({ name: '', description: '' });
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    // Grades Entry
    const [exams, setExams] = useState<ExamOption[]>([]);
    const [classSections, setClassSections] = useState<ClassSectionOption[]>([]);
    const [selectedExam, setSelectedExam] = useState('');
    const [selectedClassSection, setSelectedClassSection] = useState('');
    const [students, setStudents] = useState<StudentRow[]>([]);
    const [gradeAreas, setGradeAreas] = useState<CoArea[]>([]);
    const [gradesMap, setGradesMap] = useState<Record<string, Record<string, string>>>({});
    const [loadingGrades, setLoadingGrades] = useState(false);
    const [savingGrades, setSavingGrades] = useState(false);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const GRADE_OPTIONS = ['A', 'B', 'C', 'D', 'E'];

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (!['super_admin', 'developer', 'teacher'].includes(parsed.role)) { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchAreas(token);
        fetchExams(token);
        fetchClassSections(token);
    }, [router]);

    const fetchAreas = async (token?: string) => {
        const t = token || localStorage.getItem('token')!;
        setLoadingAreas(true);
        try {
            const res = await fetch('/api/co-scholastic/areas', { headers: { Authorization: `Bearer ${t}` } });
            const data = await res.json();
            setAreas(data.areas || []);
        } catch { /* ignore */ }
        setLoadingAreas(false);
    };

    const fetchExams = async (token: string) => {
        try {
            const res = await fetch('/api/exams', { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            setExams(data.exams || []);
        } catch { /* ignore */ }
    };

    const fetchClassSections = async (token: string) => {
        try {
            const res = await fetch('/api/manage/class-sections?withEnrollments=true', { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            setClassSections(data.classSections || []);
        } catch { /* ignore */ }
    };

    const handleAreaSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingArea(true); setError(''); setSuccess('');
        const token = localStorage.getItem('token')!;
        const method = editingAreaId ? 'PUT' : 'POST';
        const body = { ...(editingAreaId ? { id: editingAreaId } : {}), name: areaForm.name, description: areaForm.description };
        try {
            const res = await fetch('/api/co-scholastic/areas', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to save'); } else { setSuccess(editingAreaId ? 'Area updated!' : 'Area created!'); }
            setShowAreaForm(false); setEditingAreaId(null); setAreaForm({ name: '', description: '' });
            fetchAreas(token);
        } catch { setError('Network error'); }
        setSavingArea(false);
    };

    const deleteArea = async (id: string) => {
        const token = localStorage.getItem('token')!;
        await fetch(`/api/co-scholastic/areas?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        setDeleteConfirm(null); fetchAreas(token);
    };

    const loadGrades = useCallback(async () => {
        if (!selectedExam || !selectedClassSection) return;
        setLoadingGrades(true); setError(''); setSuccess('');
        const token = localStorage.getItem('token')!;
        try {
            const res = await fetch(`/api/co-scholastic/grades?examId=${selectedExam}&classSectionId=${selectedClassSection}`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to load'); setLoadingGrades(false); return; }
            setStudents(data.students || []);
            setGradeAreas(data.areas || []);
            setGradesMap(data.gradesMap || {});
        } catch { setError('Network error'); }
        setLoadingGrades(false);
    }, [selectedExam, selectedClassSection]);

    useEffect(() => { loadGrades(); }, [loadGrades]);

    const updateGrade = (studentId: string, areaId: string, grade: string) => {
        setGradesMap(prev => ({
            ...prev,
            [studentId]: { ...(prev[studentId] || {}), [areaId]: grade },
        }));
    };

    const saveGrades = async () => {
        setSavingGrades(true); setError(''); setSuccess('');
        const token = localStorage.getItem('token')!;
        const entries: { studentId: string; areaId: string; grade: string; }[] = [];
        for (const studentId of Object.keys(gradesMap)) {
            for (const areaId of Object.keys(gradesMap[studentId])) {
                entries.push({ studentId, areaId, grade: gradesMap[studentId][areaId] });
            }
        }
        try {
            const res = await fetch('/api/co-scholastic/grades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ examId: selectedExam, classSectionId: selectedClassSection, entries }),
            });
            const data = await res.json();
            if (!res.ok) setError(data.error || 'Failed to save');
            else setSuccess('Co-scholastic grades saved!');
        } catch { setError('Network error'); }
        setSavingGrades(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const gradeColorClass = (grade: string) => {
        const map: Record<string, string> = { A: 'bg-emerald-100 text-emerald-700', B: 'bg-blue-100 text-blue-700', C: 'bg-amber-100 text-amber-700', D: 'bg-orange-100 text-orange-700', E: 'bg-red-100 text-red-700' };
        return map[grade] || 'bg-gray-100 text-gray-700';
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-6xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-teal-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-cyan-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10">
                        <span className="text-teal-400 font-semibold tracking-wide uppercase text-sm">Marks Management</span>
                        <h1 className="text-2xl font-bold mt-1 mb-2 flex items-center gap-3">Co-Scholastic Assessment <Award className="w-6 h-6 text-teal-400" /></h1>
                        <p className="text-teal-100 text-sm max-w-xl">Manage co-scholastic areas (Art, Sports, Discipline) and enter grades per student.</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm mb-6 w-fit">
                    <button onClick={() => setActiveTab('areas')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'areas' ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                        Manage Areas
                    </button>
                    <button onClick={() => setActiveTab('grades')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'grades' ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                        Enter Grades
                    </button>
                </div>

                {/* Messages */}
                {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error} <button onClick={() => setError('')} className="ml-auto text-red-400">✕</button></div>}
                {success && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {success}</div>}

                {/* TAB: Manage Areas */}
                {activeTab === 'areas' && (
                    <>
                        {/* Add Area Form */}
                        {showAreaForm ? (
                            <form onSubmit={handleAreaSubmit} className="bg-white rounded-2xl border border-teal-100 p-5 mb-6 shadow-md">
                                <h3 className="font-bold text-gray-800 mb-3">{editingAreaId ? 'Edit Area' : 'Add New Area'}</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                    <div><Label>Area Name *</Label><Input value={areaForm.name} onChange={e => setAreaForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Art Education" required className="mt-1" /></div>
                                    <div><Label>Description</Label><Input value={areaForm.description} onChange={e => setAreaForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional..." className="mt-1" /></div>
                                </div>
                                <div className="flex gap-2">
                                    <Button type="submit" disabled={savingArea} className="bg-teal-600 hover:bg-teal-700 text-white gap-2"><Save className="w-4 h-4" /> {savingArea ? 'Saving...' : 'Save'}</Button>
                                    <Button type="button" variant="outline" onClick={() => { setShowAreaForm(false); setEditingAreaId(null); setAreaForm({ name: '', description: '' }); }}>Cancel</Button>
                                </div>
                            </form>
                        ) : (
                            <div className="mb-6">
                                <Button onClick={() => setShowAreaForm(true)} className="bg-teal-600 hover:bg-teal-700 text-white gap-2"><Plus className="w-4 h-4" /> Add Area</Button>
                            </div>
                        )}

                        {/* Areas List */}
                        {loadingAreas ? (
                            <div className="flex flex-col items-center py-16 gap-3"><Loader2 className="w-8 h-8 text-teal-500 animate-spin" /><p className="text-gray-400 text-sm">Loading...</p></div>
                        ) : areas.length === 0 ? (
                            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                                <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500">No co-scholastic areas yet. Add your first area above.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {areas.map((area, idx) => (
                                    <div key={area.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold text-sm">{idx + 1}</div>
                                            <div>
                                                <h4 className="font-bold text-gray-900 text-sm">{area.name}</h4>
                                                {area.description && <p className="text-xs text-gray-400">{area.description}</p>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button onClick={() => { setEditingAreaId(area.id); setAreaForm({ name: area.name, description: area.description || '' }); setShowAreaForm(true); }}
                                                className="p-2 rounded-lg bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                                            {deleteConfirm === area.id ? (
                                                <div className="flex gap-1"><button onClick={() => deleteArea(area.id)} className="px-2 py-1 bg-red-500 text-white rounded-lg text-xs font-bold">Yes</button><button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 bg-gray-200 rounded-lg text-xs font-bold">No</button></div>
                                            ) : (
                                                <button onClick={() => setDeleteConfirm(area.id)} className="p-2 rounded-lg bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* TAB: Enter Grades */}
                {activeTab === 'grades' && (
                    <>
                        {/* Selectors */}
                        <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6 shadow-sm">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Exam</label>
                                    <div className="relative">
                                        <select value={selectedExam} onChange={e => { setSelectedExam(e.target.value); }}
                                            className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-teal-500 outline-none appearance-none">
                                            <option value="">Select exam</option>
                                            {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-3 pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Class</label>
                                    <div className="relative">
                                        <select value={selectedClassSection} onChange={e => setSelectedClassSection(e.target.value)} disabled={!selectedExam}
                                            className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-teal-500 outline-none appearance-none disabled:opacity-50">
                                            <option value="">Select class</option>
                                            {classSections.map(cs => <option key={cs.id} value={cs.id}>{cs.class_name} - {cs.section_name}</option>)}
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-3 pointer-events-none" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Grades Grid */}
                        {loadingGrades ? (
                            <div className="flex flex-col items-center py-16 gap-3"><Loader2 className="w-8 h-8 text-teal-500 animate-spin" /><p className="text-gray-400 text-sm">Loading students...</p></div>
                        ) : students.length > 0 && gradeAreas.length > 0 ? (
                            <>
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 border-b border-gray-100">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase w-12">#</th>
                                                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Student</th>
                                                    {gradeAreas.map(a => (
                                                        <th key={a.id} className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase w-28">{a.name}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {students.map((student, sIdx) => (
                                                    <tr key={student.student_id} className="hover:bg-gray-50/50">
                                                        <td className="px-4 py-2 text-gray-400 text-xs">{student.roll_number || sIdx + 1}</td>
                                                        <td className="px-4 py-2 font-medium text-gray-900 text-sm">{student.student_name}</td>
                                                        {gradeAreas.map(area => {
                                                            const currentGrade = gradesMap[student.student_id]?.[area.id] || '';
                                                            return (
                                                                <td key={area.id} className="px-2 py-1.5 text-center">
                                                                    <div className="flex gap-0.5 justify-center">
                                                                        {GRADE_OPTIONS.map(g => (
                                                                            <button key={g} onClick={() => updateGrade(student.student_id, area.id, g)}
                                                                                className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${currentGrade === g ? gradeColorClass(g) + ' ring-2 ring-offset-1 ring-teal-400 scale-110' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                                                                                {g}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="sticky bottom-4 flex justify-center">
                                    <Button onClick={saveGrades} disabled={savingGrades} className="bg-teal-600 hover:bg-teal-700 text-white gap-2 shadow-lg px-8">
                                        <Save className="w-4 h-4" /> {savingGrades ? 'Saving...' : 'Save Co-Scholastic Grades'}
                                    </Button>
                                </div>
                            </>
                        ) : selectedExam && selectedClassSection && !loadingGrades ? (
                            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                                <Award className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500 text-sm">No data found. Make sure co-scholastic areas are created and students are enrolled.</p>
                            </div>
                        ) : null}
                    </>
                )}
            </main>
        </div>
    );
}
