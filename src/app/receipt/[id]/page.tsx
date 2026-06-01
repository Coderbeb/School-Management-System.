'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Printer, Download, ArrowLeft, CheckCircle, IndianRupee } from 'lucide-react';

interface ReceiptData {
    id: string;
    receipt_number: string;
    amount_paid: string;
    payment_mode: string;
    payment_date: string;
    payment_status: string;
    remarks: string | null;
    student_first_name: string;
    student_last_name: string;
    admission_number: string;
    guardian_name: string | null;
    guardian_phone: string | null;
    class_name: string | null;
    section_name: string | null;
    school_name: string;
    school_address: string | null;
    school_phone: string | null;
    school_email: string | null;
    school_logo: string | null;
    invoice_number: string | null;
    invoice_total: string | null;
    invoice_paid: string | null;
    fee_structure_name: string | null;
    fee_structure_amount: string | null;
    collected_by_name: string | null;
    invoice_items: { name: string; head_name: string; amount: string; tax_amount: string; discount_amount: string; total_amount: string; }[];
}

export default function ReceiptPage() {
    const params = useParams();
    const router = useRouter();
    const [receipt, setReceipt] = useState<ReceiptData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) { router.replace('/login'); return; }

        const fetchReceipt = async () => {
            try {
                const res = await fetch(`/api/fees/payments/${params.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setReceipt(data.payment);
                } else {
                    const e = await res.json();
                    setError(e.error || 'Failed to load receipt');
                }
            } catch {
                setError('Network error');
            }
            setLoading(false);
        };
        fetchReceipt();
    }, [params.id, router]);

    const handlePrint = () => window.print();

    const modeLabel = (mode: string) => {
        const labels: Record<string, string> = {
            cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank Transfer',
            cheque: 'Cheque', card: 'Card', online: 'Online (Razorpay)',
        };
        return labels[mode] || mode;
    };

    const numberToWords = (num: number): string => {
        if (num === 0) return 'Zero';
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
            'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const convert = (n: number): string => {
            if (n < 20) return ones[n];
            if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
            if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convert(n % 100) : '');
            if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
            if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
            return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
        };
        const rupees = Math.floor(num);
        const paise = Math.round((num - rupees) * 100);
        let result = convert(rupees) + ' Rupees';
        if (paise > 0) result += ' and ' + convert(paise) + ' Paise';
        return result + ' Only';
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
        );
    }

    if (error || !receipt) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <p className="text-red-600 font-bold text-lg mb-2">Receipt Not Found</p>
                    <p className="text-gray-500 text-sm mb-4">{error || 'This receipt does not exist or you do not have permission to view it.'}</p>
                    <button onClick={() => router.back()} className="px-4 py-2 bg-gray-200 rounded-xl text-sm font-semibold cursor-pointer">Go Back</button>
                </div>
            </div>
        );
    }

    const amountPaid = parseFloat(receipt.amount_paid);
    const invoiceTotal = receipt.invoice_total ? parseFloat(receipt.invoice_total) : null;
    const invoicePaid = receipt.invoice_paid ? parseFloat(receipt.invoice_paid) : null;
    const balance = invoiceTotal && invoicePaid ? Math.max(0, invoiceTotal - invoicePaid) : null;

    return (
        <>
            {/* Print styles */}
            <style jsx global>{`
                @media print {
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .no-print { display: none !important; }
                    .receipt-container { box-shadow: none !important; border: none !important; max-width: 100% !important; margin: 0 !important; padding: 24px !important; }
                    @page { margin: 10mm; size: A4; }
                }
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                body { font-family: 'Inter', sans-serif; }
            `}</style>

            <div className="min-h-screen bg-gray-100 py-8 px-4">
                {/* Action bar */}
                <div className="max-w-[700px] mx-auto mb-4 flex items-center justify-between no-print">
                    <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-semibold text-sm cursor-pointer">
                        <ArrowLeft className="w-4 h-4" /> Back
                    </button>
                    <div className="flex items-center gap-2">
                        <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm cursor-pointer hover:bg-emerald-700 shadow-lg">
                            <Printer className="w-4 h-4" /> Print Receipt
                        </button>
                    </div>
                </div>

                {/* Receipt */}
                <div className="receipt-container max-w-[700px] mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white px-8 py-6">
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-xl font-black tracking-tight">{receipt.school_name}</h1>
                                {receipt.school_address && <p className="text-gray-400 text-xs mt-1 max-w-[300px]">{receipt.school_address}</p>}
                                <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400">
                                    {receipt.school_phone && <span>📞 {receipt.school_phone}</span>}
                                    {receipt.school_email && <span>✉ {receipt.school_email}</span>}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest inline-block">
                                    Fee Receipt
                                </div>
                                <p className="text-gray-400 text-xs mt-2 font-mono">#{receipt.receipt_number}</p>
                            </div>
                        </div>
                    </div>

                    {/* Meta info strip */}
                    <div className="bg-gray-50 border-b border-gray-200 px-8 py-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-6">
                            <div><span className="text-gray-400 font-medium">Date: </span><span className="font-bold text-gray-700">{new Date(receipt.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
                            <div><span className="text-gray-400 font-medium">Mode: </span><span className="font-bold text-gray-700">{modeLabel(receipt.payment_mode)}</span></div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="font-bold text-emerald-600 uppercase text-[10px] tracking-wider">Paid</span>
                        </div>
                    </div>

                    {/* Student details */}
                    <div className="px-8 py-5 border-b border-gray-100">
                        <h3 className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-3">Student Details</h3>
                        <div className="grid grid-cols-2 gap-y-2.5 gap-x-8 text-sm">
                            <div><span className="text-gray-400 text-xs">Name</span><p className="font-bold text-gray-900">{receipt.student_first_name} {receipt.student_last_name}</p></div>
                            <div><span className="text-gray-400 text-xs">Admission No.</span><p className="font-bold text-gray-900">{receipt.admission_number || '—'}</p></div>
                            <div><span className="text-gray-400 text-xs">Class</span><p className="font-bold text-gray-900">{receipt.class_name ? `${receipt.class_name}${receipt.section_name ? ' - ' + receipt.section_name : ''}` : '—'}</p></div>
                            <div><span className="text-gray-400 text-xs">Guardian</span><p className="font-bold text-gray-900">{receipt.guardian_name || '—'}</p></div>
                        </div>
                    </div>

                    {/* Fee breakdown */}
                    <div className="px-8 py-5">
                        <h3 className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-3">Payment Details</h3>
                        {receipt.invoice_items && receipt.invoice_items.length > 0 ? (
                            <table className="w-full text-sm mb-4">
                                <thead>
                                    <tr className="border-b-2 border-gray-200 text-gray-500 text-xs uppercase">
                                        <th className="text-left py-2 font-bold">#</th>
                                        <th className="text-left py-2 font-bold">Description</th>
                                        <th className="text-right py-2 font-bold">Amount</th>
                                        <th className="text-right py-2 font-bold">Tax</th>
                                        <th className="text-right py-2 font-bold">Discount</th>
                                        <th className="text-right py-2 font-bold">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {receipt.invoice_items.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="py-2.5 text-gray-400">{idx + 1}</td>
                                            <td className="py-2.5 font-semibold text-gray-900">{item.head_name || item.name}</td>
                                            <td className="py-2.5 text-right text-gray-700">₹{parseFloat(item.amount).toLocaleString('en-IN')}</td>
                                            <td className="py-2.5 text-right text-gray-500">{parseFloat(item.tax_amount) > 0 ? `₹${parseFloat(item.tax_amount).toLocaleString('en-IN')}` : '—'}</td>
                                            <td className="py-2.5 text-right text-green-600">{parseFloat(item.discount_amount) > 0 ? `-₹${parseFloat(item.discount_amount).toLocaleString('en-IN')}` : '—'}</td>
                                            <td className="py-2.5 text-right font-bold text-gray-900">₹{parseFloat(item.total_amount).toLocaleString('en-IN')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">{receipt.fee_structure_name || 'Fee Payment'}</span>
                                    <span className="font-bold text-gray-900">₹{receipt.fee_structure_amount ? parseFloat(receipt.fee_structure_amount).toLocaleString('en-IN') : amountPaid.toLocaleString('en-IN')}</span>
                                </div>
                            </div>
                        )}

                        {/* Totals */}
                        <div className="border-t-2 border-gray-900 pt-4 space-y-2">
                            {invoiceTotal && (
                                <div className="flex justify-between text-sm text-gray-500">
                                    <span>Invoice Total</span>
                                    <span>₹{invoiceTotal.toLocaleString('en-IN')}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-gray-900">Amount Paid (This Receipt)</span>
                                <span className="text-2xl font-black text-emerald-600">₹{amountPaid.toLocaleString('en-IN')}</span>
                            </div>
                            {balance !== null && balance > 0 && (
                                <div className="flex justify-between text-sm text-red-600 font-semibold">
                                    <span>Balance Due</span>
                                    <span>₹{balance.toLocaleString('en-IN')}</span>
                                </div>
                            )}
                            {balance !== null && balance === 0 && (
                                <div className="flex justify-between text-sm text-emerald-600 font-semibold">
                                    <span>Balance Due</span>
                                    <span>₹0 (Fully Paid)</span>
                                </div>
                            )}
                        </div>

                        {/* Amount in words */}
                        <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
                            <p className="text-xs text-gray-500">Amount in words</p>
                            <p className="text-sm font-bold text-gray-800 italic">{numberToWords(amountPaid)}</p>
                        </div>

                        {/* Remarks */}
                        {receipt.remarks && (
                            <div className="mt-3 text-xs text-gray-500">
                                <span className="font-semibold">Remarks:</span> {receipt.remarks}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-8 py-5 border-t border-dashed border-gray-200 bg-gray-50">
                        <div className="flex items-end justify-between">
                            <div className="text-xs text-gray-400">
                                <p>This is a computer-generated receipt.</p>
                                {receipt.invoice_number && <p className="mt-0.5">Invoice Ref: {receipt.invoice_number}</p>}
                                {receipt.collected_by_name && <p className="mt-0.5">Collected by: {receipt.collected_by_name}</p>}
                            </div>
                            <div className="text-right">
                                <div className="w-40 border-t border-gray-300 pt-1.5 mt-6">
                                    <p className="text-xs font-bold text-gray-600">Authorized Signatory</p>
                                    <p className="text-[10px] text-gray-400">{receipt.school_name}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer action */}
                <div className="max-w-[700px] mx-auto mt-4 text-center no-print">
                    <p className="text-xs text-gray-400">Tip: Use your browser&apos;s &quot;Save as PDF&quot; option in the print dialog to download this receipt.</p>
                </div>
            </div>
        </>
    );
}
