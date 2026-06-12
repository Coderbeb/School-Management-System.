'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import {
    FileText, Search, Loader2, CheckCircle, XCircle, X, Plus, Printer,
    Shield, AlertCircle, Eye, Ban, Award, Users, Download
} from 'lucide-react';
import { CertificateRenderer } from '@/components/certificates/CertificateTemplates';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; schoolId?: string; }

interface IssuedCert {
    id: string; certificate_number: string; template_name: string; template_type: string;
    student_name: string; admission_number: string; date_of_birth: string;
    guardian_name: string; photo_url: string; data: Record<string, string>;
    issued_at: string; issued_by_name: string; revoked: boolean; revoked_reason: string;
    verification_code: string;
}

interface Student {
    id: string; name: string; admission_number: string; class_name: string;
    section_name: string; guardian_name: string; guardian_phone: string; photo_url: string;
}

const certTypes = [
    { key: 'transfer_certificate', label: 'Transfer Certificate (TC)', icon: '📜', color: 'bg-red-50 text-red-700 border-red-200' },
    { key: 'bonafide', label: 'Bonafide Certificate', icon: '📋', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { key: 'character', label: 'Character Certificate', icon: '🏅', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { key: 'study', label: 'Study Certificate', icon: '📚', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { key: 'conduct', label: 'Conduct Certificate', icon: '⭐', color: 'bg-purple-50 text-purple-700 border-purple-200' },
];

type TabType = 'issue' | 'issued' | 'verify';

function StableInput({ value, onChange, ...props }: { value: string; onChange: (v: string) => void; [k: string]: unknown }) {
    return <input value={value} onChange={e => onChange(e.target.value)} {...props} />;
}

export default function CertificatesPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [tab, setTab] = useState<TabType>('issue');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    // Issue Tab
    const [studentSearch, setStudentSearch] = useState('');
    const [searchResults, setSearchResults] = useState<Student[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [selectedCertType, setSelectedCertType] = useState('');
    const [extraData, setExtraData] = useState<Record<string, string>>({});
    const [previewData, setPreviewData] = useState<Record<string, string> | null>(null);
    const [issuing, setIssuing] = useState(false);

    // Issued Tab
    const [issuedCerts, setIssuedCerts] = useState<IssuedCert[]>([]);
    const [certSearch, setCertSearch] = useState('');
    const certSearchRef = useRef('');
    const [certTypeFilter, setCertTypeFilter] = useState('');
    const [previewCert, setPreviewCert] = useState<IssuedCert | null>(null);

    // Verify Tab
    const [verifyCode, setVerifyCode] = useState('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [verifyResult, setVerifyResult] = useState<any>(null);
    const [verifying, setVerifying] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (!stored) { router.push('/login'); return; }
        const u = JSON.parse(stored);
        if (!['developer', 'super_admin'].includes(u.role)) { router.push('/dashboard'); return; }
        setUser(u);
    }, [router]);

    const getHeaders = useCallback(() => {
        if (!user) return {};
        const h: Record<string, string> = { 'x-user-id': user.id, 'x-user-role': user.role, 'Content-Type': 'application/json' };
        if (user.schoolId) h['x-school-id'] = user.schoolId;
        return h;
    }, [user]);

    // Student search
    const searchStudents = useCallback(async (q: string) => {
        if (!user || q.length < 2) { setSearchResults([]); return; }
        try {
            const res = await fetch(`/api/students?search=${encodeURIComponent(q)}&limit=10`, { headers: getHeaders() });
            const data = await res.json();
            setSearchResults(data.students || []);
        } catch { /* */ }
    }, [user, getHeaders]);

    useEffect(() => {
        const timer = setTimeout(() => searchStudents(studentSearch), 300);
        return () => clearTimeout(timer);
    }, [studentSearch, searchStudents]);

    // Load issued certificates
    const loadIssuedCerts = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (certSearchRef.current) params.set('search', certSearchRef.current);
            if (certTypeFilter) params.set('type', certTypeFilter);
            const res = await fetch(`/api/certificates/issue?${params}`, { headers: getHeaders() });
            const data = await res.json();
            setIssuedCerts(data.certificates || []);
        } catch { /* */ }
        setLoading(false);
    }, [user, getHeaders, certTypeFilter]);

    useEffect(() => {
        if (tab === 'issued' && user) loadIssuedCerts();
    }, [tab, user, loadIssuedCerts]);

    // Issue certificate
    const issueCertificate = async () => {
        if (!selectedStudent || !selectedCertType) { setError('Select student and certificate type'); return; }
        setIssuing(true);
        try {
            const res = await fetch('/api/certificates/issue', {
                method: 'POST', headers: getHeaders(),
                body: JSON.stringify({ studentId: selectedStudent.id, certificateType: selectedCertType, data: extraData }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); setIssuing(false); return; }
            setPreviewData(data.data);
            setSuccess(`Certificate issued! Number: ${data.certificate?.certificate_number} | Verification: ${data.verificationCode}`);
            setIssuing(false);
        } catch { setError('Failed to issue certificate'); setIssuing(false); }
    };

    // Revoke certificate
    const revokeCert = async (certId: string) => {
        const reason = prompt('Reason for revoking this certificate:');
        if (!reason) return;
        try {
            const res = await fetch('/api/certificates/issue', {
                method: 'PUT', headers: getHeaders(),
                body: JSON.stringify({ certificateId: certId, action: 'revoke', reason }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); return; }
            setSuccess('Certificate revoked');
            loadIssuedCerts();
        } catch { setError('Failed to revoke'); }
    };

    // Verify certificate
    const verifyCertificate = async () => {
        if (!verifyCode) return;
        setVerifying(true);
        try {
            const res = await fetch(`/api/certificates/verify?code=${encodeURIComponent(verifyCode)}`);
            const data = await res.json();
            setVerifyResult(data);
        } catch { setVerifyResult({ verified: false, message: 'Verification failed' }); }
        setVerifying(false);
    };

    // Print
    const printCertificate = () => {
        const el = document.getElementById('cert-print-area');
        if (!el) return;
        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(`<html><head><title>Certificate</title><style>
            body { margin: 0; padding: 0; }
            @media print { @page { size: A4; margin: 10mm; } }
        </style></head><body>${el.innerHTML}</body></html>`);
        win.document.close();
        win.print();
    };

    if (!user) return null;

    const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
        { key: 'issue', label: 'Issue Certificate', icon: <Award size={16} /> },
        { key: 'issued', label: 'Issued Certificates', icon: <FileText size={16} /> },
        { key: 'verify', label: 'Verify', icon: <Shield size={16} /> },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} />
            <MobileSidebar user={user} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <main className="max-w-7xl mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">📜 Certificate Management</h1>
                        <p className="text-sm text-gray-500">Issue, manage, and verify student certificates</p>
                    </div>
                </div>

                {success && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-emerald-700 text-sm">
                        <CheckCircle size={16} />{success}<button onClick={() => setSuccess('')} className="ml-auto"><X size={14} /></button>
                    </div>
                )}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                        <AlertCircle size={16} />{error}<button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-white/80 backdrop-blur rounded-xl border border-gray-200 mb-6">
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                                tab === t.key ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
                            }`}>
                            {t.icon}{t.label}
                        </button>
                    ))}
                </div>

                {/* ===================== TAB: ISSUE ===================== */}
                {tab === 'issue' && (
                    <div className="space-y-6">
                        {/* Step 1: Search Student */}
                        <div className="bg-white rounded-xl border border-gray-200 p-6">
                            <h3 className="font-semibold text-gray-800 mb-3">Step 1: Select Student</h3>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <StableInput value={studentSearch} onChange={v => setStudentSearch(v)}
                                    placeholder="Search by name, admission number, or phone..."
                                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                            </div>
                            {searchResults.length > 0 && !selectedStudent && (
                                <div className="mt-2 border rounded-lg divide-y max-h-60 overflow-y-auto">
                                    {searchResults.map(s => (
                                        <div key={s.id} onClick={() => { setSelectedStudent(s); setSearchResults([]); setStudentSearch(s.name); }}
                                            className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                                                {s.name?.charAt(0)}
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-medium text-sm text-gray-900">{s.name}</div>
                                                <div className="text-xs text-gray-500">{s.admission_number} • {s.class_name} - {s.section_name}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {selectedStudent && (
                                <div className="mt-3 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-sm font-bold text-blue-800">
                                        {selectedStudent.name?.charAt(0)}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-gray-900">{selectedStudent.name}</div>
                                        <div className="text-xs text-gray-600">{selectedStudent.admission_number} • {selectedStudent.class_name} - {selectedStudent.section_name}</div>
                                    </div>
                                    <button onClick={() => { setSelectedStudent(null); setStudentSearch(''); setPreviewData(null); setSelectedCertType(''); }}
                                        className="text-gray-400 hover:text-red-500"><X size={18} /></button>
                                </div>
                            )}
                        </div>

                        {/* Step 2: Select Certificate Type */}
                        {selectedStudent && (
                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <h3 className="font-semibold text-gray-800 mb-3">Step 2: Select Certificate Type</h3>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    {certTypes.map(ct => (
                                        <button key={ct.key} onClick={() => { setSelectedCertType(ct.key); setExtraData({}); setPreviewData(null); }}
                                            className={`p-4 rounded-xl border-2 text-center transition-all ${
                                                selectedCertType === ct.key ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-300'
                                            }`}>
                                            <div className="text-2xl mb-1">{ct.icon}</div>
                                            <div className="text-xs font-medium text-gray-700">{ct.label}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 3: Extra Fields (for TC) */}
                        {selectedStudent && selectedCertType === 'transfer_certificate' && (
                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <h3 className="font-semibold text-gray-800 mb-3">Step 3: TC Details</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { key: 'reason_for_leaving', label: 'Reason for Leaving', placeholder: "Parent's wish" },
                                        { key: 'date_of_leaving', label: 'Date of Leaving', placeholder: '', type: 'date' },
                                        { key: 'conduct', label: 'Conduct', placeholder: 'Good' },
                                        { key: 'last_exam_passed', label: 'Last Exam Passed', placeholder: 'Annual Exam 2026' },
                                        { key: 'fee_concession', label: 'Fee Concession', placeholder: 'None' },
                                    ].map(f => (
                                        <div key={f.key}>
                                            <label className="text-xs font-medium text-gray-600">{f.label}</label>
                                            <StableInput value={extraData[f.key] || ''} onChange={v => setExtraData(p => ({ ...p, [f.key]: v }))}
                                                type={f.type || 'text'} placeholder={f.placeholder}
                                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                                    <AlertCircle size={14} className="inline mr-1" />
                                    <strong>Warning:</strong> Issuing a TC will mark this student as inactive and remove them from active enrollment.
                                </div>
                            </div>
                        )}

                        {/* Step 3: Extra Fields (for Bonafide) */}
                        {selectedStudent && selectedCertType === 'bonafide' && (
                            <div className="bg-white rounded-xl border border-gray-200 p-6">
                                <h3 className="font-semibold text-gray-800 mb-3">Step 3: Purpose</h3>
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Purpose of Certificate</label>
                                    <StableInput value={extraData.purpose || ''} onChange={v => setExtraData(p => ({ ...p, purpose: v }))}
                                        placeholder="e.g. Bank account opening, Passport application..."
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                                </div>
                            </div>
                        )}

                        {/* Issue Button */}
                        {selectedStudent && selectedCertType && !previewData && (
                            <div className="flex justify-center">
                                <Button onClick={issueCertificate} disabled={issuing}
                                    className="bg-blue-600 hover:bg-blue-700 px-8 py-3 text-base">
                                    {issuing ? <Loader2 className="animate-spin mr-2" size={16} /> : <Award size={16} className="mr-2" />}
                                    Issue Certificate & Preview
                                </Button>
                            </div>
                        )}

                        {/* Preview */}
                        {previewData && (
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-semibold text-gray-800">Certificate Preview</h3>
                                    <div className="flex gap-2">
                                        <Button onClick={printCertificate} className="bg-blue-600 hover:bg-blue-700">
                                            <Printer size={16} className="mr-1" />Print
                                        </Button>
                                        <Button variant="outline" onClick={() => {
                                            setPreviewData(null); setSelectedStudent(null); setStudentSearch('');
                                            setSelectedCertType(''); setExtraData({});
                                        }}>Issue Another</Button>
                                    </div>
                                </div>
                                <div id="cert-print-area" className="bg-white p-4 rounded-xl border border-gray-200 overflow-auto">
                                    <CertificateRenderer type={selectedCertType} data={previewData} />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ===================== TAB: ISSUED ===================== */}
                {tab === 'issued' && (
                    <div>
                        <div className="flex gap-2 mb-4">
                            <div className="flex-1 relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <StableInput value={certSearch}
                                    onChange={v => { setCertSearch(v); certSearchRef.current = v; }}
                                    placeholder="Search by student name, certificate number..."
                                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
                            </div>
                            <Button variant="outline" onClick={loadIssuedCerts}><Search size={14} /></Button>
                            <select value={certTypeFilter} onChange={e => setCertTypeFilter(e.target.value)}
                                className="px-3 py-2 rounded-lg border border-gray-200 text-sm">
                                <option value="">All Types</option>
                                {certTypes.map(ct => <option key={ct.key} value={ct.key}>{ct.label}</option>)}
                            </select>
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" size={32} /></div>
                        ) : (
                            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 border-b">
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Cert No</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Issued</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Verification</th>
                                            <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {issuedCerts.length === 0 ? (
                                            <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No certificates issued yet</td></tr>
                                        ) : issuedCerts.map(c => (
                                            <tr key={c.id} className="border-b hover:bg-blue-50/30">
                                                <td className="px-4 py-3 font-mono text-xs text-blue-600">{c.certificate_number}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                                        certTypes.find(t => t.key === c.template_type)?.color || 'bg-gray-100'
                                                    }`}>{c.template_name || c.template_type}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-gray-900">{c.student_name}</div>
                                                    <div className="text-xs text-gray-500">{c.admission_number}</div>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-600">
                                                    {new Date(c.issued_at).toLocaleDateString('en-IN')}
                                                    <div className="text-gray-400">by {c.issued_by_name}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {c.revoked ? (
                                                        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">Revoked</span>
                                                    ) : (
                                                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">Valid</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.verification_code}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex gap-1">
                                                        <button onClick={() => setPreviewCert(c)}
                                                            className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">
                                                            <Eye size={12} className="inline mr-0.5" />View
                                                        </button>
                                                        {!c.revoked && (
                                                            <button onClick={() => revokeCert(c.id)}
                                                                className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200">
                                                                <Ban size={12} className="inline mr-0.5" />Revoke
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Preview Modal */}
                        {previewCert && (
                            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                                <div className="bg-white rounded-2xl shadow-2xl max-w-[900px] w-full max-h-[90vh] overflow-y-auto p-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg font-bold">{previewCert.certificate_number}</h3>
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={() => {
                                                const el = document.getElementById('cert-modal-print');
                                                if (!el) return;
                                                const win = window.open('', '_blank');
                                                if (!win) return;
                                                win.document.write(`<html><head><title>Certificate</title><style>body{margin:0}@media print{@page{size:A4;margin:10mm}}</style></head><body>${el.innerHTML}</body></html>`);
                                                win.document.close(); win.print();
                                            }}><Printer size={14} className="mr-1" />Print</Button>
                                            <button onClick={() => setPreviewCert(null)}><X size={20} /></button>
                                        </div>
                                    </div>
                                    <div id="cert-modal-print">
                                        <CertificateRenderer type={previewCert.template_type} data={previewCert.data || {}} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ===================== TAB: VERIFY ===================== */}
                {tab === 'verify' && (
                    <div className="max-w-lg mx-auto">
                        <div className="bg-white rounded-xl border border-gray-200 p-6">
                            <div className="text-center mb-6">
                                <Shield size={48} className="mx-auto text-blue-600 mb-3" />
                                <h2 className="text-xl font-bold text-gray-900">Certificate Verification</h2>
                                <p className="text-sm text-gray-500 mt-1">Enter verification code or certificate number to verify authenticity</p>
                            </div>

                            <div className="space-y-4">
                                <StableInput value={verifyCode} onChange={setVerifyCode}
                                    placeholder="Enter verification code (e.g. A1B2C3D4E5) or certificate number"
                                    className="w-full px-4 py-3 rounded-lg border border-gray-200 text-center text-lg tracking-widest font-mono focus:ring-2 focus:ring-blue-300 outline-none" />

                                <Button onClick={verifyCertificate} disabled={verifying || !verifyCode}
                                    className="w-full bg-blue-600 hover:bg-blue-700 py-3">
                                    {verifying ? <Loader2 className="animate-spin mr-2" size={16} /> : <Shield size={16} className="mr-2" />}
                                    Verify Certificate
                                </Button>
                            </div>

                            {verifyResult && (
                                <div className={`mt-6 p-4 rounded-xl border-2 ${
                                    verifyResult.verified ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                                }`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        {verifyResult.verified ? (
                                            <CheckCircle size={24} className="text-green-600" />
                                        ) : (
                                            <XCircle size={24} className="text-red-600" />
                                        )}
                                        <span className={`text-lg font-bold ${verifyResult.verified ? 'text-green-700' : 'text-red-700'}`}>
                                            {verifyResult.message}
                                        </span>
                                    </div>
                                    {verifyResult.certificate && (
                                        <div className="mt-3 space-y-1 text-sm">
                                            <div><span className="text-gray-500">Certificate No:</span> <strong>{verifyResult.certificate.number}</strong></div>
                                            <div><span className="text-gray-500">Type:</span> <strong>{verifyResult.certificate.type}</strong></div>
                                            <div><span className="text-gray-500">Student:</span> <strong>{verifyResult.certificate.student}</strong></div>
                                            <div><span className="text-gray-500">School:</span> <strong>{verifyResult.certificate.school}</strong></div>
                                            {verifyResult.certificate.issuedAt && (
                                                <div><span className="text-gray-500">Issued:</span> <strong>{new Date(verifyResult.certificate.issuedAt).toLocaleDateString('en-IN')}</strong></div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
