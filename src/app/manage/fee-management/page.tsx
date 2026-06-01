'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Navbar } from '@/components/ui/Navbar';
import {
    IndianRupee,
    ChevronRight,
    ArrowLeft,
    X,
    Search,
    Plus,
    Trash2,
    Edit3,
    CheckCircle,
    Loader2,
    ExternalLink,
    Settings,
    CreditCard,
    AlertCircle,
    Receipt,
    Wallet,
    Gift,
    Landmark,
    ClipboardList,
    CalendarDays,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────
interface User { id: string; email: string; firstName: string; lastName: string; role: 'developer' | 'super_admin' | 'teacher' | 'accountant' | 'student'; }
interface FeeStructure { id: string; name: string; amount: string; fee_type: string; class_name: string | null; class_id: string | null; due_date: string | null; frequency: string; late_fee_per_day: string | null; grace_period_days: number | null; is_active: boolean; late_fee_enabled: boolean; concession_allowed: boolean; }
interface FeePayment { id: string; student_name: string; admission_number: string; fee_name: string; amount_paid: string; fee_amount: string; payment_mode: string; payment_date: string; receipt_number: string; payment_status: string; collected_by_name: string; }
interface PlatformCharge { id: string; billing_month: string; total_amount: string; due_date: string; status: string; description: string; }
interface Concession { id: string; student_name: string; fee_structure_name: string; type: string; value: string; reason: string; }
interface ClassItem { id: string; name: string; }

type ActiveSection = null | 'structures' | 'collect' | 'payments' | 'defaulters' | 'billing' | 'concessions' | 'settings';

// ─── Main Component ─────────────────────────────────────────────────
export default function FeeManagementPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeSection, setActiveSection] = useState<ActiveSection>(null);

    // Data
    const [structures, setStructures] = useState<FeeStructure[]>([]);
    const [payments, setPayments] = useState<FeePayment[]>([]);
    const [platformCharges, setPlatformCharges] = useState<PlatformCharge[]>([]);
    const [concessions, setConcessions] = useState<Concession[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [defaulters, setDefaulters] = useState<any[]>([]);
    const [loadingDefaulters, setLoadingDefaulters] = useState(false);

    // Config
    const [lateFeeEnabled, setLateFeeEnabled] = useState(false);
    const [concessionEnabled, setConcessionEnabled] = useState(false);
    const [gatewayStatus, setGatewayStatus] = useState<string>('');

    // Structure modal
    const [structureModal, setStructureModal] = useState(false);
    const [editingStructure, setEditingStructure] = useState<FeeStructure | null>(null);
    const [structureForm, setStructureForm] = useState({ name: '', feeType: 'tuition', classId: '', amount: '', frequency: 'monthly', dueDate: '', lateFeePerDay: '', gracePeriodDays: '', isActive: true, lateFeeEnabled: false, concessionAllowed: false });

    // Collect fee
    const [collectForm, setCollectForm] = useState({ studentId: '', feeStructureId: '', amountPaid: '', paymentMode: 'cash', remarks: '' });
    const [studentSearch, setStudentSearch] = useState('');
    const [studentResults, setStudentResults] = useState<any[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [collectLoading, setCollectLoading] = useState(false);

    // Billing offline modal
    const [offlineModal, setOfflineModal] = useState(false);
    const [offlineChargeId, setOfflineChargeId] = useState('');
    const [offlineForm, setOfflineForm] = useState({ paymentMode: 'bank_transfer', referenceNumber: '', paymentDate: new Date().toISOString().split('T')[0] });
    const [billingLoading, setBillingLoading] = useState(false);

    // Concession modal
    const [concessionModal, setConcessionModal] = useState(false);
    const [concessionForm, setConcessionForm] = useState({ studentId: '', feeStructureId: '', type: 'percentage', value: '', reason: '' });
    const [concStudentSearch, setConcStudentSearch] = useState('');
    const [concStudentResults, setConcStudentResults] = useState<any[]>([]);
    const [concSelectedStudent, setConcSelectedStudent] = useState<any>(null);

    const [savingConfig, setSavingConfig] = useState(false);
    const [savingStructure, setSavingStructure] = useState(false);

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

    // ── Data fetchers ──
    const fetchStructures = useCallback(async () => {
        try { const r = await fetch('/api/fees/structures', { headers: headers() }); if (r.ok) { const d = await r.json(); setStructures(d.structures || []); } } catch { }
    }, [headers]);

    const fetchPayments = useCallback(async () => {
        try { const r = await fetch('/api/fees/payments', { headers: headers() }); if (r.ok) { const d = await r.json(); setPayments(d.payments || []); } } catch { }
    }, [headers]);

    const fetchPlatformCharges = useCallback(async () => {
        try { const r = await fetch('/api/platform-billing', { headers: headers() }); if (r.ok) { const d = await r.json(); setPlatformCharges(d.charges || []); } } catch { }
    }, [headers]);

    const fetchConcessions = useCallback(async () => {
        try { const r = await fetch('/api/fees/concessions', { headers: headers() }); if (r.ok) { const d = await r.json(); setConcessions(d.concessions || []); } } catch { }
    }, [headers]);

    const fetchClasses = useCallback(async () => {
        try { const r = await fetch('/api/manage/classes', { headers: headers() }); if (r.ok) { const d = await r.json(); setClasses(d.classes || []); } } catch { }
    }, [headers]);

    const fetchFeeConfig = useCallback(async () => {
        try { const r = await fetch('/api/schools/fee-config', { headers: headers() }); if (r.ok) { const d = await r.json(); setLateFeeEnabled(d.lateFeeEnabled || false); setConcessionEnabled(d.concessionEnabled || false); } } catch { }
    }, [headers]);

    const fetchDefaulters = useCallback(async () => {
        setLoadingDefaulters(true);
        try { const r = await fetch('/api/fees/defaulters', { headers: headers() }); if (r.ok) { const d = await r.json(); setDefaulters(d.defaulters || []); } } catch { }
        setLoadingDefaulters(false);
    }, [headers]);

    const fetchGatewayStatus = useCallback(async () => {
        try { const r = await fetch('/api/settings/payment-gateway', { headers: headers() }); if (r.ok) { const d = await r.json(); setGatewayStatus(d.status || 'not_configured'); } } catch { }
    }, [headers]);

    useEffect(() => {
        if (user) { fetchStructures(); fetchPayments(); fetchPlatformCharges(); fetchFeeConfig(); }
    }, [user, fetchStructures, fetchPayments, fetchPlatformCharges, fetchFeeConfig]);

    useEffect(() => {
        if (user && activeSection === 'defaulters') fetchDefaulters();
        if (user && activeSection === 'structures') fetchClasses();
        if (user && activeSection === 'concessions') fetchConcessions();
        if (user && activeSection === 'settings') fetchGatewayStatus();
    }, [user, activeSection, fetchDefaulters, fetchClasses, fetchConcessions, fetchGatewayStatus]);

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    // ── Stats ──
    const totalCollected = payments.filter(p => p.payment_status === 'completed' || p.payment_status === 'partial').reduce((s, p) => s + parseFloat(p.amount_paid || '0'), 0);
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCollected = payments.filter(p => p.payment_date === todayStr).reduce((s, p) => s + parseFloat(p.amount_paid || '0'), 0);
    const activeStructures = structures.filter(s => s.is_active).length;
    const pendingCharges = platformCharges.filter(c => c.status === 'pending').reduce((s, c) => s + parseFloat(c.total_amount || '0'), 0);

    // ── Structures CRUD ──
    const openCreateStructure = () => {
        setEditingStructure(null);
        setStructureForm({ name: '', feeType: 'tuition', classId: '', amount: '', frequency: 'monthly', dueDate: '', lateFeePerDay: '', gracePeriodDays: '', isActive: true, lateFeeEnabled: false, concessionAllowed: false });
        setStructureModal(true);
    };

    const openEditStructure = (s: FeeStructure) => {
        setEditingStructure(s);
        setStructureForm({ name: s.name, feeType: s.fee_type, classId: s.class_id || '', amount: s.amount, frequency: s.frequency || 'monthly', dueDate: s.due_date || '', lateFeePerDay: s.late_fee_per_day || '', gracePeriodDays: s.grace_period_days?.toString() || '', isActive: s.is_active, lateFeeEnabled: s.late_fee_enabled, concessionAllowed: s.concession_allowed });
        setStructureModal(true);
    };

    const saveStructure = async () => {
        setSavingStructure(true);
        const body: any = { ...structureForm, amount: parseFloat(structureForm.amount), lateFeePerDay: structureForm.lateFeePerDay ? parseFloat(structureForm.lateFeePerDay) : 0, gracePeriodDays: structureForm.gracePeriodDays ? parseInt(structureForm.gracePeriodDays) : 0 };
        if (editingStructure) body.id = editingStructure.id;
        try {
            const r = await fetch('/api/fees/structures', { method: editingStructure ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify(body) });
            if (r.ok) { setStructureModal(false); fetchStructures(); } else { const e = await r.json(); alert(e.error || 'Failed'); }
        } catch { alert('Failed to save'); }
        setSavingStructure(false);
    };

    const deleteStructure = async (id: string) => {
        if (!confirm('Delete this fee structure?')) return;
        try { await fetch('/api/fees/structures', { method: 'DELETE', headers: headers(), body: JSON.stringify({ id }) }); fetchStructures(); } catch { alert('Failed to delete'); }
    };

    // ── Collect fee ──
    const searchStudents = async (term: string) => {
        setStudentSearch(term);
        if (term.length < 2) { setStudentResults([]); return; }
        try { const r = await fetch(`/api/students?search=${encodeURIComponent(term)}`, { headers: headers() }); if (r.ok) { const d = await r.json(); setStudentResults(d.students?.slice(0, 8) || []); } } catch { }
    };

    const handleCollectFee = async () => {
        if (!collectForm.studentId || !collectForm.feeStructureId || !collectForm.amountPaid) return;
        setCollectLoading(true);
        try {
            const r = await fetch('/api/fees/payments', { method: 'POST', headers: headers(), body: JSON.stringify(collectForm) });
            if (r.ok) { const d = await r.json(); alert(`Payment recorded! Receipt: ${d.payment.receipt_number}\nTotal Paid: ₹${d.summary.totalPaid}\nRemaining: ₹${d.summary.remaining}`); setCollectForm({ studentId: '', feeStructureId: '', amountPaid: '', paymentMode: 'cash', remarks: '' }); setSelectedStudent(null); setStudentSearch(''); fetchPayments(); }
            else { const e = await r.json(); alert(e.error || 'Failed'); }
        } catch { alert('Failed to record payment'); }
        setCollectLoading(false);
    };

    // ── Billing ──
    const handlePayOnline = async (chargeId: string) => {
        setBillingLoading(true);
        try {
            const r = await fetch('/api/platform-billing/pay', { method: 'POST', headers: headers(), body: JSON.stringify({ chargeId }) });
            if (!r.ok) { alert('Failed to initiate payment'); setBillingLoading(false); return; }
            const data = await r.json();
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => {
                const options = {
                    key: data.keyId, amount: data.amount, currency: data.currency || 'INR',
                    name: 'Platform System Charge', description: 'Platform charge payment', order_id: data.orderId,
                    handler: async function (response: any) {
                        await fetch('/api/platform-billing/verify', { method: 'POST', headers: headers(), body: JSON.stringify({ razorpay_order_id: response.razorpay_order_id, razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature }) });
                        fetchPlatformCharges();
                    }
                };
                const rzp = new (window as any).Razorpay(options);
                rzp.open();
            };
            document.body.appendChild(script);
        } catch { alert('Payment failed'); }
        setBillingLoading(false);
    };

    const handlePayOffline = async () => {
        setBillingLoading(true);
        try {
            const r = await fetch('/api/platform-billing/pay-offline', { method: 'POST', headers: headers(), body: JSON.stringify({ chargeId: offlineChargeId, ...offlineForm }) });
            if (r.ok) { setOfflineModal(false); fetchPlatformCharges(); } else { const e = await r.json(); alert(e.error || 'Failed'); }
        } catch { alert('Failed'); }
        setBillingLoading(false);
    };

    // ── Concessions ──
    const searchConcStudents = async (term: string) => {
        setConcStudentSearch(term);
        if (term.length < 2) { setConcStudentResults([]); return; }
        try { const r = await fetch(`/api/students?search=${encodeURIComponent(term)}`, { headers: headers() }); if (r.ok) { const d = await r.json(); setConcStudentResults(d.students?.slice(0, 8) || []); } } catch { }
    };

    const saveConcession = async () => {
        if (!concessionForm.studentId || !concessionForm.value) return;
        try {
            const r = await fetch('/api/fees/concessions', { method: 'POST', headers: headers(), body: JSON.stringify(concessionForm) });
            if (r.ok) { setConcessionModal(false); setConcessionForm({ studentId: '', feeStructureId: '', type: 'percentage', value: '', reason: '' }); setConcSelectedStudent(null); setConcStudentSearch(''); fetchConcessions(); }
            else { const e = await r.json(); alert(e.error || 'Failed'); }
        } catch { alert('Failed'); }
    };

    const deleteConcession = async (id: string) => {
        if (!confirm('Remove this concession?')) return;
        try { await fetch('/api/fees/concessions', { method: 'DELETE', headers: headers(), body: JSON.stringify({ id }) }); fetchConcessions(); } catch { alert('Failed'); }
    };

    // ── Settings ──
    const saveConfig = async (lf: boolean, ce: boolean) => {
        setSavingConfig(true);
        setLateFeeEnabled(lf); setConcessionEnabled(ce);
        try { await fetch('/api/schools/fee-config', { method: 'PUT', headers: headers(), body: JSON.stringify({ lateFeeEnabled: lf, concessionEnabled: ce }) }); } catch { alert('Failed to save'); }
        setSavingConfig(false);
    };

    // ── Loading / Auth guard ──
    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-500 font-medium">Loading...</p>
            </div>
        </div>
    );
    if (!user) return null;

    // ── Hub cards ──
    const hubCards = [
        { id: 'structures', iconEmoji: '📋', title: 'Fee Structures', description: 'Manage fee types & amounts', gradient: 'from-emerald-100 to-teal-100', textColor: 'text-emerald-700', borderColor: 'border-emerald-200' },
        { id: 'collect', iconEmoji: '💳', title: 'Collect Fee', description: 'Record offline student payments', gradient: 'from-blue-100 to-indigo-100', textColor: 'text-blue-700', borderColor: 'border-blue-200' },
        { id: 'payments', iconEmoji: '🧾', title: 'Payment History', description: 'All fee transactions', gradient: 'from-violet-100 to-purple-100', textColor: 'text-violet-700', borderColor: 'border-violet-200' },
        { id: 'defaulters', iconEmoji: '🚨', title: 'Fee Defaulters', description: 'Overdue students list', gradient: 'from-red-100 to-rose-100', textColor: 'text-red-700', borderColor: 'border-red-200' },
        { id: 'salary', iconEmoji: '💰', title: 'Staff Salary', description: 'Manage teacher/staff salaries', gradient: 'from-amber-100 to-yellow-100', textColor: 'text-amber-700', borderColor: 'border-amber-200' },
        { id: 'billing', iconEmoji: '🏛️', title: 'Platform Billing', description: 'View & pay system charges', gradient: 'from-purple-100 to-fuchsia-100', textColor: 'text-purple-700', borderColor: 'border-purple-200' },
        ...(concessionEnabled ? [{ id: 'concessions', iconEmoji: '🎁', title: 'Fee Concessions', description: 'Student discounts', gradient: 'from-teal-100 to-cyan-100', textColor: 'text-teal-700', borderColor: 'border-teal-200' }] : []),
        { id: 'settings', iconEmoji: '⚙️', title: 'Settings', description: 'Payment gateway & feature toggles', gradient: 'from-gray-100 to-slate-100', textColor: 'text-gray-700', borderColor: 'border-gray-200' },
    ];

    const handleCardClick = (id: string) => {
        if (id === 'salary') { router.push('/manage/salary-management'); return; }
        setActiveSection(id as ActiveSection);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">

                {/* ═══════ Legacy System Banner ═══════ */}
                <div className="mb-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-3">
                    <div className="p-2 bg-amber-100 rounded-xl text-amber-600 mt-0.5 flex-shrink-0">
                        <AlertCircle className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-bold text-amber-900">Legacy Fee System</p>
                        <p className="text-xs text-amber-700 mt-0.5">This is the old single-amount fee system. For class-range targeting, multi-group assignments, auto-assign, and invoicing, use the <strong>new Fee Hub</strong>.</p>
                    </div>
                    <button onClick={() => router.push('/manage/fee-hub')} className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 transition-colors cursor-pointer whitespace-nowrap">
                        Open Fee Hub →
                    </button>
                </div>

                {/* ═══════ Hero Banner ═══════ */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-8 mb-8 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-green-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                            <button onClick={() => router.push('/dashboard')} className="inline-flex items-center gap-1.5 text-sm text-green-200 hover:text-white transition-colors">
                                <ArrowLeft className="w-4 h-4" /> Dashboard
                            </button>
                            {activeSection && (
                                <>
                                    <span className="text-white/30">/</span>
                                    <button onClick={() => setActiveSection(null)} className="inline-flex items-center gap-1.5 text-sm text-green-200 hover:text-white transition-colors">
                                        <ArrowLeft className="w-4 h-4" /> Fee Hub
                                    </button>
                                </>
                            )}
                        </div>
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-bold mb-2">Fee Management</h1>
                                <p className="text-green-100 text-sm max-w-xl">Comprehensive fee management — structures, collections, billing, concessions, and salary administration.</p>
                            </div>
                            <IndianRupee className="hidden sm:block w-12 h-12 text-green-200 opacity-80" />
                        </div>
                        <div className="mt-6 flex flex-wrap gap-3">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-medium backdrop-blur-md">
                                <CalendarDays className="w-4 h-4" />
                                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ═══════ Stats ═══════ */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                    <div className="bg-white border border-emerald-200 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 font-medium">Total Collected</p>
                        <p className="text-xl font-bold text-emerald-600 mt-1">₹{totalCollected.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-white border border-blue-200 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 font-medium">Today&apos;s Collection</p>
                        <p className="text-xl font-bold text-blue-600 mt-1">₹{todayCollected.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-white border border-violet-200 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 font-medium">Active Structures</p>
                        <p className="text-xl font-bold text-violet-600 mt-1">{activeStructures}</p>
                    </div>
                    <div className="bg-white border border-amber-200 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 font-medium">Pending Charges</p>
                        <p className="text-xl font-bold text-amber-600 mt-1">₹{pendingCharges.toLocaleString('en-IN')}</p>
                    </div>
                </div>

                {/* ═══════ Hub Cards (no section active) ═══════ */}
                {activeSection === null && (
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                        {hubCards.map(card => (
                            <HubCard key={card.id} card={card} onClick={() => handleCardClick(card.id)} />
                        ))}
                    </div>
                )}

                {/* ═══════ STRUCTURES ═══════ */}
                {activeSection === 'structures' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b flex items-center justify-between">
                                <h2 className="text-lg font-bold text-gray-900">Fee Structures</h2>
                                <button onClick={openCreateStructure} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm">
                                    <Plus className="w-4 h-4" /> Create
                                </button>
                            </div>
                            {structures.length === 0 ? (
                                <div className="p-10 text-center text-gray-400 text-sm">No fee structures configured yet.</div>
                            ) : (
                                <div className="divide-y">
                                    {structures.map(s => (
                                        <div key={s.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                                                <p className="text-xs text-gray-500">{s.class_name || 'All Classes'} · {s.fee_type} · {s.frequency} {s.due_date ? `· Due: ${new Date(s.due_date).toLocaleDateString('en-IN')}` : ''}</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-emerald-600">₹{parseFloat(s.amount).toLocaleString('en-IN')}</p>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
                                                </div>
                                                <button onClick={() => openEditStructure(s)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"><Edit3 className="w-4 h-4" /></button>
                                                <button onClick={() => deleteStructure(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══════ COLLECT FEE ═══════ */}
                {activeSection === 'collect' && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">Collect Fee Payment</h2>

                        {/* Student Search */}
                        <div className="mb-4 relative">
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Student</label>
                            {selectedStudent ? (
                                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                                    <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700">
                                        {selectedStudent.first_name?.[0]}{selectedStudent.last_name?.[0]}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-gray-900">{selectedStudent.first_name} {selectedStudent.last_name}</p>
                                        <p className="text-xs text-gray-500">Adm: {selectedStudent.admission_number || '-'}</p>
                                    </div>
                                    <button onClick={() => { setSelectedStudent(null); setCollectForm(f => ({ ...f, studentId: '' })); setStudentSearch(''); }} className="p-1 rounded hover:bg-emerald-100"><X className="w-4 h-4 text-gray-500" /></button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="text" placeholder="Search by name or admission number..." value={studentSearch} onChange={e => searchStudents(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                                    {studentResults.length > 0 && (
                                        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                            {studentResults.map((s: any) => (
                                                <button key={s.id} onClick={() => { setSelectedStudent(s); setCollectForm(f => ({ ...f, studentId: s.id })); setStudentResults([]); setStudentSearch(''); }} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b last:border-b-0">
                                                    <span className="font-semibold">{s.first_name} {s.last_name}</span>
                                                    <span className="text-gray-400 ml-2 text-xs">{s.admission_number}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Fee Structure Select */}
                        <div className="mb-4">
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Fee Type</label>
                            <select value={collectForm.feeStructureId} onChange={e => setCollectForm(f => ({ ...f, feeStructureId: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
                                <option value="">Select fee structure...</option>
                                {structures.filter(s => s.is_active).map(s => (
                                    <option key={s.id} value={s.id}>{s.name} {s.class_name ? `(${s.class_name})` : ''} — ₹{parseFloat(s.amount).toLocaleString('en-IN')}</option>
                                ))}
                            </select>
                        </div>

                        {/* Amount & Payment Mode */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Amount (₹)</label>
                                <input type="number" placeholder="0" value={collectForm.amountPaid} onChange={e => setCollectForm(f => ({ ...f, amountPaid: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Payment Mode</label>
                                <select value={collectForm.paymentMode} onChange={e => setCollectForm(f => ({ ...f, paymentMode: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
                                    {['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'online'].map(m => (
                                        <option key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Remarks */}
                        <div className="mb-5">
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Remarks (Optional)</label>
                            <input type="text" placeholder="Any notes..." value={collectForm.remarks} onChange={e => setCollectForm(f => ({ ...f, remarks: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                        </div>

                        <button onClick={handleCollectFee} disabled={collectLoading || !collectForm.studentId || !collectForm.feeStructureId || !collectForm.amountPaid} className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm">
                            {collectLoading ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Processing...</> : '💳 Record Payment'}
                        </button>
                    </div>
                )}

                {/* ═══════ PAYMENTS ═══════ */}
                {activeSection === 'payments' && (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="px-5 py-4 border-b"><h2 className="text-lg font-bold text-gray-900">Payment History</h2></div>
                        {payments.length === 0 ? (
                            <div className="p-10 text-center text-gray-400 text-sm">No payments recorded yet.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50/50 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                                            <th className="px-5 py-3">Student</th>
                                            <th className="px-5 py-3">Fee</th>
                                            <th className="px-5 py-3">Amount</th>
                                            <th className="px-5 py-3">Mode</th>
                                            <th className="px-5 py-3">Date</th>
                                            <th className="px-5 py-3">Receipt #</th>
                                            <th className="px-5 py-3">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {payments.map(p => (
                                            <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-5 py-3.5">
                                                    <p className="font-semibold text-gray-900">{p.student_name}</p>
                                                    <p className="text-[10px] text-gray-400">{p.admission_number}</p>
                                                </td>
                                                <td className="px-5 py-3.5 text-gray-600">{p.fee_name}</td>
                                                <td className="px-5 py-3.5 font-bold text-emerald-600">₹{parseFloat(p.amount_paid).toLocaleString('en-IN')}</td>
                                                <td className="px-5 py-3.5 text-gray-500">{p.payment_mode?.replace('_', ' ').toUpperCase()}</td>
                                                <td className="px-5 py-3.5 text-gray-500">{new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                                                <td className="px-5 py-3.5 text-gray-400 font-mono text-xs">{p.receipt_number}</td>
                                                <td className="px-5 py-3.5">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.payment_status === 'completed' ? 'bg-green-100 text-green-700' : p.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                                                        {p.payment_status?.toUpperCase()}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════ DEFAULTERS ═══════ */}
                {activeSection === 'defaulters' && (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-50/50">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Overdue Fee Defaulters</h2>
                                <p className="text-xs text-gray-500 mt-0.5">Students who have outstanding dues past their payment deadline.</p>
                            </div>
                            <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-lg">{defaulters.length} Defaulters</span>
                        </div>
                        {loadingDefaulters ? (
                            <div className="flex flex-col items-center py-12 gap-2 text-gray-400">
                                <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
                                <p className="text-xs font-medium">Scanning fee records...</p>
                            </div>
                        ) : defaulters.length === 0 ? (
                            <div className="p-12 text-center text-gray-400 text-sm flex flex-col items-center">
                                <CheckCircle className="w-12 h-12 text-emerald-500 mb-3" />
                                <p className="font-bold text-gray-700">All Clear!</p>
                                <p className="text-xs text-gray-400 mt-0.5">No students have overdue fees.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead>
                                        <tr className="border-b bg-gray-50/50 text-gray-500 text-xs font-semibold uppercase tracking-wider">
                                            <th className="px-5 py-3">Student Name</th>
                                            <th className="px-5 py-3">Class</th>
                                            <th className="px-5 py-3">Fee Item</th>
                                            <th className="px-5 py-3">Deadline</th>
                                            <th className="px-5 py-3 text-right">Overdue Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {defaulters.map((d: any, i: number) => (
                                            <tr key={i} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-5 py-3.5">
                                                    <p className="font-bold text-gray-900">{d.first_name} {d.last_name}</p>
                                                    <p className="text-[10px] text-gray-400 font-mono">Adm: {d.admission_number || '-'}</p>
                                                </td>
                                                <td className="px-5 py-3.5 text-gray-600 font-medium">{d.class_name}</td>
                                                <td className="px-5 py-3.5 text-gray-600">{d.fee_name}</td>
                                                <td className="px-5 py-3.5 text-gray-500">{new Date(d.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                                <td className="px-5 py-3.5 text-right font-black text-red-600">₹{parseFloat(d.remaining_amount).toLocaleString('en-IN')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════ BILLING ═══════ */}
                {activeSection === 'billing' && (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="px-5 py-4 border-b flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">Platform Billing</h2>
                        </div>
                        {platformCharges.length === 0 ? (
                            <div className="p-10 text-center text-gray-400 text-sm">No billing charges found.</div>
                        ) : (
                            <div className="divide-y">
                                {platformCharges.map(c => (
                                    <div key={c.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50 transition-colors">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{c.description || `Platform charge — ${c.billing_month}`}</p>
                                            <p className="text-xs text-gray-500">Due: {new Date(c.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <p className="text-lg font-bold text-gray-900">₹{parseFloat(c.total_amount).toLocaleString('en-IN')}</p>
                                            {c.status === 'pending' ? (
                                                <div className="flex gap-2">
                                                    <button onClick={() => handlePayOnline(c.id)} disabled={billingLoading} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50">
                                                        {billingLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Pay Online'}
                                                    </button>
                                                    <button onClick={() => { setOfflineChargeId(c.id); setOfflineModal(true); }} className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-200 transition-all">
                                                        Offline
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">✓ Paid</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════ CONCESSIONS ═══════ */}
                {activeSection === 'concessions' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b flex items-center justify-between">
                                <h2 className="text-lg font-bold text-gray-900">Fee Concessions</h2>
                                <button onClick={() => setConcessionModal(true)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors shadow-sm">
                                    <Plus className="w-4 h-4" /> Add Concession
                                </button>
                            </div>
                            {concessions.length === 0 ? (
                                <div className="p-10 text-center text-gray-400 text-sm">No concessions granted yet.</div>
                            ) : (
                                <div className="divide-y">
                                    {concessions.map(c => (
                                        <div key={c.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">{c.student_name}</p>
                                                <p className="text-xs text-gray-500">{c.fee_structure_name || 'All Fees'} · {c.type === 'percentage' ? `${c.value}%` : `₹${parseFloat(c.value).toLocaleString('en-IN')}`} · {c.reason}</p>
                                            </div>
                                            <button onClick={() => deleteConcession(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══════ SETTINGS ═══════ */}
                {activeSection === 'settings' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Payment Gateway */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-4">Payment Gateway</h2>
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full ${gatewayStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`}></div>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">Razorpay</p>
                                        <p className="text-xs text-gray-500">{gatewayStatus === 'connected' ? 'Connected & Active' : 'Not Configured'}</p>
                                    </div>
                                </div>
                                <button onClick={() => router.push('/settings')} className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors">
                                    <ExternalLink className="w-4 h-4" /> Configure
                                </button>
                            </div>
                        </div>

                        {/* Feature Toggles */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-4">Feature Toggles</h2>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">Late Fee Calculation</p>
                                        <p className="text-xs text-gray-500">Automatically calculate late fees after due date + grace period</p>
                                    </div>
                                    <ToggleSwitch checked={lateFeeEnabled} onChange={(v) => saveConfig(v, concessionEnabled)} />
                                </div>
                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">Fee Concessions</p>
                                        <p className="text-xs text-gray-500">Enable student fee discounts & concession management</p>
                                    </div>
                                    <ToggleSwitch checked={concessionEnabled} onChange={(v) => saveConfig(lateFeeEnabled, v)} />
                                </div>
                            </div>
                            {savingConfig && <p className="text-xs text-blue-500 mt-3 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</p>}
                        </div>
                    </div>
                )}

            </main>

            {/* ═══════ MODALS ═══════ */}

            {/* Structure Create/Edit Modal */}
            <Modal open={structureModal} onClose={() => setStructureModal(false)} title={editingStructure ? 'Edit Fee Structure' : 'Create Fee Structure'}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Name</label>
                        <input type="text" value={structureForm.name} onChange={e => setStructureForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Annual Tuition Fee" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Fee Type</label>
                            <select value={structureForm.feeType} onChange={e => setStructureForm(f => ({ ...f, feeType: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
                                {['tuition', 'transport', 'lab', 'library', 'exam', 'sports', 'uniform', 'other'].map(t => (<option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Class</label>
                            <select value={structureForm.classId} onChange={e => setStructureForm(f => ({ ...f, classId: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
                                <option value="">All Classes</option>
                                {classes.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Amount (₹)</label>
                            <input type="number" value={structureForm.amount} onChange={e => setStructureForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Frequency</label>
                            <select value={structureForm.frequency} onChange={e => setStructureForm(f => ({ ...f, frequency: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
                                {['monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time'].map(f => (<option key={f} value={f}>{f.replace('_', ' ').toUpperCase()}</option>))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Due Date</label>
                        <input type="date" value={structureForm.dueDate} onChange={e => setStructureForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Late Fee / Day (₹)</label>
                            <input type="number" value={structureForm.lateFeePerDay} onChange={e => setStructureForm(f => ({ ...f, lateFeePerDay: e.target.value }))} placeholder="0" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Grace Period (days)</label>
                            <input type="number" value={structureForm.gracePeriodDays} onChange={e => setStructureForm(f => ({ ...f, gracePeriodDays: e.target.value }))} placeholder="0" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-5 pt-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                            <ToggleSwitch checked={structureForm.isActive} onChange={v => setStructureForm(f => ({ ...f, isActive: v }))} /> Active
                        </label>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                            <ToggleSwitch checked={structureForm.lateFeeEnabled} onChange={v => setStructureForm(f => ({ ...f, lateFeeEnabled: v }))} /> Late Fee
                        </label>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                            <ToggleSwitch checked={structureForm.concessionAllowed} onChange={v => setStructureForm(f => ({ ...f, concessionAllowed: v }))} /> Concession
                        </label>
                    </div>
                    <button onClick={saveStructure} disabled={savingStructure || !structureForm.name || !structureForm.amount} className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm mt-2">
                        {savingStructure ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Saving...</> : editingStructure ? 'Update Structure' : 'Create Structure'}
                    </button>
                </div>
            </Modal>

            {/* Offline Payment Modal */}
            <Modal open={offlineModal} onClose={() => setOfflineModal(false)} title="Mark as Paid (Offline)">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Payment Mode</label>
                        <select value={offlineForm.paymentMode} onChange={e => setOfflineForm(f => ({ ...f, paymentMode: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
                            {['bank_transfer', 'cash', 'upi', 'cheque'].map(m => (<option key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</option>))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Reference Number</label>
                        <input type="text" value={offlineForm.referenceNumber} onChange={e => setOfflineForm(f => ({ ...f, referenceNumber: e.target.value }))} placeholder="Transaction ref..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Payment Date</label>
                        <input type="date" value={offlineForm.paymentDate} onChange={e => setOfflineForm(f => ({ ...f, paymentDate: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <button onClick={handlePayOffline} disabled={billingLoading} className="w-full py-3 bg-gradient-to-r from-gray-700 to-gray-900 text-white font-bold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 transition-all text-sm">
                        {billingLoading ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Processing...</> : 'Confirm Payment'}
                    </button>
                </div>
            </Modal>

            {/* Concession Modal */}
            <Modal open={concessionModal} onClose={() => { setConcessionModal(false); setConcSelectedStudent(null); setConcStudentSearch(''); setConcStudentResults([]); }} title="Add Fee Concession">
                <div className="space-y-4">
                    {/* Student Search */}
                    <div className="relative">
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Student</label>
                        {concSelectedStudent ? (
                            <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-xl p-3">
                                <div className="h-9 w-9 rounded-full bg-teal-100 flex items-center justify-center text-sm font-bold text-teal-700">
                                    {concSelectedStudent.first_name?.[0]}{concSelectedStudent.last_name?.[0]}
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-gray-900">{concSelectedStudent.first_name} {concSelectedStudent.last_name}</p>
                                </div>
                                <button onClick={() => { setConcSelectedStudent(null); setConcessionForm(f => ({ ...f, studentId: '' })); setConcStudentSearch(''); }} className="p-1 rounded hover:bg-teal-100"><X className="w-4 h-4 text-gray-500" /></button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input type="text" placeholder="Search student..." value={concStudentSearch} onChange={e => searchConcStudents(e.target.value)} className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                                {concStudentResults.length > 0 && (
                                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                        {concStudentResults.map((s: any) => (
                                            <button key={s.id} onClick={() => { setConcSelectedStudent(s); setConcessionForm(f => ({ ...f, studentId: s.id })); setConcStudentResults([]); setConcStudentSearch(''); }} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b last:border-b-0">
                                                <span className="font-semibold">{s.first_name} {s.last_name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Fee Structure</label>
                        <select value={concessionForm.feeStructureId} onChange={e => setConcessionForm(f => ({ ...f, feeStructureId: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
                            <option value="">All Fees</option>
                            {structures.filter(s => s.concession_allowed).map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Type</label>
                            <select value={concessionForm.type} onChange={e => setConcessionForm(f => ({ ...f, type: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
                                <option value="percentage">Percentage (%)</option>
                                <option value="fixed_amount">Fixed Amount (₹)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Value</label>
                            <input type="number" value={concessionForm.value} onChange={e => setConcessionForm(f => ({ ...f, value: e.target.value }))} placeholder="0" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Reason</label>
                        <input type="text" value={concessionForm.reason} onChange={e => setConcessionForm(f => ({ ...f, reason: e.target.value }))} placeholder="Scholarship, financial aid, etc." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <button onClick={saveConcession} disabled={!concessionForm.studentId || !concessionForm.value} className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm">
                        Grant Concession
                    </button>
                </div>
            </Modal>
        </div>
    );
}

// ─── Reusable Inline Components ─────────────────────────────────────

function HubCard({ card, onClick }: { card: { id: string; iconEmoji: string; title: string; description: string; gradient: string; textColor: string; borderColor: string }; onClick: () => void }) {
    return (
        <div onClick={onClick} className={`group relative bg-white p-4 sm:p-5 rounded-2xl shadow-sm border ${card.borderColor} transition-all duration-300 overflow-hidden hover:shadow-lg hover:-translate-y-1 cursor-pointer`}>
            <div className={`absolute -right-8 -top-8 w-24 h-24 rounded-full bg-gradient-to-br ${card.gradient} opacity-20 group-hover:scale-150 transition-transform duration-500`}></div>
            <div className="relative flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${card.gradient} ${card.textColor} text-xl`}>{card.iconEmoji}</div>
                <div className="p-1.5 rounded-full bg-gray-50 text-gray-300 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                </div>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-0.5">{card.title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{card.description}</p>
        </div>
    );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button type="button" onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${checked ? 'bg-emerald-500' : 'bg-gray-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 shadow-sm ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    );
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b">
                    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    );
}
