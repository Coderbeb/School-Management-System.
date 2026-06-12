'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import {
    ArrowLeft, Loader2, CheckCircle, XCircle, Clock, User, Phone, Mail,
    MapPin, Calendar, FileText, Shield, Heart, Building2, GraduationCap,
    ArrowRightCircle, AlertCircle, ChevronDown
} from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: string; }

export default function ApplicationDetailPage() {
    const router = useRouter();
    const { id } = useParams();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [app, setApp] = useState<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [documents, setDocuments] = useState<any[]>([]);
    const [actionLoading, setActionLoading] = useState('');
    const [reviewRemarks, setReviewRemarks] = useState('');
    const [showEnroll, setShowEnroll] = useState(false);
    const [enrollData, setEnrollData] = useState({ classSectionId: '', rollNumber: '' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [classSections, setClassSections] = useState<any[]>([]);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    const fetchData = useCallback(async () => {
        if (!token || !id) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/admissions/applications/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setApp(data.application);
            setDocuments(data.documents || []);

            // Fetch class sections for enrollment
            if (data.application?.class_id) {
                const csRes = await fetch(`/api/manage/class-sections?classId=${data.application.class_id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const csData = await csRes.json();
                setClassSections(csData.classSections || []);
            }
        } catch { /* ignore */ }
        setLoading(false);
    }, [token, id]);

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (!['developer', 'super_admin'].includes(parsed.role)) { router.replace('/dashboard'); return; }
        setUser(parsed);
    }, [router, token]);

    useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const updateStatus = async (status: string) => {
        setActionLoading(status); setError(''); setSuccess('');
        try {
            const res = await fetch(`/api/admissions/applications/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status, reviewRemarks }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); setActionLoading(''); return; }
            setSuccess(`Application ${status} successfully`);
            setReviewRemarks('');
            fetchData();
        } catch { setError('Network error'); }
        setActionLoading('');
    };

    const enrollStudent = async () => {
        setActionLoading('enroll'); setError(''); setSuccess('');
        try {
            const res = await fetch(`/api/admissions/applications/${id}/enroll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(enrollData),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); setActionLoading(''); return; }
            setSuccess(data.message || 'Student enrolled successfully!');
            setShowEnroll(false);
            fetchData();
        } catch { setError('Network error'); }
        setActionLoading('');
    };

    const statusColors: Record<string, string> = {
        submitted: 'bg-blue-100 text-blue-700 border-blue-200',
        under_review: 'bg-amber-100 text-amber-700 border-amber-200',
        approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        rejected: 'bg-red-100 text-red-700 border-red-200',
        waitlisted: 'bg-purple-100 text-purple-700 border-purple-200',
        enrolled: 'bg-teal-100 text-teal-700 border-teal-200',
        draft: 'bg-gray-100 text-gray-600 border-gray-200',
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }

    if (!app) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <p className="text-gray-500">Application not found</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-5xl mx-auto px-4 py-8 mt-16">
                {/* Back + Header */}
                <button onClick={() => router.push('/manage/admissions')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Admissions
                </button>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center shrink-0 overflow-hidden">
                            {app.photo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={app.photo_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-8 h-8 text-indigo-600" />
                            )}
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-gray-900">{app.student_name}</h1>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{app.application_number}</span>
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusColors[app.status]}`}>
                                    {app.status.replace(/_/g, ' ').toUpperCase()}
                                </span>
                                <span className="text-xs text-gray-500">{app.class_name} • {app.session_name}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Messages */}
                {success && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {success}</div>}
                {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}

                {/* Action Bar */}
                {app.status !== 'enrolled' && app.status !== 'rejected' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
                        <h3 className="text-sm font-bold text-gray-700 mb-3">Actions</h3>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex-1">
                                <input type="text" value={reviewRemarks} onChange={e => setReviewRemarks(e.target.value)}
                                    placeholder="Review remarks (optional)..."
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {app.status === 'submitted' && (
                                    <Button onClick={() => updateStatus('under_review')} disabled={!!actionLoading}
                                        className="bg-amber-500 hover:bg-amber-600 text-white gap-1.5 text-xs h-9">
                                        {actionLoading === 'under_review' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />} Start Review
                                    </Button>
                                )}
                                {['submitted', 'under_review', 'waitlisted'].includes(app.status) && (
                                    <>
                                        <Button onClick={() => updateStatus('approved')} disabled={!!actionLoading}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs h-9">
                                            {actionLoading === 'approved' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} Approve
                                        </Button>
                                        <Button onClick={() => updateStatus('rejected')} disabled={!!actionLoading}
                                            className="bg-red-600 hover:bg-red-700 text-white gap-1.5 text-xs h-9">
                                            {actionLoading === 'rejected' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Reject
                                        </Button>
                                        <Button onClick={() => updateStatus('waitlisted')} disabled={!!actionLoading}
                                            className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5 text-xs h-9">
                                            {actionLoading === 'waitlisted' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />} Waitlist
                                        </Button>
                                    </>
                                )}
                                {app.status === 'approved' && (
                                    <Button onClick={() => setShowEnroll(true)} disabled={!!actionLoading}
                                        className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5 text-xs h-9">
                                        <ArrowRightCircle className="w-3.5 h-3.5" /> Enroll Student
                                    </Button>
                                )}
                            </div>
                        </div>
                        {app.review_remarks && (
                            <div className="mt-3 p-3 bg-gray-50 rounded-xl text-xs text-gray-600">
                                <span className="font-bold">Review Remarks:</span> {app.review_remarks}
                                {app.reviewed_by_name && <span className="text-gray-400 ml-2">— {app.reviewed_by_name}</span>}
                            </div>
                        )}
                    </div>
                )}

                {/* Info Sections Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Personal Info */}
                    <InfoSection title="Personal Information" icon={<User className="w-4 h-4 text-indigo-600" />}>
                        <InfoRow label="Date of Birth" value={app.date_of_birth ? new Date(app.date_of_birth).toLocaleDateString() : '—'} />
                        <InfoRow label="Gender" value={app.gender ? app.gender.charAt(0).toUpperCase() + app.gender.slice(1) : '—'} />
                        <InfoRow label="Blood Group" value={app.blood_group || '—'} />
                        <InfoRow label="Nationality" value={app.nationality || '—'} />
                        <InfoRow label="Religion" value={app.religion || '—'} />
                        <InfoRow label="Category" value={app.caste_category || '—'} />
                        <InfoRow label="Aadhar" value={app.aadhar_number || '—'} />
                    </InfoSection>

                    {/* Guardian Info */}
                    <InfoSection title="Guardian Details" icon={<Shield className="w-4 h-4 text-emerald-600" />}>
                        <InfoRow label="Father" value={app.father_name || '—'} icon={<Phone className="w-3 h-3" />} subtext={app.father_phone} />
                        <InfoRow label="Mother" value={app.mother_name || '—'} icon={<Phone className="w-3 h-3" />} subtext={app.mother_phone} />
                        <InfoRow label="Guardian" value={app.guardian_name || '—'} subtext={app.guardian_relation} />
                        <InfoRow label="Contact Phone" value={app.guardian_phone} icon={<Phone className="w-3 h-3" />} />
                        <InfoRow label="Contact Email" value={app.guardian_email || '—'} icon={<Mail className="w-3 h-3" />} />
                        <InfoRow label="Father Occupation" value={app.father_occupation || '—'} />
                    </InfoSection>

                    {/* Address */}
                    <InfoSection title="Address" icon={<MapPin className="w-4 h-4 text-amber-600" />}>
                        <InfoRow label="Address" value={app.address || '—'} />
                        <InfoRow label="City" value={app.city || '—'} />
                        <InfoRow label="State" value={app.state || '—'} />
                        <InfoRow label="Pincode" value={app.pincode || '—'} />
                    </InfoSection>

                    {/* Previous School */}
                    <InfoSection title="Previous School" icon={<Building2 className="w-4 h-4 text-violet-600" />}>
                        <InfoRow label="School Name" value={app.previous_school || '—'} />
                        <InfoRow label="Class" value={app.previous_class || '—'} />
                        <InfoRow label="Percentage" value={app.previous_percentage ? `${app.previous_percentage}%` : '—'} />
                        <InfoRow label="TC Number" value={app.tc_number || '—'} />
                    </InfoSection>

                    {/* Medical */}
                    <InfoSection title="Medical Information" icon={<Heart className="w-4 h-4 text-red-500" />}>
                        <InfoRow label="Medical Conditions" value={app.medical_conditions || 'None'} />
                        <InfoRow label="Allergies" value={app.allergies || 'None'} />
                        <InfoRow label="Emergency Contact" value={app.emergency_contact_name || '—'} />
                        <InfoRow label="Emergency Phone" value={app.emergency_contact_phone || '—'} />
                    </InfoSection>

                    {/* Documents */}
                    <InfoSection title={`Documents (${documents.length})`} icon={<FileText className="w-4 h-4 text-cyan-600" />}>
                        {documents.length > 0 ? documents.map((doc: { id: string; document_type: string; document_name: string; is_verified: boolean }) => (
                            <div key={doc.id} className="flex items-center justify-between py-1.5">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-xs text-gray-700">{doc.document_name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                                        {doc.document_type.replace(/_/g, ' ')}
                                    </span>
                                    {doc.is_verified ? (
                                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                                    )}
                                </div>
                            </div>
                        )) : (
                            <p className="text-xs text-gray-400 py-2">No documents uploaded</p>
                        )}
                    </InfoSection>
                </div>

                {/* Enroll Modal */}
                {showEnroll && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
                                    <GraduationCap className="w-5 h-5 text-teal-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">Enroll Student</h2>
                                    <p className="text-xs text-gray-500">Convert {app.student_name}&apos;s application to enrollment</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1 block">Section *</label>
                                    <div className="relative">
                                        <select value={enrollData.classSectionId} onChange={e => setEnrollData({ ...enrollData, classSectionId: e.target.value })}
                                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none appearance-none">
                                            <option value="">Auto-assign first available section</option>
                                            {classSections.map((cs: { id: string; section_name: string }) => (
                                                <option key={cs.id} value={cs.id}>{app.class_name} - {cs.section_name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600 mb-1 block">Roll Number (Optional)</label>
                                    <input type="number" value={enrollData.rollNumber} onChange={e => setEnrollData({ ...enrollData, rollNumber: e.target.value })}
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none" placeholder="Auto-assigned if empty" />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <Button variant="outline" onClick={() => setShowEnroll(false)}>Cancel</Button>
                                <Button onClick={enrollStudent} disabled={actionLoading === 'enroll'}
                                    className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
                                    {actionLoading === 'enroll' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightCircle className="w-4 h-4" />} Enroll Now
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

function InfoSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50 flex items-center gap-2">
                {icon}
                <h3 className="text-sm font-bold text-gray-800">{title}</h3>
            </div>
            <div className="px-5 py-3 divide-y divide-gray-50">{children}</div>
        </div>
    );
}

function InfoRow({ label, value, icon, subtext }: { label: string; value: string; icon?: React.ReactNode; subtext?: string }) {
    return (
        <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-gray-500">{label}</span>
            <div className="text-right">
                <span className="text-xs font-medium text-gray-900 flex items-center gap-1">
                    {icon}{value}
                </span>
                {subtext && <span className="text-[10px] text-gray-400">{subtext}</span>}
            </div>
        </div>
    );
}
