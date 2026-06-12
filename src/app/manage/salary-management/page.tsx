'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Navbar } from '@/components/ui/Navbar';
import { Button } from '@/components/ui/button';
import {
    IndianRupee, ArrowLeft, X, Search, Plus, Trash2, Edit3, Loader2,
    CheckCircle, Users, CalendarDays, Banknote, ClipboardList, ChevronRight, Receipt, Filter, Settings, Award
} from 'lucide-react';

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
    remarks: string; status: string; designation: string; advance_deducted: string;
}

interface SalaryComponent {
    id: string; name: string; type: 'earning' | 'deduction';
    is_percentage: boolean; percentage_of: string | null;
}

interface SalaryAdvance {
    id: string; user_id: string; staff_name: string; amount: string;
    given_date: string; repayment_start_month: string; monthly_deduction: string;
    amount_repaid: string; status: string;
}

interface StaffMember { id: string; first_name: string; last_name: string; email: string; role: string; }

type ActiveTab = 'structures' | 'pay' | 'history' | 'components' | 'advances' | 'summary';

export default function SalaryManagementPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<ActiveTab>('structures');

    // Data lists
    const [structures, setStructures] = useState<SalaryStructure[]>([]);
    const [payments, setPayments] = useState<SalaryPayment[]>([]);
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [components, setComponents] = useState<SalaryComponent[]>([]);
    const [advances, setAdvances] = useState<SalaryAdvance[]>([]);

    // Component Modal
    const [compModal, setCompModal] = useState(false);
    const [editingComp, setEditingComp] = useState<SalaryComponent | null>(null);
    const [compForm, setCompForm] = useState({
        name: '', type: 'earning' as 'earning' | 'deduction',
        isPercentage: false, percentageOf: 'Basic Pay'
    });

    // Advance Modal
    const [advModal, setAdvModal] = useState(false);
    const [advForm, setAdvForm] = useState({
        userId: '', amount: '', monthlyDeduction: '',
        repaymentStartMonth: new Date().toISOString().slice(0, 7),
        givenDate: new Date().toISOString().split('T')[0]
    });

    // Payslip Printable Modal
    const [payslipModal, setPayslipModal] = useState(false);
    const [activePayslip, setActivePayslip] = useState<any>(null);

    // Structure Modal
    const [structureModal, setStructureModal] = useState(false);
    const [editingStructure, setEditingStructure] = useState<SalaryStructure | null>(null);
    const [structureForm, setStructureForm] = useState({
        userId: '', roleTarget: 'teacher', designation: '', baseSalary: '',
        allowances: {} as Record<string, string>, deductions: {} as Record<string, string>,
        netSalary: '', effectiveFrom: new Date().toISOString().split('T')[0],
    });

    // Staff Search
    const [staffSearch, setStaffSearch] = useState('');
    const [staffRoleFilter, setStaffRoleFilter] = useState('');
    const [staffResults, setStaffResults] = useState<StaffMember[]>([]);
    const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

    // Pay Salary Form
    const [payMonth, setPayMonth] = useState(new Date().toISOString().slice(0, 7));
    const [payForm, setPayForm] = useState<Record<string, { paymentMode: string; referenceNumber: string; remarks: string; checked: boolean; advanceDeducted: string }>>({});
    const [payingAll, setPayingAll] = useState(false);

    // History filter
    const [historyMonth, setHistoryMonth] = useState('');

    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        try {
            const parsed = JSON.parse(userData);
            if (!['super_admin', 'developer', 'accountant'].includes(parsed.role)) { router.replace('/login'); return; }
            setUser(parsed);
        } catch { router.replace('/login'); }
        setLoading(false);
    }, [router]);

    const getToken = () => localStorage.getItem('token') || '';
    const headers = useCallback(() => ({
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
    }), []);

    // --- Fetch Data ---
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

    const fetchComponents = useCallback(async () => {
        try { const r = await fetch('/api/salary/components', { headers: headers() }); if (r.ok) { const d = await r.json(); setComponents(d.components || []); } } catch { }
    }, [headers]);

    const fetchAdvances = useCallback(async () => {
        try { const r = await fetch('/api/salary/advances', { headers: headers() }); if (r.ok) { const d = await r.json(); setAdvances(d.advances || []); } } catch { }
    }, [headers]);

    const loadAllData = useCallback(() => {
        if (user) {
            fetchStructures();
            fetchPayments();
            fetchStaff();
            fetchComponents();
            fetchAdvances();
        }
    }, [user, fetchStructures, fetchPayments, fetchStaff, fetchComponents, fetchAdvances]);

    useEffect(() => {
        loadAllData();
    }, [user, loadAllData]);

    useEffect(() => {
        if (user && activeTab === 'history') fetchPayments();
    }, [user, activeTab, fetchPayments]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    // --- Component Math Calculations ---
    const calcFormNet = useCallback((base: string, allowances: Record<string, string>, deductions: Record<string, string>) => {
        const b = parseFloat(base) || 0;
        const earningsSum = Object.values(allowances).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
        const deductionsSum = Object.values(deductions).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
        return (b + earningsSum - deductionsSum).toFixed(2);
    }, []);

    // Recalculate net salary when components change in structure form
    useEffect(() => {
        setStructureForm(f => ({ ...f, netSalary: calcFormNet(f.baseSalary, f.allowances, f.deductions) }));
    }, [structureForm.baseSalary, structureForm.allowances, structureForm.deductions, calcFormNet]);

    // Recalculate percentages dynamically in structure form when base salary changes
    const handleBaseSalaryChange = (newVal: string) => {
        const baseVal = parseFloat(newVal) || 0;
        setStructureForm(f => {
            const allowances = { ...f.allowances };
            const deductions = { ...f.deductions };

            // Update percentage values
            components.forEach(comp => {
                if (comp.is_percentage) {
                    const percentage = parseFloat(comp.percentage_of || '0') || 0; 
                    // To keep it simple, percentage_of is assumed to be percentage value (e.g. 10 representing 10% of base)
                    // Let's check: if comp.is_percentage is true, let's treat the value input in structure form as percentage, or auto-calculate:
                    // Actually, a simpler way: the structure allows entering custom amounts or we auto-calc.
                }
            });

            return { ...f, baseSalary: newVal, allowances, deductions };
        });
    };

    // --- Component Handlers ---
    const openCreateComp = () => {
        setEditingComp(null);
        setCompForm({ name: '', type: 'earning', isPercentage: false, percentageOf: 'Basic Pay' });
        setCompModal(true);
    };

    const openEditComp = (comp: SalaryComponent) => {
        setEditingComp(comp);
        setCompForm({
            name: comp.name,
            type: comp.type,
            isPercentage: comp.is_percentage,
            percentageOf: comp.percentage_of || 'Basic Pay'
        });
        setCompModal(true);
    };

    const saveComponent = async () => {
        setSaving(true);
        setError('');
        try {
            const method = editingComp ? 'PUT' : 'POST';
            const body = {
                id: editingComp?.id,
                ...compForm
            };
            const r = await fetch('/api/salary/components', {
                method,
                headers: headers(),
                body: JSON.stringify(body)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to save component');
            setSuccess('Salary component saved!');
            setCompModal(false);
            fetchComponents();
        } catch (err: any) {
            setError(err.message);
        }
        setSaving(false);
    };

    const deleteComponent = async (id: string) => {
        if (!confirm('Are you sure you want to delete this component?')) return;
        try {
            const r = await fetch(`/api/salary/components?id=${id}`, {
                method: 'DELETE',
                headers: headers()
            });
            if (!r.ok) throw new Error('Failed to delete');
            setSuccess('Component deleted!');
            fetchComponents();
        } catch (err: any) {
            alert(err.message);
        }
    };

    // --- Advance Handlers ---
    const openCreateAdv = () => {
        setAdvForm({
            userId: '', amount: '', monthlyDeduction: '',
            repaymentStartMonth: new Date().toISOString().slice(0, 7),
            givenDate: new Date().toISOString().split('T')[0]
        });
        setSelectedStaff(null);
        setStaffSearch('');
        setError('');
        setAdvModal(true);
    };

    const saveAdvance = async () => {
        if (!selectedStaff) {
            setError('Please select a staff member');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const body = {
                userId: selectedStaff.id,
                amount: advForm.amount,
                monthlyDeduction: advForm.monthlyDeduction,
                repaymentStartMonth: advForm.repaymentStartMonth,
                givenDate: advForm.givenDate
            };
            const r = await fetch('/api/salary/advances', {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify(body)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to record advance');
            setSuccess('Advance recorded successfully!');
            setAdvModal(false);
            fetchAdvances();
        } catch (err: any) {
            setError(err.message);
        }
        setSaving(false);
    };

    // --- Structure CRUD ---
    const openCreateStructure = () => {
        setEditingStructure(null);
        setSelectedStaff(null);
        setStaffSearch('');
        setStructureForm({
            userId: '', roleTarget: 'teacher', designation: '', baseSalary: '',
            allowances: {}, deductions: {}, netSalary: '',
            effectiveFrom: new Date().toISOString().split('T')[0]
        });
        setError('');
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
            effectiveFrom: s.effective_from ? s.effective_from.split('T')[0] : ''
        });

        setSelectedStaff({
            id: s.user_id,
            first_name: s.staff_name?.split(' ')[0] || '',
            last_name: s.staff_name?.split(' ').slice(1).join(' ') || '',
            email: s.staff_email,
            role: s.role_target
        });
        setError('');
        setStructureModal(true);
    };

    const saveStructure = async () => {
        if (!selectedStaff || !structureForm.baseSalary) return;
        setSaving(true);
        setError('');

        const allowancesNum: Record<string, number> = {};
        const deductionsNum: Record<string, number> = {};
        Object.entries(structureForm.allowances).forEach(([k, v]) => { allowancesNum[k] = parseFloat(v) || 0; });
        Object.entries(structureForm.deductions).forEach(([k, v]) => { deductionsNum[k] = parseFloat(v) || 0; });

        const body: any = {
            userId: selectedStaff.id,
            roleTarget: selectedStaff.role,
            designation: structureForm.designation,
            baseSalary: parseFloat(structureForm.baseSalary),
            allowances: allowancesNum,
            deductions: deductionsNum,
            netSalary: parseFloat(structureForm.netSalary || '0'),
            effectiveFrom: structureForm.effectiveFrom,
        };
        if (editingStructure) body.id = editingStructure.id;

        try {
            const r = await fetch('/api/salary/structures', {
                method: editingStructure ? 'PUT' : 'POST',
                headers: headers(),
                body: JSON.stringify(body)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to save structure');
            setSuccess('Salary structure saved!');
            setStructureModal(false);
            fetchStructures();
        } catch (err: any) {
            setError(err.message);
        }
        setSaving(false);
    };

    const deleteStructure = async (id: string) => {
        if (!confirm('Are you sure you want to delete this structure?')) return;
        try {
            const r = await fetch(`/api/salary/structures?id=${id}`, {
                method: 'DELETE',
                headers: headers()
            });
            if (!r.ok) throw new Error('Failed to delete');
            setSuccess('Structure deleted!');
            fetchStructures();
        } catch (err: any) {
            alert(err.message);
        }
    };

    // --- Staff search ---
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

    // --- Pay Salary ---
    const initPayForm = useCallback(() => {
        const form: typeof payForm = {};
        structures.filter(s => s.is_active).forEach(s => {
            // Find if this user has any active salary advances for this month
            const activeAdv = advances.find(a => a.user_id === s.user_id && a.status === 'active');
            const advDeducted = activeAdv ? activeAdv.monthly_deduction : '0';

            form[s.id] = {
                paymentMode: 'bank_transfer',
                referenceNumber: '',
                remarks: '',
                checked: true,
                advanceDeducted: advDeducted
            };
        });
        setPayForm(form);
    }, [structures, advances]);

    useEffect(() => {
        if (activeTab === 'pay') initPayForm();
    }, [activeTab, initPayForm]);

    const handlePaySalary = async (structureId: string) => {
        const s = structures.find(st => st.id === structureId);
        const f = payForm[structureId];
        if (!s || !f) return;

        const gross = parseFloat(s.base_salary) + Object.values(s.allowances || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
        
        // Net deductions is normal structure deductions + advance deduction if checked
        const structuralDeductions = Object.values(s.deductions || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
        const advDeduct = parseFloat(f.advanceDeducted || '0') || 0;
        const totalDeductions = structuralDeductions + advDeduct;
        const finalNet = gross - totalDeductions;

        try {
            const r = await fetch('/api/salary/payments', {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({
                    userId: s.user_id,
                    salaryStructureId: s.id,
                    month: payMonth,
                    grossAmount: gross,
                    deductionsAmount: totalDeductions,
                    netAmount: finalNet,
                    paymentMode: f.paymentMode,
                    referenceNumber: f.referenceNumber,
                    remarks: f.remarks,
                    paymentDate: new Date().toISOString().split('T')[0],
                    advanceDeducted: advDeduct
                }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to record payment');
            
            // Success
            setSuccess(`Salary paid to ${s.staff_name} for ${payMonth}`);
            fetchPayments();
            fetchAdvances(); // Refresh advance balances
        } catch (err: any) {
            alert(err.message || 'Failed to pay salary');
        }
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

    // --- Payslip View ---
    const showPayslipDetails = async (payment: SalaryPayment) => {
        try {
            const res = await fetch(`/api/salary/payslip?userId=${payment.user_id}&month=${payment.month}`, {
                headers: headers()
            });
            const data = await res.json();
            if (res.ok) {
                // Fetch user's structure details to split allowances/deductions
                const struct = structures.find(s => s.user_id === payment.user_id);
                setActivePayslip({
                    ...data.payslip,
                    allowances: struct?.allowances || {},
                    deductions: struct?.deductions || {}
                });
                setPayslipModal(true);
            } else {
                alert(data.error || 'Failed to load payslip');
            }
        } catch {
            alert('Failed to load payslip');
        }
    };

    const triggerPrint = () => {
        if (typeof window !== 'undefined') {
            window.print();
        }
    };

    // --- Stats ---
    const totalSalaryExpense = payments.filter(p => p.status === 'paid').reduce((s, p) => s + parseFloat(p.net_amount || '0'), 0);
    const activeStaffCount = structures.filter(s => s.is_active).length;
    const thisMonthPayments = payments.filter(p => p.month === new Date().toISOString().slice(0, 7));
    const thisMonthPaid = thisMonthPayments.filter(p => p.status === 'paid').length;

    const tabs = [
        { id: 'structures' as const, label: 'Salary Structures', icon: <ClipboardList className="w-4.5 h-4.5" /> },
        { id: 'pay' as const, label: 'Pay Salary', icon: <Banknote className="w-4.5 h-4.5" /> },
        { id: 'history' as const, label: 'Payment History', icon: <CalendarDays className="w-4.5 h-4.5" /> },
        { id: 'components' as const, label: 'Salary Components', icon: <Settings className="w-4.5 h-4.5" /> },
        { id: 'advances' as const, label: 'Advances / Loans', icon: <Award className="w-4.5 h-4.5" /> },
        { id: 'summary' as const, label: 'Register Summary', icon: <IndianRupee className="w-4.5 h-4.5" /> },
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans print:bg-white print:min-h-0">
            <div className="print:hidden">
                <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
                <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />
            </div>

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16 print:mt-0 print:py-0">

                {/* Hero Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-950 via-amber-900 to-orange-950 text-white p-6 sm:p-8 mb-8 shadow-2xl print:hidden">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-amber-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-yellow-500 rounded-full mix-blend-screen filter blur-3xl opacity-20"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <button onClick={() => router.push('/manage/finance')} className="inline-flex items-center gap-1.5 text-xs text-amber-300 hover:text-white mb-3 transition-colors cursor-pointer font-bold">
                                <ArrowLeft className="w-4 h-4" /> Finance Dashboard
                            </button>
                            <h1 className="text-2xl sm:text-3xl font-black">Staff Salary Management</h1>
                            <p className="text-amber-100 text-sm mt-1 max-w-lg">Manage salary templates, components, cash advances, and print compliant payslips</p>
                        </div>
                        <Users className="w-12 h-12 text-amber-200 opacity-80 shrink-0 hidden md:block" />
                    </div>
                </div>

                {/* Notifications */}
                {success && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center justify-between shadow-sm print:hidden">
                        <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {success}</span>
                        <button onClick={() => setSuccess('')}><X className="w-4 h-4" /></button>
                    </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 print:hidden">
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4">
                        <p className="text-[10px] uppercase font-bold text-gray-400">Total Paid Out</p>
                        <p className="text-xl font-black text-emerald-600 mt-0.5">₹{totalSalaryExpense.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4">
                        <p className="text-[10px] uppercase font-bold text-gray-400">Staff Count</p>
                        <p className="text-xl font-black text-blue-600 mt-0.5">{activeStaffCount}</p>
                    </div>
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4">
                        <p className="text-[10px] uppercase font-bold text-gray-400">Month Payments</p>
                        <p className="text-xl font-black text-amber-600 mt-0.5">{thisMonthPaid} Paid</p>
                    </div>
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4">
                        <p className="text-[10px] uppercase font-bold text-gray-400">Active Structures</p>
                        <p className="text-xl font-black text-violet-600 mt-0.5">{structures.length}</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-white p-1 rounded-xl border border-gray-200 mb-6 overflow-x-auto print:hidden">
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${activeTab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>

                {/* --- STRUCTURES TAB --- */}
                {activeTab === 'structures' && (
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden print:hidden">
                        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                            <h2 className="text-sm font-black text-gray-900">Salary Structures</h2>
                            <Button onClick={openCreateStructure} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9">
                                <Plus className="w-4 h-4 mr-1" /> Create Structure
                            </Button>
                        </div>
                        {structures.length === 0 ? (
                            <div className="p-12 text-center text-gray-400 text-sm">No salary structures created yet. Click &quot;Create Structure&quot; to begin.</div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {structures.map(s => (
                                    <div key={s.id} className="px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-all">
                                        <div>
                                            <p className="text-sm font-black text-gray-900">{s.staff_name}</p>
                                            <p className="text-xs text-gray-500 font-medium">{s.designation || s.role_target.toUpperCase()} · Effective: {s.effective_from ? new Date(s.effective_from).toLocaleDateString('en-IN') : '-'}</p>
                                            <div className="flex gap-1.5 mt-2 flex-wrap">
                                                <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-bold">Base: ₹{parseFloat(s.base_salary)}</span>
                                                {Object.entries(s.allowances || {}).map(([k, v]) => (
                                                    <span key={k} className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-bold">+{k}: ₹{v}</span>
                                                ))}
                                                {Object.entries(s.deductions || {}).map(([k, v]) => (
                                                    <span key={k} className="text-[10px] px-2 py-0.5 bg-red-50 text-red-700 rounded-full font-bold">-{k}: ₹{v}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <p className="text-sm font-black text-emerald-600">₹{parseFloat(s.net_salary).toLocaleString('en-IN')}</p>
                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${s.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
                                            </div>
                                            <button onClick={() => openEditStructure(s)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-all cursor-pointer"><Edit3 className="w-4 h-4" /></button>
                                            <button onClick={() => deleteStructure(s.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* --- PAY SALARY TAB --- */}
                {activeTab === 'pay' && (
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6 print:hidden">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-50 pb-4 mb-4">
                            <div>
                                <h2 className="text-sm font-black text-gray-900">Record Salary Payments</h2>
                                <p className="text-xs text-gray-400 mt-0.5">Select a month and record payments for all active staff structures</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="month" value={payMonth} onChange={e => setPayMonth(e.target.value)}
                                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-500" />
                                {Object.values(payForm).filter(f => f.checked).length > 0 && (
                                    <Button onClick={handlePayAll} disabled={payingAll} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs h-9">
                                        Pay Selected ({Object.values(payForm).filter(f => f.checked).length})
                                    </Button>
                                )}
                            </div>
                        </div>

                        {structures.filter(s => s.is_active).length === 0 ? (
                            <div className="p-12 text-center text-gray-400 text-sm">No active salary structures setup.</div>
                        ) : (
                            <div className="space-y-4">
                                {structures.filter(s => s.is_active).map(s => {
                                    const f = payForm[s.id] || { paymentMode: 'bank_transfer', referenceNumber: '', remarks: '', checked: true, advanceDeducted: '0' };
                                    const hasAdvance = parseFloat(f.advanceDeducted) > 0;
                                    const baseNet = parseFloat(s.net_salary);
                                    const finalNetVal = baseNet - parseFloat(f.advanceDeducted || '0');

                                    return (
                                        <div key={s.id} className="border border-gray-150 rounded-2xl p-4 hover:border-indigo-400 transition-colors">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                                                <div className="flex items-center gap-3">
                                                    <input type="checkbox" checked={f.checked}
                                                        onChange={e => setPayForm(pf => ({ ...pf, [s.id]: { ...f, checked: e.target.checked } }))}
                                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-900">{s.staff_name}</p>
                                                        <p className="text-xs text-gray-500 font-semibold">{s.designation || s.role_target.toUpperCase()}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-base font-black text-emerald-600">₹{finalNetVal.toLocaleString('en-IN')}</p>
                                                    {hasAdvance && (
                                                        <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full">
                                                            Advance Deducted: -₹{f.advanceDeducted}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {f.checked && (
                                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
                                                    <div>
                                                        <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Mode</label>
                                                        <select value={f.paymentMode} onChange={e => setPayForm(pf => ({ ...pf, [s.id]: { ...f, paymentMode: e.target.value } }))}
                                                            className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none">
                                                            <option value="bank_transfer">Bank Transfer</option>
                                                            <option value="cash">Cash (Indian currency)</option>
                                                            <option value="upi">UPI / Online</option>
                                                            <option value="cheque">Cheque</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Reference Number</label>
                                                        <input type="text" placeholder="UTR/Txn ID/Cheque#" value={f.referenceNumber}
                                                            onChange={e => setPayForm(pf => ({ ...pf, [s.id]: { ...f, referenceNumber: e.target.value } }))}
                                                            className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Deduct Active Advance</label>
                                                        <input type="number" placeholder="Deduction amount" value={f.advanceDeducted}
                                                            onChange={e => setPayForm(pf => ({ ...pf, [s.id]: { ...f, advanceDeducted: e.target.value } }))}
                                                            className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-amber-600 focus:ring-1 focus:ring-indigo-500 outline-none" />
                                                    </div>
                                                    <div className="flex items-end">
                                                        <button onClick={() => handlePaySalary(s.id)} className="w-full py-1.5 bg-indigo-600 text-white text-xs font-black rounded-lg hover:bg-indigo-700 transition-colors shadow-sm h-[32px] cursor-pointer">
                                                            Record Payment
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
                )}

                {/* --- HISTORY TAB --- */}
                {activeTab === 'history' && (
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden print:hidden">
                        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                            <h2 className="text-sm font-black text-gray-900">Payment Audit History</h2>
                            <input type="month" value={historyMonth} onChange={e => setHistoryMonth(e.target.value)}
                                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        {payments.length === 0 ? (
                            <div className="p-12 text-center text-gray-400 text-sm">No payment records match filters.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs select-none">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-400 font-bold uppercase border-b border-gray-150 text-[10px]">
                                            <th className="py-3.5 px-5">Staff</th>
                                            <th className="py-3.5 px-5">Month</th>
                                            <th className="py-3.5 px-5">Gross Pay</th>
                                            <th className="py-3.5 px-5">Advance Deducted</th>
                                            <th className="py-3.5 px-5">Net Paid</th>
                                            <th className="py-3.5 px-5">Mode</th>
                                            <th className="py-3.5 px-5">Txn Reference</th>
                                            <th className="py-3.5 px-5">Payment Date</th>
                                            <th className="py-3.5 px-5 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 text-gray-600 font-medium">
                                        {payments.map(p => (
                                            <tr key={p.id} className="hover:bg-gray-50/40">
                                                <td className="py-3 px-5">
                                                    <div className="font-bold text-gray-900">{p.staff_name}</div>
                                                    <div className="text-[10px] text-gray-400 font-semibold">{p.designation || 'STAFF'}</div>
                                                </td>
                                                <td className="py-3 px-5 font-bold text-gray-750">{p.month}</td>
                                                <td className="py-3 px-5">₹{parseFloat(p.gross_amount)}</td>
                                                <td className="py-3 px-5 text-amber-600 font-bold">{parseFloat(p.advance_deducted) > 0 ? `₹${p.advance_deducted}` : '-'}</td>
                                                <td className="py-3 px-5 font-black text-emerald-600">₹{parseFloat(p.net_amount)}</td>
                                                <td className="py-3 px-5 uppercase text-[10px] bg-gray-50 rounded-lg py-1 px-2 text-center w-fit mt-2 block font-bold text-gray-500">
                                                    {p.payment_mode.replace('_', ' ')}
                                                </td>
                                                <td className="py-3 px-5 font-mono text-gray-400">{p.reference_number || '-'}</td>
                                                <td className="py-3 px-5">{new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                                                <td className="py-3 px-5 text-right">
                                                    <button onClick={() => showPayslipDetails(p)}
                                                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition-colors flex items-center gap-1 text-[10px] ml-auto">
                                                        <Receipt className="w-3 h-3" /> View Payslip
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* --- COMPONENTS TAB --- */}
                {activeTab === 'components' && (
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden print:hidden">
                        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-black text-gray-900">Salary Components Configuration</h2>
                                <p className="text-xs text-gray-400 mt-0.5">Manage earnings & deductions applicable to school salary sheets</p>
                            </div>
                            <Button onClick={openCreateComp} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9">
                                <Plus className="w-4 h-4 mr-1" /> Add Component
                            </Button>
                        </div>
                        {components.length === 0 ? (
                            <div className="p-12 text-center text-gray-400 text-sm">No components configured.</div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {components.map(comp => (
                                    <div key={comp.id} className="px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-all">
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{comp.name}</p>
                                            <p className="text-xs text-gray-400 font-medium uppercase mt-0.5">
                                                Type: <span className={`font-bold ${comp.type === 'earning' ? 'text-emerald-600' : 'text-red-500'}`}>{comp.type}</span>
                                                {comp.is_percentage && ` · Formula: ${comp.percentage_of}% of Basic Pay`}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => openEditComp(comp)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 cursor-pointer"><Edit3 className="w-4 h-4" /></button>
                                            <button onClick={() => deleteComponent(comp.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* --- ADVANCES TAB --- */}
                {activeTab === 'advances' && (
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden print:hidden">
                        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                            <div>
                                <h2 className="text-sm font-black text-gray-900">Staff Advances & Loans Registry</h2>
                                <p className="text-xs text-gray-400 mt-0.5">Record advanced cash and track recovery schedules during monthly payrolls</p>
                            </div>
                            <Button onClick={openCreateAdv} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9">
                                <Plus className="w-4 h-4 mr-1" /> Disburse Advance
                            </Button>
                        </div>
                        {advances.length === 0 ? (
                            <div className="p-12 text-center text-gray-400 text-sm">No advance loan logs.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs select-none">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-400 font-bold uppercase border-b border-gray-150 text-[10px]">
                                            <th className="py-3.5 px-5">Staff member</th>
                                            <th className="py-3.5 px-5">Loan Amount</th>
                                            <th className="py-3.5 px-5">Monthly Deduction</th>
                                            <th className="py-3.5 px-5">Total Repaid</th>
                                            <th className="py-3.5 px-5">Remaining Balance</th>
                                            <th className="py-3.5 px-5">Repayment Start Month</th>
                                            <th className="py-3.5 px-5">Disbursement Date</th>
                                            <th className="py-3.5 px-5 text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 text-gray-600 font-medium">
                                        {advances.map(a => {
                                            const total = parseFloat(a.amount);
                                            const repaid = parseFloat(a.amount_repaid || '0');
                                            const bal = Math.max(0, total - repaid);
                                            return (
                                                <tr key={a.id} className="hover:bg-gray-50/30">
                                                    <td className="py-3 px-5 font-bold text-gray-900">{a.staff_name}</td>
                                                    <td className="py-3 px-5 font-bold text-gray-800">₹{total}</td>
                                                    <td className="py-3 px-5 font-semibold text-amber-600">₹{a.monthly_deduction}/month</td>
                                                    <td className="py-3 px-5 font-bold text-emerald-600">₹{repaid}</td>
                                                    <td className="py-3 px-5 font-black text-gray-800">₹{bal}</td>
                                                    <td className="py-3 px-5 font-semibold font-mono text-gray-500">{a.repayment_start_month}</td>
                                                    <td className="py-3 px-5">{new Date(a.given_date).toLocaleDateString('en-IN')}</td>
                                                    <td className="py-3 px-5 text-right">
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                                            a.status === 'active' ? 'bg-amber-50 text-amber-700' :
                                                            a.status === 'fully_repaid' ? 'bg-emerald-50 text-emerald-700' :
                                                            'bg-gray-100 text-gray-500'
                                                        }`}>
                                                            {a.status.replace('_', ' ')}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* --- REGISTER SUMMARY TAB --- */}
                {activeTab === 'summary' && (
                    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6 print:hidden">
                        <div className="flex justify-between items-center border-b border-gray-50 pb-4 mb-4">
                            <div>
                                <h2 className="text-sm font-black text-gray-900">Salary Registry (Audit Sheets)</h2>
                                <p className="text-xs text-gray-400 mt-0.5">Overview of active staff configurations for financial reporting</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => window.print()} className="text-xs h-8">Print/PDF Register</Button>
                        </div>

                        {structures.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No salary sheets configured.</p>
                        ) : (
                            <div className="overflow-x-auto border border-gray-150 rounded-2xl">
                                <table className="w-full text-left border-collapse text-xs select-none">
                                    <thead>
                                        <tr className="bg-gray-50 text-gray-500 font-bold uppercase border-b border-gray-150 text-[10px]">
                                            <th className="py-3.5 px-4">Staff Member</th>
                                            <th className="py-3.5 px-4">Role/Designation</th>
                                            <th className="py-3.5 px-4">Base Salary</th>
                                            <th className="py-3.5 px-4">Allowances (Total)</th>
                                            <th className="py-3.5 px-4">Deductions (Total)</th>
                                            <th className="py-3.5 px-4">Net Salary</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 font-semibold text-gray-600">
                                        {structures.map(s => {
                                            const allowanceTotal = Object.values(s.allowances || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
                                            const deductionTotal = Object.values(s.deductions || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
                                            return (
                                                <tr key={s.id} className="hover:bg-gray-50/30">
                                                    <td className="py-3 px-4 font-bold text-gray-950">{s.staff_name}</td>
                                                    <td className="py-3 px-4 capitalize">{s.designation || s.role_target}</td>
                                                    <td className="py-3 px-4 text-gray-800">₹{parseFloat(s.base_salary)}</td>
                                                    <td className="py-3 px-4 text-emerald-700">+₹{allowanceTotal}</td>
                                                    <td className="py-3 px-4 text-red-600">-₹{deductionTotal}</td>
                                                    <td className="py-3 px-4 font-black text-emerald-600">₹{parseFloat(s.net_salary)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

            </main>

            {/* --- COMPONENT FORM MODAL --- */}
            {compModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setCompModal(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">{editingComp ? 'Edit Salary Component' : 'New Salary Component'}</h2>
                            <button onClick={() => setCompModal(false)} className="p-1.5 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {error && <div className="p-3 bg-red-50 border border-red-100 text-xs text-red-700 rounded-xl">{error}</div>}
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1 block">Component Name *</label>
                                <input value={compForm.name} onChange={e => setCompForm({ ...compForm, name: e.target.value })}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. HRA, TA, PF" />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1 block">Component Type *</label>
                                <select value={compForm.type} onChange={e => setCompForm({ ...compForm, type: e.target.value as any })}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-semibold">
                                    <option value="earning">Earning (+)</option>
                                    <option value="deduction">Deduction (-)</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                                <input type="checkbox" checked={compForm.isPercentage} onChange={e => setCompForm({ ...compForm, isPercentage: e.target.checked })}
                                    id="isPercentageCheckbox" className="w-4 h-4 text-indigo-600 rounded" />
                                <label htmlFor="isPercentageCheckbox" className="text-xs font-semibold text-gray-650 cursor-pointer">Calculate as percentage of Basic Pay</label>
                            </div>
                            {compForm.isPercentage && (
                                <div>
                                    <label className="text-xs font-semibold text-gray-650 mb-1 block">Percentage Value *</label>
                                    <input value={compForm.percentageOf} onChange={e => setCompForm({ ...compForm, percentageOf: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. 10 for 10%" />
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-gray-100 flex justify-end gap-3 rounded-b-3xl">
                            <Button variant="outline" onClick={() => setCompModal(false)}>Cancel</Button>
                            <Button onClick={saveComponent} disabled={saving || !compForm.name}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4">
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                Save Component
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- ADVANCE FORM MODAL --- */}
            {advModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setAdvModal(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">Disburse Salary Advance</h2>
                            <button onClick={() => setAdvModal(false)} className="p-1.5 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {error && <div className="p-3 bg-red-50 border border-red-100 text-xs text-red-700 rounded-xl">{error}</div>}

                            {/* Search Staff */}
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1 block">Select Staff Member *</label>
                                {selectedStaff ? (
                                    <div className="flex items-center justify-between p-3 bg-indigo-50/50 border border-indigo-150 rounded-xl text-xs font-bold text-indigo-900">
                                        <div>
                                            <p>{selectedStaff.first_name} {selectedStaff.last_name}</p>
                                            <p className="text-[10px] text-indigo-500 font-semibold">{selectedStaff.email}</p>
                                        </div>
                                        <button onClick={() => setSelectedStaff(null)} className="p-1 hover:bg-indigo-100 rounded-full"><X className="w-4 h-4" /></button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                                        <input value={staffSearch} onChange={e => searchStaff(e.target.value)}
                                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Type staff name..." />
                                        
                                        {staffResults.length > 0 && (
                                            <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-150 rounded-xl shadow-xl z-20 max-h-40 overflow-y-auto divide-y divide-gray-50">
                                                {staffResults.map(s => (
                                                    <div key={s.id} onClick={() => { setSelectedStaff(s); setStaffSearch(''); setStaffResults([]); }}
                                                        className="p-3 hover:bg-indigo-50/50 cursor-pointer text-xs font-semibold text-gray-800 flex justify-between">
                                                        <span>{s.first_name} {s.last_name}</span>
                                                        <span className="text-[10px] text-gray-400 font-bold uppercase">{s.role}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Amount & Monthly Deduction */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Advance Amount *</label>
                                    <input type="number" value={advForm.amount} onChange={e => setAdvForm({ ...advForm, amount: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="₹10000" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Monthly Deduction *</label>
                                    <input type="number" value={advForm.monthlyDeduction} onChange={e => setAdvForm({ ...advForm, monthlyDeduction: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="₹2000" />
                                </div>
                            </div>

                            {/* Repayment Month & Date */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Repayment Start Month *</label>
                                    <input type="month" value={advForm.repaymentStartMonth} onChange={e => setAdvForm({ ...advForm, repaymentStartMonth: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Disbursed Date *</label>
                                    <input type="date" value={advForm.givenDate} onChange={e => setAdvForm({ ...advForm, givenDate: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex justify-end gap-3 rounded-b-3xl">
                            <Button variant="outline" onClick={() => setAdvModal(false)}>Cancel</Button>
                            <Button onClick={saveAdvance} disabled={saving || !selectedStaff || !advForm.amount || !advForm.monthlyDeduction || !advForm.repaymentStartMonth}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4">
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                Disburse Advance
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- STRUCTURE FORM MODAL --- */}
            {structureModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setStructureModal(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-3xl z-10">
                            <h2 className="text-lg font-bold text-gray-900">{editingStructure ? 'Edit Salary Structure' : 'Create Salary Structure'}</h2>
                            <button onClick={() => setStructureModal(false)} className="p-1.5 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {error && <div className="p-3 bg-red-50 border border-red-100 text-xs text-red-700 rounded-xl">{error}</div>}

                            {/* Staff Selector */}
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Staff Member *</label>
                                {selectedStaff ? (
                                    <div className="flex items-center justify-between p-3.5 bg-indigo-50/50 border border-indigo-150 rounded-xl text-xs font-bold text-indigo-900">
                                        <div>
                                            <p>{selectedStaff.first_name} {selectedStaff.last_name}</p>
                                            <p className="text-[10px] text-indigo-500 font-semibold">{selectedStaff.email}</p>
                                        </div>
                                        {!editingStructure && (
                                            <button onClick={() => { setSelectedStaff(null); setStructureForm(f => ({ ...f, userId: '' })); }} className="p-1 hover:bg-indigo-100 rounded-full"><X className="w-4 h-4" /></button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                                        <input value={staffSearch} onChange={e => searchStaff(e.target.value)}
                                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Search staff by name or email..." />
                                        
                                        {staffResults.length > 0 && (
                                            <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-150 rounded-xl shadow-xl z-20 max-h-40 overflow-y-auto divide-y divide-gray-50">
                                                {staffResults.map(s => (
                                                    <div key={s.id} onClick={() => { setSelectedStaff(s); setStructureForm(f => ({ ...f, userId: s.id, roleTarget: s.role })); setStaffResults([]); setStaffSearch(''); }}
                                                        className="p-3 hover:bg-indigo-50/50 cursor-pointer text-xs font-semibold text-gray-800 flex justify-between">
                                                        <span>{s.first_name} {s.last_name}</span>
                                                        <span className="text-[10px] text-gray-400 font-bold uppercase">{s.role}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Designation & Effective From */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Designation</label>
                                    <input value={structureForm.designation} onChange={e => setStructureForm({ ...structureForm, designation: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Science HOD" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Effective From *</label>
                                    <input type="date" value={structureForm.effectiveFrom} onChange={e => setStructureForm({ ...structureForm, effectiveFrom: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                </div>
                            </div>

                            {/* Base Salary */}
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Base Salary *</label>
                                <input type="number" value={structureForm.baseSalary} onChange={e => handleBaseSalaryChange(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="₹25000" />
                                <span className="text-[10px] text-gray-400 font-semibold block mt-1">This is the fixed monthly base salary amount.</span>
                            </div>

                            {/* Earnings & Deductions Custom Breakdown */}
                            <div className="border-t border-gray-100 pt-4">
                                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider mb-2">Configure Allowances (+)</h3>
                                <div className="space-y-2.5">
                                    {components.filter(c => c.type === 'earning').map(c => {
                                        // Auto percentage calculation if checked
                                        let calculatedLabel = '';
                                        if (c.is_percentage) {
                                            const baseSalaryVal = parseFloat(structureForm.baseSalary) || 0;
                                            const pct = parseFloat(c.percentage_of || '0') || 0;
                                            const amt = Math.round((pct / 100) * baseSalaryVal);
                                            calculatedLabel = `Formula calculated: ₹${amt} (${pct}% of Base)`;
                                        }

                                        return (
                                            <div key={c.id} className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg shrink-0 min-w-[120px] text-center">{c.name}</span>
                                                <div className="flex-1">
                                                    <input type="number" value={structureForm.allowances[c.name] || ''}
                                                        onChange={e => {
                                                            const copy = { ...structureForm.allowances };
                                                            copy[c.name] = e.target.value;
                                                            setStructureForm({ ...structureForm, allowances: copy });
                                                        }}
                                                        className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="Allowances amount" />
                                                    {calculatedLabel && <span className="text-[9px] text-gray-400 font-bold block mt-0.5">{calculatedLabel}</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="border-t border-gray-100 pt-4">
                                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider mb-2">Configure Deductions (-)</h3>
                                <div className="space-y-2.5">
                                    {components.filter(c => c.type === 'deduction').map(c => {
                                        let calculatedLabel = '';
                                        if (c.is_percentage) {
                                            const baseSalaryVal = parseFloat(structureForm.baseSalary) || 0;
                                            const pct = parseFloat(c.percentage_of || '0') || 0;
                                            const amt = Math.round((pct / 100) * baseSalaryVal);
                                            calculatedLabel = `Formula calculated: ₹${amt} (${pct}% of Base)`;
                                        }

                                        return (
                                            <div key={c.id} className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-red-700 bg-red-50 px-2.5 py-1.5 rounded-lg shrink-0 min-w-[120px] text-center">{c.name}</span>
                                                <div className="flex-1">
                                                    <input type="number" value={structureForm.deductions[c.name] || ''}
                                                        onChange={e => {
                                                            const copy = { ...structureForm.deductions };
                                                            copy[c.name] = e.target.value;
                                                            setStructureForm({ ...structureForm, deductions: copy });
                                                        }}
                                                        className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="Deductions amount" />
                                                    {calculatedLabel && <span className="text-[9px] text-gray-400 font-bold block mt-0.5">{calculatedLabel}</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Net Salary breakdown */}
                            <div className="bg-emerald-50 border border-emerald-250 p-4 rounded-2xl text-center">
                                <p className="text-[10px] uppercase font-bold text-emerald-600 mb-0.5">Calculated Net Salary</p>
                                <p className="text-xl font-black text-emerald-800">₹{parseFloat(structureForm.netSalary || '0').toLocaleString('en-IN')}</p>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white rounded-b-3xl z-10">
                            <Button variant="outline" onClick={() => setStructureModal(false)}>Cancel</Button>
                            <Button onClick={saveStructure} disabled={saving || !selectedStaff || !structureForm.baseSalary}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4">
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                Save Structure
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- PRINTABLE PAYSLIP DETAIL MODAL --- */}
            {payslipModal && activePayslip && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm print:absolute print:inset-0 print:p-0 print:bg-white" onClick={() => setPayslipModal(false)}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 print:max-h-none print:shadow-none print:p-0 print:rounded-none" onClick={e => e.stopPropagation()}>
                        
                        {/* Print Header Controls (hidden on print) */}
                        <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-6 print:hidden">
                            <h3 className="text-sm font-black text-gray-900">Payslip Preview</h3>
                            <div className="flex gap-2">
                                <Button onClick={triggerPrint} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-8">
                                    Print / PDF
                                </Button>
                                <Button variant="outline" onClick={() => setPayslipModal(false)} className="text-xs h-8">
                                    Close
                                </Button>
                            </div>
                        </div>

                        {/* Payslip Paper Sheet */}
                        <div className="border border-gray-200 p-8 rounded-2xl print:border-0 print:p-0">
                            <div className="text-center border-b border-gray-200 pb-4 mb-6">
                                <h1 className="text-xl font-black text-gray-900">{activePayslip.school_name}</h1>
                                <p className="text-xs text-gray-500 font-semibold">{activePayslip.school_address}</p>
                                <p className="text-xs text-gray-400 mt-0.5">Phone: {activePayslip.school_phone}</p>
                                <div className="text-xs font-black bg-gray-100 rounded-lg py-1 px-4 text-center mt-3 tracking-wider uppercase text-gray-700 inline-block">
                                    Salary Payslip for {activePayslip.month}
                                </div>
                            </div>

                            {/* Employee Details Card */}
                            <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-gray-750 mb-6 bg-gray-50 p-4 rounded-xl print:bg-transparent print:border print:p-3">
                                <div>
                                    <p className="text-gray-400 text-[10px] uppercase font-bold">Employee Name</p>
                                    <p className="text-sm font-black text-gray-900 mt-0.5">{activePayslip.staff_name}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 text-[10px] uppercase font-bold">Designation / Role</p>
                                    <p className="text-sm font-black text-gray-900 mt-0.5">{activePayslip.designation || activePayslip.staff_role.toUpperCase()}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 text-[10px] uppercase font-bold">Email ID</p>
                                    <p className="text-gray-800 mt-0.5">{activePayslip.staff_email}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 text-[10px] uppercase font-bold">Phone Number</p>
                                    <p className="text-gray-800 mt-0.5">{activePayslip.staff_phone || '-'}</p>
                                </div>
                            </div>

                            {/* Earnings vs Deductions Table */}
                            <div className="grid grid-cols-2 border border-gray-200 rounded-xl overflow-hidden mb-6 text-xs print:rounded-none">
                                <div className="border-r border-gray-200 divide-y divide-gray-100">
                                    <div className="bg-gray-50 px-4 py-2 font-black text-gray-750 uppercase text-[10px] tracking-wider">Earnings</div>
                                    <div className="px-4 py-2.5 flex justify-between font-bold text-gray-750">
                                        <span>Basic Pay</span>
                                        <span>₹{parseFloat(activePayslip.structure_base_salary)}</span>
                                    </div>
                                    {Object.entries(activePayslip.allowances || {}).map(([k, v]) => (
                                        <div key={k} className="px-4 py-2 flex justify-between font-medium text-gray-600">
                                            <span>{k}</span>
                                            <span>₹{String(v)}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="divide-y divide-gray-100">
                                    <div className="bg-gray-50 px-4 py-2 font-black text-gray-750 uppercase text-[10px] tracking-wider">Deductions</div>
                                    {Object.entries(activePayslip.deductions || {}).map(([k, v]) => (
                                        <div key={k} className="px-4 py-2 flex justify-between font-medium text-gray-600">
                                            <span>{k}</span>
                                            <span>₹{String(v)}</span>
                                        </div>
                                    ))}
                                    {parseFloat(activePayslip.advance_deducted) > 0 && (
                                        <div className="px-4 py-2 flex justify-between font-bold text-amber-700">
                                            <span>Salary Advance Recovery</span>
                                            <span>-₹{activePayslip.advance_deducted}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Summary Totals */}
                            <div className="border-t border-gray-200 pt-4 flex flex-col gap-1.5 text-xs text-right items-end font-semibold">
                                <div className="flex gap-4 min-w-[200px] justify-between">
                                    <span className="text-gray-400">Gross Salary:</span>
                                    <span className="text-gray-800 font-bold">₹{parseFloat(activePayslip.gross_amount)}</span>
                                </div>
                                <div className="flex gap-4 min-w-[200px] justify-between">
                                    <span className="text-gray-400">Total Deductions:</span>
                                    <span className="text-red-600 font-bold">-₹{parseFloat(activePayslip.deductions_amount)}</span>
                                </div>
                                <div className="flex gap-4 min-w-[200px] justify-between border-t border-gray-100 pt-2 text-sm">
                                    <span className="text-gray-900 font-black">Net Salary Paid:</span>
                                    <span className="text-emerald-700 font-black">₹{parseFloat(activePayslip.net_amount)}</span>
                                </div>
                            </div>

                            {/* Signature Footer */}
                            <div className="grid grid-cols-2 gap-12 mt-16 pt-8 border-t border-dashed border-gray-200 text-center text-xs font-semibold text-gray-500">
                                <div>
                                    <div className="h-10"></div>
                                    <div className="border-t border-gray-300 pt-1.5 max-w-[160px] mx-auto">Employee Signature</div>
                                </div>
                                <div>
                                    <div className="h-10"></div>
                                    <div className="border-t border-gray-300 pt-1.5 max-w-[160px] mx-auto">Authorized Signatory</div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}
