'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    IndianRupee, ArrowLeft, Plus, Pencil, Trash2, X, Save, Loader2,
    CheckCircle, AlertTriangle, FileText, Users, Zap, Globe, School, User
} from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: string; }
interface FeeHead { id: string; name: string; }
interface ClassItem { id: string; name: string; display_order: number; }
interface GroupHead {
    fee_head_id: string;
    head_name: string;
    amount: string;
    frequency: string;
}
interface FeeGroup {
    id: string;
    name: string;
    description: string | null;
    heads: GroupHead[];
    target_class_ids: string[];
    is_default: boolean;
    apply_to: 'all' | 'specific_classes' | 'individual';
    display_order: number;
    is_active: boolean;
    assigned_students: number;
}

const FREQUENCIES = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'half_yearly', label: 'Half Yearly' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'one_time', label: 'One Time' },
];

interface FormHeadRow {
    feeHeadId: string;
    amount: string;
    frequency: string;
}

const APPLY_TO_OPTIONS = [
    { value: 'all', label: 'All Students', icon: Globe, desc: 'Every student in the school', color: 'emerald' },
    { value: 'specific_classes', label: 'Specific Classes', icon: School, desc: 'Students in selected classes', color: 'blue' },
    { value: 'individual', label: 'Individual (Manual)', icon: User, desc: 'Manually assigned per student', color: 'violet' },
];

export default function FeeGroupsPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [groups, setGroups] = useState<FeeGroup[]>([]);
    const [heads, setHeads] = useState<FeeHead[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [formHeads, setFormHeads] = useState<FormHeadRow[]>([{ feeHeadId: '', amount: '', frequency: 'monthly' }]);
    const [applyTo, setApplyTo] = useState<'all' | 'specific_classes' | 'individual'>('individual');
    const [targetClassIds, setTargetClassIds] = useState<string[]>([]);
    const [isDefault, setIsDefault] = useState(false);
    const [isActive, setIsActive] = useState(true);

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
    const hdrs = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

    const fetchData = async (token: string) => {
        setLoading(true);
        try {
            const [groupRes, headRes, classRes] = await Promise.all([
                fetch('/api/fees/groups', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/fees/heads', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/manage/classes', { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (groupRes.ok) setGroups((await groupRes.json()).groups || []);
            if (headRes.ok) setHeads((await headRes.json()).heads || []);
            if (classRes.ok) {
                const classData = (await classRes.json()).classes || [];
                setClasses(classData.sort((a: ClassItem, b: ClassItem) => a.display_order - b.display_order));
            }
        } catch { /* silent */ }
        setLoading(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const addHeadRow = () => {
        setFormHeads([...formHeads, { feeHeadId: '', amount: '', frequency: 'monthly' }]);
    };

    const removeHeadRow = (index: number) => {
        if (formHeads.length === 1) return;
        setFormHeads(formHeads.filter((_, i) => i !== index));
    };

    const updateHeadRow = (index: number, field: keyof FormHeadRow, value: string) => {
        const updated = [...formHeads];
        updated[index][field] = value;
        setFormHeads(updated);
    };

    const toggleClass = (classId: string) => {
        setTargetClassIds(prev =>
            prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
        );
    };

    const selectClassRange = (startOrder: number, endOrder: number) => {
        const rangeIds = classes.filter(c => c.display_order >= startOrder && c.display_order <= endOrder).map(c => c.id);
        setTargetClassIds(rangeIds);
    };

    const openCreate = () => {
        setName('');
        setDescription('');
        setFormHeads([{ feeHeadId: '', amount: '', frequency: 'monthly' }]);
        setApplyTo('individual');
        setTargetClassIds([]);
        setIsDefault(false);
        setIsActive(true);
        setEditId(null);
        setShowForm(true);
        setMessage(null);
    };

    const openEdit = (g: FeeGroup) => {
        setName(g.name);
        setDescription(g.description || '');
        setFormHeads(g.heads.length > 0 ? g.heads.map(h => ({
            feeHeadId: h.fee_head_id,
            amount: h.amount,
            frequency: h.frequency
        })) : [{ feeHeadId: '', amount: '', frequency: 'monthly' }]);
        setApplyTo(g.apply_to || 'individual');
        setTargetClassIds(Array.isArray(g.target_class_ids) ? g.target_class_ids : []);
        setIsDefault(g.is_default || false);
        setIsActive(g.is_active !== false);
        setEditId(g.id);
        setShowForm(true);
        setMessage(null);
    };

    const handleSave = async () => {
        if (!name) { setMessage({ type: 'error', text: 'Group Name is required' }); return; }

        const validHeads = formHeads.filter(h => h.feeHeadId && h.amount);
        if (validHeads.length === 0) {
            setMessage({ type: 'error', text: 'At least one valid Fee Head must be configured' });
            return;
        }

        if (applyTo === 'specific_classes' && targetClassIds.length === 0) {
            setMessage({ type: 'error', text: 'Select at least one target class' });
            return;
        }

        setSaving(true);
        setMessage(null);
        try {
            const body = {
                name,
                description: description || null,
                heads: validHeads,
                applyTo,
                targetClassIds: applyTo === 'specific_classes' ? targetClassIds : [],
                isDefault,
                isActive,
            };

            let res;
            if (editId) {
                res = await fetch('/api/fees/groups', {
                    method: 'PUT', headers: hdrs(),
                    body: JSON.stringify({ id: editId, ...body }),
                });
            } else {
                res = await fetch('/api/fees/groups', {
                    method: 'POST', headers: hdrs(),
                    body: JSON.stringify(body),
                });
            }

            if (res.ok) {
                setMessage({ type: 'success', text: editId ? 'Fee Group updated!' : 'Fee Group created!' });
                setShowForm(false);
                fetchData(getToken());
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Failed to save' });
            }
        } catch { setMessage({ type: 'error', text: 'Network error' }); }
        setSaving(false);
    };

    const handleDelete = async (id: string, groupName: string) => {
        if (!confirm(`Delete Fee Group "${groupName}"? This cannot be undone.`)) return;
        try {
            const res = await fetch(`/api/fees/groups?id=${id}`, { method: 'DELETE', headers: hdrs() });
            if (res.ok) {
                setMessage({ type: 'success', text: 'Deleted successfully' });
                fetchData(getToken());
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Cannot delete' });
            }
        } catch { setMessage({ type: 'error', text: 'Network error' }); }
    };

    const getScopeBadge = (g: FeeGroup) => {
        if (g.apply_to === 'all') return { label: '🌐 All Students', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
        if (g.apply_to === 'specific_classes') {
            const classNames = classes.filter(c => g.target_class_ids?.includes(c.id)).map(c => c.name);
            const label = classNames.length > 3 ? `🏫 ${classNames.slice(0, 3).join(', ')}...` : `🏫 ${classNames.join(', ')}`;
            return { label, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
        }
        return { label: '👤 Individual', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' };
    };

    const getGroupTotal = (g: FeeGroup) => {
        return g.heads.reduce((sum, h) => sum + parseFloat(h.amount || '0'), 0);
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.push('/manage/fee-hub')} className="p-2 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer">
                            <ArrowLeft className="w-5 h-5 text-gray-500" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Fee Groups</h1>
                            <p className="text-xs text-gray-500">{groups.length} configured groups · Bundle fee heads into packages</p>
                        </div>
                    </div>
                    <button onClick={openCreate}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all text-sm cursor-pointer">
                        <Plus className="w-4 h-4" /> Create Group
                    </button>
                </div>

                {/* Message */}
                {message && (
                    <div className={`mb-4 p-3 rounded-xl text-sm flex items-center gap-2 ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                        {message.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        {message.text}
                    </div>
                )}

                {/* ═══════ Modal Form ═══════ */}
                {showForm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-5">
                                <h2 className="text-lg font-bold text-gray-900">{editId ? 'Edit Fee Group' : 'Create Fee Group'}</h2>
                                <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X className="w-5 h-5 text-gray-400" /></button>
                            </div>

                            <div className="space-y-5">
                                {/* Name & Description */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Group Name *</label>
                                        <input type="text" value={name} onChange={e => setName(e.target.value)}
                                            placeholder="e.g., Class 10 Day Scholar" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
                                        <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                                            placeholder="Optional description..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                                    </div>
                                </div>

                                {/* ═══════ Scope Selector ═══════ */}
                                <div className="border border-gray-200 rounded-2xl p-4">
                                    <label className="block text-sm font-bold text-gray-800 mb-3">Applies To</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {APPLY_TO_OPTIONS.map(opt => {
                                            const Icon = opt.icon;
                                            const selected = applyTo === opt.value;
                                            return (
                                                <button key={opt.value} type="button" onClick={() => {
                                                    setApplyTo(opt.value as any);
                                                    if (opt.value === 'all') setIsDefault(true);
                                                    if (opt.value !== 'specific_classes') setTargetClassIds([]);
                                                }}
                                                    className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${selected
                                                        ? `border-${opt.color}-500 bg-${opt.color}-50 ring-2 ring-${opt.color}-200`
                                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                                        }`}
                                                    style={selected ? {
                                                        borderColor: opt.color === 'emerald' ? '#10b981' : opt.color === 'blue' ? '#3b82f6' : '#8b5cf6',
                                                        backgroundColor: opt.color === 'emerald' ? '#ecfdf5' : opt.color === 'blue' ? '#eff6ff' : '#f5f3ff',
                                                    } : {}}
                                                >
                                                    <Icon className={`w-5 h-5 mb-1.5 ${selected ? (opt.color === 'emerald' ? 'text-emerald-600' : opt.color === 'blue' ? 'text-blue-600' : 'text-violet-600') : 'text-gray-400'}`} />
                                                    <p className={`text-xs font-bold ${selected ? 'text-gray-900' : 'text-gray-600'}`}>{opt.label}</p>
                                                    <p className="text-[10px] text-gray-400 mt-0.5">{opt.desc}</p>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Class Picker (only when specific_classes) */}
                                    {applyTo === 'specific_classes' && (
                                        <div className="mt-4 p-3 bg-blue-50/50 border border-blue-100 rounded-xl">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-xs font-bold text-blue-800">Select Target Classes</p>
                                                <div className="flex gap-1.5">
                                                    <button type="button" onClick={() => selectClassRange(1, 3)} className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 cursor-pointer">Pre-Primary</button>
                                                    <button type="button" onClick={() => selectClassRange(4, 8)} className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 cursor-pointer">Primary (1-5)</button>
                                                    <button type="button" onClick={() => selectClassRange(9, 11)} className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 cursor-pointer">Middle (6-8)</button>
                                                    <button type="button" onClick={() => selectClassRange(12, 13)} className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 cursor-pointer">Senior (9-10)</button>
                                                    <button type="button" onClick={() => setTargetClassIds(classes.map(c => c.id))} className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 cursor-pointer">All</button>
                                                    <button type="button" onClick={() => setTargetClassIds([])} className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-500 rounded-md hover:bg-gray-200 cursor-pointer">Clear</button>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {classes.map(c => (
                                                    <button key={c.id} type="button" onClick={() => toggleClass(c.id)}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${targetClassIds.includes(c.id)
                                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                                                            }`}>
                                                        {c.name}
                                                    </button>
                                                ))}
                                            </div>
                                            {targetClassIds.length > 0 && (
                                                <p className="text-[10px] text-blue-600 mt-2 font-medium">{targetClassIds.length} class{targetClassIds.length > 1 ? 'es' : ''} selected</p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Auto-Assign Toggle */}
                                <div className="flex items-center gap-3 p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
                                    <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)}
                                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-gray-300 cursor-pointer" id="isDefault" />
                                    <div className="flex-1">
                                        <label htmlFor="isDefault" className="block text-sm font-bold text-gray-800 cursor-pointer flex items-center gap-1.5">
                                            <Zap className="w-4 h-4 text-amber-500" /> Auto-Assign on Enrollment
                                        </label>
                                        <p className="text-[10px] text-gray-500 mt-0.5">Automatically assign this group to students when they are enrolled or when &quot;Apply Defaults&quot; is triggered.</p>
                                    </div>
                                </div>

                                {/* Active Toggle */}
                                <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl">
                                    <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
                                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 cursor-pointer" id="isActive" />
                                    <div>
                                        <label htmlFor="isActive" className="block text-sm font-bold text-gray-800 cursor-pointer">Active</label>
                                        <p className="text-[10px] text-gray-500 mt-0.5">Inactive groups won&apos;t appear in invoices or assignments.</p>
                                    </div>
                                </div>

                                {/* Fee Heads */}
                                <div className="border-t border-gray-100 pt-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-bold text-gray-700">Included Fee Items</h3>
                                        <button type="button" onClick={addHeadRow} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer">
                                            <Plus className="w-3.5 h-3.5" /> Add Row
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        {formHeads.map((row, index) => (
                                            <div key={index} className="flex items-center gap-3 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                                <div className="flex-1 grid grid-cols-3 gap-3">
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Fee Head</label>
                                                        <select value={row.feeHeadId} onChange={e => updateHeadRow(index, 'feeHeadId', e.target.value)}
                                                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                                                            <option value="">Select Head</option>
                                                            {heads.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Amount (₹)</label>
                                                        <input type="number" value={row.amount} onChange={e => updateHeadRow(index, 'amount', e.target.value)}
                                                            placeholder="0" className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-500 mb-1">Frequency</label>
                                                        <select value={row.frequency} onChange={e => updateHeadRow(index, 'frequency', e.target.value)}
                                                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
                                                            {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                                <button type="button" onClick={() => removeHeadRow(index)} className="p-1 rounded hover:bg-red-50 text-red-500 mt-4 cursor-pointer">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
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

                {/* ═══════ Groups List ═══════ */}
                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
                ) : groups.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-bold text-lg">No Fee Groups Created</p>
                        <p className="text-gray-400 text-sm mt-1 mb-4">Create your first fee group to start bundling individual fees.</p>
                        <button onClick={openCreate} className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm hover:bg-emerald-700 transition-colors cursor-pointer">
                            <Plus className="w-4 h-4 inline mr-1" /> Create Fee Group
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {groups.map(g => {
                            const scope = getScopeBadge(g);
                            return (
                                <div key={g.id} className={`bg-white border rounded-3xl p-5 hover:shadow-md transition-all ${g.is_active ? 'border-gray-200' : 'border-red-100 opacity-60'}`}>
                                    <div className="flex items-start justify-between border-b border-gray-100 pb-4 mb-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-bold text-gray-900 text-base">{g.name}</h3>
                                                {!g.is_active && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">Inactive</span>}
                                            </div>
                                            {g.description && <p className="text-xs text-gray-500 mt-0.5">{g.description}</p>}

                                            {/* Badges */}
                                            <div className="flex flex-wrap items-center gap-2 mt-3">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${scope.bg} ${scope.text} ${scope.border}`}>
                                                    {scope.label}
                                                </span>
                                                {g.is_default && (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold">
                                                        <Zap className="w-3 h-3" /> Auto-Assign
                                                    </span>
                                                )}
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-gray-600 text-[11px] font-bold">
                                                    <Users className="w-3 h-3" /> {g.assigned_students || 0} students
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button onClick={() => openEdit(g)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors cursor-pointer">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(g.id, g.name)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors cursor-pointer">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Included Items</p>
                                        {g.heads.map((h, i) => (
                                            <div key={i} className="flex items-center justify-between text-sm py-1">
                                                <span className="text-gray-700 font-medium">{h.head_name}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[10px] uppercase font-bold">{FREQUENCIES.find(f => f.value === h.frequency)?.label}</span>
                                                    <span className="font-bold text-gray-900">₹{parseFloat(h.amount).toLocaleString('en-IN')}</span>
                                                </div>
                                            </div>
                                        ))}
                                        <div className="flex justify-between items-center border-t border-dashed border-gray-100 pt-3 mt-3">
                                            <span className="text-xs font-bold text-gray-400 uppercase">Estimated Subtotal</span>
                                            <span className="text-base font-bold text-emerald-600">
                                                ₹{getGroupTotal(g).toLocaleString('en-IN')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
