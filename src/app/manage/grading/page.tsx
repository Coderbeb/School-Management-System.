'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GraduationCap, Plus, Pencil, Trash2, Save, AlertCircle, CheckCircle, Star, ChevronDown, ChevronUp, X } from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface GradeDef { gradeName: string; minPercentage: number; maxPercentage: number; gradePoint: number; description: string; displayOrder: number; }
interface GradingScale {
    id: string; name: string; description: string; is_default: boolean;
    grades: { id: string; grade_name: string; min_percentage: number; max_percentage: number; grade_point: number; description: string; display_order: number; }[];
}

export default function ManageGradingPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [scales, setScales] = useState<GradingScale[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    const [form, setForm] = useState({ name: '', description: '', isDefault: false });
    const [grades, setGrades] = useState<GradeDef[]>([]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin' && parsed.role !== 'developer') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchScales(token);
    }, [router]);

    const fetchScales = async (token?: string) => {
        const t = token || localStorage.getItem('token')!;
        setLoading(true);
        try {
            const res = await fetch('/api/grading', { headers: { Authorization: `Bearer ${t}` } });
            const data = await res.json();
            setScales(data.gradingScales || []);
        } catch { /* ignore */ }
        setLoading(false);
    };

    const resetForm = () => {
        setShowForm(false); setEditingId(null); setError(''); setSuccess('');
        setForm({ name: '', description: '', isDefault: false });
        setGrades([]);
    };

    const addGradeRow = () => {
        setGrades(prev => [...prev, { gradeName: '', minPercentage: 0, maxPercentage: 100, gradePoint: 0, description: '', displayOrder: prev.length + 1 }]);
    };

    const removeGradeRow = (idx: number) => {
        setGrades(prev => prev.filter((_, i) => i !== idx));
    };

    const updateGrade = (idx: number, field: string, value: string | number) => {
        setGrades(prev => prev.map((g, i) => i === idx ? { ...g, [field]: value } : g));
    };

    const startEdit = (scale: GradingScale) => {
        setEditingId(scale.id);
        setForm({ name: scale.name, description: scale.description || '', isDefault: scale.is_default });
        setGrades(scale.grades.map(g => ({
            gradeName: g.grade_name, minPercentage: g.min_percentage, maxPercentage: g.max_percentage,
            gradePoint: g.grade_point, description: g.description || '', displayOrder: g.display_order,
        })));
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (grades.length === 0) { setError('Add at least one grade definition'); return; }
        setSaving(true); setError(''); setSuccess('');
        const token = localStorage.getItem('token')!;
        const method = editingId ? 'PUT' : 'POST';
        const body = {
            ...(editingId ? { id: editingId } : {}),
            name: form.name, description: form.description, isDefault: form.isDefault, grades,
        };
        try {
            const res = await fetch('/api/grading', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to save'); setSaving(false); return; }
            setSuccess(editingId ? 'Grading scale updated!' : 'Grading scale created!');
            resetForm(); fetchScales(token);
        } catch { setError('Network error'); }
        setSaving(false);
    };

    const deleteScale = async (id: string) => {
        const token = localStorage.getItem('token')!;
        const res = await fetch(`/api/grading?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Cannot delete'); }
        else { setSuccess('Grading scale deleted'); }
        setDeleteConfirm(null);
        fetchScales(token);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const gradeColor = (pct: number) => {
        if (pct >= 90) return 'bg-emerald-100 text-emerald-700';
        if (pct >= 75) return 'bg-blue-100 text-blue-700';
        if (pct >= 60) return 'bg-cyan-100 text-cyan-700';
        if (pct >= 45) return 'bg-amber-100 text-amber-700';
        return 'bg-red-100 text-red-700';
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-5xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-indigo-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-violet-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <span className="text-indigo-400 font-semibold tracking-wide uppercase text-sm">Marks Management</span>
                            <h1 className="text-2xl font-bold mt-1 mb-2 flex items-center gap-3">
                                Grading Scales <GraduationCap className="w-6 h-6 text-indigo-400" />
                            </h1>
                            <p className="text-indigo-100 text-sm max-w-xl">
                                Configure grading scales (CBSE, ICSE, Custom) with grade ranges, grade points, and descriptions.
                            </p>
                        </div>
                        <Button onClick={() => { resetForm(); setShowForm(true); addGradeRow(); }} className="bg-indigo-500 hover:bg-indigo-600 text-white gap-2 h-9 text-xs shadow-lg">
                            <Plus className="w-4 h-4" /> New Scale
                        </Button>
                    </div>
                </div>

                {/* Messages */}
                {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error} <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button></div>}
                {success && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {success}</div>}

                {/* Form */}
                {showForm && (
                    <div className="bg-white border border-indigo-100 rounded-2xl p-6 mb-6 shadow-md">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                                <GraduationCap className="w-5 h-5 text-indigo-500" />
                                {editingId ? 'Edit Grading Scale' : 'Create New Grading Scale'}
                            </h2>
                            <button onClick={resetForm} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                                <div className="sm:col-span-2">
                                    <Label>Scale Name *</Label>
                                    <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. CBSE Pattern" required className="mt-1" />
                                </div>
                                <div className="flex items-end gap-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                        <span className="text-sm font-medium text-gray-700 flex items-center gap-1"><Star className="w-3.5 h-3.5 text-amber-500" /> Default</span>
                                    </label>
                                </div>
                                <div className="sm:col-span-3">
                                    <Label>Description</Label>
                                    <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description..." className="mt-1" />
                                </div>
                            </div>

                            {/* Grade Definitions Table */}
                            <div className="border border-gray-100 rounded-xl overflow-hidden mb-4">
                                <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-500 uppercase">Grade Definitions</span>
                                    <button type="button" onClick={addGradeRow} className="text-xs text-indigo-600 font-bold hover:text-indigo-800 flex items-center gap-1">
                                        <Plus className="w-3.5 h-3.5" /> Add Grade
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                                                <th className="px-3 py-2 text-left">Grade</th>
                                                <th className="px-3 py-2 text-center">Min %</th>
                                                <th className="px-3 py-2 text-center">Max %</th>
                                                <th className="px-3 py-2 text-center">Points</th>
                                                <th className="px-3 py-2 text-left">Description</th>
                                                <th className="px-3 py-2 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {grades.map((g, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50/50">
                                                    <td className="px-3 py-1.5"><Input value={g.gradeName} onChange={e => updateGrade(idx, 'gradeName', e.target.value)} placeholder="A1" className="w-20 h-8 text-sm font-bold" required /></td>
                                                    <td className="px-3 py-1.5 text-center"><Input type="number" min="0" max="100" value={g.minPercentage} onChange={e => updateGrade(idx, 'minPercentage', parseFloat(e.target.value) || 0)} className="w-20 h-8 text-sm text-center" /></td>
                                                    <td className="px-3 py-1.5 text-center"><Input type="number" min="0" max="100" value={g.maxPercentage} onChange={e => updateGrade(idx, 'maxPercentage', parseFloat(e.target.value) || 0)} className="w-20 h-8 text-sm text-center" /></td>
                                                    <td className="px-3 py-1.5 text-center"><Input type="number" min="0" max="10" step="0.1" value={g.gradePoint} onChange={e => updateGrade(idx, 'gradePoint', parseFloat(e.target.value) || 0)} className="w-20 h-8 text-sm text-center" /></td>
                                                    <td className="px-3 py-1.5"><Input value={g.description} onChange={e => updateGrade(idx, 'description', e.target.value)} placeholder="Outstanding" className="h-8 text-sm" /></td>
                                                    <td className="px-3 py-1.5"><button type="button" onClick={() => removeGradeRow(idx)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {grades.length === 0 && <div className="text-center py-6 text-gray-400 text-sm">No grades defined. Click &quot;Add Grade&quot; above.</div>}
                            </div>

                            <div className="flex gap-3">
                                <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                                    <Save className="w-4 h-4" /> {saving ? 'Saving...' : editingId ? 'Update Scale' : 'Create Scale'}
                                </Button>
                                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Existing Scales */}
                {loading ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                        <p className="text-gray-400 text-sm">Loading grading scales...</p>
                    </div>
                ) : scales.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <GraduationCap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No grading scales found. Create one to get started.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {scales.map(scale => (
                            <div key={scale.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="p-5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <h3 className="font-bold text-gray-900">{scale.name}</h3>
                                            {scale.is_default && (
                                                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center gap-1">
                                                    <Star className="w-3 h-3" /> Default
                                                </span>
                                            )}
                                            <span className="text-xs text-gray-400">{scale.grades.length} grade{scale.grades.length !== 1 ? 's' : ''}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button onClick={() => setExpandedId(expandedId === scale.id ? null : scale.id)}
                                                className="p-2 rounded-lg bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                                                {expandedId === scale.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            </button>
                                            <button onClick={() => startEdit(scale)} className="p-2 rounded-lg bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            {deleteConfirm === scale.id ? (
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => deleteScale(scale.id)} className="px-2 py-1 bg-red-500 text-white rounded-lg text-xs font-bold">Yes</button>
                                                    <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 bg-gray-200 text-gray-600 rounded-lg text-xs font-bold">No</button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setDeleteConfirm(scale.id)} className="p-2 rounded-lg bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {scale.description && <p className="text-xs text-gray-500 mt-1">{scale.description}</p>}

                                    {/* Quick grade preview */}
                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                        {scale.grades.map(g => (
                                            <span key={g.id} className={`px-2 py-0.5 rounded-full text-xs font-bold ${gradeColor(g.min_percentage)}`}>
                                                {g.grade_name}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Expanded view */}
                                {expandedId === scale.id && scale.grades.length > 0 && (
                                    <div className="border-t border-gray-100 bg-gray-50/50">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-xs text-gray-500 uppercase border-b border-gray-100">
                                                    <th className="px-4 py-2 text-left">Grade</th>
                                                    <th className="px-4 py-2 text-center">Range</th>
                                                    <th className="px-4 py-2 text-center">Grade Point</th>
                                                    <th className="px-4 py-2 text-left">Description</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {scale.grades.map(g => (
                                                    <tr key={g.id}>
                                                        <td className="px-4 py-2"><span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${gradeColor(g.min_percentage)}`}>{g.grade_name}</span></td>
                                                        <td className="px-4 py-2 text-center text-gray-700 font-medium">{g.min_percentage}% — {g.max_percentage}%</td>
                                                        <td className="px-4 py-2 text-center font-bold text-gray-900">{g.grade_point}</td>
                                                        <td className="px-4 py-2 text-gray-500">{g.description || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
