'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    IndianRupee, Receipt, Download, Clock, CheckCircle, AlertCircle,
    Loader2, CalendarDays, CreditCard, TrendingUp, FileText, Copy, Tag
} from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: string; }
interface Concession {
    id: string; fee_structure_id: string; discount_type: string;
    discount_value: number; reason: string;
}
interface FeeItem {
    id: string; name: string; fee_type: string; amount: string;
    due_date: string | null; frequency: string;
    totalPaid: number; remaining: number; isOverdue: boolean;
    grace_period_days?: number; late_fee_per_day?: number;
    concession?: Concession;
}
interface PaymentRecord {
    id: string; amount_paid: string; payment_mode: string;
    payment_date: string; receipt_number: string; payment_status: string;
    fee_name: string; collected_by_name: string;
}
interface SchoolConfig {
    late_fee_enabled: boolean;
    concession_enabled: boolean;
}

export default function StudentFeesPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [feeStructures, setFeeStructures] = useState<FeeItem[]>([]);
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
    const [onlinePaymentsEnabled, setOnlinePaymentsEnabled] = useState(false);
    const [payingId, setPayingId] = useState<string | null>(null);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string | null>(null);
    const [schoolConfig, setSchoolConfig] = useState<SchoolConfig>({ late_fee_enabled: false, concession_enabled: false });
    const [copiedReceipt, setCopiedReceipt] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'student') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchFees(token);
    }, [router]);

    const fetchFees = async (token: string) => {
        setLoading(true);
        try {
            const res = await fetch('/api/fees/student-summary', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setFeeStructures(data.feeStructures || []);
                setPayments(data.payments || []);
                setOnlinePaymentsEnabled(data.onlinePaymentsEnabled || false);
                if (data.schoolConfig) {
                    setSchoolConfig(data.schoolConfig);
                }
            }
        } catch { /* silent */ }
        setLoading(false);
    };

    const loadRazorpay = () => {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });
    };

    const handlePayOnline = async (feeStructureId: string) => {
        setPayingId(feeStructureId);
        setPaymentError(null);
        setPaymentSuccessMessage(null);

        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            // 1. Create order on backend
            const orderRes = await fetch('/api/fees/create-order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ feeStructureId })
            });

            const orderData = await orderRes.json();
            if (!orderRes.ok) throw new Error(orderData.error || 'Failed to initiate payment');

            // 2. Load Razorpay script
            const loaded = await loadRazorpay();
            if (!loaded) throw new Error('Failed to load Razorpay SDK. Please check your internet connection.');

            // 3. Open Razorpay checkout
            const options = {
                key: orderData.keyId,
                amount: orderData.amount,
                currency: orderData.currency,
                name: schoolNameLabel(),
                description: 'Online Fee Payment',
                order_id: orderData.orderId,
                handler: async function (response: any) {
                    setPayingId(feeStructureId); // Show loading during verification
                    try {
                        const verifyRes = await fetch('/api/fees/verify-payment', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature
                            })
                        });

                        const verifyData = await verifyRes.json();
                        if (!verifyRes.ok) throw new Error(verifyData.error || 'Payment verification failed');

                        setPaymentSuccessMessage('✓ Payment completed successfully! Receipt No: ' + verifyData.payment.receipt_number);
                        fetchFees(token); // Reload fee list
                    } catch (err: any) {
                        setPaymentError(err.message || 'Signature verification failed. Please contact admin.');
                    } finally {
                        setPayingId(null);
                    }
                },
                prefill: {
                    name: `${user?.firstName || ''} ${user?.lastName || ''}`,
                    email: user?.email || '',
                },
                theme: {
                    color: '#059669', // Emerald 600
                },
                modal: {
                    ondismiss: function() {
                        setPayingId(null);
                    }
                }
            };

            const paymentObject = new (window as any).Razorpay(options);
            paymentObject.open();
        } catch (err: any) {
            setPaymentError(err.message || 'An error occurred during payment');
            setPayingId(null);
        }
    };

    const schoolNameLabel = () => {
        // Can resolve from branding settings or keep simple
        return 'YSM Attendance & Fees';
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedReceipt(text);
            setTimeout(() => setCopiedReceipt(null), 2000);
        });
    };

    // Calculate concession discount for a fee
    const getConcessionDiscount = (fee: FeeItem): number => {
        if (!schoolConfig.concession_enabled || !fee.concession) return 0;
        const originalAmount = parseFloat(fee.amount);
        if (fee.concession.discount_type === 'percentage') {
            return (originalAmount * fee.concession.discount_value) / 100;
        }
        return fee.concession.discount_value;
    };

    // Calculate late fee for a fee item
    const getLateFee = (fee: FeeItem): number => {
        if (!schoolConfig.late_fee_enabled || !fee.isOverdue || !fee.due_date || fee.remaining <= 0) return 0;
        const gracePeriod = fee.grace_period_days || 0;
        const lateFeePerDay = fee.late_fee_per_day || 0;
        if (lateFeePerDay <= 0) return 0;

        const dueDate = new Date(fee.due_date);
        const today = new Date();
        const diffTime = today.getTime() - dueDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const daysOverdue = Math.max(0, diffDays - gracePeriod);
        return daysOverdue * lateFeePerDay;
    };

    const getEffectiveAmount = (fee: FeeItem): number => {
        const original = parseFloat(fee.amount);
        const discount = getConcessionDiscount(fee);
        return original - discount;
    };

    const totalFee = feeStructures.reduce((s, f) => s + getEffectiveAmount(f), 0);
    const totalLateFees = feeStructures.reduce((s, f) => s + getLateFee(f), 0);
    const totalPaid = feeStructures.reduce((s, f) => s + f.totalPaid, 0);
    const totalRemaining = feeStructures.reduce((s, f) => {
        const effective = getEffectiveAmount(f);
        const remaining = Math.max(0, effective - f.totalPaid);
        return s + remaining + getLateFee(f);
    }, 0);
    const overdueCount = feeStructures.filter(f => f.isOverdue && f.remaining > 0).length;

    const modeLabel = (mode: string) => {
        const labels: Record<string, string> = { cash: '💵 Cash', upi: '📱 UPI', bank_transfer: '🏦 Bank Transfer', cheque: '📝 Cheque', card: '💳 Card', online: '🌐 Online' };
        return labels[mode] || mode;
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-3xl mx-auto px-4 py-8 mt-16">
                {/* Header */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-7 mb-7 shadow-xl">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" />
                    <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
                    <div className="relative z-10">
                        <h1 className="text-xl font-bold mb-1 flex items-center gap-2">
                            <IndianRupee className="w-6 h-6 text-emerald-300" /> Fee Status
                        </h1>
                        <p className="text-emerald-200 text-sm">View your fee details, payment history, and pending dues.</p>
                    </div>
                </div>

                {/* Payment Alerts */}
                {paymentSuccessMessage && (
                    <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-bold text-emerald-800">Payment Successful</p>
                            <p className="text-xs text-emerald-600 mt-0.5">{paymentSuccessMessage}</p>
                        </div>
                    </div>
                )}

                {paymentError && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-bold text-red-800">Payment Failed</p>
                            <p className="text-xs text-red-600 mt-0.5">{paymentError}</p>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
                ) : feeStructures.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <IndianRupee className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-bold text-lg">No Fee Records Found</p>
                        <p className="text-gray-400 text-sm mt-1">Your school hasn&apos;t assigned any fee structures to your class yet.</p>
                    </div>
                ) : (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                            <div className="bg-white border border-gray-200 rounded-2xl p-4">
                                <div className="flex items-center gap-1.5 mb-1"><FileText className="w-3.5 h-3.5 text-gray-400" /><span className="text-xs text-gray-500 font-medium">Total Fee</span></div>
                                <p className="text-lg font-bold text-gray-900">₹{totalFee.toLocaleString('en-IN')}</p>
                                {totalLateFees > 0 && (
                                    <p className="text-[10px] text-red-500 font-medium mt-0.5">+₹{totalLateFees.toLocaleString('en-IN')} late fees</p>
                                )}
                            </div>
                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                                <div className="flex items-center gap-1.5 mb-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /><span className="text-xs text-emerald-600 font-medium">Paid</span></div>
                                <p className="text-lg font-bold text-emerald-700">₹{totalPaid.toLocaleString('en-IN')}</p>
                            </div>
                            <div className={`rounded-2xl p-4 ${totalRemaining > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}`}>
                                <div className="flex items-center gap-1.5 mb-1"><Clock className="w-3.5 h-3.5 text-amber-500" /><span className="text-xs text-amber-600 font-medium">Remaining</span></div>
                                <p className={`text-lg font-bold ${totalRemaining > 0 ? 'text-amber-700' : 'text-gray-400'}`}>₹{totalRemaining.toLocaleString('en-IN')}</p>
                            </div>
                            <div className={`rounded-2xl p-4 ${overdueCount > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}`}>
                                <div className="flex items-center gap-1.5 mb-1"><AlertCircle className="w-3.5 h-3.5 text-red-500" /><span className="text-xs text-red-600 font-medium">Overdue</span></div>
                                <p className={`text-lg font-bold ${overdueCount > 0 ? 'text-red-700' : 'text-gray-400'}`}>{overdueCount}</p>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl mb-6">
                            <button onClick={() => setActiveTab('overview')} className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'overview' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                                📋 Fee Breakdown
                            </button>
                            <button onClick={() => setActiveTab('history')} className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'history' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                                🧾 Payment History ({payments.length})
                            </button>
                        </div>

                        {/* Fee Breakdown */}
                        {activeTab === 'overview' && (
                            <div className="space-y-3">
                                {feeStructures.map(fee => {
                                    const concessionDiscount = getConcessionDiscount(fee);
                                    const hasConcession = schoolConfig.concession_enabled && concessionDiscount > 0;
                                    const effectiveAmount = getEffectiveAmount(fee);
                                    const lateFee = getLateFee(fee);
                                    const paidPercent = effectiveAmount > 0 ? Math.min((fee.totalPaid / effectiveAmount) * 100, 100) : 0;

                                    return (
                                        <div key={fee.id} className={`bg-white border rounded-2xl p-4 transition-all ${fee.isOverdue && fee.remaining > 0 ? 'border-red-200' : 'border-gray-200'}`}>
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-bold text-gray-900 text-sm">{fee.name}</h3>
                                                        {hasConcession && (
                                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
                                                                <Tag className="w-2.5 h-2.5" /> Concession Applied
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        {fee.fee_type.charAt(0).toUpperCase() + fee.fee_type.slice(1)} · {fee.frequency?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Yearly'}
                                                        {fee.due_date && ` · Due: ${new Date(fee.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                                                    </p>
                                                </div>
                                                <div className="text-right flex flex-col items-end">
                                                    {hasConcession ? (
                                                        <div>
                                                            <p className="text-sm text-gray-400 line-through">₹{parseFloat(fee.amount).toLocaleString('en-IN')}</p>
                                                            <p className="text-xs text-green-600 font-semibold">−₹{concessionDiscount.toLocaleString('en-IN')} discount</p>
                                                            <p className="text-lg font-bold text-gray-900">₹{effectiveAmount.toLocaleString('en-IN')}</p>
                                                        </div>
                                                    ) : (
                                                        <p className="text-lg font-bold text-gray-900">₹{parseFloat(fee.amount).toLocaleString('en-IN')}</p>
                                                    )}
                                                    {lateFee > 0 && (
                                                        <p className="text-xs text-red-600 font-semibold mt-0.5">+₹{lateFee.toLocaleString('en-IN')} late fee</p>
                                                    )}
                                                    {fee.remaining > 0 ? (
                                                        <div className="flex flex-col items-end gap-1.5 mt-1.5">
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${fee.isOverdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                {fee.isOverdue ? '⚠ Overdue' : `⏳ ₹${fee.remaining.toLocaleString('en-IN')} due`}
                                                            </span>
                                                            {onlinePaymentsEnabled && (
                                                                <button
                                                                    onClick={() => handlePayOnline(fee.id)}
                                                                    disabled={payingId === fee.id}
                                                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white text-[11px] font-bold rounded-lg shadow-sm hover:shadow transition-all shrink-0 cursor-pointer flex items-center gap-1 mt-1"
                                                                >
                                                                    {payingId === fee.id ? (
                                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                                    ) : (
                                                                        <CreditCard className="w-3 h-3" />
                                                                    )}
                                                                    Pay Now
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 mt-1">✓ Fully Paid</span>
                                                    )}
                                                </div>
                                            </div>
                                            {/* Progress bar */}
                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full transition-all duration-500 ${paidPercent >= 100 ? 'bg-emerald-500' : fee.isOverdue ? 'bg-red-400' : 'bg-blue-500'}`}
                                                    style={{ width: `${paidPercent}%` }} />
                                            </div>
                                            <div className="flex justify-between mt-1.5">
                                                <span className="text-[10px] text-gray-400">Paid: ₹{fee.totalPaid.toLocaleString('en-IN')}</span>
                                                <span className="text-[10px] text-gray-400">{Math.round(paidPercent)}%</span>
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Online Payment Status Banner */}
                                {onlinePaymentsEnabled ? (
                                    <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-2xl p-5 shadow-md flex items-center justify-between mt-4">
                                        <div className="text-left">
                                            <p className="text-sm font-bold flex items-center gap-1.5"><CreditCard className="w-4 h-4 text-emerald-200" /> Online Payments Ready</p>
                                            <p className="text-[11px] text-emerald-100 mt-0.5 max-w-md">You can pay any pending fee instantly using Cards, Net Banking, Wallet, or UPI.</p>
                                        </div>
                                        <CheckCircle className="w-8 h-8 text-emerald-200 opacity-60 hidden sm:block" />
                                    </div>
                                ) : (
                                    <div className="bg-gradient-to-r from-gray-50 to-slate-100 border border-gray-200 rounded-2xl p-5 text-center mt-4">
                                        <CreditCard className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                        <p className="text-sm font-bold text-gray-700 mb-1">Online Payment Coming Soon</p>
                                        <p className="text-xs text-gray-400">Online fee payment will be available once your school finishes setting up their payment gateway.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Payment History */}
                        {activeTab === 'history' && (
                            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                {payments.length === 0 ? (
                                    <div className="p-10 text-center text-gray-400 text-sm">No payments recorded yet.</div>
                                ) : (
                                    <div className="divide-y">
                                        {payments.map(p => (
                                            <div key={p.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm font-semibold text-gray-900">{p.fee_name || 'Fee Payment'}</p>
                                                        <p className="text-xs text-gray-500 mt-0.5">
                                                            {modeLabel(p.payment_mode)} · {new Date(p.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                            {p.collected_by_name && ` · By: ${p.collected_by_name}`}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-bold text-emerald-600">₹{parseFloat(p.amount_paid).toLocaleString('en-IN')}</p>
                                                        <div className="flex items-center gap-1.5 justify-end mt-1">
                                                            <span className="text-[10px] text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{p.receipt_number}</span>
                                                            <button
                                                                onClick={() => copyToClipboard(p.receipt_number)}
                                                                className="p-0.5 rounded hover:bg-gray-200 transition-colors cursor-pointer"
                                                                title="Copy receipt number"
                                                            >
                                                                {copiedReceipt === p.receipt_number ? (
                                                                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                                                                ) : (
                                                                    <Copy className="w-3 h-3 text-gray-400" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
