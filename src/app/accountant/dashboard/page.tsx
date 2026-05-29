'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { IndianRupee, Users, AlertCircle, Receipt, BarChart3, CreditCard, ChevronRight, CalendarDays, Plus, Search, X, CheckCircle, Loader2 } from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: 'super_admin' | 'teacher' | 'accountant' | 'student'; }
interface FeeStructure { id: string; name: string; amount: string; fee_type: string; class_name: string | null; due_date: string | null; is_active: boolean; }
interface FeePayment { id: string; student_name: string; admission_number: string; fee_name: string; amount_paid: string; fee_amount: string; payment_mode: string; payment_date: string; receipt_number: string; payment_status: string; collected_by_name: string; }

export default function AccountantDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'structures' | 'collect' | 'payments' | 'defaulters'>('overview');
    const [structures, setStructures] = useState<FeeStructure[]>([]);
    const [payments, setPayments] = useState<FeePayment[]>([]);
    const [loading, setLoading] = useState(false);

    // Defaulters & billing status states
    const [defaulters, setDefaulters] = useState<any[]>([]);
    const [loadingDefaulters, setLoadingDefaulters] = useState(false);
    const [platformCharge, setPlatformCharge] = useState<any>(null);

    // Collect fee form state
    const [collectForm, setCollectForm] = useState({ studentId: '', feeStructureId: '', amountPaid: '', paymentMode: 'cash', remarks: '' });
    const [studentSearch, setStudentSearch] = useState('');
    const [studentResults, setStudentResults] = useState<any[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [studentConcessions, setStudentConcessions] = useState<any[]>([]);

    const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'accountant' && parsed.role !== 'super_admin') { router.replace('/dashboard'); return; }
        setUser(parsed);
    }, []);

    useEffect(() => {
        if (user) {
            fetchStructures();
            fetchPayments();
            fetchPlatformBilling();
        }
    }, [user]);

    useEffect(() => {
        if (user && activeTab === 'defaulters') {
            fetchDefaulters();
        }
    }, [user, activeTab]);

    const getToken = () => localStorage.getItem('token') || '';
    const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

    const fetchStructures = async () => {
        try {
            const res = await fetch('/api/fees/structures', { headers: headers() });
            if (res.ok) { const data = await res.json(); setStructures(data.structures || []); }
        } catch { /* silent */ }
    };

    const fetchPayments = async () => {
        try {
            const res = await fetch('/api/fees/payments', { headers: headers() });
            if (res.ok) { const data = await res.json(); setPayments(data.payments || []); }
        } catch { /* silent */ }
    };

    const fetchDefaulters = async () => {
        setLoadingDefaulters(true);
        try {
            const res = await fetch('/api/fees/defaulters', { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                setDefaulters(data.defaulters || []);
            }
        } catch { /* silent */ }
        setLoadingDefaulters(false);
    };

    const fetchPlatformBilling = async () => {
        try {
            const res = await fetch('/api/platform-billing', { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                const pending = data.charges?.find((c: any) => c.status === 'pending');
                setPlatformCharge(pending || null);
            }
        } catch { /* silent */ }
    };

    const searchStudents = async (searchTerm: string) => {
        setStudentSearch(searchTerm);
        if (searchTerm.length < 2) { setStudentResults([]); return; }
        try {
            const res = await fetch(`/api/students?search=${encodeURIComponent(searchTerm)}`, { headers: headers() });
            if (res.ok) { const data = await res.json(); setStudentResults(data.students?.slice(0, 8) || []); }
        } catch { /* silent */ }
    };

    const fetchStudentConcessions = async (studentId: string) => {
        try {
            const res = await fetch(`/api/fees/concessions?studentId=${studentId}`, { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                setStudentConcessions(data.concessions || []);
            } else {
                setStudentConcessions([]);
            }
        } catch { setStudentConcessions([]); }
    };

    const handleCollectFee = async () => {
        if (!collectForm.studentId || !collectForm.feeStructureId || !collectForm.amountPaid) return;
        setLoading(true);
        try {
            const res = await fetch('/api/fees/payments', {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify(collectForm),
            });
            if (res.ok) {
                const data = await res.json();
                alert(`Payment recorded! Receipt: ${data.payment.receipt_number}\nTotal Paid: ₹${data.summary.totalPaid}\nRemaining: ₹${data.summary.remaining}`);
                setCollectForm({ studentId: '', feeStructureId: '', amountPaid: '', paymentMode: 'cash', remarks: '' });
                setSelectedStudent(null);
                setStudentSearch('');
                setStudentConcessions([]);
                fetchPayments();
                setActiveTab('payments');
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to record payment');
            }
        } catch { alert('Failed to record payment'); }
        setLoading(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    // Calculate stats
    const totalCollected = payments.filter(p => p.payment_status === 'completed' || p.payment_status === 'partial')
        .reduce((sum, p) => sum + parseFloat(p.amount_paid || '0'), 0);
    const todayPayments = payments.filter(p => p.payment_date === new Date().toISOString().split('T')[0]);
    const todayCollected = todayPayments.reduce((sum, p) => sum + parseFloat(p.amount_paid || '0'), 0);

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-4xl mx-auto px-4 py-8 mt-16">
                {/* Welcome Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-7 mb-7 shadow-xl">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-green-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" />
                    <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
                    <div className="relative z-10">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-xl font-bold mb-1">Hello, {user?.firstName}! 👋</h1>
                                <p className="text-green-200 text-sm">Fee Management Dashboard</p>
                            </div>
                            <IndianRupee className="w-10 h-10 text-white/30" />
                        </div>
                        <span className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium">
                            <CalendarDays className="w-3.5 h-3.5" /> {todayLabel}
                        </span>
                    </div>
                </div>

                {/* Platform Charge Status Banner */}
                {platformCharge && (
                    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-bold text-amber-800">Platform Charge Pending</p>
                            <p className="text-xs text-amber-600 mt-0.5">
                                Your school's platform system charge of ₹{parseFloat(platformCharge.total_amount).toLocaleString('en-IN')} is due on {new Date(platformCharge.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} for the month of {platformCharge.billing_month}.
                            </p>
                        </div>
                        <button onClick={() => router.push('/manage/fee-hub')} className="px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 transition-all cursor-pointer shadow-sm">
                            Pay Dues
                        </button>
                    </div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <div className="bg-white border border-emerald-200 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 font-medium">Total Collected</p>
                        <p className="text-xl font-bold text-emerald-600 mt-1">₹{totalCollected.toLocaleString()}</p>
                    </div>
                    <div className="bg-white border border-blue-200 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 font-medium">Today&apos;s Collection</p>
                        <p className="text-xl font-bold text-blue-600 mt-1">₹{todayCollected.toLocaleString()}</p>
                    </div>
                    <div className="bg-white border border-violet-200 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 font-medium">Fee Structures</p>
                        <p className="text-xl font-bold text-violet-600 mt-1">{structures.length}</p>
                    </div>
                    <div className="bg-white border border-amber-200 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 font-medium">Total Payments</p>
                        <p className="text-xl font-bold text-amber-600 mt-1">{payments.length}</p>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl mb-6 overflow-x-auto">
                    {(['overview', 'collect', 'structures', 'payments', 'defaulters'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`flex-1 min-w-fit px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            {tab === 'overview' ? '📊 Overview' : tab === 'collect' ? '💳 Collect Fee' : tab === 'structures' ? '📋 Structures' : tab === 'payments' ? '🧾 Payments' : '🚨 Defaulters'}
                        </button>
                    ))}
                </div>

                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { title: 'Collect Fee', desc: 'Search student & record payment', icon: <CreditCard className="w-6 h-6" />, tab: 'collect' as const, gradient: 'from-emerald-100 to-teal-100', color: 'text-emerald-700', border: 'border-emerald-200' },
                            { title: 'Defaulters List', desc: 'Students with overdue fee dues', icon: <AlertCircle className="w-6 h-6" />, tab: 'defaulters' as const, gradient: 'from-red-100 to-rose-100', color: 'text-red-700', border: 'border-red-200' },
                            { title: 'Fee Structures', desc: 'View class-wise fee structure', icon: <IndianRupee className="w-6 h-6" />, tab: 'structures' as const, gradient: 'from-slate-100 to-gray-200', color: 'text-slate-700', border: 'border-slate-200' },
                            { title: 'Payment History', desc: 'All collected transactions', icon: <Receipt className="w-6 h-6" />, tab: 'payments' as const, gradient: 'from-blue-100 to-indigo-100', color: 'text-blue-700', border: 'border-blue-200' },
                        ].map(card => (
                            <div key={card.title} onClick={() => setActiveTab(card.tab)}
                                className={`group bg-white border ${card.border} rounded-2xl p-5 overflow-hidden relative cursor-pointer hover:shadow-lg transition-all`}>
                                <div className={`absolute -right-6 -top-6 w-20 h-20 rounded-full bg-gradient-to-br ${card.gradient} opacity-20`} />
                                <div className={`p-2.5 w-fit rounded-xl bg-gradient-to-br ${card.gradient} ${card.color} mb-3`}>{card.icon}</div>
                                <p className="font-bold text-gray-900 text-sm">{card.title}</p>
                                <p className="text-xs text-gray-500 mt-0.5 leading-snug">{card.desc}</p>
                                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 absolute top-5 right-4 transition-colors" />
                            </div>
                        ))}
                    </div>
                )}

                {/* Collect Fee Tab */}
                {activeTab === 'collect' && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-6">
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
                                    <button onClick={() => { setSelectedStudent(null); setCollectForm(f => ({ ...f, studentId: '' })); setStudentSearch(''); setStudentConcessions([]); }}
                                        className="p-1 rounded hover:bg-emerald-100"><X className="w-4 h-4 text-gray-500" /></button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="text" placeholder="Search by name or admission number..." value={studentSearch}
                                        onChange={e => searchStudents(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                                    {studentResults.length > 0 && (
                                        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                            {studentResults.map((s: any) => (
                                                <button key={s.id} onClick={() => {
                                                    setSelectedStudent(s);
                                                    setCollectForm(f => ({ ...f, studentId: s.id }));
                                                    setStudentResults([]);
                                                    setStudentSearch('');
                                                    fetchStudentConcessions(s.id);
                                                }}
                                                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b last:border-b-0">
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
                            <select value={collectForm.feeStructureId} onChange={e => setCollectForm(f => ({ ...f, feeStructureId: e.target.value }))}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
                                <option value="">Select fee structure...</option>
                                {structures.filter(s => s.is_active).map(s => (
                                    <option key={s.id} value={s.id}>{s.name} {s.class_name ? `(${s.class_name})` : ''} — ₹{parseFloat(s.amount).toLocaleString()}</option>
                                ))}
                            </select>
                        </div>

                        {/* Concession Note */}
                        {selectedStudent && collectForm.feeStructureId && studentConcessions.length > 0 && (() => {
                            const matchedConcession = studentConcessions.find((c: any) => c.fee_structure_id === collectForm.feeStructureId);
                            if (!matchedConcession) return null;
                            const discountLabel = matchedConcession.discount_type === 'percentage'
                                ? `${matchedConcession.discount_value}% discount`
                                : `₹${Number(matchedConcession.discount_value).toLocaleString('en-IN')} discount`;
                            return (
                                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                                    <p className="text-sm text-green-700 font-medium">
                                        Concession Applied: {discountLabel}
                                        {matchedConcession.reason && <span className="text-green-500 font-normal"> — {matchedConcession.reason}</span>}
                                    </p>
                                </div>
                            );
                        })()}

                        {/* Amount & Payment Mode */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Amount (₹)</label>
                                <input type="number" placeholder="0" value={collectForm.amountPaid}
                                    onChange={e => setCollectForm(f => ({ ...f, amountPaid: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Payment Mode</label>
                                <select value={collectForm.paymentMode} onChange={e => setCollectForm(f => ({ ...f, paymentMode: e.target.value }))}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
                                    {['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'online'].map(m => (
                                        <option key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Remarks */}
                        <div className="mb-5">
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Remarks (Optional)</label>
                            <input type="text" placeholder="Any notes..." value={collectForm.remarks}
                                onChange={e => setCollectForm(f => ({ ...f, remarks: e.target.value }))}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                        </div>

                        <button onClick={handleCollectFee} disabled={loading || !collectForm.studentId || !collectForm.feeStructureId || !collectForm.amountPaid}
                            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm">
                            {loading ? 'Processing...' : '💳 Record Payment'}
                        </button>
                    </div>
                )}

                {/* Fee Structures Tab */}
                {activeTab === 'structures' && (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">Fee Structures</h2>
                        </div>
                        {structures.length === 0 ? (
                            <div className="p-10 text-center text-gray-400 text-sm">
                                No fee structures configured yet. Ask your administrator to set them up.
                            </div>
                        ) : (
                            <div className="divide-y">
                                {structures.map(s => (
                                    <div key={s.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                                            <p className="text-xs text-gray-500">{s.class_name || 'All Classes'} · {s.fee_type} {s.due_date ? `· Due: ${new Date(s.due_date).toLocaleDateString('en-IN')}` : ''}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-emerald-600">₹{parseFloat(s.amount).toLocaleString()}</p>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                {s.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Payments Tab */}
                {activeTab === 'payments' && (
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b">
                            <h2 className="text-lg font-bold text-gray-900">Payment History</h2>
                        </div>
                        {payments.length === 0 ? (
                            <div className="p-10 text-center text-gray-400 text-sm">
                                No payments recorded yet.
                            </div>
                        ) : (
                            <div className="divide-y max-h-[500px] overflow-y-auto">
                                {payments.map(p => (
                                    <div key={p.id} className="px-5 py-3.5 hover:bg-gray-50">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">{p.student_name}</p>
                                                <p className="text-xs text-gray-500">{p.fee_name} · {p.payment_mode?.toUpperCase()} · {new Date(p.payment_date).toLocaleDateString('en-IN')}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-emerald-600">₹{parseFloat(p.amount_paid).toLocaleString()}</p>
                                                <p className="text-[10px] text-gray-400">{p.receipt_number}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {/* Defaulters Tab */}
                {activeTab === 'defaulters' && (
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
                                <p className="text-xs text-gray-400 mt-0.5">No students have overdue fees. That's incredible!</p>
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
                                        {defaulters.map((d: any, i) => (
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
            </main>
        </div>
    );
}
