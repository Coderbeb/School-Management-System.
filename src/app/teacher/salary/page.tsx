'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    ArrowLeft, IndianRupee, Loader2, CheckCircle, Clock, CalendarDays,
    Wallet, TrendingUp, Receipt, CreditCard, AlertCircle, Banknote
} from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: string; }
interface SalaryStructure {
    id: string; designation: string; base_salary: string;
    allowances: Record<string, number>; deductions: Record<string, number>;
    net_salary: string; effective_from: string;
}
interface SalaryPayment {
    id: string; month: string; gross_amount: string; total_deductions: string;
    net_amount: string; payment_mode: string; payment_date: string;
    reference_number: string; status: string;
}

export default function TeacherSalaryPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [structure, setStructure] = useState<SalaryStructure | null>(null);
    const [payments, setPayments] = useState<SalaryPayment[]>([]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'teacher') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchSalary(token);
    }, [router]);

    const fetchSalary = async (token: string) => {
        setLoading(true);
        try {
            const res = await fetch('/api/salary/my-salary', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setStructure(data.structure || null);
                setPayments(data.payments || []);
            }
        } catch { /* silent */ }
        setLoading(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const totalReceived = payments
        .filter(p => p.status === 'paid')
        .reduce((sum, p) => sum + parseFloat(p.net_amount || '0'), 0);

    const lastPayment = payments
        .filter(p => p.status === 'paid')
        .sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())[0];

    const monthsPaid = payments.filter(p => p.status === 'paid').length;

    const modeLabel = (mode: string) => {
        const labels: Record<string, string> = {
            cash: '💵 Cash', upi: '📱 UPI', bank_transfer: '🏦 Bank Transfer',
            cheque: '📝 Cheque', neft: '🏦 NEFT', imps: '⚡ IMPS', online: '🌐 Online'
        };
        return labels[mode] || mode;
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-3xl mx-auto px-4 py-8 mt-16">
                {/* Hero Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-7 mb-7 shadow-xl">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" />
                    <div className="absolute bottom-0 left-0 w-40 h-40 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
                    <div className="relative z-10">
                        <button onClick={() => router.push('/teacher/dashboard')} className="inline-flex items-center gap-1.5 text-sm text-amber-200 hover:text-white mb-4 transition-colors cursor-pointer">
                            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                        </button>
                        <h1 className="text-xl font-bold mb-1 flex items-center gap-2">
                            <IndianRupee className="w-6 h-6 text-amber-300" /> My Salary
                        </h1>
                        <p className="text-amber-200 text-sm">View your salary structure and payment history.</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-amber-500 animate-spin" /></div>
                ) : (
                    <>
                        {/* Summary Stats */}
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                                    <span className="text-xs text-emerald-600 font-medium">Total Received</span>
                                </div>
                                <p className="text-lg font-bold text-emerald-700">₹{totalReceived.toLocaleString('en-IN')}</p>
                            </div>
                            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <CalendarDays className="w-3.5 h-3.5 text-blue-500" />
                                    <span className="text-xs text-blue-600 font-medium">Last Payment</span>
                                </div>
                                <p className="text-lg font-bold text-blue-700">
                                    {lastPayment
                                        ? new Date(lastPayment.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                                        : '—'}
                                </p>
                            </div>
                            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <Receipt className="w-3.5 h-3.5 text-violet-500" />
                                    <span className="text-xs text-violet-600 font-medium">Months Paid</span>
                                </div>
                                <p className="text-lg font-bold text-violet-700">{monthsPaid}</p>
                            </div>
                        </div>

                        {/* Salary Structure Card */}
                        {structure ? (
                            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-6 shadow-sm">
                                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                                    <h2 className="text-base font-bold text-gray-900">💼 Salary Structure</h2>
                                    <p className="text-xs text-gray-500 mt-0.5">Your current salary breakdown</p>
                                </div>
                                <div className="p-5 space-y-4">
                                    {/* Designation & Base */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-gray-500 font-medium">Designation</p>
                                            <p className="text-sm font-bold text-gray-900">{structure.designation}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500 font-medium">Base Salary</p>
                                            <p className="text-sm font-bold text-gray-900">₹{parseFloat(structure.base_salary).toLocaleString('en-IN')}</p>
                                        </div>
                                    </div>

                                    <hr className="border-gray-100" />

                                    {/* Allowances */}
                                    {structure.allowances && Object.keys(structure.allowances).length > 0 && (
                                        <div>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Allowances</p>
                                            <div className="space-y-1.5">
                                                {Object.entries(structure.allowances).map(([key, value]) => (
                                                    <div key={key} className="flex items-center justify-between py-1.5 px-3 bg-emerald-50/50 rounded-lg">
                                                        <span className="text-sm text-gray-700 font-medium">{key}</span>
                                                        <span className="text-sm font-semibold text-emerald-600">+₹{Number(value).toLocaleString('en-IN')}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Deductions */}
                                    {structure.deductions && Object.keys(structure.deductions).length > 0 && (
                                        <div>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Deductions</p>
                                            <div className="space-y-1.5">
                                                {Object.entries(structure.deductions).map(([key, value]) => (
                                                    <div key={key} className="flex items-center justify-between py-1.5 px-3 bg-red-50/50 rounded-lg">
                                                        <span className="text-sm text-gray-700 font-medium">{key}</span>
                                                        <span className="text-sm font-semibold text-red-600">−₹{Number(value).toLocaleString('en-IN')}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <hr className="border-gray-100" />

                                    {/* Net Salary */}
                                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                                        <div className="flex items-center gap-2">
                                            <Wallet className="w-5 h-5 text-emerald-600" />
                                            <span className="text-sm font-bold text-gray-900">Net Salary</span>
                                        </div>
                                        <span className="text-2xl font-black text-emerald-600">₹{parseFloat(structure.net_salary).toLocaleString('en-IN')}</span>
                                    </div>

                                    {/* Effective From */}
                                    {structure.effective_from && (
                                        <p className="text-xs text-gray-400 text-center">
                                            Effective from {new Date(structure.effective_from).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200 mb-6">
                                <Banknote className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500 font-bold text-lg">No Salary Structure</p>
                                <p className="text-gray-400 text-sm mt-1">Your salary structure hasn&apos;t been configured yet. Contact your administrator.</p>
                            </div>
                        )}

                        {/* Payment History */}
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                                <h2 className="text-base font-bold text-gray-900">🧾 Payment History</h2>
                                <p className="text-xs text-gray-500 mt-0.5">All your salary payments</p>
                            </div>
                            {payments.length === 0 ? (
                                <div className="p-12 text-center">
                                    <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                    <p className="text-gray-500 font-bold">No Payments Yet</p>
                                    <p className="text-gray-400 text-xs mt-1">Your salary payments will appear here once processed.</p>
                                </div>
                            ) : (
                                <div className="divide-y max-h-[500px] overflow-y-auto">
                                    {payments.map(p => (
                                        <div key={p.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900">{p.month}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        {modeLabel(p.payment_mode)} · {new Date(p.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </p>
                                                    {p.reference_number && (
                                                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">Ref: {p.reference_number}</p>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-bold text-emerald-600">₹{parseFloat(p.net_amount).toLocaleString('en-IN')}</p>
                                                    <div className="flex items-center gap-2 justify-end mt-1">
                                                        <span className="text-[10px] text-gray-400">
                                                            Gross: ₹{parseFloat(p.gross_amount).toLocaleString('en-IN')}
                                                        </span>
                                                        <span className="text-[10px] text-red-400">
                                                            −₹{parseFloat(p.total_deductions).toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                    <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                        p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                        {p.status === 'paid' ? '✓ Paid' : '⏳ Pending'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
