'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, Download, ArrowLeft, Loader2, Building, ShieldCheck, Mail, Phone, MapPin } from 'lucide-react';
import Image from 'next/image';

interface PayslipData {
    id: string;
    month: string;
    gross_amount: string;
    deductions_amount: string;
    net_amount: string;
    payment_mode: string;
    payment_date: string;
    reference_number: string;
    remarks: string;
    status: string;
    
    base_salary: string;
    allowances: Record<string, number>;
    deductions: Record<string, number>;
    
    first_name: string;
    last_name: string;
    email: string;
    role: string;
    
    school_name: string;
    school_address: string;
    school_phone: string;
    school_email: string;
    school_logo: string;
}

// Helper to convert number to Indian Words (Lakhs, Crores)
function numberToWords(num: number): string {
    if (num === 0) return 'Zero';
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    const convert = (n: number): string => {
        if (n < 20) return a[n];
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
        if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + convert(n % 100) : '');
        if (n < 100000) return convert(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? convert(n % 1000) : '');
        if (n < 10000000) return convert(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? convert(n % 100000) : '');
        return convert(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? convert(n % 10000000) : '');
    };
    return convert(num).trim() + ' Rupees Only';
}

export default function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [payslip, setPayslip] = useState<PayslipData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchPayslip = async () => {
            const token = localStorage.getItem('token');
            if (!token) { router.replace('/login'); return; }
            
            try {
                const r = await fetch(`/api/salary/payments/${id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (r.ok) {
                    const data = await r.json();
                    setPayslip(data.payment);
                } else {
                    const e = await r.json();
                    setError(e.error || 'Failed to load payslip');
                }
            } catch (err) {
                setError('Network error loading payslip');
            }
            setLoading(false);
        };
        fetchPayslip();
    }, [id, router]);

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                    <p className="text-gray-500 font-medium">Generating Payslip...</p>
                </div>
            </div>
        );
    }

    if (error || !payslip) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
                <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full border border-gray-200">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                        <ShieldCheck className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
                    <p className="text-gray-500 mb-6">{error || 'Could not find this payslip.'}</p>
                    <button onClick={() => window.close()} className="px-6 py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors w-full">
                        Close Window
                    </button>
                </div>
            </div>
        );
    }

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const [year, monthNum] = payslip.month.split('-');
    const formattedMonth = `${monthNames[parseInt(monthNum) - 1]} ${year}`;
    
    // Fallbacks for school info if not joined perfectly
    const schoolName = payslip.school_name || 'Antigravity International School';
    const schoolAddress = payslip.school_address || '123 Education Hub, Sector 45, Smart City';
    const schoolPhone = payslip.school_phone || '+91 98765 43210';
    const schoolEmail = payslip.school_email || 'info@antigravityschool.edu.in';
    const payslipNo = payslip.id.substring(0, 8).toUpperCase();

    return (
        <div className="min-h-screen bg-gray-100 font-sans p-4 md:p-8 print:p-0 print:bg-white">
            {/* Header Actions (Hidden when printing) */}
            <div className="max-w-3xl mx-auto mb-6 flex items-center justify-between print:hidden">
                <button onClick={() => window.close()} className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <div className="flex gap-3">
                    <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95">
                        <Printer className="w-4 h-4" /> Print Payslip
                    </button>
                    <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-gray-900 text-gray-900 font-bold rounded-xl hover:bg-gray-50 transition-all active:scale-95">
                        <Download className="w-4 h-4" /> Save PDF
                    </button>
                </div>
            </div>

            {/* Print Tip (Hidden when printing) */}
            <div className="max-w-3xl mx-auto mb-6 bg-blue-50 border border-blue-100 text-blue-800 text-xs px-4 py-3 rounded-xl flex items-center gap-3 print:hidden">
                <Printer className="w-4 h-4 text-blue-500 shrink-0" />
                <p><strong>Tip:</strong> For the best PDF result, ensure <em>"Background graphics"</em> is turned on in your print settings.</p>
            </div>

            {/* --- PAYSLIP PAPER START --- */}
            <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden print:shadow-none print:rounded-none">
                
                {/* 1. Header Area */}
                <div className="p-8 border-b-4 border-blue-900 bg-blue-50 print:bg-white print:border-b-2 print:border-gray-300">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-4">
                            {payslip.school_logo ? (
                                <Image src={payslip.school_logo} alt="Logo" width={80} height={80} className="rounded-xl shadow-sm object-cover" />
                            ) : (
                                <div className="w-20 h-20 bg-blue-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
                                    <Building className="w-10 h-10" />
                                </div>
                            )}
                            <div>
                                <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">{schoolName}</h1>
                                <p className="text-sm text-gray-600 mt-1 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {schoolAddress}</p>
                                <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500 font-medium">
                                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {schoolPhone}</span>
                                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {schoolEmail}</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <h2 className="text-3xl font-black text-blue-900 tracking-tight uppercase">PAYSLIP</h2>
                            <div className="inline-block bg-blue-900 text-white px-3 py-1 rounded-lg text-sm font-bold mt-2 shadow-sm">
                                {formattedMonth}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Employee Details & Payslip Info */}
                <div className="p-8 pb-6 bg-white border-b border-gray-100">
                    <div className="grid grid-cols-2 gap-8">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Employee Details</p>
                            <table className="w-full text-sm">
                                <tbody>
                                    <tr><td className="py-1 text-gray-500 w-32">Employee Name</td><td className="py-1 font-bold text-gray-900">{payslip.first_name} {payslip.last_name}</td></tr>
                                    <tr><td className="py-1 text-gray-500">Designation / Role</td><td className="py-1 font-semibold text-gray-900 capitalize">{payslip.role.replace('_', ' ')}</td></tr>
                                    <tr><td className="py-1 text-gray-500">Email</td><td className="py-1 font-medium text-gray-900">{payslip.email}</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Payment Details</p>
                            <table className="w-full text-sm">
                                <tbody>
                                    <tr><td className="py-1 text-gray-500 w-32">Payslip No.</td><td className="py-1 font-mono font-bold text-gray-900">PS-{payslipNo}</td></tr>
                                    <tr><td className="py-1 text-gray-500">Payment Date</td><td className="py-1 font-medium text-gray-900">{new Date(payslip.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td></tr>
                                    <tr><td className="py-1 text-gray-500">Payment Mode</td><td className="py-1 font-medium text-gray-900 capitalize">{payslip.payment_mode.replace('_', ' ')}</td></tr>
                                    {payslip.reference_number && <tr><td className="py-1 text-gray-500">Reference No.</td><td className="py-1 font-mono text-gray-900">{payslip.reference_number}</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* 3. Salary Breakdown Table */}
                <div className="p-8 pt-6">
                    <div className="grid grid-cols-2 gap-8">
                        
                        {/* EARNINGS */}
                        <div>
                            <div className="bg-emerald-50 border border-emerald-100 rounded-t-xl px-4 py-3 flex justify-between items-center print:bg-white print:border-b-2 print:border-gray-800 print:rounded-none">
                                <h3 className="font-bold text-emerald-900 print:text-gray-900">Earnings</h3>
                                <span className="text-xs font-bold text-emerald-600 print:text-gray-600">Amount (₹)</span>
                            </div>
                            <div className="border-x border-b border-gray-100 rounded-b-xl print:border-0">
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-gray-50">
                                        <tr>
                                            <td className="py-3 px-4 font-semibold text-gray-700">Basic Salary</td>
                                            <td className="py-3 px-4 text-right font-medium text-gray-900">{parseFloat(payslip.base_salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                        {Object.entries(payslip.allowances || {}).map(([key, val]) => (
                                            <tr key={key}>
                                                <td className="py-3 px-4 text-gray-600">{key}</td>
                                                <td className="py-3 px-4 text-right font-medium text-gray-900">{parseFloat(String(val)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-gray-50/50 print:bg-white border-t border-gray-200">
                                            <td className="py-3 px-4 font-bold text-gray-900">Total Earnings</td>
                                            <td className="py-3 px-4 text-right font-bold text-gray-900">{parseFloat(payslip.gross_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {/* DEDUCTIONS */}
                        <div>
                            <div className="bg-red-50 border border-red-100 rounded-t-xl px-4 py-3 flex justify-between items-center print:bg-white print:border-b-2 print:border-gray-800 print:rounded-none">
                                <h3 className="font-bold text-red-900 print:text-gray-900">Deductions</h3>
                                <span className="text-xs font-bold text-red-600 print:text-gray-600">Amount (₹)</span>
                            </div>
                            <div className="border-x border-b border-gray-100 rounded-b-xl print:border-0 h-[calc(100%-48px)] flex flex-col justify-between">
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-gray-50">
                                        {Object.keys(payslip.deductions || {}).length > 0 ? (
                                            Object.entries(payslip.deductions || {}).map(([key, val]) => (
                                                <tr key={key}>
                                                    <td className="py-3 px-4 text-gray-600">{key}</td>
                                                    <td className="py-3 px-4 text-right font-medium text-gray-900">{parseFloat(String(val)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td className="py-3 px-4 text-gray-400 italic text-center" colSpan={2}>No deductions</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                <table className="w-full text-sm mt-auto">
                                    <tfoot>
                                        <tr className="bg-gray-50/50 print:bg-white border-t border-gray-200">
                                            <td className="py-3 px-4 font-bold text-gray-900">Total Deductions</td>
                                            <td className="py-3 px-4 text-right font-bold text-gray-900">{parseFloat(payslip.deductions_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                    </div>
                </div>

                {/* 4. Net Pay Summary */}
                <div className="px-8 pb-8">
                    <div className="bg-gray-900 text-white rounded-2xl p-6 flex items-center justify-between shadow-lg print:bg-white print:text-gray-900 print:border-2 print:border-gray-900 print:shadow-none">
                        <div>
                            <p className="text-sm text-gray-400 font-medium uppercase tracking-wider mb-1 print:text-gray-500">Net Salary Payable</p>
                            <p className="text-3xl font-black tracking-tight">₹{parseFloat(payslip.net_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                            <p className="text-sm mt-2 font-medium text-gray-300 print:text-gray-600 italic">
                                {numberToWords(Math.round(parseFloat(payslip.net_amount)))}
                            </p>
                        </div>
                        {payslip.status === 'paid' && (
                            <div className="w-24 h-24 border-4 border-emerald-500 text-emerald-500 rounded-full flex flex-col items-center justify-center rotate-[-12deg] opacity-80 print:opacity-100 print:border-gray-900 print:text-gray-900">
                                <span className="text-xl font-black uppercase tracking-widest leading-none">PAID</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* 5. Remarks & Signatures */}
                <div className="px-8 pb-8 pt-4">
                    {payslip.remarks && (
                        <div className="mb-12">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Remarks</p>
                            <p className="text-sm text-gray-700">{payslip.remarks}</p>
                        </div>
                    )}
                    
                    <div className="flex justify-between items-end mt-16 pt-8 border-t border-dashed border-gray-300">
                        <div className="text-center w-48">
                            <div className="h-10 border-b border-gray-400 mb-2"></div>
                            <p className="text-sm font-bold text-gray-900">Employee Signature</p>
                        </div>
                        <div className="text-center w-48">
                            <div className="h-10 border-b border-gray-400 mb-2"></div>
                            <p className="text-sm font-bold text-gray-900">Authorized Signatory</p>
                            <p className="text-xs text-gray-500 mt-0.5">{schoolName}</p>
                        </div>
                    </div>
                </div>

                {/* 6. Footer */}
                <div className="bg-gray-50 py-3 px-8 text-center border-t border-gray-100 print:bg-white print:border-t-2 print:border-gray-900">
                    <p className="text-xs text-gray-400 font-medium">
                        This is a computer-generated document. No physical signature is required. Generated on {new Date().toLocaleString('en-IN')}.
                    </p>
                </div>
            </div>
        </div>
    );
}
