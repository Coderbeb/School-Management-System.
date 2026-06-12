'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2, AlertCircle, GraduationCap, Calendar, Phone, MapPin } from 'lucide-react';

interface WindowData {
    id: string; title: string; description: string; open_date: string; close_date: string;
    registration_fee: number; max_registrations: number; registration_count: number;
    school_name: string; logo_url: string; school_address: string; school_city: string;
    school_phone: string; session_name: string;
}

interface ClassItem { id: string; name: string; }

function StableInput({ value, onChange, ...props }: { value: string; onChange: (v: string) => void; [k: string]: unknown }) {
    return <input value={value} onChange={e => onChange(e.target.value)} {...props} />;
}

function StableSelect({ value, onChange, children, ...props }: { value: string; onChange: (v: string) => void; children: React.ReactNode; [k: string]: unknown }) {
    return <select value={value} onChange={e => onChange(e.target.value)} {...props}>{children}</select>;
}

function RegistrationContent() {
    const searchParams = useSearchParams();
    const slug = searchParams.get('slug') || '';

    const [windowData, setWindowData] = useState<WindowData | null>(null);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [regNumber, setRegNumber] = useState('');

    const [form, setForm] = useState({
        studentName: '', dateOfBirth: '', gender: '', classId: '',
        previousSchool: '', previousClass: '',
        fatherName: '', fatherPhone: '', fatherOccupation: '',
        motherName: '', motherPhone: '',
        guardianName: '', guardianPhone: '', guardianEmail: '',
        address: '', city: '', pincode: '',
    });

    useEffect(() => {
        if (!slug) { setLoading(false); return; }
        fetch(`/api/admissions/registrations?slug=${slug}`)
            .then(r => r.json())
            .then(data => {
                if (data.error) { setError(data.error); }
                else {
                    setWindowData(data.window);
                    setClasses(data.classes || []);
                }
                setLoading(false);
            })
            .catch(() => { setError('Failed to load registration form'); setLoading(false); });
    }, [slug]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.studentName || !form.dateOfBirth || !form.gender || !form.classId || !form.guardianPhone) {
            setError('Please fill all required fields'); return;
        }
        setSubmitting(true); setError('');
        try {
            const res = await fetch('/api/admissions/registrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'register', windowId: windowData?.id, ...form }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); setSubmitting(false); return; }
            setRegNumber(data.registrationNumber);
            setSuccess(data.message);
        } catch { setError('Registration failed. Please try again.'); }
        setSubmitting(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
        );
    }

    if (!slug || !windowData) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md">
                    <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Registration Not Available</h2>
                    <p className="text-gray-500">{error || 'This registration link is invalid or the registration window has closed.'}</p>
                </div>
            </div>
        );
    }

    const now = new Date();
    const isOpen = new Date(windowData.open_date) <= now && new Date(windowData.close_date) >= now;
    const isFull = windowData.max_registrations && windowData.registration_count >= windowData.max_registrations;

    if (!isOpen || isFull) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md">
                    <AlertCircle size={48} className="mx-auto text-amber-400 mb-4" />
                    <h2 className="text-xl font-bold text-gray-900 mb-2">
                        {isFull ? 'Registrations Full' : 'Registration Closed'}
                    </h2>
                    <p className="text-gray-500">
                        {isFull ? 'Maximum registrations have been reached for this admission window.' : `Registration period: ${new Date(windowData.open_date).toLocaleDateString('en-IN')} to ${new Date(windowData.close_date).toLocaleDateString('en-IN')}`}
                    </p>
                </div>
            </div>
        );
    }

    // Success Screen
    if (success) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md">
                    <div className="w-20 h-20 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircle size={40} className="text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Registration Successful! 🎉</h2>
                    <p className="text-gray-600 mb-4">{success}</p>
                    <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-4">
                        <p className="text-xs text-green-600 mb-1">Your Registration Number</p>
                        <p className="text-2xl font-bold text-green-800 tracking-wider">{regNumber}</p>
                    </div>
                    <p className="text-xs text-gray-400">
                        Please save this registration number. You will need it for entrance test and admission process.
                        The school will contact you on your registered phone number.
                    </p>
                </div>
            </div>
        );
    }

    const inputClass = "w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-blue-300 focus:border-transparent outline-none transition-shadow";

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
            {/* School Header */}
            <div className="bg-white border-b shadow-sm">
                <div className="max-w-2xl mx-auto px-4 py-5 text-center">
                    {windowData.logo_url && (
                        <img src={windowData.logo_url} alt="School Logo" className="w-16 h-16 mx-auto mb-2 rounded-full object-cover" />
                    )}
                    <h1 className="text-2xl font-bold text-gray-900">{windowData.school_name}</h1>
                    {windowData.school_address && (
                        <p className="text-sm text-gray-500 mt-1 flex items-center justify-center gap-1">
                            <MapPin size={12} />{windowData.school_address}{windowData.school_city ? `, ${windowData.school_city}` : ''}
                        </p>
                    )}
                    {windowData.school_phone && (
                        <p className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
                            <Phone size={10} />{windowData.school_phone}
                        </p>
                    )}
                </div>
            </div>

            {/* Registration Form */}
            <div className="max-w-2xl mx-auto px-4 py-6">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                    {/* Title Banner */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white">
                        <div className="flex items-center gap-3">
                            <GraduationCap size={28} />
                            <div>
                                <h2 className="text-lg font-bold">{windowData.title}</h2>
                                <p className="text-blue-100 text-xs mt-0.5">
                                    Session: {windowData.session_name} | Deadline: {new Date(windowData.close_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                        </div>
                        {windowData.description && (
                            <p className="text-blue-100 text-xs mt-3">{windowData.description}</p>
                        )}
                    </div>

                    {error && (
                        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                            <AlertCircle size={16} />{error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        {/* Student Details */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                                Student Details
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="md:col-span-2">
                                    <label className="text-xs font-medium text-gray-600">Student Name *</label>
                                    <StableInput value={form.studentName} onChange={v => setForm(f => ({ ...f, studentName: v }))}
                                        placeholder="Full name of the student" className={inputClass} />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Date of Birth *</label>
                                    <StableInput type="date" value={form.dateOfBirth} onChange={v => setForm(f => ({ ...f, dateOfBirth: v }))} className={inputClass} />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Gender *</label>
                                    <StableSelect value={form.gender} onChange={v => setForm(f => ({ ...f, gender: v }))} className={inputClass}>
                                        <option value="">Select Gender</option>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                    </StableSelect>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Class Applying For *</label>
                                    <StableSelect value={form.classId} onChange={v => setForm(f => ({ ...f, classId: v }))} className={inputClass}>
                                        <option value="">Select Class</option>
                                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </StableSelect>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Previous School</label>
                                    <StableInput value={form.previousSchool} onChange={v => setForm(f => ({ ...f, previousSchool: v }))}
                                        placeholder="Name of previous school" className={inputClass} />
                                </div>
                            </div>
                        </div>

                        {/* Parent Details */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                                Parent / Guardian Details
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Father&apos;s Name</label>
                                    <StableInput value={form.fatherName} onChange={v => setForm(f => ({ ...f, fatherName: v }))} placeholder="Father's full name" className={inputClass} />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Father&apos;s Phone</label>
                                    <StableInput value={form.fatherPhone} onChange={v => setForm(f => ({ ...f, fatherPhone: v }))} placeholder="10-digit number" className={inputClass} />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Mother&apos;s Name</label>
                                    <StableInput value={form.motherName} onChange={v => setForm(f => ({ ...f, motherName: v }))} placeholder="Mother's full name" className={inputClass} />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Mother&apos;s Phone</label>
                                    <StableInput value={form.motherPhone} onChange={v => setForm(f => ({ ...f, motherPhone: v }))} placeholder="10-digit number" className={inputClass} />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Guardian Phone * (Primary Contact)</label>
                                    <StableInput value={form.guardianPhone} onChange={v => setForm(f => ({ ...f, guardianPhone: v }))} placeholder="Primary phone number" className={inputClass} />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Email</label>
                                    <StableInput type="email" value={form.guardianEmail} onChange={v => setForm(f => ({ ...f, guardianEmail: v }))} placeholder="email@example.com" className={inputClass} />
                                </div>
                            </div>
                        </div>

                        {/* Address */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-xs">3</span>
                                Address
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="md:col-span-2">
                                    <label className="text-xs font-medium text-gray-600">Full Address</label>
                                    <StableInput value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} placeholder="House/Flat No, Street, Area" className={inputClass} />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600">City</label>
                                    <StableInput value={form.city} onChange={v => setForm(f => ({ ...f, city: v }))} placeholder="City / Town" className={inputClass} />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-600">Pincode</label>
                                    <StableInput value={form.pincode} onChange={v => setForm(f => ({ ...f, pincode: v }))} placeholder="6-digit pincode" className={inputClass} />
                                </div>
                            </div>
                        </div>

                        {/* Fee Info */}
                        {windowData.registration_fee > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                                <strong>Registration Fee:</strong> ₹{windowData.registration_fee} (to be paid at the school office)
                            </div>
                        )}

                        {/* Submit */}
                        <button type="submit" disabled={submitting}
                            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-base hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-60 flex items-center justify-center gap-2">
                            {submitting ? <Loader2 className="animate-spin" size={18} /> : <GraduationCap size={18} />}
                            {submitting ? 'Submitting...' : 'Submit Registration'}
                        </button>

                        <p className="text-center text-xs text-gray-400">
                            By submitting, you agree that the information provided is accurate.
                            The school will contact you for further admission process.
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default function PublicRegistrationPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                <Loader2 className="animate-spin text-blue-600" size={40} />
            </div>
        }>
            <RegistrationContent />
        </Suspense>
    );
}
