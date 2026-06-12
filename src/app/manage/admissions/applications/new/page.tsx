'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import {
    ArrowLeft, Loader2, CheckCircle, Plus, User, Shield, MapPin,
    Building2, Heart, ChevronDown, AlertCircle
} from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: string; }
interface ClassItem { id: string; name: string; }
interface Session { id: string; name: string; is_current: boolean; }

export default function NewApplicationPageWrapper() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-8 h-8 text-indigo-500 animate-spin" /></div>}>
            <NewApplicationPage />
        </Suspense>
    );
}

function NewApplicationPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const enquiryId = searchParams.get('enquiryId');

    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    const [step, setStep] = useState(1);

    const [form, setForm] = useState({
        enquiryId: enquiryId || '', sessionId: '', classId: '',
        studentName: '', dateOfBirth: '', gender: '', bloodGroup: '', nationality: 'Indian',
        religion: '', casteCategory: '', aadharNumber: '', address: '', city: '', state: '', pincode: '',
        previousSchool: '', previousClass: '', previousPercentage: '', tcNumber: '',
        fatherName: '', fatherPhone: '', fatherEmail: '', fatherOccupation: '', fatherIncome: '',
        motherName: '', motherPhone: '', motherEmail: '', motherOccupation: '',
        guardianName: '', guardianRelation: '', guardianPhone: '', guardianEmail: '',
        medicalConditions: '', allergies: '', emergencyContactName: '', emergencyContactPhone: '',
    });

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const f = (key: string, value: string) => setForm(p => ({ ...p, [key]: value }));

    const fetchData = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const headers = { Authorization: `Bearer ${token}` };
            const [classRes, sessRes] = await Promise.all([
                fetch('/api/manage/classes', { headers }),
                fetch('/api/manage/sessions', { headers }),
            ]);
            const [classData, sessData] = await Promise.all([classRes.json(), sessRes.json()]);
            setClasses(classData.classes || []);
            setSessions(sessData.sessions || []);

            // Auto-select current session
            const current = sessData.sessions?.find((s: Session) => s.is_current);
            if (current) setForm(prev => ({ ...prev, sessionId: current.id }));

            // If from enquiry, pre-fill data
            if (enquiryId) {
                const enqRes = await fetch(`/api/admissions/enquiries`, { headers });
                const enqData = await enqRes.json();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const enq = (enqData.enquiries || []).find((e: any) => e.id === enquiryId);
                if (enq) {
                    setForm(prev => ({
                        ...prev,
                        studentName: enq.student_name || '',
                        guardianName: enq.guardian_name || '',
                        guardianPhone: enq.guardian_phone || '',
                        classId: enq.class_id || '',
                        sessionId: enq.session_id || prev.sessionId,
                        dateOfBirth: enq.date_of_birth?.split('T')[0] || '',
                        gender: enq.gender || '',
                    }));
                }
            }
        } catch { /* ignore */ }
        setLoading(false);
    }, [token, enquiryId]);

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (!['developer', 'super_admin'].includes(parsed.role)) { router.replace('/dashboard'); return; }
        setUser(parsed);
    }, [router, token]);

    useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const submitApplication = async () => {
        setSubmitting(true); setError(''); setSuccess('');
        try {
            const res = await fetch('/api/admissions/applications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed'); setSubmitting(false); return; }
            setSuccess(`Application ${data.application.application_number} created successfully!`);
            setTimeout(() => router.push(`/manage/admissions/applications/${data.application.id}`), 1500);
        } catch { setError('Network error'); }
        setSubmitting(false);
    };

    const canSubmit = form.studentName && form.dateOfBirth && form.gender && form.guardianPhone && form.classId && form.sessionId;

    const Input = ({ label, name, type = 'text', required, placeholder, colSpan }: { label: string; name: string; type?: string; required?: boolean; placeholder?: string; colSpan?: number }) => (
        <div className={colSpan === 2 ? 'sm:col-span-2' : ''}>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{label}{required && ' *'}</label>
            <input type={type} value={(form as Record<string, string>)[name] || ''} onChange={e => f(name, e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder={placeholder} />
        </div>
    );

    const Select = ({ label, name, options, required }: { label: string; name: string; options: { value: string; label: string }[]; required?: boolean }) => (
        <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">{label}{required && ' *'}</label>
            <div className="relative">
                <select value={(form as Record<string, string>)[name] || ''} onChange={e => f(name, e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none">
                    <option value="">Select...</option>
                    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" />
            </div>
        </div>
    );

    if (loading) {
        return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-8 h-8 text-indigo-500 animate-spin" /></div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-3xl mx-auto px-4 py-8 mt-16">
                <button onClick={() => router.push('/manage/admissions')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
                    <ArrowLeft className="w-4 h-4" /> Back to Admissions
                </button>

                <h1 className="text-2xl font-black text-gray-900 mb-1">New Admission Application</h1>
                <p className="text-sm text-gray-500 mb-6">{enquiryId ? 'Pre-filled from enquiry' : 'Fill in the student details below'}</p>

                {success && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {success}</div>}
                {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}

                {/* Steps */}
                <div className="flex items-center gap-2 mb-6">
                    {[
                        { n: 1, label: 'Student', icon: <User className="w-3.5 h-3.5" /> },
                        { n: 2, label: 'Guardian', icon: <Shield className="w-3.5 h-3.5" /> },
                        { n: 3, label: 'Address & School', icon: <MapPin className="w-3.5 h-3.5" /> },
                        { n: 4, label: 'Medical', icon: <Heart className="w-3.5 h-3.5" /> },
                    ].map(s => (
                        <button key={s.n} onClick={() => setStep(s.n)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${step === s.n ? 'bg-indigo-600 text-white shadow-sm' : step > s.n ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {s.icon}{s.label}
                        </button>
                    ))}
                </div>

                {/* Step 1: Student Info */}
                {step === 1 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-4"><User className="w-4 h-4 text-indigo-600" />Student Information</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input label="Student Name" name="studentName" required placeholder="Full name" colSpan={2} />
                            <Input label="Date of Birth" name="dateOfBirth" type="date" required />
                            <Select label="Gender" name="gender" required options={[
                                { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }
                            ]} />
                            <Select label="Class" name="classId" required options={classes.map(c => ({ value: c.id, label: c.name }))} />
                            <Select label="Session" name="sessionId" required options={sessions.map(s => ({ value: s.id, label: `${s.name}${s.is_current ? ' (Current)' : ''}` }))} />
                            <Select label="Blood Group" name="bloodGroup" options={['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(b => ({ value: b, label: b }))} />
                            <Input label="Nationality" name="nationality" placeholder="Indian" />
                            <Input label="Religion" name="religion" placeholder="Optional" />
                            <Input label="Caste Category" name="casteCategory" placeholder="General / SC / ST / OBC" />
                            <Input label="Aadhar Number" name="aadharNumber" placeholder="12 digit number" />
                        </div>
                        <div className="flex justify-end mt-6">
                            <Button onClick={() => setStep(2)} className="bg-indigo-600 hover:bg-indigo-700 text-white">Next →</Button>
                        </div>
                    </div>
                )}

                {/* Step 2: Guardian Info */}
                {step === 2 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-4"><Shield className="w-4 h-4 text-emerald-600" />Guardian Details</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide sm:col-span-2 pt-2">Father</h3>
                            <Input label="Father&apos;s Name" name="fatherName" placeholder="Full name" />
                            <Input label="Phone" name="fatherPhone" placeholder="9876543210" />
                            <Input label="Email" name="fatherEmail" type="email" />
                            <Input label="Occupation" name="fatherOccupation" />
                            <Input label="Annual Income" name="fatherIncome" placeholder="Optional" />

                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide sm:col-span-2 pt-2 border-t border-gray-100">Mother</h3>
                            <Input label="Mother&apos;s Name" name="motherName" placeholder="Full name" />
                            <Input label="Phone" name="motherPhone" placeholder="9876543210" />
                            <Input label="Email" name="motherEmail" type="email" />
                            <Input label="Occupation" name="motherOccupation" />

                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide sm:col-span-2 pt-2 border-t border-gray-100">Primary Contact</h3>
                            <Input label="Guardian Name" name="guardianName" placeholder="If different from father/mother" />
                            <Input label="Relation" name="guardianRelation" placeholder="e.g. Uncle, Grandfather" />
                            <Input label="Contact Phone" name="guardianPhone" required placeholder="Primary contact number" />
                            <Input label="Contact Email" name="guardianEmail" type="email" />
                        </div>
                        <div className="flex justify-between mt-6">
                            <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
                            <Button onClick={() => setStep(3)} className="bg-indigo-600 hover:bg-indigo-700 text-white">Next →</Button>
                        </div>
                    </div>
                )}

                {/* Step 3: Address & Previous School */}
                {step === 3 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-4"><MapPin className="w-4 h-4 text-amber-600" />Address & Previous School</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input label="Address" name="address" colSpan={2} placeholder="Full address" />
                            <Input label="City" name="city" placeholder="City" />
                            <Input label="State" name="state" placeholder="State" />
                            <Input label="Pincode" name="pincode" placeholder="6-digit pincode" />

                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide sm:col-span-2 pt-2 border-t border-gray-100 flex items-center gap-2">
                                <Building2 className="w-3.5 h-3.5" /> Previous School
                            </h3>
                            <Input label="School Name" name="previousSchool" colSpan={2} placeholder="Previous school name" />
                            <Input label="Class" name="previousClass" placeholder="Last class attended" />
                            <Input label="Percentage / CGPA" name="previousPercentage" placeholder="e.g. 85.5" />
                            <Input label="TC Number" name="tcNumber" placeholder="Transfer certificate number" />
                        </div>
                        <div className="flex justify-between mt-6">
                            <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
                            <Button onClick={() => setStep(4)} className="bg-indigo-600 hover:bg-indigo-700 text-white">Next →</Button>
                        </div>
                    </div>
                )}

                {/* Step 4: Medical & Submit */}
                {step === 4 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-4"><Heart className="w-4 h-4 text-red-500" />Medical Information</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2">
                                <label className="text-xs font-medium text-gray-600 mb-1 block">Medical Conditions</label>
                                <textarea value={form.medicalConditions} onChange={e => f('medicalConditions', e.target.value)} rows={2}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" placeholder="Any known medical conditions..." />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="text-xs font-medium text-gray-600 mb-1 block">Allergies</label>
                                <textarea value={form.allergies} onChange={e => f('allergies', e.target.value)} rows={2}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" placeholder="Any known allergies..." />
                            </div>
                            <Input label="Emergency Contact Name" name="emergencyContactName" placeholder="Person to contact in emergency" />
                            <Input label="Emergency Phone" name="emergencyContactPhone" placeholder="Emergency phone number" />
                        </div>
                        <div className="flex justify-between mt-6">
                            <Button variant="outline" onClick={() => setStep(3)}>← Back</Button>
                            <Button onClick={submitApplication} disabled={submitting || !canSubmit}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Submit Application
                            </Button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
