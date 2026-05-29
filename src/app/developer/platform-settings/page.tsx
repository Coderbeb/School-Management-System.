'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    ArrowLeft, Save, Eye, EyeOff, Loader2, CheckCircle, AlertTriangle,
    IndianRupee, Building2, CreditCard, Users, CalendarDays, TrendingUp,
    ChevronRight, Settings
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface PlatformConfig {
    razorpay_key_id_masked: string;
    razorpay_key_secret_set: boolean;
    charge_model: string;
    charge_amount: string;
    charge_percentage: string;
    is_active: boolean;
}
interface PlatformCharge {
    id: string; school_name: string; billing_month: string;
    student_count: number; charge_model: string; charge_amount: string;
    total_amount: string; status: string; paid_at: string | null;
}

export default function PlatformSettingsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'config' | 'billing'>('config');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Config state
    const [config, setConfig] = useState<PlatformConfig | null>(null);
    const [formKeyId, setFormKeyId] = useState('');
    const [formKeySecret, setFormKeySecret] = useState('');
    const [showSecret, setShowSecret] = useState(false);
    const [chargeModel, setChargeModel] = useState('monthly_flat');
    const [chargeAmount, setChargeAmount] = useState('3000');
    const [chargePercentage, setChargePercentage] = useState('0');

    // Billing state
    const [charges, setCharges] = useState<PlatformCharge[]>([]);
    const [generateMonth, setGenerateMonth] = useState(new Date().toISOString().slice(0, 7));
    const [generating, setGenerating] = useState(false);

    // Offline payment modal state
    const [showOfflineModal, setShowOfflineModal] = useState(false);
    const [selectedCharge, setSelectedCharge] = useState<PlatformCharge | null>(null);
    const [offlinePaymentMode, setOfflinePaymentMode] = useState('cash');
    const [offlineReference, setOfflineReference] = useState('');
    const [offlinePaymentDate, setOfflinePaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [markingPaid, setMarkingPaid] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'developer') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchData(token);
    }, [router]);

    const getToken = () => localStorage.getItem('token') || '';
    const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

    const fetchData = async (token: string) => {
        setLoading(true);
        try {
            const [configRes, chargesRes] = await Promise.all([
                fetch('/api/developer/platform-config', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/developer/platform-charges', { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            if (configRes.ok) {
                const data = await configRes.json();
                setConfig(data.config);
                if (data.config) {
                    setChargeModel(data.config.charge_model || 'monthly_flat');
                    setChargeAmount(data.config.charge_amount || '3000');
                    setChargePercentage(data.config.charge_percentage || '0');
                }
            }
            if (chargesRes.ok) {
                const data = await chargesRes.json();
                setCharges(data.charges || []);
            }
        } catch { /* silent */ }
        setLoading(false);
    };

    const handleSaveConfig = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const body: any = {
                chargeModel,
                chargeAmount: parseFloat(chargeAmount || '0'),
                chargePercentage: parseFloat(chargePercentage || '0'),
            };
            if (formKeyId) body.razorpayKeyId = formKeyId;
            if (formKeySecret) body.razorpayKeySecret = formKeySecret;

            const res = await fetch('/api/developer/platform-config', {
                method: 'PUT', headers: headers(), body: JSON.stringify(body),
            });
            if (res.ok) {
                setMessage({ type: 'success', text: 'Platform configuration saved!' });
                setFormKeyId('');
                setFormKeySecret('');
                fetchData(getToken());
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Failed to save' });
            }
        } catch { setMessage({ type: 'error', text: 'Network error' }); }
        setSaving(false);
    };

    const handleGenerateCharges = async () => {
        setGenerating(true);
        setMessage(null);
        try {
            const res = await fetch('/api/developer/platform-charges', {
                method: 'POST', headers: headers(),
                body: JSON.stringify({ month: generateMonth }),
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: `Generated ${data.generated} charge(s) for ${generateMonth}` });
                fetchData(getToken());
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to generate' });
            }
        } catch { setMessage({ type: 'error', text: 'Network error' }); }
        setGenerating(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const handleMarkOffline = async () => {
        if (!selectedCharge) return;
        setMarkingPaid(true);
        setMessage(null);
        try {
            const res = await fetch('/api/platform-billing/pay-offline', {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({
                    chargeId: selectedCharge.id,
                    paymentMode: offlinePaymentMode,
                    paymentReference: offlineReference,
                    paymentDate: offlinePaymentDate,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: `Payment marked as paid for ${selectedCharge.school_name} (${selectedCharge.billing_month})` });
                fetchData(getToken());
                setShowOfflineModal(false);
                setSelectedCharge(null);
                setOfflinePaymentMode('cash');
                setOfflineReference('');
                setOfflinePaymentDate(new Date().toISOString().split('T')[0]);
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to mark as paid' });
            }
        } catch { setMessage({ type: 'error', text: 'Network error' }); }
        setMarkingPaid(false);
    };

    const totalRevenue = charges.filter(c => c.status === 'paid').reduce((s, c) => s + parseFloat(c.total_amount || '0'), 0);
    const pendingRevenue = charges.filter(c => c.status === 'pending').reduce((s, c) => s + parseFloat(c.total_amount || '0'), 0);
    const thisMonthCharges = charges.filter(c => c.billing_month === new Date().toISOString().slice(0, 7));

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-8 mb-8 shadow-xl">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-violet-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
                    <div className="relative z-10">
                        <button onClick={() => router.push('/developer/dashboard')} className="inline-flex items-center gap-1.5 text-sm text-violet-200 hover:text-white mb-4 transition-colors cursor-pointer">
                            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                        </button>
                        <h1 className="text-2xl font-bold mb-2">⚙️ Platform Settings & Revenue</h1>
                        <p className="text-violet-100 text-sm">Configure your payment gateway and manage school billing.</p>
                    </div>
                </div>

                {/* Revenue Stats */}
                {!loading && (
                    <div className="grid grid-cols-3 gap-3 mb-6">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                            <div className="flex items-center gap-1.5 mb-1 text-emerald-600"><TrendingUp className="w-4 h-4" /><span className="text-xs font-medium">Total Revenue</span></div>
                            <p className="text-xl font-bold text-emerald-700">₹{totalRevenue.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                            <div className="flex items-center gap-1.5 mb-1 text-amber-600"><CalendarDays className="w-4 h-4" /><span className="text-xs font-medium">Pending</span></div>
                            <p className="text-xl font-bold text-amber-700">₹{pendingRevenue.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                            <div className="flex items-center gap-1.5 mb-1 text-blue-600"><Building2 className="w-4 h-4" /><span className="text-xs font-medium">This Month</span></div>
                            <p className="text-xl font-bold text-blue-700">{thisMonthCharges.length} school{thisMonthCharges.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl mb-6">
                    <button onClick={() => setActiveTab('config')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'config' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        <Settings className="w-4 h-4" /> Configuration
                    </button>
                    <button onClick={() => setActiveTab('billing')} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'billing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        <IndianRupee className="w-4 h-4" /> School Billing
                    </button>
                </div>

                {/* Message */}
                {message && (
                    <div className={`mb-4 p-3 rounded-xl text-sm flex items-center gap-2 ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                        {message.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        {message.text}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>
                ) : (
                    <>
                        {/* Config Tab */}
                        {activeTab === 'config' && (
                            <div className="space-y-6">
                                {/* Razorpay Credentials */}
                                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                                        <h2 className="text-base font-bold text-gray-900">🔐 Your Razorpay Credentials</h2>
                                        <p className="text-xs text-gray-500 mt-0.5">Your personal Razorpay account where platform charges are received.</p>
                                    </div>
                                    <div className="p-5 space-y-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Razorpay Key ID</label>
                                            <input type="text" value={formKeyId} onChange={e => setFormKeyId(e.target.value)}
                                                placeholder={config?.razorpay_key_id_masked || 'rzp_live_xxxxxxxxxxxx'}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 font-mono" />
                                            {config?.razorpay_key_id_masked && <p className="text-xs text-gray-400 mt-1">Current: {config.razorpay_key_id_masked}</p>}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Razorpay Key Secret</label>
                                            <div className="relative">
                                                <input type={showSecret ? 'text' : 'password'} value={formKeySecret} onChange={e => setFormKeySecret(e.target.value)}
                                                    placeholder={config?.razorpay_key_secret_set ? '••••••••••••' : 'Enter your key secret'}
                                                    className="w-full px-4 pr-12 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 font-mono" />
                                                <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer">
                                                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                            {config?.razorpay_key_secret_set && <p className="text-xs text-emerald-600 mt-1">✓ Secret is saved</p>}
                                        </div>
                                    </div>
                                </div>

                                {/* Charge Model */}
                                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                                        <h2 className="text-base font-bold text-gray-900">💰 System Charge Model</h2>
                                        <p className="text-xs text-gray-500 mt-0.5">How you charge schools for using the platform.</p>
                                    </div>
                                    <div className="p-5 space-y-4">
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                { value: 'monthly_flat', label: 'Flat Monthly', desc: 'Fixed amount/month', icon: <IndianRupee className="w-5 h-5" /> },
                                                { value: 'per_student', label: 'Per Student', desc: '₹X per student/month', icon: <Users className="w-5 h-5" /> },
                                                { value: 'per_transaction', label: 'Per Transaction', desc: '% of each payment', icon: <CreditCard className="w-5 h-5" /> },
                                            ].map(opt => (
                                                <button key={opt.value} onClick={() => setChargeModel(opt.value)}
                                                    className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer ${
                                                        chargeModel === opt.value ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-gray-300'
                                                    }`}>
                                                    <div className={chargeModel === opt.value ? 'text-violet-600' : 'text-gray-400'}>{opt.icon}</div>
                                                    <p className={`font-bold text-sm mt-2 ${chargeModel === opt.value ? 'text-violet-700' : 'text-gray-700'}`}>{opt.label}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                                                </button>
                                            ))}
                                        </div>

                                        {chargeModel !== 'per_transaction' ? (
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                                    {chargeModel === 'monthly_flat' ? 'Monthly Charge (₹)' : 'Per Student Charge (₹/month)'}
                                                </label>
                                                <input type="number" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)}
                                                    placeholder={chargeModel === 'monthly_flat' ? '3000' : '2'}
                                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500" />
                                                {chargeModel === 'monthly_flat' && <p className="text-xs text-gray-400 mt-1">Each school pays this fixed amount per month</p>}
                                                {chargeModel === 'per_student' && <p className="text-xs text-gray-400 mt-1">Example: 350 students × ₹{chargeAmount || '2'} = ₹{(350 * parseFloat(chargeAmount || '2')).toLocaleString('en-IN')}/month</p>}
                                            </div>
                                        ) : (
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Transaction Fee (%)</label>
                                                <input type="number" value={chargePercentage} onChange={e => setChargePercentage(e.target.value)}
                                                    step="0.1" placeholder="1.5"
                                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500" />
                                                <p className="text-xs text-gray-400 mt-1">Example: ₹10,000 payment × {chargePercentage || '1.5'}% = ₹{((10000 * parseFloat(chargePercentage || '1.5')) / 100).toLocaleString('en-IN')} fee</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button onClick={handleSaveConfig} disabled={saving}
                                    className="w-full py-3 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {saving ? 'Saving...' : 'Save Configuration'}
                                </button>
                            </div>
                        )}

                        {/* Billing Tab */}
                        {activeTab === 'billing' && (
                            <div className="space-y-6">
                                {/* Generate Charges */}
                                <div className="bg-white border border-gray-200 rounded-2xl p-5">
                                    <h3 className="font-bold text-gray-900 text-sm mb-3">Generate Monthly Charges</h3>
                                    <div className="flex gap-3">
                                        <input type="month" value={generateMonth} onChange={e => setGenerateMonth(e.target.value)}
                                            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500" />
                                        <button onClick={handleGenerateCharges} disabled={generating}
                                            className="px-6 py-2.5 bg-violet-600 text-white font-bold rounded-xl text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer">
                                            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
                                            {generating ? 'Generating...' : 'Generate'}
                                        </button>
                                    </div>
                                </div>

                                {/* Charges List */}
                                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                    <div className="px-5 py-4 border-b border-gray-100">
                                        <h3 className="font-bold text-gray-900">All Billing Records</h3>
                                    </div>
                                    {charges.length === 0 ? (
                                        <div className="p-10 text-center text-gray-400 text-sm">
                                            No billing records yet. Generate charges for a month above.
                                        </div>
                                    ) : (
                                        <div className="divide-y max-h-[500px] overflow-y-auto">
                                            {charges.map(c => (
                                                <div key={c.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50">
                                                    <div>
                                                        <p className="text-sm font-semibold text-gray-900">{c.school_name}</p>
                                                        <p className="text-xs text-gray-500">
                                                            {c.billing_month} · {c.student_count} students · {c.charge_model?.replace('_', ' ')}
                                                        </p>
                                                    </div>
                                                    <div className="text-right flex items-center gap-3">
                                                        <div>
                                                            <p className="text-sm font-bold text-gray-900">₹{parseFloat(c.total_amount).toLocaleString('en-IN')}</p>
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                                c.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                                                c.status === 'overdue' ? 'bg-red-100 text-red-700' :
                                                                'bg-amber-100 text-amber-700'
                                                            }`}>
                                                                {c.status === 'paid' ? '✓ Paid' : c.status === 'overdue' ? '⚠ Overdue' : '⏳ Pending'}
                                                            </span>
                                                        </div>
                                                        {(c.status === 'pending' || c.status === 'overdue') && (
                                                            <button
                                                                onClick={() => { setSelectedCharge(c); setShowOfflineModal(true); }}
                                                                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
                                                            >
                                                                Mark as Paid
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* Offline Payment Modal */}
            {showOfflineModal && selectedCharge && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">Mark as Paid</h3>
                        <p className="text-xs text-gray-500 mb-5">
                            {selectedCharge.school_name} · {selectedCharge.billing_month} · ₹{parseFloat(selectedCharge.total_amount).toLocaleString('en-IN')}
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Payment Mode</label>
                                <select value={offlinePaymentMode} onChange={e => setOfflinePaymentMode(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500">
                                    <option value="cash">Cash</option>
                                    <option value="bank_transfer">Bank Transfer</option>
                                    <option value="upi">UPI</option>
                                    <option value="cheque">Cheque</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Reference Number</label>
                                <input type="text" value={offlineReference} onChange={e => setOfflineReference(e.target.value)}
                                    placeholder="Transaction ID, cheque number, etc."
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Payment Date</label>
                                <input type="date" value={offlinePaymentDate} onChange={e => setOfflinePaymentDate(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500" />
                            </div>
                        </div>

                        <div className="flex gap-2 mt-6">
                            <button onClick={() => { setShowOfflineModal(false); setSelectedCharge(null); }}
                                className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold transition-all border border-gray-150 cursor-pointer">
                                Cancel
                            </button>
                            <button onClick={handleMarkOffline} disabled={markingPaid}
                                className="flex-1 py-3 bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer">
                                {markingPaid ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                {markingPaid ? 'Processing...' : 'Confirm Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
