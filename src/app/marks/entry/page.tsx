'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { PenLine, Save, Send, ChevronDown, AlertCircle, CheckCircle, Loader2, Plus } from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface ExamOption { id: string; name: string; is_entry_open: boolean; is_locked: boolean; }
interface ClassSectionOption { id: string; class_name: string; section_name: string; }
interface SubjectOption { id: string; name: string; code: string; }
interface StudentRow { student_id: string; student_name: string; admission_number: string; roll_number: number | null; }
interface ComponentDef { id: string; component_id: string; component_name: string; short_name: string; max_marks: number; }

interface MarkEntry {
    studentId: string;
    componentId: string | null;
    marksObtained: string;
    status: string;
}

export default function MarksEntryPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Selection state
    const [exams, setExams] = useState<ExamOption[]>([]);
    const [classSections, setClassSections] = useState<ClassSectionOption[]>([]);
    const [subjects, setSubjects] = useState<SubjectOption[]>([]);
    const [selectedExam, setSelectedExam] = useState('');
    const [selectedClassSection, setSelectedClassSection] = useState('');
    const [selectedSubject, setSelectedSubject] = useState('');

    // Grid data
    const [students, setStudents] = useState<StudentRow[]>([]);
    const [components, setComponents] = useState<ComponentDef[]>([]);
    const [marksData, setMarksData] = useState<Record<string, Record<string, { marks_obtained: number | null; status: string }>>>({});
    const [examSubject, setExamSubject] = useState<{ total_max_marks: number; passing_marks: number } | null>(null);
    const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);

    // UI state
    const [loading, setLoading] = useState(true);
    const [loadingGrid, setLoadingGrid] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showQuickTest, setShowQuickTest] = useState(false);
    const [quickTestName, setQuickTestName] = useState('');
    const [quickTestMaxMarks, setQuickTestMaxMarks] = useState('25');

    // Local edits tracking
    const [localMarks, setLocalMarks] = useState<Record<string, Record<string, { value: string; status: string }>>>({});
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        setUser(parsed);
        fetchExams(token, parsed.role);
        setLoading(false);
    }, [router]);

    const fetchExams = async (token: string, role: string) => {
        try {
            const res = await fetch('/api/exams', { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            const filtered = (data.exams || []).filter((e: ExamOption) => role === 'teacher' ? e.is_entry_open && !e.is_locked : true);
            setExams(filtered);
        } catch { /* ignore */ }
    };

    const fetchClassSections = async (examId: string) => {
        const token = localStorage.getItem('token')!;
        try {
            // For teachers, fetch their assigned class-sections; for admin, all
            const res = await fetch(`/api/manage/class-sections?withEnrollments=true`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            setClassSections(data.classSections || []);
        } catch { /* ignore */ }
    };

    const fetchSubjects = async (classSectionId: string) => {
        const token = localStorage.getItem('token')!;
        try {
            const res = await fetch(`/api/subjects?classSectionId=${classSectionId}`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            setSubjects(data.subjects || []);
        } catch { /* ignore */ }
    };

    const loadMarksGrid = useCallback(async () => {
        if (!selectedExam || !selectedClassSection || !selectedSubject) return;
        setLoadingGrid(true); setError(''); setSuccess('');
        const token = localStorage.getItem('token')!;
        try {
            const res = await fetch(
                `/api/marks/entry?examId=${selectedExam}&classSectionId=${selectedClassSection}&subjectId=${selectedSubject}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to load marks'); setLoadingGrid(false); return; }

            setStudents(data.students || []);
            setComponents(data.components || []);
            setMarksData(data.marksMap || {});
            setExamSubject(data.examSubject || null);
            setSubmissionStatus(data.submission?.status || null);

            // Initialize local marks from existing data
            const local: Record<string, Record<string, { value: string; status: string }>> = {};
            for (const student of (data.students || [])) {
                local[student.student_id] = {};
                const studentMarks = data.marksMap?.[student.student_id] || {};
                if ((data.components || []).length > 0) {
                    for (const comp of data.components) {
                        const key = comp.component_id;
                        const existing = studentMarks[key];
                        local[student.student_id][key] = {
                            value: existing?.status === 'scored' && existing?.marks_obtained != null ? String(existing.marks_obtained) : '',
                            status: existing?.status || 'scored',
                        };
                    }
                } else {
                    const existing = studentMarks['total'];
                    local[student.student_id]['total'] = {
                        value: existing?.status === 'scored' && existing?.marks_obtained != null ? String(existing.marks_obtained) : '',
                        status: existing?.status || 'scored',
                    };
                }
            }
            setLocalMarks(local);
        } catch { setError('Failed to load marks grid'); }
        setLoadingGrid(false);
    }, [selectedExam, selectedClassSection, selectedSubject]);

    useEffect(() => { loadMarksGrid(); }, [loadMarksGrid]);

    const handleMarkChange = (studentId: string, key: string, value: string) => {
        setLocalMarks(prev => ({
            ...prev,
            [studentId]: { ...prev[studentId], [key]: { ...prev[studentId]?.[key], value, status: 'scored' } },
        }));
    };

    const handleStatusToggle = (studentId: string, key: string) => {
        setLocalMarks(prev => {
            const current = prev[studentId]?.[key]?.status || 'scored';
            const next = current === 'scored' ? 'absent' : current === 'absent' ? 'medical' : 'scored';
            return {
                ...prev,
                [studentId]: { ...prev[studentId], [key]: { value: next === 'scored' ? prev[studentId]?.[key]?.value || '' : '', status: next } },
            };
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent, studentIndex: number, compKey: string) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            const nextStudent = students[studentIndex + 1];
            if (nextStudent) {
                const nextKey = `${nextStudent.student_id}-${compKey}`;
                inputRefs.current[nextKey]?.focus();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevStudent = students[studentIndex - 1];
            if (prevStudent) {
                const prevKey = `${prevStudent.student_id}-${compKey}`;
                inputRefs.current[prevKey]?.focus();
            }
        }
    };

    const buildMarksPayload = (): MarkEntry[] => {
        const entries: MarkEntry[] = [];
        for (const studentId of Object.keys(localMarks)) {
            for (const key of Object.keys(localMarks[studentId])) {
                const { value, status } = localMarks[studentId][key];
                entries.push({
                    studentId,
                    componentId: key === 'total' ? null : key,
                    marksObtained: status === 'scored' ? value : '',
                    status,
                });
            }
        }
        return entries;
    };

    const saveMarks = async (action: 'draft' | 'submit') => {
        setSaving(true); setError(''); setSuccess('');
        const token = localStorage.getItem('token')!;
        try {
            const res = await fetch('/api/marks/entry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    examId: selectedExam, classSectionId: selectedClassSection,
                    subjectId: selectedSubject, marks: buildMarksPayload(), action,
                }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to save'); }
            else {
                setSuccess(data.message || 'Saved!');
                setSubmissionStatus(data.status);
            }
        } catch { setError('Network error'); }
        setSaving(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const getMaxForKey = (key: string): number => {
        if (key === 'total') return examSubject?.total_max_marks || 100;
        const comp = components.find(c => c.component_id === key);
        return comp?.max_marks || 100;
    };

    const getStudentTotal = (studentId: string): { total: number; maxTotal: number } => {
        const studentLocal = localMarks[studentId] || {};
        let total = 0;
        let maxTotal = examSubject?.total_max_marks || 0;
        if (components.length > 0) {
            maxTotal = components.reduce((sum, c) => sum + c.max_marks, 0);
            for (const comp of components) {
                const entry = studentLocal[comp.component_id];
                if (entry?.status === 'scored' && entry.value) total += parseFloat(entry.value) || 0;
            }
        } else {
            const entry = studentLocal['total'];
            if (entry?.status === 'scored' && entry.value) total = parseFloat(entry.value) || 0;
        }
        return { total, maxTotal };
    };

    const columnKeys = components.length > 0 ? components.map(c => c.component_id) : ['total'];

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-6xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10">
                        <span className="text-emerald-400 font-semibold tracking-wide uppercase text-sm">Marks Management</span>
                        <h1 className="text-2xl font-bold mt-1 mb-2 flex items-center gap-3">
                            Marks Entry <PenLine className="w-6 h-6 text-emerald-400" />
                        </h1>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <p className="text-emerald-100 text-sm max-w-xl">Select an exam, class, and subject to start entering marks. Use Enter/Arrow keys for fast navigation.</p>
                            {user?.role === 'teacher' && (
                                <button onClick={() => setShowQuickTest(!showQuickTest)}
                                    className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-400/30 rounded-lg text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 transition-colors flex items-center gap-1.5 whitespace-nowrap">
                                    <Plus className="w-3.5 h-3.5" /> Quick Class Test
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Quick Test Form (Teachers) */}
                {showQuickTest && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 mb-6 space-y-3">
                        <h3 className="font-bold text-emerald-900 text-sm">⚡ Quick Class Test</h3>
                        <p className="text-xs text-emerald-600">Create an informal test — it will be immediately available for marks entry. Not included in formal results.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Test Name *</label>
                                <input value={quickTestName} onChange={e => setQuickTestName(e.target.value)} placeholder="e.g., Weekly Quiz 3"
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Max Marks</label>
                                <input type="number" min="1" value={quickTestMaxMarks} onChange={e => setQuickTestMaxMarks(e.target.value)}
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                            </div>
                            <div className="flex items-end gap-2">
                                <Button onClick={async () => {
                                    if (!quickTestName.trim()) return;
                                    const token = localStorage.getItem('token');
                                    if (!token) return;
                                    setSaving(true); setError('');
                                    try {
                                        const sessRes = await fetch('/api/sessions', { headers: { Authorization: `Bearer ${token}` } });
                                        const sessData = await sessRes.json();
                                        const currentSession = (sessData.sessions || []).find((s: any) => s.is_current);
                                        if (!currentSession) { setError('No active session'); setSaving(false); return; }
                                        const res = await fetch('/api/exams', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                            body: JSON.stringify({
                                                name: quickTestName, examCategory: 'class_test',
                                                sessionId: currentSession.id, isTeacherTest: true,
                                                generatesReportCard: false, weightage: parseInt(quickTestMaxMarks) || 25,
                                            }),
                                        });
                                        const data = await res.json();
                                        if (!res.ok) { setError(data.error || 'Failed'); } else {
                                            setSuccess('Test created! Select it from the exam dropdown to enter marks.');
                                            setShowQuickTest(false); setQuickTestName('');
                                            fetchExams(token, user?.role || '');
                                        }
                                    } catch { setError('Network error'); }
                                    setSaving(false);
                                }} disabled={saving || !quickTestName.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-[38px] gap-1.5">
                                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Create Test
                                </Button>
                                <Button onClick={() => setShowQuickTest(false)} variant="outline" className="text-xs h-[38px]">Cancel</Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Selection Bar */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Exam</label>
                            <div className="relative">
                                <select value={selectedExam} onChange={e => { setSelectedExam(e.target.value); setSelectedClassSection(''); setSelectedSubject(''); if (e.target.value) fetchClassSections(e.target.value); }}
                                    className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none appearance-none">
                                    <option value="">Select exam</option>
                                    {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-3 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Class</label>
                            <div className="relative">
                                <select value={selectedClassSection} onChange={e => { setSelectedClassSection(e.target.value); setSelectedSubject(''); if (e.target.value) fetchSubjects(e.target.value); }}
                                    disabled={!selectedExam}
                                    className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none appearance-none disabled:opacity-50">
                                    <option value="">Select class</option>
                                    {classSections.map(cs => <option key={cs.id} value={cs.id}>{cs.class_name} - {cs.section_name}</option>)}
                                </select>
                                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-3 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Subject</label>
                            <div className="relative">
                                <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
                                    disabled={!selectedClassSection}
                                    className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none appearance-none disabled:opacity-50">
                                    <option value="">Select subject</option>
                                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-3 pointer-events-none" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Messages */}
                {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}
                {success && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {success}</div>}

                {/* Marks Grid */}
                {loadingGrid ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                        <p className="text-gray-400 text-sm">Loading student data...</p>
                    </div>
                ) : students.length > 0 && examSubject ? (
                    <>
                        {/* Status bar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                                <span>{students.length} students</span>
                                <span>Max: {examSubject.total_max_marks}</span>
                                <span>Pass: {examSubject.passing_marks}</span>
                                {submissionStatus && (
                                    <span className={`px-2 py-0.5 rounded-full font-bold ${submissionStatus === 'submitted' ? 'bg-emerald-100 text-emerald-700' : submissionStatus === 'locked' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {submissionStatus.toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={() => saveMarks('draft')} disabled={saving || submissionStatus === 'locked'} variant="outline" className="gap-1.5 text-xs h-8">
                                    <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Draft'}
                                </Button>
                                <Button onClick={() => saveMarks('submit')} disabled={saving || submissionStatus === 'locked'} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs h-8">
                                    <Send className="w-3.5 h-3.5" /> Submit
                                </Button>
                            </div>
                        </div>

                        {/* Desktop Table */}
                        <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-100">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase w-12">#</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Student</th>
                                            {components.length > 0 ? components.map(c => (
                                                <th key={c.component_id} className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase w-28">
                                                    {c.short_name} ({c.max_marks})
                                                </th>
                                            )) : (
                                                <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase w-28">Marks ({examSubject.total_max_marks})</th>
                                            )}
                                            <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase w-20">Total</th>
                                            <th className="px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase w-16">%</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {students.map((student, sIdx) => {
                                            const { total, maxTotal } = getStudentTotal(student.student_id);
                                            const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
                                            const isPassing = total >= (examSubject?.passing_marks || 0);
                                            return (
                                                <tr key={student.student_id} className="hover:bg-gray-50/50">
                                                    <td className="px-4 py-2 text-gray-400 text-xs">{student.roll_number || sIdx + 1}</td>
                                                    <td className="px-4 py-2">
                                                        <div className="font-medium text-gray-900 text-sm">{student.student_name}</div>
                                                        {student.admission_number && <div className="text-xs text-gray-400">{student.admission_number}</div>}
                                                    </td>
                                                    {columnKeys.map(key => {
                                                        const entry = localMarks[student.student_id]?.[key];
                                                        const max = getMaxForKey(key);
                                                        const isInvalid = entry?.status === 'scored' && entry.value && parseFloat(entry.value) > max;
                                                        return (
                                                            <td key={key} className="px-2 py-1.5 text-center">
                                                                {entry?.status === 'absent' ? (
                                                                    <button onClick={() => handleStatusToggle(student.student_id, key)}
                                                                        className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-bold w-full hover:bg-red-200 transition-colors">AB</button>
                                                                ) : entry?.status === 'medical' ? (
                                                                    <button onClick={() => handleStatusToggle(student.student_id, key)}
                                                                        className="px-3 py-1.5 bg-amber-100 text-amber-600 rounded-lg text-xs font-bold w-full hover:bg-amber-200 transition-colors">ME</button>
                                                                ) : (
                                                                    <div className="relative">
                                                                        <input
                                                                            ref={el => { inputRefs.current[`${student.student_id}-${key}`] = el; }}
                                                                            type="number" min="0" max={max} step="0.5"
                                                                            value={entry?.value || ''}
                                                                            onChange={e => handleMarkChange(student.student_id, key, e.target.value)}
                                                                            onKeyDown={e => handleKeyDown(e, sIdx, key)}
                                                                            onDoubleClick={() => handleStatusToggle(student.student_id, key)}
                                                                            className={`w-full px-2 py-1.5 text-center text-sm font-medium rounded-lg border transition-colors outline-none
                                                                                ${isInvalid ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-500' : 'border-gray-200 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent'}
                                                                            `}
                                                                            placeholder="-"
                                                                            disabled={submissionStatus === 'locked'}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-3 py-2 text-center font-bold text-gray-900">{total || '-'}</td>
                                                    <td className={`px-3 py-2 text-center text-xs font-bold ${isPassing ? 'text-emerald-600' : 'text-red-500'}`}>
                                                        {total > 0 ? `${pct}%` : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Mobile Card View */}
                        <div className="sm:hidden space-y-3">
                            {students.map((student, sIdx) => {
                                const { total, maxTotal } = getStudentTotal(student.student_id);
                                const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
                                return (
                                    <div key={student.student_id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <span className="text-xs text-gray-400">#{student.roll_number || sIdx + 1}</span>
                                                <h4 className="font-bold text-gray-900 text-sm">{student.student_name}</h4>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-lg font-bold text-gray-900">{total || '-'}</div>
                                                <div className="text-xs text-gray-400">{pct}%</div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {columnKeys.map(key => {
                                                const entry = localMarks[student.student_id]?.[key];
                                                const max = getMaxForKey(key);
                                                const label = key === 'total' ? 'Marks' : components.find(c => c.component_id === key)?.short_name || key;
                                                return (
                                                    <div key={key}>
                                                        <label className="text-xs text-gray-500 font-medium">{label} (max {max})</label>
                                                        {entry?.status === 'absent' || entry?.status === 'medical' ? (
                                                            <button onClick={() => handleStatusToggle(student.student_id, key)}
                                                                className={`w-full mt-1 px-3 py-2 rounded-lg text-xs font-bold ${entry.status === 'absent' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                                                                {entry.status === 'absent' ? 'ABSENT' : 'MEDICAL'}
                                                            </button>
                                                        ) : (
                                                            <input type="number" min="0" max={max} step="0.5" value={entry?.value || ''}
                                                                onChange={e => handleMarkChange(student.student_id, key, e.target.value)}
                                                                onDoubleClick={() => handleStatusToggle(student.student_id, key)}
                                                                className="w-full mt-1 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                                                                placeholder="-" disabled={submissionStatus === 'locked'} />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Bottom Save Bar */}
                        <div className="sticky bottom-4 mt-6 flex justify-center gap-3">
                            <Button onClick={() => saveMarks('draft')} disabled={saving || submissionStatus === 'locked'} variant="outline" className="gap-2 shadow-lg bg-white">
                                <Save className="w-4 h-4" /> Save Draft
                            </Button>
                            <Button onClick={() => saveMarks('submit')} disabled={saving || submissionStatus === 'locked'} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-lg">
                                <Send className="w-4 h-4" /> Submit to Admin
                            </Button>
                        </div>
                    </>
                ) : selectedExam && selectedClassSection && selectedSubject && !loadingGrid ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">No data found. Make sure this subject is configured for the selected exam.</p>
                    </div>
                ) : null}
            </main>
        </div>
    );
}
