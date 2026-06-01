'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    IndianRupee, CreditCard, Receipt, Users, ArrowLeft, ChevronRight,
    BarChart3, Settings, AlertTriangle, FileText, UserCheck, Building2,
    TrendingUp, Clock, CheckCircle, Loader2
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }

interface FeeStats {
    totalGroups: number;
    totalCollected: number;
    totalPayments: number;
    todayCollected: number;
    pendingInvoices: number;
    gatewayConfigured: boolean;
}

export default function FeeHubPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<FeeStats>({
        totalGroups: 0, totalCollected: 0, totalPayments: 0,
        todayCollected: 0, pendingInvoices: 0, gatewayConfigured: false
    });

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin' && parsed.role !== 'accountant') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchStats(token);
    }, [router]);

    const fetchStats = async (token: string) => {
        setLoading(true);
        try {
            const [groupRes, payRes, invRes, gwRes] = await Promise.all([
                fetch('/api/fees/groups', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/fees/payments', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/fees/invoices', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
                fetch('/api/settings/payment-gateway', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
            ]);

            const groups = groupRes.ok ? (await groupRes.json()).groups || [] : [];
            const payments = payRes.ok ? (await payRes.json()).payments || [] : [];
            const invoices = invRes && invRes.ok ? (await invRes.json()).invoices || [] : [];
            const gatewayData = gwRes && gwRes.ok ? await gwRes.json() : null;

            const today = new Date().toISOString().split('T')[0];
            const todayPayments = payments.filter((p: any) => p.payment_date === today);
            const totalCollected = payments.reduce((s: number, p: any) => s + parseFloat(p.amount_paid || '0'), 0);
            const todayCollected = todayPayments.reduce((s: number, p: any) => s + parseFloat(p.amount_paid || '0'), 0);
            const pendingInvoices = invoices.filter((inv: any) => inv.status === 'unpaid' || inv.status === 'overdue' || inv.status === 'partially_paid').length;

            setStats({
                totalGroups: groups.length,
                totalCollected,
                totalPayments: payments.length,
                todayCollected,
                pendingInvoices,
                gatewayConfigured: !!gatewayData?.config?.is_active,
            });
        } catch { /* silent */ }
        setLoading(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const quickStats = [
        { label: 'Total Collected', value: `₹${stats.totalCollected.toLocaleString('en-IN')}`, icon: <TrendingUp className="w-4 h-4" />, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
        { label: "Today's Collection", value: `₹${stats.todayCollected.toLocaleString('en-IN')}`, icon: <Clock className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
        { label: 'Fee Groups', value: stats.totalGroups.toString(), icon: <FileText className="w-4 h-4" />, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
        { label: 'Pending Invoices', value: stats.pendingInvoices.toString(), icon: <Receipt className="w-4 h-4" />, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
    ];

    const managementCards = [
        {
            title: 'Fee Heads', desc: 'Define individual fee items: Tuition, Transport, Sports, Mess, Exam',
            href: '/manage/fee-heads', icon: <IndianRupee className="w-6 h-6" />,
            gradient: 'from-emerald-500 to-teal-600', bg: 'bg-emerald-50', color: 'text-emerald-700', border: 'border-emerald-200',
        },
        {
            title: 'Fee Groups', desc: 'Bundle fee heads into customizable packages like Day Scholar or Boarder',
            href: '/manage/fee-groups', icon: <FileText className="w-6 h-6" />,
            gradient: 'from-indigo-500 to-purple-600', bg: 'bg-indigo-50', color: 'text-indigo-700', border: 'border-indigo-200',
        },
        {
            title: 'Assign Groups', desc: 'Assign student batches to fee groups for automatic fee calculations',
            href: '/manage/student-groups', icon: <Users className="w-6 h-6" />,
            gradient: 'from-blue-500 to-cyan-600', bg: 'bg-blue-50', color: 'text-blue-700', border: 'border-blue-200',
        },
        {
            title: 'Invoices & Billing', desc: 'Generate student invoices in bulk or individually and track balances',
            href: '/manage/invoices', icon: <Receipt className="w-6 h-6" />,
            gradient: 'from-violet-500 to-fuchsia-600', bg: 'bg-violet-50', color: 'text-violet-700', border: 'border-violet-200',
        },
        {
            title: 'Legacy Fee Structures', desc: 'Manage old single-amount class-wise fee schedules',
            href: '/manage/fee-structures', icon: <Settings className="w-6 h-6" />,
            gradient: 'from-amber-500 to-orange-600', bg: 'bg-amber-50', color: 'text-amber-700', border: 'border-amber-200',
        },
    ];

    const settingsCards = [
        {
            title: 'Payment Gateway', desc: 'Configure Razorpay credentials for online fee collection',
            href: '/settings?tab=payment-gateway', icon: <Settings className="w-5 h-5" />,
            configured: stats.gatewayConfigured,
        },
        {
            title: 'Platform Billing', desc: 'View and pay monthly system charges',
            href: '/manage/platform-billing', icon: <Building2 className="w-5 h-5" />,
            configured: true,
        },
    ];

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">
                {/* Hero Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-8 mb-8 shadow-xl">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
                    <div className="relative z-10">
                        <button onClick={() => router.push('/dashboard')} className="inline-flex items-center gap-1.5 text-sm text-emerald-200 hover:text-white mb-4 transition-colors cursor-pointer">
                            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                        </button>
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-bold mb-2">💰 Fee Management</h1>
                                <p className="text-emerald-100 text-sm max-w-xl">
                                    Manage fee structures, collect payments, and track collections for your institution.
                                </p>
                            </div>
                            <IndianRupee className="hidden sm:block w-12 h-12 text-emerald-200 opacity-60" />
                        </div>
                    </div>
                </div>

                {/* Gateway Warning */}
                {!loading && !stats.gatewayConfigured && (
                    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                        <div className="p-2 bg-amber-100 rounded-xl text-amber-600 mt-0.5">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-bold text-amber-800">Online Payments Not Configured</p>
                            <p className="text-xs text-amber-600 mt-0.5">Set up your Razorpay payment gateway in Settings to enable online fee collection from students.</p>
                        </div>
                        <button onClick={() => router.push('/settings?tab=payment-gateway')} className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 transition-colors cursor-pointer whitespace-nowrap">
                            Configure Now
                        </button>
                    </div>
                )}

                {/* Quick Stats */}
                {loading ? (
                    <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                            {quickStats.map(stat => (
                                <div key={stat.label} className={`${stat.bg} border ${stat.border} rounded-2xl p-4`}>
                                    <div className={`flex items-center gap-1.5 mb-1 ${stat.color}`}>
                                        {stat.icon}
                                        <span className="text-xs font-medium">{stat.label}</span>
                                    </div>
                                    <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Management Cards */}
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Fee Operations</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                            {managementCards.map(card => (
                                <div key={card.title} onClick={() => router.push(card.href)}
                                    className={`group bg-white border ${card.border} rounded-2xl p-5 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden relative`}>
                                    <div className={`absolute -right-8 -top-8 w-24 h-24 rounded-full bg-gradient-to-br ${card.gradient} opacity-10 group-hover:scale-150 transition-transform duration-500`} />
                                    <div className="relative flex items-start justify-between mb-3">
                                        <div className={`p-3 rounded-xl ${card.bg} ${card.color}`}>{card.icon}</div>
                                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                                    </div>
                                    <h3 className="font-bold text-gray-900 text-base mb-1">{card.title}</h3>
                                    <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
                                </div>
                            ))}
                        </div>

                        {/* Settings & Billing */}
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Settings & Billing</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {settingsCards.map(card => (
                                <div key={card.title} onClick={() => router.push(card.href)}
                                    className="group bg-white border border-gray-200 rounded-2xl p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center gap-4">
                                    <div className={`p-3 rounded-xl ${card.configured ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                        {card.icon}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-gray-900 text-sm">{card.title}</p>
                                            {card.configured ? (
                                                <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">Active</span>
                                            ) : (
                                                <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">Setup Required</span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">{card.desc}</p>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-gray-300" />
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
