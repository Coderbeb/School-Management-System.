'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import {
    CalendarDays, Loader2, Plus, X, Edit2, Trash2,
    Save, AlertTriangle, CheckCircle, RefreshCw, User, BookOpen, Clock
} from 'lucide-react';

interface UserItem { id: string; email: string; firstName: string; lastName: string; role: string; schoolId?: string; }
interface Teacher { id: string; first_name: string; last_name: string; phone?: string; }
interface Subject { id: string; name: string; code: string; }
interface Session { id: string; name: string; is_current: boolean; }
interface ClassSection { id: string; class_id: string; class_name: string; name: string; }

interface Period {
    id?: string; period_number: number; start_time: string; end_time: string;
    is_break: boolean; label: string;
}

interface DayTemplate {
    id: string; name: string; periods: Period[];
}

interface TimetableEntry {
    id?: string; day_of_week: number; period_id: string; class_section_id: string;
    subject_id: string; teacher_id: string | null;
    subject_name?: string; subject_code?: string;
    class_name?: string; section_name?: string;
    teacher_name?: string;
}

const DAYS = [
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
];

export default function TimetablePage() {
    const router = useRouter();
    const [user, setUser] = useState<UserItem | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [tab, setTab] = useState<'grid' | 'periods' | 'teacher'>('grid');
    const [loading, setLoading] = useState(true);

    const [sessions, setSessions] = useState<Session[]>([]);
    const [currentSession, setCurrentSession] = useState<Session | null>(null);
    const [classSections, setClassSections] = useState<ClassSection[]>([]);
    const [selectedSectionId, setSelectedSectionId] = useState('');

    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [selectedTeacherId, setSelectedTeacherId] = useState('');

    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [templates, setTemplates] = useState<DayTemplate[]>([]);
    const [activeTemplate, setActiveTemplate] = useState<DayTemplate | null>(null);

    // Timetable Grid Data
    const [entries, setEntries] = useState<TimetableEntry[]>([]);
    const [teacherEntries, setTeacherEntries] = useState<TimetableEntry[]>([]);

    // State for placing a subject/teacher in a cell
    const [activeCell, setActiveCell] = useState<{ day: number; periodId: string } | null>(null);
    const [cellSubjectId, setCellSubjectId] = useState('');
    const [cellTeacherId, setCellTeacherId] = useState('');

    // Period timing form modal
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<DayTemplate | null>(null);
    const [templateForm, setTemplateForm] = useState<{
        id?: string; name: string; periods: {
            id?: string; period_number: number; startTime: string; endTime: string;
            isBreak: boolean; label: string;
        }[]
    }>({
        name: '', periods: []
    });

    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [clashes, setClashes] = useState<string[]>([]);

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    }), [token]);

    const fetchData = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const hdrs = headers();
            // Fetch configuration/master data
            const [sessRes, teachRes, subRes, tplRes] = await Promise.all([
                fetch('/api/manage/sessions', { headers: hdrs }),
                fetch('/api/manage/teachers', { headers: hdrs }),
                fetch('/api/manage/subjects', { headers: hdrs }),
                fetch('/api/timetable/periods', { headers: hdrs }),
            ]);

            const [sessData, teachData, subData, tplData] = await Promise.all([
                sessRes.json(), teachRes.json(), subRes.json(), tplRes.json()
            ]);

            const activeSess = sessData.sessions?.find((s: Session) => s.is_current) || sessData.sessions?.[0] || null;
            setSessions(sessData.sessions || []);
            setCurrentSession(activeSess);
            setTeachers(teachData.teachers || []);
            setSubjects(subData.subjects || []);
            
            const loadedTemplates = tplData.templates || [];
            setTemplates(loadedTemplates);
            if (loadedTemplates.length > 0) {
                setActiveTemplate(loadedTemplates[0]);
            }

            // Fetch class sections for active session
            if (activeSess) {
                const sectRes = await fetch(`/api/manage/class-sections?sessionId=${activeSess.id}`, { headers: hdrs });
                const sectData = await sectRes.json();
                const sections = sectData.classSections || [];
                setClassSections(sections);
                if (sections.length > 0) {
                    setSelectedSectionId(sections[0].id);
                }
            }
        } catch (err) {
            console.error('Error fetching configuration', err);
        }
        setLoading(false);
    }, [token, headers]);

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (!['developer', 'super_admin'].includes(parsed.role)) { router.replace('/dashboard'); return; }
        setUser(parsed);
    }, [router, token]);

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user, fetchData]);

    // Fetch entries when selected class section changes
    useEffect(() => {
        if (!selectedSectionId || !token) return;
        const loadEntries = async () => {
            try {
                const res = await fetch(`/api/timetable/entries?classSectionId=${selectedSectionId}`, {
                    headers: headers()
                });
                if (res.ok) {
                    const data = await res.json();
                    setEntries(data.entries || []);
                }
            } catch (err) {
                console.error(err);
            }
        };
        loadEntries();
    }, [selectedSectionId, token, headers]);

    // Fetch entries when selected teacher changes
    useEffect(() => {
        if (!selectedTeacherId || !token) return;
        const loadTeacherEntries = async () => {
            try {
                const res = await fetch(`/api/timetable/entries?teacherId=${selectedTeacherId}`, {
                    headers: headers()
                });
                if (res.ok) {
                    const data = await res.json();
                    setTeacherEntries(data.entries || []);
                }
            } catch (err) {
                console.error(err);
            }
        };
        loadTeacherEntries();
    }, [selectedTeacherId, token, headers]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    // --- Timetable Cell Management ---
    const handleCellClick = (day: number, periodId: string) => {
        // Find existing entry
        const existing = entries.find(e => e.day_of_week === day && e.period_id === periodId);
        setCellSubjectId(existing?.subject_id || '');
        setCellTeacherId(existing?.teacher_id || '');
        setActiveCell({ day, periodId });
    };

    const applyCellChanges = () => {
        if (!activeCell) return;
        const { day, periodId } = activeCell;

        if (!cellSubjectId) {
            // Remove entry
            setEntries(prev => prev.filter(e => !(e.day_of_week === day && e.period_id === periodId)));
        } else {
            const subject = subjects.find(s => s.id === cellSubjectId);
            const teacher = teachers.find(t => t.id === cellTeacherId);

            const newEntry: TimetableEntry = {
                day_of_week: day,
                period_id: periodId,
                class_section_id: selectedSectionId,
                subject_id: cellSubjectId,
                teacher_id: cellTeacherId || null,
                subject_name: subject?.name,
                subject_code: subject?.code,
                teacher_name: teacher ? `${teacher.first_name} ${teacher.last_name}` : undefined
            };

            setEntries(prev => {
                const filtered = prev.filter(e => !(e.day_of_week === day && e.period_id === periodId));
                return [...filtered, newEntry];
            });
        }
        setActiveCell(null);
    };

    const saveTimetable = async () => {
        setSaving(true);
        setError('');
        setClashes([]);
        setSuccess('');
        try {
            const res = await fetch('/api/timetable/entries', {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({
                    classSectionId: selectedSectionId,
                    entries: entries.map(e => ({
                        dayOfWeek: e.day_of_week,
                        periodId: e.period_id,
                        subjectId: e.subject_id,
                        teacherId: e.teacher_id
                    }))
                })
            });

            const data = await res.json();
            if (!res.ok) {
                if (data.clashes) {
                    setClashes(data.clashes);
                    throw new Error('Timetable scheduling conflict detected. Please resolve clashes.');
                }
                throw new Error(data.error || 'Failed to save timetable');
            }

            setSuccess('Timetable saved successfully!');
            // Reload database state
            const refreshRes = await fetch(`/api/timetable/entries?classSectionId=${selectedSectionId}`, { headers: headers() });
            const refreshData = await refreshRes.json();
            setEntries(refreshData.entries || []);
        } catch (err: any) {
            setError(err.message || 'Error saving timetable');
        }
        setSaving(false);
    };

    // --- Period Config Handlers ---
    const openAddTemplate = () => {
        setEditingTemplate(null);
        setTemplateForm({
            name: '',
            periods: [
                { period_number: 1, startTime: '08:00', endTime: '08:45', isBreak: false, label: 'Period 1' },
                { period_number: 2, startTime: '08:45', endTime: '09:30', isBreak: false, label: 'Period 2' }
            ]
        });
        setError('');
        setShowTemplateModal(true);
    };

    const openEditTemplate = (tpl: DayTemplate) => {
        setEditingTemplate(tpl);
        setTemplateForm({
            id: tpl.id,
            name: tpl.name,
            periods: tpl.periods.map(p => ({
                id: p.id,
                period_number: p.period_number,
                startTime: p.start_time ? p.start_time.slice(0, 5) : '',
                endTime: p.end_time ? p.end_time.slice(0, 5) : '',
                isBreak: p.is_break,
                label: p.label
            }))
        });
        setError('');
        setShowTemplateModal(true);
    };

    const addPeriodRow = () => {
        setTemplateForm(prev => {
            const nextNum = prev.periods.length + 1;
            const last = prev.periods[prev.periods.length - 1];
            return {
                ...prev,
                periods: [
                    ...prev.periods,
                    {
                        period_number: nextNum,
                        startTime: last ? last.endTime : '10:00',
                        endTime: last ? '10:45' : '10:45',
                        isBreak: false,
                        label: `Period ${nextNum}`
                    }
                ]
            };
        });
    };

    const removePeriodRow = (idx: number) => {
        setTemplateForm(prev => {
            const newPeriods = prev.periods.filter((_, i) => i !== idx);
            return {
                ...prev,
                periods: newPeriods.map((p, i) => ({ ...p, period_number: i + 1 }))
            };
        });
    };

    const saveTemplate = async () => {
        setSaving(true);
        setError('');
        try {
            const body = {
                templateId: templateForm.id,
                templateName: templateForm.name,
                periods: templateForm.periods.map((p, idx) => ({
                    ...p,
                    periodNumber: idx + 1
                }))
            };
            const res = await fetch('/api/timetable/periods', {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save configuration');
            setSuccess('Timetable day configuration saved successfully!');
            setShowTemplateModal(false);
            fetchData();
        } catch (err: any) {
            setError(err.message || 'Error saving template');
        }
        setSaving(false);
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-7xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 text-white p-6 sm:p-8 mb-6 shadow-2xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-pink-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-indigo-500 rounded-full mix-blend-screen filter blur-3xl opacity-20"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <CalendarDays className="w-4 h-4 text-pink-400" />
                                <span className="text-pink-400 font-bold tracking-wider uppercase text-xs">Timetable</span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-black">Timetable Management</h1>
                            <p className="text-purple-200 text-sm mt-1">Configure class period timings, assign subjects, teachers and resolve clashes</p>
                        </div>
                        {tab === 'periods' && (
                            <Button onClick={openAddTemplate} className="bg-pink-500 hover:bg-pink-600 text-white gap-2 shadow-lg h-10">
                                <Plus className="w-4 h-4" /> Create Timetable Template
                            </Button>
                        )}
                        {tab === 'grid' && (
                            <Button onClick={saveTimetable} disabled={saving || !selectedSectionId} className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2 shadow-lg h-10">
                                <Save className="w-4 h-4" /> Save Timetable
                            </Button>
                        )}
                    </div>
                </div>

                {/* Notifications & Clashes */}
                {success && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center justify-between shadow-sm">
                        <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {success}</span>
                        <button onClick={() => setSuccess('')}><X className="w-4 h-4" /></button>
                    </div>
                )}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex flex-col gap-2 shadow-sm">
                        <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500 shrink-0" /> {error}</div>
                        {clashes.length > 0 && (
                            <ul className="list-disc pl-6 space-y-1 text-xs text-red-600 font-medium">
                                {clashes.map((c, i) => <li key={i}>{c}</li>)}
                            </ul>
                        )}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex items-center gap-1 bg-white rounded-xl p-1 border border-gray-200 mb-5 w-fit">
                    <button onClick={() => setTab('grid')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'grid' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <CalendarDays className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Class Timetable
                    </button>
                    <button onClick={() => setTab('periods')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'periods' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <Clock className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Period Timings
                    </button>
                    <button onClick={() => setTab('teacher')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'teacher' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <User className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Teacher View
                    </button>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                        <p className="text-gray-400 text-sm">Loading timetable configurations...</p>
                    </div>
                ) : (
                    <>
                        {/* CLASS TIMETABLE GRID BUILDER */}
                        {tab === 'grid' && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                                    <div className="flex items-center gap-3">
                                        <div>
                                            <label className="text-xs font-bold text-gray-400 block mb-1">Select Class Section</label>
                                            <select value={selectedSectionId} onChange={e => setSelectedSectionId(e.target.value)}
                                                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500">
                                                {classSections.map(cs => (
                                                    <option key={cs.id} value={cs.id}>{cs.class_name} - {cs.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-400 block mb-1">Timing template</label>
                                            <select value={activeTemplate?.id || ''} onChange={e => {
                                                const t = templates.find(tpl => tpl.id === e.target.value);
                                                if (t) setActiveTemplate(t);
                                            }}
                                                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500">
                                                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2 max-w-sm">
                                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                        <span>Click on any time cell to assign subject and teacher. Press <strong>Save Timetable</strong> above to apply changes.</span>
                                    </div>
                                </div>

                                {activeTemplate && activeTemplate.periods?.length > 0 ? (
                                    <div className="overflow-x-auto border border-gray-150 rounded-2xl">
                                        <table className="w-full text-center border-collapse text-xs select-none">
                                            <thead>
                                                <tr className="bg-gray-50 text-gray-500 font-bold uppercase border-b border-gray-150">
                                                    <th className="py-4 px-4 text-left border-r border-gray-150 font-black text-gray-800">Day</th>
                                                    {activeTemplate.periods.map(p => (
                                                        <th key={p.id} className="py-3 px-3 min-w-[120px] border-r border-gray-150">
                                                            <div className="font-black text-gray-800">{p.label}</div>
                                                            <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                                                                {p.start_time ? p.start_time.slice(0, 5) : ''} - {p.end_time ? p.end_time.slice(0, 5) : ''}
                                                            </div>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-150">
                                                {DAYS.map(d => (
                                                    <tr key={d.value} className="hover:bg-gray-50/30">
                                                        <td className="py-4 px-4 text-left font-bold text-gray-900 border-r border-gray-150 bg-gray-50/50">
                                                            {d.label}
                                                        </td>
                                                        {activeTemplate.periods.map(p => {
                                                            if (p.is_break) {
                                                                return (
                                                                    <td key={p.id} className="py-3 px-3 bg-gray-100/60 text-gray-400 font-bold italic border-r border-gray-150 font-sans tracking-wide">
                                                                        {p.label || 'BREAK'}
                                                                    </td>
                                                                );
                                                            }

                                                            const entry = entries.find(e => e.day_of_week === d.value && e.period_id === p.id);

                                                            return (
                                                                <td key={p.id} onClick={() => handleCellClick(d.value, p.id || '')}
                                                                    className={`py-3 px-3 border-r border-gray-150 cursor-pointer hover:bg-indigo-50/30 transition-colors relative group min-h-[72px] ${
                                                                        entry ? 'bg-indigo-50/15' : ''
                                                                    }`}>
                                                                    {entry ? (
                                                                        <div className="space-y-1 text-center">
                                                                            <div className="font-extrabold text-indigo-700 text-sm">{entry.subject_name}</div>
                                                                            {entry.teacher_name && (
                                                                                <div className="text-[10px] text-gray-500 font-medium flex items-center justify-center gap-1">
                                                                                    <User className="w-3 h-3 text-gray-400" />
                                                                                    {entry.teacher_name}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-[10px] text-gray-300 font-semibold uppercase opacity-0 group-hover:opacity-100 transition-opacity">Assign</span>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <EmptyState icon={<Clock className="w-12 h-12" />} text="No periods defined in the selected Day Template. Please edit Period Timings." />
                                )}
                            </div>
                        )}

                        {/* PERIOD TIMINGS CONFIG */}
                        {tab === 'periods' && (
                            <div className="space-y-6">
                                {templates.map(tpl => (
                                    <div key={tpl.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                        <div className="flex justify-between items-center border-b border-gray-50 pb-4 mb-4">
                                            <div>
                                                <h3 className="text-lg font-black text-gray-900">{tpl.name}</h3>
                                                <p className="text-xs text-gray-400">{tpl.periods?.length || 0} periods configured</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm" onClick={() => openEditTemplate(tpl)} className="gap-1.5 h-9 text-xs">
                                                    <Edit2 className="w-3.5 h-3.5" /> Edit Template Timings
                                                </Button>
                                            </div>
                                        </div>

                                        {tpl.periods && tpl.periods.length > 0 ? (
                                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                                                {tpl.periods.map(p => (
                                                    <div key={p.id} className={`p-3 rounded-xl border text-center ${
                                                        p.is_break ? 'bg-amber-50/50 border-amber-100' : 'bg-gray-50 border-gray-200'
                                                    }`}>
                                                        <span className="text-[10px] uppercase font-bold text-gray-400">
                                                            {p.is_break ? 'Break' : `Slot ${p.period_number}`}
                                                        </span>
                                                        <h4 className="font-bold text-gray-800 text-sm mt-0.5">{p.label}</h4>
                                                        <p className="text-[11px] text-gray-500 font-mono mt-1">
                                                            {p.start_time ? p.start_time.slice(0, 5) : ''} - {p.end_time ? p.end_time.slice(0, 5) : ''}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-400 italic">No periods created for this template.</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* TEACHER VIEW */}
                        {tab === 'teacher' && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <div className="mb-6">
                                    <label className="text-xs font-bold text-gray-400 block mb-1">Select Teacher</label>
                                    <select value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)}
                                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 w-64">
                                        <option value="">Choose a teacher...</option>
                                        {teachers.map(t => (
                                            <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                                        ))}
                                    </select>
                                </div>

                                {selectedTeacherId ? (
                                    activeTemplate && activeTemplate.periods?.length > 0 ? (
                                        <div className="overflow-x-auto border border-gray-150 rounded-2xl">
                                            <table className="w-full text-center border-collapse text-xs">
                                                <thead>
                                                    <tr className="bg-gray-50 text-gray-500 font-bold uppercase border-b border-gray-150">
                                                        <th className="py-4 px-4 text-left border-r border-gray-150 font-black text-gray-800">Day</th>
                                                        {activeTemplate.periods.map(p => (
                                                            <th key={p.id} className="py-3 px-3 min-w-[120px] border-r border-gray-150">
                                                                <div className="font-black text-gray-800">{p.label}</div>
                                                                <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                                                                    {p.start_time ? p.start_time.slice(0, 5) : ''} - {p.end_time ? p.end_time.slice(0, 5) : ''}
                                                                </div>
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-150">
                                                    {DAYS.map(d => (
                                                        <tr key={d.value} className="hover:bg-gray-50/30">
                                                            <td className="py-4 px-4 text-left font-bold text-gray-900 border-r border-gray-150 bg-gray-50/50">
                                                                {d.label}
                                                            </td>
                                                            {activeTemplate.periods.map(p => {
                                                                if (p.is_break) {
                                                                    return (
                                                                        <td key={p.id} className="py-3 px-3 bg-gray-100/60 text-gray-400 font-bold italic border-r border-gray-150">
                                                                            {p.label || 'BREAK'}
                                                                        </td>
                                                                    );
                                                                }

                                                                const entry = teacherEntries.find(e => e.day_of_week === d.value && e.period_id === p.id);

                                                                return (
                                                                    <td key={p.id} className="py-3 px-3 border-r border-gray-150 min-h-[72px]">
                                                                        {entry ? (
                                                                            <div className="space-y-1">
                                                                                <div className="font-extrabold text-indigo-700 text-sm">{entry.subject_name}</div>
                                                                                <div className="text-[10px] text-gray-500 font-bold bg-indigo-50/50 px-2 py-0.5 rounded-full inline-block">
                                                                                    {entry.class_name} - {entry.section_name}
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-gray-300 italic">Free</span>
                                                                        )}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <EmptyState icon={<Clock className="w-12 h-12" />} text="No periods configured in the day template." />
                                    )
                                ) : (
                                    <EmptyState icon={<User className="w-12 h-12" />} text="Please select a teacher above to view their weekly timetable schedule." />
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* --- CELL ASSIGN POPOVER/MODAL --- */}
                {activeCell && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setActiveCell(null)}>
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                <h2 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                                    <CalendarDays className="w-4 h-4 text-indigo-600" />
                                    Assign Class Slot (Day {activeCell.day})
                                </h2>
                                <button onClick={() => setActiveCell(null)} className="p-1.5 hover:bg-gray-100 rounded-full"><X className="w-4 h-4 text-gray-400" /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Subject *</label>
                                    <select value={cellSubjectId} onChange={e => setCellSubjectId(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                                        <option value="">-- Clear / Free Period --</option>
                                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                                    </select>
                                </div>
                                {cellSubjectId && (
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Teacher</label>
                                        <select value={cellTeacherId} onChange={e => setCellTeacherId(e.target.value)}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                                            <option value="">No Teacher assigned</option>
                                            {teachers.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 rounded-b-3xl">
                                <Button variant="outline" onClick={() => setActiveCell(null)}>Cancel</Button>
                                <Button onClick={applyCellChanges} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4">
                                    Ok
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- CONFIG TEMPLATE MODAL --- */}
                {showTemplateModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowTemplateModal(false)}>
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-3xl z-10">
                                <h2 className="text-lg font-bold text-gray-900">{editingTemplate ? 'Edit Day Template Timings' : 'Create Day Template Timings'}</h2>
                                <button onClick={() => setShowTemplateModal(false)} className="p-1.5 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                {error && <div className="p-3 bg-red-50 border border-red-100 text-xs text-red-700 rounded-xl">{error}</div>}

                                <div>
                                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Template Name *</label>
                                    <input value={templateForm.name} onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Regular Day, Saturday, Half Day" />
                                </div>

                                <div className="border-t border-gray-100 pt-4">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><Clock className="w-4 h-4 text-indigo-500" /> Periods & Breaks List</h3>
                                        <button onClick={addPeriodRow} className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1">
                                            <Plus className="w-3.5 h-3.5" /> Add Period Slot
                                        </button>
                                    </div>

                                    <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                                        {templateForm.periods.map((p, idx) => (
                                            <div key={idx} className={`rounded-xl p-3.5 border flex items-start gap-3 ${
                                                p.isBreak ? 'bg-amber-50/50 border-amber-100' : 'bg-gray-50 border-gray-200'
                                            }`}>
                                                <span className={`font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-2 ${
                                                    p.isBreak ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                                                }`}>{idx + 1}</span>

                                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 flex-1">
                                                    <div className="sm:col-span-2">
                                                        <label className="text-[10px] text-gray-400 font-bold block mb-0.5">Label / Name *</label>
                                                        <input value={p.label} onChange={e => {
                                                            const copy = [...templateForm.periods];
                                                            copy[idx].label = e.target.value;
                                                            setTemplateForm({ ...templateForm, periods: copy });
                                                        }}
                                                            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="e.g. Period 1, Lunch" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 font-bold block mb-0.5">Start / End Time *</label>
                                                        <div className="flex gap-1">
                                                            <input type="text" placeholder="08:00" value={p.startTime} onChange={e => {
                                                                const copy = [...templateForm.periods];
                                                                copy[idx].startTime = e.target.value;
                                                                setTemplateForm({ ...templateForm, periods: copy });
                                                            }}
                                                                className="w-full px-1.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-center focus:ring-1 focus:ring-indigo-500 outline-none" />
                                                            <input type="text" placeholder="08:45" value={p.endTime} onChange={e => {
                                                                const copy = [...templateForm.periods];
                                                                copy[idx].endTime = e.target.value;
                                                                setTemplateForm({ ...templateForm, periods: copy });
                                                            }}
                                                                className="w-full px-1.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-center focus:ring-1 focus:ring-indigo-500 outline-none" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 font-bold block mb-0.5">Type</label>
                                                        <select value={p.isBreak ? 'true' : 'false'} onChange={e => {
                                                            const copy = [...templateForm.periods];
                                                            copy[idx].isBreak = e.target.value === 'true';
                                                            copy[idx].label = e.target.value === 'true' ? 'Lunch Break' : `Period ${idx + 1}`;
                                                            setTemplateForm({ ...templateForm, periods: copy });
                                                        }}
                                                            className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none font-semibold">
                                                            <option value="false">Period Slot</option>
                                                            <option value="true">Break Slot</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <button onClick={() => removePeriodRow(idx)} disabled={templateForm.periods.length <= 1}
                                                    className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg disabled:opacity-50 mt-1">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white rounded-b-3xl z-10">
                                <Button variant="outline" onClick={() => setShowTemplateModal(false)}>Cancel</Button>
                                <Button onClick={saveTemplate} disabled={saving || !templateForm.name || templateForm.periods.some(p => !p.label || !p.startTime || !p.endTime)}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Save Template
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200 shadow-sm">
            <div className="text-gray-300 mx-auto mb-3 flex justify-center">{icon}</div>
            <p className="text-gray-500 text-sm max-w-sm mx-auto font-medium">{text}</p>
        </div>
    );
}
