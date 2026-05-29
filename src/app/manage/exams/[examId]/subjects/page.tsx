'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, BookOpen, Plus, Trash2, Save, AlertCircle, CheckCircle, Settings2 } from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface ClassItem { id: string; name: string; display_order: number; }
interface Subject { id: string; name: string; code: string; }
interface MarkComponent { id: string; name: string; short_name: string; }
interface ExamSubjectComponent { component_id: string; component_name: string; short_name: string; max_marks: number; }
interface ExamSubject {
    id: string; exam_id: string; subject_id: string; class_id: string;
    subject_name: string; subject_code: string; class_name: string;
    total_max_marks: number; passing_marks: number;
    components: ExamSubjectComponent[];
}

interface SubjectConfig {
    subjectId: string; subjectName: string; subjectCode: string;
    totalMaxMarks: number; passingMarks: number;
    components: { componentId: string; componentName: string; maxMarks: number; }[];
    isNew?: boolean;
}

export default function ExamSubjectsPage() {
    const router = useRouter();
    const params = useParams();
    const examId = params.examId as string;

    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [examName, setExamName] = useState('');
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
    const [markComponents, setMarkComponents] = useState<MarkComponent[]>([]);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [existingSubjects, setExistingSubjects] = useState<ExamSubject[]>([]);
    const [configs, setConfigs] = useState<SubjectConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin' && parsed.role !== 'developer') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchInitialData(token);
    }, [router, examId]);

    const fetchInitialData = async (token: string) => {
        setLoading(true);
        try {
            const [examRes, classRes, compRes] = await Promise.all([
                fetch(`/api/exams`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/manage/classes`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`/api/marks/components`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            const [examData, classData, compData] = await Promise.all([examRes.json(), classRes.json(), compRes.json()]);
            const exam = (examData.exams || []).find((e: { id: string }) => e.id === examId);
            if (exam) setExamName(exam.name);
            setClasses(classData.classes || []);
            setMarkComponents(compData.components || []);
        } catch { /* ignore */ }
        setLoading(false);
    };

    const fetchSubjectsForClass = useCallback(async (classId: string) => {
        if (!classId) return;
        const token = localStorage.getItem('token')!;
        try {
            // Fetch subjects assigned to this class via class_subjects
            const subRes = await fetch(`/api/subjects?classId=${classId}`, { headers: { Authorization: `Bearer ${token}` } });
            const subData = await subRes.json();
            setAvailableSubjects(subData.subjects || []);

            // Fetch already configured exam subjects for this class
            const esRes = await fetch(`/api/exams/subjects?examId=${examId}&classId=${classId}`, { headers: { Authorization: `Bearer ${token}` } });
            const esData = await esRes.json();
            setExistingSubjects(esData.examSubjects || []);

            // Pre-populate configs from existing data
            const existing: SubjectConfig[] = (esData.examSubjects || []).map((es: ExamSubject) => ({
                subjectId: es.subject_id,
                subjectName: es.subject_name,
                subjectCode: es.subject_code,
                totalMaxMarks: es.total_max_marks,
                passingMarks: es.passing_marks,
                components: es.components.map((c: ExamSubjectComponent) => ({
                    componentId: c.component_id,
                    componentName: c.component_name,
                    maxMarks: c.max_marks,
                })),
            }));
            setConfigs(existing);
        } catch { /* ignore */ }
    }, [examId]);

    useEffect(() => {
        if (selectedClassId) fetchSubjectsForClass(selectedClassId);
    }, [selectedClassId, fetchSubjectsForClass]);

    const addSubject = (subjectId: string) => {
        const sub = availableSubjects.find(s => s.id === subjectId);
        if (!sub || configs.some(c => c.subjectId === subjectId)) return;
        setConfigs(prev => [...prev, {
            subjectId: sub.id, subjectName: sub.name, subjectCode: sub.code,
            totalMaxMarks: 100, passingMarks: 33, components: [], isNew: true,
        }]);
    };

    const removeSubject = (subjectId: string) => {
        setConfigs(prev => prev.filter(c => c.subjectId !== subjectId));
    };

    const updateConfig = (subjectId: string, field: string, value: number) => {
        setConfigs(prev => prev.map(c => c.subjectId === subjectId ? { ...c, [field]: value } : c));
    };

    const addComponent = (subjectId: string, componentId: string) => {
        const comp = markComponents.find(c => c.id === componentId);
        if (!comp) return;
        setConfigs(prev => prev.map(c => {
            if (c.subjectId !== subjectId) return c;
            if (c.components.some(x => x.componentId === componentId)) return c;
            return { ...c, components: [...c.components, { componentId: comp.id, componentName: comp.name, maxMarks: 0 }] };
        }));
    };

    const removeComponent = (subjectId: string, componentId: string) => {
        setConfigs(prev => prev.map(c => {
            if (c.subjectId !== subjectId) return c;
            return { ...c, components: c.components.filter(x => x.componentId !== componentId) };
        }));
    };

    const updateComponentMarks = (subjectId: string, componentId: string, maxMarks: number) => {
        setConfigs(prev => prev.map(c => {
            if (c.subjectId !== subjectId) return c;
            return { ...c, components: c.components.map(x => x.componentId === componentId ? { ...x, maxMarks } : x) };
        }));
    };

    const handleSave = async () => {
        if (!selectedClassId || configs.length === 0) return;
        setSaving(true); setError(''); setSuccess('');
        const token = localStorage.getItem('token')!;
        try {
            const subjects = configs.map(c => ({
                subjectId: c.subjectId, totalMaxMarks: c.totalMaxMarks, passingMarks: c.passingMarks,
                components: c.components.map((comp, i) => ({ componentId: comp.componentId, maxMarks: comp.maxMarks, displayOrder: i + 1 })),
            }));
            const res = await fetch('/api/exams/subjects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ examId, classId: selectedClassId, subjects }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to save'); }
            else { setSuccess('Subject configuration saved successfully!'); fetchSubjectsForClass(selectedClassId); }
        } catch { setError('Network error'); }
        setSaving(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };
    const unconfiguredSubjects = availableSubjects.filter(s => !configs.some(c => c.subjectId === s.id));

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-5xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-purple-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-rose-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10">
                        <button onClick={() => router.push('/manage/exams')} className="flex items-center gap-1 text-purple-300 hover:text-white text-sm mb-3 transition-colors">
                            <ArrowLeft className="w-4 h-4" /> Back to Exams
                        </button>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-purple-400 font-semibold tracking-wide uppercase text-sm">Configure Subjects</span>
                        </div>
                        <h1 className="text-2xl font-bold mb-1 flex items-center gap-3">
                            {examName || 'Exam'} <Settings2 className="w-6 h-6 text-purple-400" />
                        </h1>
                        <p className="text-purple-100 text-sm">Select a class, then add subjects with their mark components.</p>
                    </div>
                </div>

                {/* Class Selector */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6 shadow-sm">
                    <Label className="text-sm font-bold text-gray-700 mb-2 block">Select Class</Label>
                    <select value={selectedClassId} onChange={e => { setSelectedClassId(e.target.value); setConfigs([]); }}
                        className="w-full sm:w-72 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-purple-500 outline-none">
                        <option value="">-- Choose a class --</option>
                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>

                {/* Messages */}
                {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}
                {success && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {success}</div>}

                {selectedClassId && (
                    <>
                        {/* Add Subject */}
                        {unconfiguredSubjects.length > 0 && (
                            <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6 shadow-sm">
                                <Label className="text-sm font-bold text-gray-700 mb-2 block">Add Subject</Label>
                                <div className="flex flex-wrap gap-2">
                                    {unconfiguredSubjects.map(s => (
                                        <button key={s.id} onClick={() => addSubject(s.id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-100 transition-colors border border-purple-200">
                                            <Plus className="w-3.5 h-3.5" /> {s.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Subject Configs */}
                        {configs.length > 0 ? (
                            <div className="space-y-4 mb-6">
                                {configs.map(config => (
                                    <div key={config.subjectId} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <h3 className="font-bold text-gray-900">{config.subjectName}</h3>
                                                <span className="text-xs text-gray-400">{config.subjectCode}</span>
                                            </div>
                                            <button onClick={() => removeSubject(config.subjectId)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                                            <div>
                                                <Label className="text-xs">Total Max Marks</Label>
                                                <Input type="number" min="1" value={config.totalMaxMarks} onChange={e => updateConfig(config.subjectId, 'totalMaxMarks', parseInt(e.target.value) || 0)} className="mt-1" />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Passing Marks</Label>
                                                <Input type="number" min="0" value={config.passingMarks} onChange={e => updateConfig(config.subjectId, 'passingMarks', parseInt(e.target.value) || 0)} className="mt-1" />
                                            </div>
                                        </div>

                                        {/* Components */}
                                        <div className="border-t border-gray-100 pt-3">
                                            <Label className="text-xs font-bold text-gray-500 mb-2 block">Mark Components (optional)</Label>
                                            {config.components.length > 0 && (
                                                <div className="space-y-2 mb-3">
                                                    {config.components.map(comp => (
                                                        <div key={comp.componentId} className="flex items-center gap-3 bg-gray-50 rounded-lg p-2.5">
                                                            <span className="text-sm font-medium text-gray-700 w-32 truncate">{comp.componentName}</span>
                                                            <Input type="number" min="0" value={comp.maxMarks} placeholder="Max"
                                                                onChange={e => updateComponentMarks(config.subjectId, comp.componentId, parseInt(e.target.value) || 0)}
                                                                className="w-24 h-8 text-sm" />
                                                            <span className="text-xs text-gray-400">marks</span>
                                                            <button onClick={() => removeComponent(config.subjectId, comp.componentId)} className="ml-auto text-gray-400 hover:text-red-500">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex flex-wrap gap-1.5">
                                                {markComponents.filter(mc => !config.components.some(c => c.componentId === mc.id)).map(mc => (
                                                    <button key={mc.id} onClick={() => addComponent(config.subjectId, mc.id)}
                                                        className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 font-medium transition-colors">
                                                        + {mc.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* Save Button */}
                                <div className="flex justify-end">
                                    <Button onClick={handleSave} disabled={saving} className="bg-purple-600 hover:bg-purple-700 text-white gap-2 px-6 shadow-lg">
                                        <Save className="w-4 h-4" />
                                        {saving ? 'Saving...' : 'Save Configuration'}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                                <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500 text-sm">No subjects configured for this class yet. Add subjects above to start.</p>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
