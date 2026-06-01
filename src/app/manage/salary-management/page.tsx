'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Navbar } from '@/components/ui/Navbar';
import {
    IndianRupee, ArrowLeft, X, Search, Plus, Trash2, Edit3, Loader2,
    CheckCircle, Users, CalendarDays, Banknote, ClipboardList, ChevronRight, Receipt, Filter
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────
interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface SalaryStructure {
    id: string; user_id: string; staff_name: string; staff_email: string;
    role_target: string; designation: string; base_salary: string;
    allowances: Record<string, number>; deductions: Record<string, number>;
    net_salary: string; effective_from: string; is_active: boolean;
}
interface SalaryPayment {
    id: string; user_id: string; staff_name: string; staff_email: string;
    month: string; gross_amount: string; deductions_amount: string; net_amount: string;
    payment_mode: string; payment_date: string; reference_number: string;
    remarks: string; status: string; designation: string;
}
interface StaffMember { id: string; first_name: string; last_name: string; email: string; role: string; }

type ActiveTab = 'structures' | 'pay' | 'history' | 'summary';

// ─── Main Component ─────────────────────────────────────────────────
export default function SalaryManagementPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<ActiveTab>('structures');

    // Data
    const [structures, setStructures] = useState<SalaryStructure[]>([]);
    const [payments, setPayments] = useState<SalaryPayment[]>([]);
    const [staff, setStaff] = useState<StaffMember[]>([]);

    // Structure modal
    const [structureModal, setStructureModal] = useState(false);
    const [editingStructure, setEditingStructure] = useState<SalaryStructure | null>(null);
    const [structureForm, setStructureForm] = useState({
        userId: '', roleTarget: 'teacher', designation: '', baseSalary: '',
        allowances: {} as Record<string, string>, deductions: {} as Record<string, string>,
        netSalary: '', effectiveFrom: new Date().toISOString().split('T')[0],
    });
    const [newAllowanceKey, setNewAllowanceKey] = useState('');
    const [newDeductionKey, setNewDeductionKey] = useState('');
    const [savingStructure, setSavingStructure] = useState(false);

    // Staff search
    const [staffSearch, setStaffSearch] = useState('');
    const [staffRoleFilter, setStaffRoleFilter] = useState('');
    const [staffResults, setStaffResults] = useState<StaffMember[]>([]);
    const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

    // Pay salary
    const [payMonth, setPayMonth] = useState(new Date().toISOString().slice(0, 7));
    const [payForm, setPayForm] = useState<Record<string, { paymentMode: string; referenceNumber: string; remarks: string; checked: boolean }>>({});
    const [payingAll, setPayingAll] = useState(false);

    // History filters
    const [historyMonth, setHistoryMonth] = useState('');

    // ── Auth ──
    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        try {
            const parsed = JSON.parse(userData);
            if (parsed.role !== 'super_admin') { router.replace('/login'); return; }
            setUser(parsed);
        } catch { router.replace('/login'); }
        setLoading(false);
    }, [router]);

    const getToken = () => localStorage.getItem('token') || '';
    const headers = useCallback(() => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }), []);

    // ── Fetchers ──
    const fetchStructures = useCallback(async () => {
        try { const r = await fetch('/api/salary/structures', { headers: headers() }); if (r.ok) { const d = await r.json(); setStructures(d.structures || []); } } catch { }
    }, [headers]);

    const fetchPayments = useCallback(async () => {
        try {
            let url = '/api/salary/payments';
            if (historyMonth) url += `?month=${historyMonth}`;
            const r = await fetch(url, { headers: headers() });
            if (r.ok) { const d = await r.json(); setPayments(d.payments || []); }
        } catch { }
    }, [headers, historyMonth]);

    const fetchStaff = useCallback(async () => {
        try { const r = await fetch('/api/manage/staff', { headers: headers() }); if (r.ok) { const d = await r.json(); setStaff(d.staff || []); } } catch { }
    }, [headers]);

    useEffect(() => {
        if (user) { fetchStructures(); fetchPayments(); fetchStaff(); }
    }, [user, fetchStructures, fetchPayments, fetchStaff]);

    useEffect(() => {
        if (user && activeTab === 'history') fetchPayments();
    }, [user, activeTab, fetchPayments]);

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    // ── Auto-calc net salary ──
    const calcNet = (base: string, allowances: Record<string, string>, deductions: Record<string, string>) => {
        const b = parseFloat(base) || 0;
        const a = Object.values(allowances).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        const d = Object.values(deductions).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        return (b + a - d).toFixed(2);
    };

    useEffect(() => {
        setStructureForm(f => ({ ...f, netSalary: calcNet(f.baseSalary, f.allowances, f.deductions) }));
    }, [structureForm.baseSalary, structureForm.allowances, structureForm.deductions]);

    // ── Structure CRUD ──
    const openCreateStructure = () => {
        setEditingStructure(null);
        setStructureForm({ userId: '', roleTarget: 'teacher', designation: '', baseSalary: '', allowances: {}, deductions: {}, netSalary: '', effectiveFrom: new Date().toISOString().split('T')[0] });
        setSelectedStaff(null); setStaffSearch('');
        setStructureModal(true);
    };

    const openEditStructure = (s: SalaryStructure) => {
        setEditingStructure(s);
        const allowances: Record<string, string> = {};
        const deductions: Record<string, string> = {};
        if (s.allowances) Object.entries(s.allowances).forEach(([k, v]) => { allowances[k] = String(v); });
        if (s.deductions) Object.entries(s.deductions).forEach(([k, v]) => { deductions[k] = String(v); });
        setStructureForm({
            userId: s.user_id, roleTarget: s.role_target, designation: s.designation || '',
            baseSalary: s.base_salary, allowances, deductions, netSalary: s.net_salary,
            effectiveFrom: s.effective_from?.split('T')[0] || '',
        });
        setSelectedStaff({ id: s.user_id, first_name: s.staff_name?.split(' ')[0] || '', last_name: s.staff_name?.split(' ').slice(1).join(' ') || '', email: s.staff_email, role: s.role_target });
        setStructureModal(true);
    };

    const saveStructure = async () => {
        if (!structureForm.userId || !structureForm.baseSalary) return;
        setSavingStructure(true);
        const allowancesNum: Record<string, number> = {};
        const deductionsNum: Record<string, number> = {};
        Object.entries(structureForm.allowances).forEach(([k, v]) => { allowancesNum[k] = parseFloat(v) || 0; });
        Object.entries(structureForm.deductions).forEach(([k, v]) => { deductionsNum[k] = parseFloat(v) || 0; });
        const body: any = {
            userId: structureForm.userId, roleTarget: structureForm.roleTarget,
            designation: structureForm.designation, baseSalary: parseFloat(structureForm.baseSalary),
            allowances: allowancesNum, deductions: deductionsNum,
            netSalary: parseFloat(structureForm.netSalary || '0'),
            effectiveFrom: structureForm.effectiveFrom,
        };
        if (editingStructure) body.id = editingStructure.id;
        try {
            const r = await fetch('/api/salary/structures', { method: editingStructure ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify(body) });
            if (r.ok) { setStructureModal(false); fetchStructures(); }
            else { const e = await r.json(); alert(e.error || 'Failed to save'); }
        } catch { alert('Failed to save'); }
        setSavingStructure(false);
    };

    const deleteStructure = async (id: string) => {
        if (!confirm('Delete this salary structure?')) return;
        try {
            const r = await fetch(`/api/salary/structures?id=${id}`, { method: 'DELETE', headers: headers() });
            if (r.ok) fetchStructures(); else { const e = await r.json(); alert(e.error || 'Failed'); }
        } catch { alert('Failed'); }
    };

    // ── Staff search ──
    const searchStaff = (term: string, role: string = staffRoleFilter) => {
        setStaffSearch(term);
        setStaffRoleFilter(role);
        if (term.length < 2 && !role) { setStaffResults([]); return; }
        const lower = term.toLowerCase();
        setStaffResults(staff.filter(s => {
            const matchesTerm = !term || `${s.first_name} ${s.last_name}`.toLowerCase().includes(lower) || s.email?.toLowerCase().includes(lower);
            const matchesRole = !role || s.role === role;
            return matchesTerm && matchesRole;
        }).slice(0, 8));
    };

    // ── Pay salary ──
    const initPayForm = useCallback(() => {
        const form: typeof payForm = {};
        structures.filter(s => s.is_active).forEach(s => {
            form[s.id] = { paymentMode: 'bank_transfer', referenceNumber: '', remarks: '', checked: true };
        });
        setPayForm(form);
    }, [structures]);

    useEffect(() => { if (activeTab === 'pay') initPayForm(); }, [activeTab, initPayForm]);

    const handlePaySalary = async (structureId: string) => {
        const s = structures.find(st => st.id === structureId);
        const f = payForm[structureId];
        if (!s || !f) return;
        const gross = parseFloat(s.base_salary) + Object.values(s.allowances || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
        const ded = Object.values(s.deductions || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
        try {
            const r = await fetch('/api/salary/payments', {
                method: 'POST', headers: headers(),
                body: JSON.stringify({
                    userId: s.user_id, salaryStructureId: s.id, month: payMonth,
                    grossAmount: gross, deductionsAmount: ded, netAmount: parseFloat(s.net_salary),
                    paymentMode: f.paymentMode, referenceNumber: f.referenceNumber,
                    remarks: f.remarks, paymentDate: new Date().toISOString().split('T')[0],
                }),
            });
            if (r.ok) { alert(`Salary paid to ${s.staff_name} for ${payMonth}`); fetchPayments(); }
            else { const e = await r.json(); alert(e.error || 'Failed'); }
        } catch { alert('Failed to record payment'); }
    };

    const handlePayAll = async () => {
        setPayingAll(true);
        const selected = Object.entries(payForm).filter(([, f]) => f.checked);
        for (const [structureId] of selected) {
            await handlePaySalary(structureId);
        }
        setPayingAll(false);
        initPayForm();
    };

    // ── Stats ──
    const totalSalaryExpense = payments.filter(p => p.status === 'paid').reduce((s, p) => s + parseFloat(p.net_amount || '0'), 0);
    const activeStaffCount = structures.filter(s => s.is_active).length;
    const thisMonthPayments = payments.filter(p => p.month === new Date().toISOString().slice(0, 7));
    const thisMonthPaid = thisMonthPayments.filter(p => p.status === 'paid').length;

    // ── Loading ──
    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="w-12 h-12 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
    );
    if (!user) return null;

    const tabs = [
        { id: 'structures' as const, label: 'Salary Structures', icon: <ClipboardList className="w-4 h-4" /> },
        { id: 'pay' as const, label: 'Pay Salary', icon: <Banknote className="w-4 h-4" /> },
        { id: 'history' as const, label: 'Payment History', icon: <CalendarDays className="w-4 h-4" /> },
        { id: 'summary' as const, label: 'Summary', icon: <IndianRupee className="w-4 h-4" /> },
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">

                {/* ═══════ Hero Banner ═══════ */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-8 mb-8 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-amber-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-yellow-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10">
                        <button onClick={() => router.push('/manage/fee-management')} className="inline-flex items-center gap-1.5 text-sm text-amber-200 hover:text-white mb-4 transition-colors cursor-pointer">
                            <ArrowLeft className="w-4 h-4" /> Fee Management
                        </button>
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-bold mb-2">💰 Staff Salary Management</h1>
                                <p className="text-amber-100 text-sm max-w-xl">Create salary structures, record payments, and track monthly salary expenses for all staff members.</p>
                            </div>
                            <Users className="hidden sm:block w-12 h-12 text-amber-200 opacity-80" />
                        </div>
                    </div>
                </div>

                {/* ═══════ Stats ═══════ */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <div className="bg-white border border-emerald-200 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 font-medium">Total Salary Paid</p>
                        <p className="text-xl font-bold text-emerald-600 mt-1">₹{totalSalaryExpense.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-white border border-blue-200 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 font-medium">Active Staff</p>
                        <p className="text-xl font-bold text-blue-600 mt-1">{activeStaffCount}</p>
                    </div>
                    <div className="bg-white border border-amber-200 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 font-medium">This Month Paid</p>
                        <p className="text-xl font-bold text-amber-600 mt-1">{thisMonthPaid} / {activeStaffCount}</p>
                    </div>
                    <div className="bg-white border border-violet-200 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 font-medium">Structures</p>
                        <p className="text-xl font-bold text-violet-600 mt-1">{structures.length}</p>
                    </div>
                </div>

                {/* ═══════ Tabs ═══════ */}
                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 overflow-x-auto">
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)}
                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${activeTab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>

                {/* ═══════ TAB: STRUCTURES ═══════ */}
                {activeTab === 'structures' && (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">Salary Structures</h2>
                            <button onClick={openCreateStructure} className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 transition-colors shadow-sm cursor-pointer">
                                <Plus className="w-4 h-4" /> Create
                            </button>
                        </div>
                        {structures.length === 0 ? (
                            <div className="p-10 text-center text-gray-400 text-sm">No salary structures created yet. Click &quot;Create&quot; to add one.</div>
                        ) : (
                            <div className="divide-y">
                                {structures.map(s => (
                                    <div key={s.id} className="px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{s.staff_name}</p>
                                            <p className="text-xs text-gray-500">{s.designation || s.role_target} · Effective: {s.effective_from ? new Date(s.effective_from).toLocaleDateString('en-IN') : '-'}</p>
                                            <div className="flex gap-2 mt-1 flex-wrap">
                                                <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">Base: ₹{parseFloat(s.base_salary).toLocaleString('en-IN')}</span>
                                                {Object.entries(s.allowances || {}).map(([k, v]) => (
                                                    <span key={k} className="text-[10px] px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-medium">+{k}: ₹{Number(v).toLocaleString('en-IN')}</span>
                                                ))}
                                                {Object.entries(s.deductions || {}).map(([k, v]) => (
                                                    <span key={k} className="text-[10px] px-2 py-0.5 bg-red-50 text-red-600 rounded-full font-medium">-{k}: ₹{Number(v).toLocaleString('en-IN')}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-emerald-600">₹{parseFloat(s.net_salary).toLocaleString('en-IN')}</p>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
                                            </div>
                                            <button onClick={() => openEditStructure(s)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors cursor-pointer"><Edit3 className="w-4 h-4" /></button>
                                            <button onClick={() => deleteStructure(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════ TAB: PAY SALARY ═══════ */}
                {activeTab === 'pay' && (
                    <div className="space-y-4">
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-bold text-gray-900">Pay Salary</h2>
                                <div className="flex items-center gap-3">
                                    {Object.values(payForm).filter(f => f.checked).length > 1 && (
                                        <button onClick={handlePayAll} disabled={payingAll} className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 shadow-sm disabled:opacity-50 flex items-center gap-2 transition-all cursor-pointer">
                                            {payingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                                            Pay Selected ({Object.values(payForm).filter(f => f.checked).length})
                                        </button>
                                    )}
                                    <input type="month" value={payMonth} onChange={e => setPayMonth(e.target.value)}
                                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500" />
                                </div>
                            </div>

                            {structures.filter(s => s.is_active).length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-sm">No active salary structures. Create one first.</div>
                            ) : (
                                <div className="space-y-3">
                                    {structures.filter(s => s.is_active).map(s => {
                                        const f = payForm[s.id] || { paymentMode: 'bank_transfer', referenceNumber: '', remarks: '', checked: true };
                                        return (
                                            <div key={s.id} className="border border-gray-200 rounded-xl p-4 hover:border-amber-300 transition-colors">
                                                <div className="flex items-start justify-between mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <input type="checkbox" checked={f.checked}
                                                            onChange={e => setPayForm(pf => ({ ...pf, [s.id]: { ...f, checked: e.target.checked } }))}
                                                            className="w-4 h-4 text-amber-600 rounded" />
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-900">{s.staff_name}</p>
                                                            <p className="text-xs text-gray-500">{s.designation || s.role_target}</p>
                                                        </div>
                                                    </div>
                                                    <p className="text-lg font-bold text-emerald-600">₹{parseFloat(s.net_salary).toLocaleString('en-IN')}</p>
                                                </div>
                                                {f.checked && (
                                                    <div className="grid grid-cols-3 gap-3 mt-2 pt-3 border-t border-gray-100">
                                                        <div>
                                                            <label className="block text-xs font-semibold text-gray-500 mb-1">Mode</label>
                                                            <select value={f.paymentMode} onChange={e => setPayForm(pf => ({ ...pf, [s.id]: { ...f, paymentMode: e.target.value } }))}
                                                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-500">
                                                                <option value="bank_transfer">Bank Transfer</option>
                                                                <option value="cash">Cash</option>
                                                                <option value="upi">UPI</option>
                                                                <option value="cheque">Cheque</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-semibold text-gray-500 mb-1">Reference #</label>
                                                            <input type="text" placeholder="UTR / Cheque no." value={f.referenceNumber}
                                                                onChange={e => setPayForm(pf => ({ ...pf, [s.id]: { ...f, referenceNumber: e.target.value } }))}
                                                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-500" />
                                                        </div>
                                                        <div className="flex items-end">
                                                            <button onClick={() => handlePaySalary(s.id)} className="w-full py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer">
                                                                Pay ₹{parseFloat(s.net_salary).toLocaleString('en-IN')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══════ TAB: HISTORY ═══════ */}
                {activeTab === 'history' && (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">Payment History</h2>
                            <input type="month" value={historyMonth} onChange={e => setHistoryMonth(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500" />
                        </div>
                        {payments.length === 0 ? (
                            <div className="p-10 text-center text-gray-400 text-sm">No salary payments recorded yet.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50/50 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                                            <th className="px-5 py-3">Staff</th>
                                            <th className="px-5 py-3">Month</th>
                                            <th className="px-5 py-3">Gross</th>
                                            <th className="px-5 py-3">Deductions</th>
                                            <th className="px-5 py-3">Net</th>
                                            <th className="px-5 py-3">Mode</th>
                                            <th className="px-5 py-3">Reference</th>
                                            <th className="px-5 py-3">Date</th>
                                            <th className="px-5 py-3">Status</th>
                                            <th className="px-5 py-3 w-16"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {payments.map(p => (
                                            <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-5 py-3.5">
                                                    <p className="font-semibold text-gray-900">{p.staff_name}</p>
                                                    <p className="text-[10px] text-gray-400">{p.designation || '-'}</p>
                                                </td>
                                                <td className="px-5 py-3.5 text-gray-600 font-medium">{p.month}</td>
                                                <td className="px-5 py-3.5 text-gray-600">₹{parseFloat(p.gross_amount).toLocaleString('en-IN')}</td>
                                                <td className="px-5 py-3.5 text-red-500">-₹{parseFloat(p.deductions_amount || '0').toLocaleString('en-IN')}</td>
                                                <td className="px-5 py-3.5 font-bold text-emerald-600">₹{parseFloat(p.net_amount).toLocaleString('en-IN')}</td>
                                                <td className="px-5 py-3.5 text-gray-500">{p.payment_mode?.replace('_', ' ').toUpperCase()}</td>
                                                <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">{p.reference_number || '-'}</td>
                                                <td className="px-5 py-3.5 text-gray-500">{new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                                                <td className="px-5 py-3.5">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.status === 'paid' ? 'bg-green-100 text-green-700' : p.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                                        {p.status?.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    {p.status === 'paid' && (
                                                        <a href={`/payslip/${p.id}`} target="_blank" rel="noopener noreferrer" 
                                                           className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-bold rounded-lg hover:bg-blue-100 cursor-pointer transition-colors">
                                                            <Receipt className="w-3 h-3" /> Print
                                                        </a>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════ TAB: SUMMARY ═══════ */}
                {activeTab === 'summary' && (
                    <div className="space-y-4">
                        <div className="bg-white border border-gray-200 rounded-2xl p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-4">Monthly Salary Summary</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                                    <p className="text-xs text-emerald-600 font-medium">Total Paid (All Time)</p>
                                    <p className="text-2xl font-bold text-emerald-700 mt-1">₹{totalSalaryExpense.toLocaleString('en-IN')}</p>
                                </div>
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                                    <p className="text-xs text-blue-600 font-medium">Monthly Salary Bill</p>
                                    <p className="text-2xl font-bold text-blue-700 mt-1">₹{structures.filter(s => s.is_active).reduce((s, st) => s + parseFloat(st.net_salary || '0'), 0).toLocaleString('en-IN')}</p>
                                </div>
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                                    <p className="text-xs text-amber-600 font-medium">Active Staff</p>
                                    <p className="text-2xl font-bold text-amber-700 mt-1">{activeStaffCount}</p>
                                </div>
                            </div>

                            <h3 className="text-sm font-bold text-gray-700 mb-3">By Staff Member</h3>
                            <div className="space-y-2">
                                {structures.filter(s => s.is_active).map(s => {
                                    const paid = payments.filter(p => p.user_id === s.user_id && p.status === 'paid');
                                    const totalPaid = paid.reduce((sum, p) => sum + parseFloat(p.net_amount || '0'), 0);
                                    return (
                                        <div key={s.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">{s.staff_name}</p>
                                                <p className="text-xs text-gray-500">{s.designation || s.role_target} · {paid.length} payments</p>
                                            </div>
                                            <p className="text-sm font-bold text-emerald-600">₹{totalPaid.toLocaleString('en-IN')}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

            </main>

            {/* ═══════ Structure Modal ═══════ */}
            {structureModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setStructureModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b">
                            <h2 className="text-lg font-bold text-gray-900">{editingStructure ? 'Edit' : 'Create'} Salary Structure</h2>
                            <button onClick={() => setStructureModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X className="w-5 h-5 text-gray-500" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            {/* Staff selector */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Staff Member *</label>
                                {selectedStaff ? (
                                    <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                        <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-sm font-bold text-amber-700">
                                            {selectedStaff.first_name?.[0]}{selectedStaff.last_name?.[0]}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-gray-900">{selectedStaff.first_name} {selectedStaff.last_name}</p>
                                            <p className="text-xs text-gray-500">{selectedStaff.email}</p>
                                        </div>
                                        <button onClick={() => { setSelectedStaff(null); setStructureForm(f => ({ ...f, userId: '' })); setStaffSearch(''); }} className="p-1 rounded hover:bg-amber-100 cursor-pointer"><X className="w-4 h-4 text-gray-500" /></button>
                                    </div>
                                ) : (
                                    <div className="relative flex flex-col sm:flex-row gap-2">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input type="text" placeholder="Search staff by name or email..." value={staffSearch} onChange={e => searchStaff(e.target.value)}
                                                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500" />
                                        </div>
                                        <select value={staffRoleFilter} onChange={e => searchStaff(staffSearch, e.target.value)}
                                            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 bg-white">
                                            <option value="">All Roles</option>
                                            <option value="teacher">Teacher</option>
                                            <option value="accountant">Accountant</option>
                                            <option value="admin">Admin</option>
                                            <option value="librarian">Librarian</option>
                                        </select>
                                        {staffResults.length > 0 && (
                                            <div className="absolute top-full left-0 z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                                {staffResults.map(s => (
                                                    <button key={s.id} onClick={() => { setSelectedStaff(s); setStructureForm(f => ({ ...f, userId: s.id, roleTarget: s.role })); setStaffResults([]); setStaffSearch(''); setStaffRoleFilter(''); }}
                                                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b last:border-b-0 cursor-pointer flex justify-between items-center">
                                                        <span className="font-semibold">{s.first_name} {s.last_name}</span>
                                                        <span className="text-gray-400 text-xs capitalize bg-gray-100 px-2 py-0.5 rounded-md">{s.role.replace('_', ' ')}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Designation */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Designation</label>
                                <input type="text" value={structureForm.designation} onChange={e => setStructureForm(f => ({ ...f, designation: e.target.value }))}
                                    placeholder="e.g. Senior Teacher, Head of Science" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500" />
                            </div>

                            {/* Base Salary */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Base Salary (₹) *</label>
                                <input type="number" value={structureForm.baseSalary} onChange={e => setStructureForm(f => ({ ...f, baseSalary: e.target.value }))}
                                    placeholder="25000" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500" />
                            </div>

                            {/* Allowances */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Allowances (+)</label>
                                <div className="space-y-2">
                                    {Object.entries(structureForm.allowances).map(([key, val]) => (
                                        <div key={key} className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-lg min-w-[60px] text-center">{key}</span>
                                            <input type="number" value={val} onChange={e => setStructureForm(f => ({ ...f, allowances: { ...f.allowances, [key]: e.target.value } }))}
                                                className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500" />
                                            <button onClick={() => { const { [key]: _, ...rest } = structureForm.allowances; setStructureForm(f => ({ ...f, allowances: rest })); }}
                                                className="p-1 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-2">
                                        <input type="text" placeholder="e.g. HRA, DA, TA" value={newAllowanceKey} onChange={e => setNewAllowanceKey(e.target.value)}
                                            className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-green-500" />
                                        <button onClick={() => { if (newAllowanceKey.trim()) { setStructureForm(f => ({ ...f, allowances: { ...f.allowances, [newAllowanceKey.trim()]: '0' } })); setNewAllowanceKey(''); } }}
                                            className="px-3 py-1.5 bg-green-100 text-green-700 text-xs font-semibold rounded-lg hover:bg-green-200 cursor-pointer"><Plus className="w-3.5 h-3.5" /></button>
                                    </div>
                                </div>
                            </div>

                            {/* Deductions */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Deductions (-)</label>
                                <div className="space-y-2">
                                    {Object.entries(structureForm.deductions).map(([key, val]) => (
                                        <div key={key} className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-lg min-w-[60px] text-center">{key}</span>
                                            <input type="number" value={val} onChange={e => setStructureForm(f => ({ ...f, deductions: { ...f.deductions, [key]: e.target.value } }))}
                                                className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500" />
                                            <button onClick={() => { const { [key]: _, ...rest } = structureForm.deductions; setStructureForm(f => ({ ...f, deductions: rest })); }}
                                                className="p-1 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-2">
                                        <input type="text" placeholder="e.g. PF, Tax, ESI" value={newDeductionKey} onChange={e => setNewDeductionKey(e.target.value)}
                                            className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-red-500" />
                                        <button onClick={() => { if (newDeductionKey.trim()) { setStructureForm(f => ({ ...f, deductions: { ...f.deductions, [newDeductionKey.trim()]: '0' } })); setNewDeductionKey(''); } }}
                                            className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-200 cursor-pointer"><Plus className="w-3.5 h-3.5" /></button>
                                    </div>
                                </div>
                            </div>

                            {/* Net Salary (auto-calculated) */}
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                                <p className="text-xs text-emerald-600 font-medium mb-1">Net Salary (Auto-Calculated)</p>
                                <p className="text-2xl font-bold text-emerald-700">₹{parseFloat(structureForm.netSalary || '0').toLocaleString('en-IN')}</p>
                            </div>

                            {/* Effective From */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Effective From</label>
                                <input type="date" value={structureForm.effectiveFrom} onChange={e => setStructureForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500" />
                            </div>

                            <button onClick={saveStructure} disabled={savingStructure || !structureForm.userId || !structureForm.baseSalary}
                                className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm cursor-pointer">
                                {savingStructure ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Saving...</> : editingStructure ? 'Update Structure' : 'Create Structure'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
