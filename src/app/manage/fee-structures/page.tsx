'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    IndianRupee, ArrowLeft, Plus, Pencil, Trash2, X, Save, Loader2,
    CheckCircle, AlertTriangle, ToggleLeft, ToggleRight
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface FeeStructure {
    id: string; name: string; description: string | null; fee_type: string;
    class_id: string | null; class_name: string | null; session_id: string | null;
    amount: string; due_date: string | null; is_active: boolean;
    frequency: string; late_fee_per_day: string; grace_period_days: number;
}
interface ClassItem { id: string; name: string; }

const FEE_TYPES = ['tuition', 'transport', 'lab', 'library', 'exam', 'sports', 'uniform', 'other'];
const FREQUENCIES = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'half_yearly', label: 'Half Yearly' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'one_time', label: 'One Time' },
];

const emptyForm = {
    name: '', description: '', feeType: 'tuition', classId: '', amount: '',
    dueDate: '', frequency: 'yearly', lateFeePerDay: '0', gracePeriodDays: '0',
};

export default function FeeStructuresPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [structures, setStructures] = useState<FeeStructure[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin' && parsed.role !== 'developer') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchData(token);
    }, [router]);

    const getToken = () => localStorage.getItem('token') || '';
    const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

    const fetchData = async (token: string) => {
        setLoading(true);
        try {
            const [structRes, classRes] = await Promise.all([
                fetch('/api/fees/structures', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/sms/classes', { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (structRes.ok) setStructures((await structRes.json()).structures || []);
            if (classRes.ok) setClasses((await classRes.json()).classes || []);
        } catch { /* silent */ }
        setLoading(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const openCreate = () => {
        setForm(emptyForm);
        setEditId(null);
        setShowForm(true);
        setMessage(null);
    };

    const openEdit = (s: FeeStructure) => {
        setForm({
            name: s.name, description: s.description || '', feeType: s.fee_type,
            classId: s.class_id || '', amount: s.amount,
            dueDate: s.due_date ? s.due_date.split('T')[0] : '',
            frequency: s.frequency || 'yearly',
            lateFeePerDay: s.late_fee_per_day || '0',
            gracePeriodDays: String(s.grace_period_days || 0),
        });
        setEditId(s.id);
        setShowForm(true);
        setMessage(null);
    };

    const handleSave = async () => {
        if (!form.name || !form.amount) { setMessage({ type: 'error', text: 'Name and amount are required' }); return; }
        setSaving(true);
        setMessage(null);
        try {
            const body = {
                name: form.name, description: form.description || null, feeType: form.feeType,
                classId: form.classId || null, amount: parseFloat(form.amount),
                dueDate: form.dueDate || null, frequency: form.frequency,
                lateFeePerDay: parseFloat(form.lateFeePerDay || '0'),
                gracePeriodDays: parseInt(form.gracePeriodDays || '0'),
            };

            let res;
            if (editId) {
                res = await fetch('/api/fees/structures', {
                    method: 'PUT', headers: headers(),
                    body: JSON.stringify({ id: editId, ...body }),
                });
            } else {
                res = await fetch('/api/fees/structures', {
                    method: 'POST', headers: headers(),
                    body: JSON.stringify(body),
                });
            }

            if (res.ok) {
                setMessage({ type: 'success', text: editId ? 'Fee structure updated!' : 'Fee structure created!' });
                setShowForm(false);
                fetchData(getToken());
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Failed to save' });
            }
        } catch { setMessage({ type: 'error', text: 'Network error' }); }
        setSaving(false);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
        try {
            const res = await fetch(`/api/fees/structures?id=${id}`, { method: 'DELETE', headers: headers() });
            if (res.ok) {
                setMessage({ type: 'success', text: 'Deleted successfully' });
                fetchData(getToken());
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Cannot delete' });
            }
        } catch { setMessage({ type: 'error', text: 'Network error' }); }
    };

    const handleToggle = async (s: FeeStructure) => {
        try {
            await fetch('/api/fees/structures', {
                method: 'PUT', headers: headers(),
                body: JSON.stringify({ id: s.id, isActive: !s.is_active }),
            });
            fetchData(getToken());
        } catch { /* silent */ }
    };

    const totalActive = structures.filter(s => s.is_active).length;

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.push('/manage/fee-hub')} className="p-2 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer">
                            <ArrowLeft className="w-5 h-5 text-gray-500" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Fee Structures</h1>
                            <p className="text-xs text-gray-500">{totalActive} active structure{totalActive !== 1 ? 's' : ''} · {structures.length} total</p>
                        </div>
                    </div>
                    <button onClick={openCreate}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all text-sm cursor-pointer">
                        <Plus className="w-4 h-4" /> Add Fee
                    </button>
                </div>

                {/* Message */}
                {message && (
                    <div className={`mb-4 p-3 rounded-xl text-sm flex items-center gap-2 ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                        {message.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        {message.text}
                    </div>
                )}

                {/* Create/Edit Form Modal */}
                {showForm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-5">
                                <h2 className="text-lg font-bold text-gray-900">{editId ? 'Edit Fee Structure' : 'Create Fee Structure'}</h2>
                                <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X className="w-5 h-5 text-gray-400" /></button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Fee Name *</label>
                                    <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                        placeholder="e.g., Tuition Fee - Class 1 to 5" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Fee Type</label>
                                        <select value={form.feeType} onChange={e => setForm({ ...form, feeType: e.target.value })}
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                                            {FEE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Class</label>
                                        <select value={form.classId} onChange={e => setForm({ ...form, classId: e.target.value })}
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                                            <option value="">All Classes</option>
                                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Amount (₹) *</label>
                                        <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                                            placeholder="0" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Frequency</label>
                                        <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                                            {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Due Date</label>
                                        <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })}
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Late Fee/Day (₹)</label>
                                        <input type="number" value={form.lateFeePerDay} onChange={e => setForm({ ...form, lateFeePerDay: e.target.value })}
                                            placeholder="0" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Grace Days</label>
                                        <input type="number" value={form.gracePeriodDays} onChange={e => setForm({ ...form, gracePeriodDays: e.target.value })}
                                            placeholder="0" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
                                    <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                        rows={2} placeholder="Optional description..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 resize-none" />
                                </div>
                            </div>

                            <div className="flex gap-2 mt-6 pt-4 border-t border-gray-100">
                                <button onClick={() => setShowForm(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-200 transition-colors cursor-pointer">Cancel</button>
                                <button onClick={handleSave} disabled={saving}
                                    className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl text-sm shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Structures List */}
                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
                ) : structures.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <IndianRupee className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-bold text-lg">No Fee Structures Yet</p>
                        <p className="text-gray-400 text-sm mt-1 mb-4">Create your first fee structure to start collecting payments.</p>
                        <button onClick={openCreate} className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm hover:bg-emerald-700 transition-colors cursor-pointer">
                            <Plus className="w-4 h-4 inline mr-1" /> Create Fee Structure
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {structures.map(s => (
                            <div key={s.id} className={`bg-white border rounded-2xl p-4 transition-all hover:shadow-md ${s.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3">
                                        <div className={`p-2.5 rounded-xl ${s.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                                            <IndianRupee className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 text-sm">{s.name}</h3>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {s.class_name || 'All Classes'} · {s.fee_type.charAt(0).toUpperCase() + s.fee_type.slice(1)} · {FREQUENCIES.find(f => f.value === (s.frequency || 'yearly'))?.label || 'Yearly'}
                                            </p>
                                            {s.due_date && (
                                                <p className="text-xs text-amber-600 mt-1">Due: {new Date(s.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                            )}
                                            {s.description && <p className="text-xs text-gray-400 mt-1">{s.description}</p>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-lg font-bold text-emerald-600 mr-2">₹{parseFloat(s.amount).toLocaleString('en-IN')}</p>
                                        <button onClick={() => handleToggle(s)} className="p-1 cursor-pointer" title={s.is_active ? 'Deactivate' : 'Activate'}>
                                            {s.is_active ? <ToggleRight className="w-6 h-6 text-emerald-500" /> : <ToggleLeft className="w-6 h-6 text-gray-300" />}
                                        </button>
                                        <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors cursor-pointer">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleDelete(s.id, s.name)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors cursor-pointer">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
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
