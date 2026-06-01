'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    IndianRupee, ArrowLeft, Plus, Pencil, Trash2, X, Save, Loader2,
    CheckCircle, AlertTriangle, Info
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface FeeHead {
    id: string;
    name: string;
    category: string;
    is_taxable: boolean;
    tax_rate: string;
    hsn_code: string | null;
}

const CATEGORIES = [
    { value: 'academic', label: 'Academic' },
    { value: 'transport', label: 'Transport' },
    { value: 'hostel', label: 'Hostel' },
    { value: 'activity', label: 'Activity' },
    { value: 'one_time', label: 'One Time' },
    { value: 'other', label: 'Other' }
];

const emptyForm = {
    name: '',
    category: 'academic',
    isTaxable: false,
    taxRate: '0',
    hsnCode: ''
};

export default function FeeHeadsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [heads, setHeads] = useState<FeeHead[]>([]);
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
        fetchHeads(token);
    }, [router]);

    const getToken = () => localStorage.getItem('token') || '';
    const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

    const fetchHeads = async (token: string) => {
        setLoading(true);
        try {
            const res = await fetch('/api/fees/heads', { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setHeads((await res.json()).heads || []);
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

    const openEdit = (h: FeeHead) => {
        setForm({
            name: h.name,
            category: h.category,
            isTaxable: h.is_taxable,
            taxRate: h.tax_rate,
            hsnCode: h.hsn_code || ''
        });
        setEditId(h.id);
        setShowForm(true);
        setMessage(null);
    };

    const handleSave = async () => {
        if (!form.name) { setMessage({ type: 'error', text: 'Fee Head Name is required' }); return; }
        setSaving(true);
        setMessage(null);
        try {
            const body = {
                name: form.name,
                category: form.category,
                isTaxable: form.isTaxable,
                taxRate: parseFloat(form.taxRate || '0'),
                hsnCode: form.hsnCode || null
            };

            let res;
            if (editId) {
                res = await fetch('/api/fees/heads', {
                    method: 'PUT', headers: headers(),
                    body: JSON.stringify({ id: editId, ...body }),
                });
            } else {
                res = await fetch('/api/fees/heads', {
                    method: 'POST', headers: headers(),
                    body: JSON.stringify(body),
                });
            }

            if (res.ok) {
                setMessage({ type: 'success', text: editId ? 'Fee Head updated!' : 'Fee Head created!' });
                setShowForm(false);
                fetchHeads(getToken());
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Failed to save' });
            }
        } catch { setMessage({ type: 'error', text: 'Network error' }); }
        setSaving(false);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Delete Fee Head "${name}"? This cannot be undone.`)) return;
        try {
            const res = await fetch(`/api/fees/heads?id=${id}`, { method: 'DELETE', headers: headers() });
            if (res.ok) {
                setMessage({ type: 'success', text: 'Deleted successfully' });
                fetchHeads(getToken());
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Cannot delete' });
            }
        } catch { setMessage({ type: 'error', text: 'Network error' }); }
    };

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
                            <h1 className="text-xl font-bold text-gray-900">Fee Heads</h1>
                            <p className="text-xs text-gray-500">{heads.length} total defined fee heads</p>
                        </div>
                    </div>
                    <button onClick={openCreate}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all text-sm cursor-pointer">
                        <Plus className="w-4 h-4" /> Add Fee Head
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
                        <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl">
                            <div className="flex items-center justify-between mb-5">
                                <h2 className="text-lg font-bold text-gray-900">{editId ? 'Edit Fee Head' : 'Create Fee Head'}</h2>
                                <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X className="w-5 h-5 text-gray-400" /></button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Fee Head Name *</label>
                                    <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                        placeholder="e.g., Tuition Fee, Sports Charge" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Category</label>
                                        <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                                            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">HSN Code (Optional)</label>
                                        <input type="text" value={form.hsnCode} onChange={e => setForm({ ...form, hsnCode: e.target.value })}
                                            placeholder="e.g., 9963" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                                    </div>
                                </div>

                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-start gap-3">
                                    <input type="checkbox" checked={form.isTaxable} onChange={e => setForm({ ...form, isTaxable: e.target.checked })}
                                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 mt-1 cursor-pointer" id="taxable" />
                                    <div className="flex-1">
                                        <label htmlFor="taxable" className="block text-sm font-bold text-gray-700 cursor-pointer">Taxable Fee Head</label>
                                        <p className="text-xs text-gray-500 mt-0.5">Enable if this fee item attracts GST or local taxes.</p>
                                        
                                        {form.isTaxable && (
                                            <div className="mt-3">
                                                <label className="block text-xs font-semibold text-gray-600 mb-1">Tax Rate (%)</label>
                                                <input type="number" value={form.taxRate} onChange={e => setForm({ ...form, taxRate: e.target.value })}
                                                    placeholder="0" className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500" />
                                            </div>
                                        )}
                                    </div>
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

                {/* Heads List */}
                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
                ) : heads.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <IndianRupee className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-bold text-lg">No Fee Heads Defined</p>
                        <p className="text-gray-400 text-sm mt-1 mb-4">Define fee heads so they can be bundled into fee groups.</p>
                        <button onClick={openCreate} className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm hover:bg-emerald-700 transition-colors cursor-pointer">
                            <Plus className="w-4 h-4 inline mr-1" /> Add Fee Head
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {heads.map(h => (
                            <div key={h.id} className="bg-white border border-gray-200 rounded-2xl p-4 transition-all hover:shadow-md flex items-start justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                                        <IndianRupee className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-sm">{h.name}</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            Category: {CATEGORIES.find(c => c.value === h.category)?.label || h.category}
                                            {h.hsn_code && ` · HSN: ${h.hsn_code}`}
                                        </p>
                                        <div className="flex items-center gap-2 mt-2">
                                            {h.is_taxable ? (
                                                <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100 text-amber-700 text-[10px] font-bold">Taxable ({h.tax_rate}%)</span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold">Tax Free</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button onClick={() => openEdit(h)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors cursor-pointer">
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(h.id, h.name)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors cursor-pointer">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
