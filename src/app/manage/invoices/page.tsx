'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    Receipt, ArrowLeft, Plus, X, Calendar, Loader2, CheckCircle, AlertTriangle, Search, Info, Trash2
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface ClassItem { id: string; name: string; }
interface SessionItem { id: string; name: string; is_current: boolean; }
interface InvoiceItem {
    id: string;
    name: string;
    amount: string;
    tax_amount: string;
    discount_amount: string;
    total_amount: string;
}
interface Invoice {
    id: string;
    invoice_number: string;
    student_name: string;
    admission_number: string;
    class_name: string;
    section_name: string;
    due_date: string;
    subtotal: string;
    tax_amount: string;
    discount_amount: string;
    total_amount: string;
    paid_amount: string;
    status: 'unpaid' | 'partially_paid' | 'paid' | 'void' | 'overdue';
    items: InvoiceItem[];
}

export default function InvoicesPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    
    const [sessions, setSessions] = useState<SessionItem[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    
    const [selectedSession, setSelectedSession] = useState('');
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    
    const [showGenModal, setShowGenModal] = useState(false);
    const [genSession, setGenSession] = useState('');
    const [genClass, setGenClass] = useState('');
    const [genDueDate, setGenDueDate] = useState('');
    const [genStart, setGenStart] = useState('');
    const [genEnd, setGenEnd] = useState('');
    const [generating, setGenerating] = useState(false);
    
    const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin' && parsed.role !== 'accountant' && parsed.role !== 'developer') {
            router.replace('/dashboard');
            return;
        }
        setUser(parsed);
        fetchConfig(token);
    }, [router]);

    const getToken = () => localStorage.getItem('token') || '';
    const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

    const fetchConfig = async (token: string) => {
        setLoading(true);
        try {
            const [sessRes, classRes] = await Promise.all([
                fetch('/api/manage/sessions', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/manage/classes', { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            
            const sessionsData = sessRes.ok ? (await sessRes.json()).sessions || [] : [];
            const classesData = classRes.ok ? (await classRes.json()).classes || [] : [];
            
            setSessions(sessionsData);
            setClasses(classesData);
            
            const current = sessionsData.find((s: any) => s.is_current);
            if (current) {
                setSelectedSession(current.id);
                setGenSession(current.id);
                fetchInvoices(token, current.id, '', '');
            }
        } catch { setLoading(false); }
    };

    const fetchInvoices = async (token: string, sessionId: string, classId: string, status: string) => {
        if (!sessionId) return;
        setLoading(true);
        try {
            let url = `/api/fees/invoices?sessionId=${sessionId}`;
            if (classId) url += `&classSectionId=${classId}`; // Note: API filters classSectionId, in our GET handler it maps to classSectionId
            if (status) url += `&status=${status}`;
            
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                setInvoices((await res.json()).invoices || []);
            }
        } catch { /* silent */ }
        setLoading(false);
    };

    const handleFilterChange = (sessionId: string, classId: string, status: string) => {
        setSelectedSession(sessionId);
        setSelectedClass(classId);
        setSelectedStatus(status);
        fetchInvoices(getToken(), sessionId, classId, status);
    };

    const handleGenerate = async () => {
        if (!genSession || !genDueDate) {
            setMessage({ type: 'error', text: 'Academic Session and Due Date are required.' });
            return;
        }
        
        setGenerating(true);
        setMessage(null);
        try {
            const res = await fetch('/api/fees/invoices', {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({
                    sessionId: genSession,
                    classId: genClass || null,
                    dueDate: genDueDate,
                    billingPeriodStart: genStart || null,
                    billingPeriodEnd: genEnd || null
                })
            });

            if (res.ok) {
                const data = await res.json();
                setMessage({ type: 'success', text: data.message || 'Successfully generated invoices!' });
                setShowGenModal(false);
                fetchInvoices(getToken(), selectedSession, selectedClass, selectedStatus);
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Failed to generate invoices' });
            }
        } catch { setMessage({ type: 'error', text: 'Network error' }); }
        setGenerating(false);
    };

    const handleUpdateStatus = async (invoiceId: string, newStatus: string) => {
        if (!confirm(`Update status of invoice to "${newStatus.toUpperCase()}"?`)) return;
        try {
            const res = await fetch('/api/fees/invoices', {
                method: 'PUT',
                headers: headers(),
                body: JSON.stringify({ id: invoiceId, status: newStatus })
            });
            if (res.ok) {
                setMessage({ type: 'success', text: 'Invoice status updated successfully' });
                setViewInvoice(null);
                fetchInvoices(getToken(), selectedSession, selectedClass, selectedStatus);
            }
        } catch { /* silent */ }
    };

    const handleDeleteInvoice = async (invoiceId: string) => {
        if (!confirm('Are you sure you want to permanently delete this invoice? This action cannot be undone.')) return;
        try {
            const res = await fetch(`/api/fees/invoices?id=${invoiceId}`, {
                method: 'DELETE',
                headers: headers()
            });
            if (res.ok) {
                setMessage({ type: 'success', text: 'Invoice deleted successfully' });
                setViewInvoice(null);
                fetchInvoices(getToken(), selectedSession, selectedClass, selectedStatus);
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Failed to delete' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Network error' });
        }
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const filteredInvoices = invoices.filter(inv =>
        inv.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.admission_number.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'paid': return 'bg-emerald-50 border-emerald-100 text-emerald-700';
            case 'partially_paid': return 'bg-blue-50 border-blue-100 text-blue-700';
            case 'unpaid': return 'bg-amber-50 border-amber-100 text-amber-700';
            case 'void': return 'bg-gray-100 border-gray-200 text-gray-400';
            case 'overdue': return 'bg-red-50 border-red-100 text-red-700';
            default: return 'bg-gray-50 border-gray-100 text-gray-700';
        }
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
                            <h1 className="text-xl font-bold text-gray-900">Invoices & Billing</h1>
                            <p className="text-xs text-gray-500">{filteredInvoices.length} invoices matching filters</p>
                        </div>
                    </div>
                    {user?.role === 'super_admin' && (
                        <button onClick={() => setShowGenModal(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all text-sm cursor-pointer">
                            <Plus className="w-4 h-4" /> Generate Invoices
                        </button>
                    )}
                </div>

                {/* Filters */}
                <div className="bg-white border border-gray-200 rounded-3xl p-5 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-3 shadow-sm">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">Academic Session</label>
                        <select value={selectedSession} onChange={e => handleFilterChange(e.target.value, selectedClass, selectedStatus)}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 bg-white">
                            {sessions.map(s => <option key={s.id} value={s.id}>{s.name} {s.is_current ? '(Current)' : ''}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">Class Filter</label>
                        <select value={selectedClass} onChange={e => handleFilterChange(selectedSession, e.target.value, selectedStatus)}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 bg-white">
                            <option value="">All Classes</option>
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">Status</label>
                        <select value={selectedStatus} onChange={e => handleFilterChange(selectedSession, selectedClass, e.target.value)}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 bg-white">
                            <option value="">All Statuses</option>
                            <option value="unpaid">Unpaid</option>
                            <option value="partially_paid">Partially Paid</option>
                            <option value="paid">Paid</option>
                            <option value="overdue">Overdue</option>
                            <option value="void">Void</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">Search Student</label>
                        <div className="relative">
                            <input type="text" placeholder="Name or Adm #" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500" />
                            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-3.5" />
                        </div>
                    </div>
                </div>

                {/* Message */}
                {message && (
                    <div className={`mb-4 p-3 rounded-xl text-sm flex items-center gap-2 ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                        {message.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        {message.text}
                    </div>
                )}

                {/* Invoices List */}
                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
                ) : filteredInvoices.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-bold text-lg">No Invoices Found</p>
                        <p className="text-gray-400 text-sm mt-1">Generate invoices to get started.</p>
                    </div>
                ) : (
                    <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                        <table className="w-full border-collapse text-left text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold">
                                    <th className="p-4">Invoice #</th>
                                    <th className="p-4">Student</th>
                                    <th className="p-4">Due Date</th>
                                    <th className="p-4">Total</th>
                                    <th className="p-4">Paid</th>
                                    <th className="p-4">Balance</th>
                                    <th className="p-4">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredInvoices.map(inv => {
                                    const total = parseFloat(inv.total_amount);
                                    const paid = parseFloat(inv.paid_amount || '0');
                                    const balance = total - paid;
                                    
                                    return (
                                        <tr key={inv.id} onClick={() => setViewInvoice(inv)}
                                            className="hover:bg-gray-50 transition-colors cursor-pointer">
                                            <td className="p-4 font-bold text-gray-900">{inv.invoice_number}</td>
                                            <td className="p-4">
                                                <div className="font-bold text-gray-950">{inv.student_name}</div>
                                                <div className="text-xs text-gray-400">Class {inv.class_name} · Adm {inv.admission_number}</div>
                                            </td>
                                            <td className="p-4 text-gray-600">{new Date(inv.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                            <td className="p-4 font-semibold text-gray-900">₹{total.toLocaleString('en-IN')}</td>
                                            <td className="p-4 text-emerald-600">₹{paid.toLocaleString('en-IN')}</td>
                                            <td className="p-4 font-bold text-red-600">₹{balance.toLocaleString('en-IN')}</td>
                                            <td className="p-4">
                                                <span className={`px-2.5 py-1 rounded-full border text-xs font-semibold ${getStatusStyle(inv.status)}`}>
                                                    {inv.status.replace('_', ' ').toUpperCase()}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Generate Invoice Modal */}
                {showGenModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl">
                            <div className="flex items-center justify-between mb-5 border-b border-gray-100 pb-3">
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Receipt className="w-5 h-5 text-emerald-600" />
                                    Generate Student Invoices
                                </h2>
                                <button onClick={() => setShowGenModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X className="w-5 h-5 text-gray-400" /></button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Academic Session *</label>
                                    <select value={genSession} onChange={e => setGenSession(e.target.value)}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                                        {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Target Class (Optional)</label>
                                    <select value={genClass} onChange={e => setGenClass(e.target.value)}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                                        <option value="">All Classes</option>
                                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Invoice Due Date *</label>
                                    <input type="date" value={genDueDate} onChange={e => setGenDueDate(e.target.value)}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Billing Start (Optional)</label>
                                        <input type="date" value={genStart} onChange={e => setGenStart(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Billing End (Optional)</label>
                                        <input type="date" value={genEnd} onChange={e => setGenEnd(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-6 pt-4 border-t border-gray-100">
                                <button onClick={() => setShowGenModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-200 transition-colors cursor-pointer">Cancel</button>
                                <button onClick={handleGenerate} disabled={generating}
                                    className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl text-sm shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer">
                                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    {generating ? 'Generating...' : 'Generate Now'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* View Invoice Drawer/Details Modal */}
                {viewInvoice && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
                        <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-5 border-b border-gray-100 pb-3">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">{viewInvoice.invoice_number}</h2>
                                    <p className="text-xs text-gray-500">{viewInvoice.student_name} (Class {viewInvoice.class_name})</p>
                                </div>
                                <button onClick={() => setViewInvoice(null)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X className="w-5 h-5 text-gray-400" /></button>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold uppercase">Admission Number</p>
                                        <p className="font-semibold text-gray-900 mt-0.5">{viewInvoice.admission_number}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold uppercase">Due Date</p>
                                        <p className="font-semibold text-gray-900 mt-0.5">{new Date(viewInvoice.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Invoice Line Items</p>
                                    <div className="border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100">
                                        {viewInvoice.items && viewInvoice.items.map((item, idx) => (
                                            <div key={item.id || idx} className="p-3 flex items-center justify-between text-sm hover:bg-gray-50">
                                                <div>
                                                    <span className="font-bold text-gray-900">{item.name}</span>
                                                    {parseFloat(item.tax_amount) > 0 && (
                                                        <span className="text-[10px] ml-2 px-1.5 py-0.5 bg-amber-50 text-amber-700 font-bold rounded">Tax: ₹{parseFloat(item.tax_amount).toFixed(2)}</span>
                                                    )}
                                                    {parseFloat(item.discount_amount) > 0 && (
                                                        <span className="text-[10px] ml-2 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded">Discount: -₹{parseFloat(item.discount_amount).toFixed(2)}</span>
                                                    )}
                                                </div>
                                                <span className="font-bold text-gray-950">₹{parseFloat(item.total_amount).toLocaleString('en-IN')}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="border-t border-dashed border-gray-200 pt-4 flex flex-col items-end gap-1.5 text-sm">
                                    <div className="flex justify-between w-48 text-gray-500">
                                        <span>Subtotal</span>
                                        <span>₹{parseFloat(viewInvoice.subtotal).toLocaleString('en-IN')}</span>
                                    </div>
                                    {parseFloat(viewInvoice.tax_amount) > 0 && (
                                        <div className="flex justify-between w-48 text-gray-500">
                                            <span>Tax Amount</span>
                                            <span>₹{parseFloat(viewInvoice.tax_amount).toLocaleString('en-IN')}</span>
                                        </div>
                                    )}
                                    {parseFloat(viewInvoice.discount_amount) > 0 && (
                                        <div className="flex justify-between w-48 text-emerald-600">
                                            <span>Discounts</span>
                                            <span>-₹{parseFloat(viewInvoice.discount_amount).toLocaleString('en-IN')}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between w-48 text-base font-bold text-gray-900 border-t border-gray-100 pt-2 mt-1">
                                        <span>Net Payable</span>
                                        <span>₹{parseFloat(viewInvoice.total_amount).toLocaleString('en-IN')}</span>
                                    </div>
                                    <div className="flex justify-between w-48 text-sm font-semibold text-emerald-600">
                                        <span>Amount Paid</span>
                                        <span>₹{parseFloat(viewInvoice.paid_amount || '0').toLocaleString('en-IN')}</span>
                                    </div>
                                    <div className="flex justify-between w-48 text-base font-bold text-red-600 border-t border-gray-100 pt-2">
                                        <span>Balance Due</span>
                                        <span>₹{(parseFloat(viewInvoice.total_amount) - parseFloat(viewInvoice.paid_amount || '0')).toLocaleString('en-IN')}</span>
                                    </div>
                                </div>
                            </div>

                            {user?.role === 'super_admin' && viewInvoice.status !== 'void' && (
                                <div className="flex gap-2 mt-6 pt-4 border-t border-gray-100">
                                    {viewInvoice.status !== 'paid' && (
                                        <button onClick={() => handleUpdateStatus(viewInvoice.id, 'paid')}
                                            className="flex-1 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-xs hover:bg-emerald-700 transition-all cursor-pointer">
                                            Mark as Paid
                                        </button>
                                    )}
                                    <button onClick={() => handleUpdateStatus(viewInvoice.id, 'void')}
                                        className="flex-1 py-2.5 bg-gray-100 text-gray-500 font-bold rounded-xl text-xs hover:bg-gray-200 transition-all cursor-pointer">
                                        Void Invoice
                                    </button>
                                    <button onClick={() => handleDeleteInvoice(viewInvoice.id)}
                                        className="py-2.5 px-4 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-all cursor-pointer border border-red-100" title="Delete Invoice">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
