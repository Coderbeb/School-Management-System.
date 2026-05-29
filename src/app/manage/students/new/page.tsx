'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GraduationCap, ArrowLeft, Save, User, Phone, MapPin, BookOpen } from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: 'super_admin' | 'teacher' | 'accountant' | 'student'; }
interface Session { id: string; name: string; is_current: boolean; }
interface ClassSection { id: string; display_name: string; }

export default function NewStudentPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [classSections, setClassSections] = useState<ClassSection[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [form, setForm] = useState({
        firstName: '', lastName: '', email: '', password: '', dateOfBirth: '', gender: '', bloodGroup: '', address: '',
        guardianName: '', guardianRelation: 'Father', guardianPhone: '', guardianEmail: '', guardianPhoneAlt: '',
        admissionNumber: '', admissionDate: new Date().toISOString().split('T')[0],
        sessionId: '', classSectionId: '', rollNumber: '',
    });

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin') { router.replace('/dashboard'); return; }
        setUser(parsed);
        loadDropdowns(token);
    }, []);

    const loadDropdowns = async (token: string) => {
        const sessRes = await fetch('/api/manage/sessions', { headers: { Authorization: `Bearer ${token}` } });
        const sessData = await sessRes.json();
        setSessions(sessData.sessions || []);
        const curr = (sessData.sessions || []).find((s: Session) => s.is_current);
        if (curr) {
            setForm(f => ({ ...f, sessionId: curr.id }));
            loadClassSections(curr.id, token);
        }
    };

    const loadClassSections = async (sessionId: string, token?: string) => {
        const t = token || localStorage.getItem('token')!;
        const res = await fetch(`/api/manage/class-sections?sessionId=${sessionId}`, { headers: { Authorization: `Bearer ${t}` } });
        const data = await res.json();
        setClassSections(data.classSections || []);
    };

    const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true); setError(''); setSuccess('');
        const token = localStorage.getItem('token')!;
        const res = await fetch('/api/manage/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                ...form,
                rollNumber: form.rollNumber ? parseInt(form.rollNumber) : null,
            })
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Failed to admit student'); setSaving(false); return; }
        setSuccess('Student admitted successfully!');
        setSaving(false);
        setTimeout(() => router.push('/manage/students'), 1500);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const SectionHeader = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
            <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600">{icon}</div>
            <h3 className="font-bold text-gray-800">{title}</h3>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-3xl mx-auto px-4 py-8 mt-16">
                <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => router.push('/manage/students')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <GraduationCap className="w-6 h-6 text-emerald-600" /> New Student Admission
                        </h1>
                        <p className="text-sm text-gray-500 mt-0.5">Fill in the student and guardian details to admit a new student.</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Personal Details */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                        <SectionHeader icon={<User className="w-4 h-4" />} title="Personal Details" />
                        <div className="grid grid-cols-2 gap-4">
                            <div><Label>First Name *</Label><Input value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="First name" required className="mt-1" /></div>
                            <div><Label>Last Name *</Label><Input value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Last name" required className="mt-1" /></div>
                            <div><Label>Date of Birth</Label><Input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} className="mt-1" /></div>
                            <div>
                                <Label>Gender</Label>
                                <select value={form.gender} onChange={e => set('gender', e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white">
                                    <option value="">Select Gender</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div><Label>Blood Group</Label>
                                <select value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white">
                                    <option value="">Select</option>
                                    {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                            <div><Label>Admission Number</Label><Input value={form.admissionNumber} onChange={e => set('admissionNumber', e.target.value)} placeholder="e.g. ADM-2026-001" className="mt-1" /></div>
                            <div><Label>Admission Date</Label><Input type="date" value={form.admissionDate} onChange={e => set('admissionDate', e.target.value)} className="mt-1" /></div>
                        </div>
                        <div className="mt-4"><Label>Address</Label><textarea value={form.address} onChange={e => set('address', e.target.value)} placeholder="Full residential address" rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" /></div>
                    </div>

                    {/* Login Credentials */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                        <SectionHeader icon={<User className="w-4 h-4" />} title="Student Login Credentials" />
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Student Email (Login Username)</Label>
                                <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="student@school.com" className="mt-1" />
                            </div>
                            <div>
                                <Label>Student Password</Label>
                                <Input type="text" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Default: Test@1234" className="mt-1" />
                            </div>
                        </div>
                    </div>

                    {/* Guardian Details */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                        <SectionHeader icon={<Phone className="w-4 h-4" />} title="Guardian / Parent Details" />
                        <div className="grid grid-cols-2 gap-4">
                            <div><Label>Guardian Name</Label><Input value={form.guardianName} onChange={e => set('guardianName', e.target.value)} placeholder="Parent / Guardian name" className="mt-1" /></div>
                            <div>
                                <Label>Relation</Label>
                                <select value={form.guardianRelation} onChange={e => set('guardianRelation', e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white">
                                    {['Father','Mother','Guardian','Grandparent','Uncle','Aunt','Other'].map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div><Label>WhatsApp Number *</Label><Input value={form.guardianPhone} onChange={e => set('guardianPhone', e.target.value)} placeholder="+91 9999999999" required className="mt-1" /></div>
                            <div><Label>Alternate Phone</Label><Input value={form.guardianPhoneAlt} onChange={e => set('guardianPhoneAlt', e.target.value)} placeholder="Alternate number" className="mt-1" /></div>
                            <div className="col-span-2"><Label>Guardian Email</Label><Input type="email" value={form.guardianEmail} onChange={e => set('guardianEmail', e.target.value)} placeholder="parent@email.com" className="mt-1" /></div>
                        </div>
                    </div>

                    {/* Enrollment Details */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                        <SectionHeader icon={<BookOpen className="w-4 h-4" />} title="Class Enrollment" />
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Academic Session</Label>
                                <select value={form.sessionId} onChange={e => { set('sessionId', e.target.value); set('classSectionId', ''); loadClassSections(e.target.value); }} className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white">
                                    <option value="">Select Session</option>
                                    {sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (Current)' : ''}</option>)}
                                </select>
                            </div>
                            <div>
                                <Label>Class & Section</Label>
                                <select value={form.classSectionId} onChange={e => set('classSectionId', e.target.value)} className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3 text-sm bg-white" disabled={!form.sessionId}>
                                    <option value="">Select Classroom</option>
                                    {classSections.map(cs => <option key={cs.id} value={cs.id}>{cs.display_name}</option>)}
                                </select>
                            </div>
                            <div><Label>Roll Number</Label><Input type="number" value={form.rollNumber} onChange={e => set('rollNumber', e.target.value)} placeholder="Optional" className="mt-1" /></div>
                        </div>
                        <p className="text-xs text-gray-400 mt-3">* Enrollment can also be done later from the student&apos;s profile.</p>
                    </div>

                    {error && <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 font-medium">{error}</div>}
                    {success && <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-700 font-semibold">{success}</div>}

                    <div className="flex gap-3 pb-8">
                        <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-6">
                            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Admit Student'}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => router.push('/manage/students')}>Cancel</Button>
                    </div>
                </form>
            </main>
        </div>
    );
}
