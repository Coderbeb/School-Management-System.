'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import {
    Building2, Plus, ChevronRight, Users, GraduationCap, ClipboardList,
    Search, Shield, Loader2, CheckCircle, XCircle, ChevronDown, X
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface School {
    id: string; name: string; short_name: string; address: string; city: string; state: string;
    board_type: string; is_active: boolean; subscription_tier: string; max_students: number;
    phone: string; email: string; principal_name: string;
    total_users: number; total_students: number; total_teachers: number; total_exams: number; total_classes: number;
    created_at: string;
}
interface Template { board_type: string; name: string; description: string; grading_scale_name: string; }

export default function SchoolsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [schools, setSchools] = useState<School[]>([]);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [search, setSearch] = useState('');
    const [creating, setCreating] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    // Form state
    const [form, setForm] = useState({
        name: '', shortName: '', address: '', city: '', state: '', pincode: '',
        phone: '', email: '', website: '', boardType: 'cbse', affiliationNumber: '',
        principalName: '', establishedYear: '', subscriptionTier: 'free', maxStudents: '500',
        adminEmail: '', adminPassword: '', adminFirstName: '', adminLastName: ''
    });

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'developer') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchData(token);
    }, [router]);

    const fetchData = async (token: string) => {
        setLoading(true);
        const [schoolsRes, templatesRes] = await Promise.all([
            fetch('/api/developer/schools', { headers: { Authorization: `Bearer ${token}` } }),
            fetch('/api/developer/templates', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const [schoolsData, templatesData] = await Promise.all([schoolsRes.json(), templatesRes.json()]);
        setSchools(schoolsData.schools || []);
        setTemplates(templatesData.templates || []);
        setLoading(false);
    };

    const createSchool = async () => {
        setCreating(true); setError(''); setSuccess('');
        const token = localStorage.getItem('token')!;
        try {
            const res = await fetch('/api/developer/schools', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed'); setCreating(false); return; }
            setSuccess(`School "${form.name}" created! Admin: ${form.adminEmail || 'none'}`);
            setShowCreate(false);
            setForm({ name: '', shortName: '', address: '', city: '', state: '', pincode: '', phone: '', email: '', website: '', boardType: 'cbse', affiliationNumber: '', principalName: '', establishedYear: '', subscriptionTier: 'free', maxStudents: '500', adminEmail: '', adminPassword: '', adminFirstName: '', adminLastName: '' });
            fetchData(token);
        } catch { setError('Network error'); }
        setCreating(false);
    };

    const toggleSchool = async (schoolId: string, isActive: boolean) => {
        const token = localStorage.getItem('token')!;
        await fetch('/api/developer/schools', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ id: schoolId, isActive: !isActive }),
        });
        fetchData(token);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const filteredSchools = schools.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.city?.toLowerCase().includes(search.toLowerCase()) ||
        s.board_type?.toLowerCase().includes(search.toLowerCase())
    );

    const boardLabel = (type: string) => {
        const map: Record<string, string> = { cbse: 'CBSE', icse: 'ICSE', state_board: 'State Board', custom: 'Custom' };
        return map[type] || type;
    };

    const tierColor = (tier: string) => {
        const map: Record<string, string> = { free: 'bg-gray-100 text-gray-700', basic: 'bg-blue-100 text-blue-700', premium: 'bg-purple-100 text-purple-700', enterprise: 'bg-amber-100 text-amber-700' };
        return map[tier] || 'bg-gray-100 text-gray-700';
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-6xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6 sm:p-8 mb-6 shadow-2xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-cyan-500 rounded-full mix-blend-screen filter blur-3xl opacity-25 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-violet-500 rounded-full mix-blend-screen filter blur-3xl opacity-25"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Shield className="w-4 h-4 text-cyan-400" />
                                <span className="text-cyan-400 font-bold tracking-wider uppercase text-xs">Developer Panel</span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-3">School Management <Building2 className="w-7 h-7 text-cyan-400" /></h1>
                            <p className="text-gray-300 text-sm mt-1">{schools.length} school{schools.length !== 1 ? 's' : ''} on the platform</p>
                        </div>
                        <Button onClick={() => setShowCreate(true)} className="bg-cyan-500 hover:bg-cyan-600 text-white gap-2 shadow-lg h-10">
                            <Plus className="w-4 h-4" /> Add School
                        </Button>
                    </div>
                </div>

                {/* Messages */}
                {success && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {success}</div>}
                {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

                {/* Search */}
                <div className="relative mb-5">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                    <input type="text" placeholder="Search schools..." value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 outline-none" />
                </div>

                {/* Schools List */}
                {loading ? (
                    <div className="flex flex-col items-center py-16 gap-3"><Loader2 className="w-8 h-8 text-cyan-500 animate-spin" /><p className="text-gray-400 text-sm">Loading schools...</p></div>
                ) : filteredSchools.length > 0 ? (
                    <div className="space-y-3">
                        {filteredSchools.map(school => (
                            <div key={school.id} className={`bg-white rounded-2xl border ${school.is_active ? 'border-gray-100' : 'border-red-100 opacity-60'} shadow-sm p-5 hover:shadow-md transition-shadow`}>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-100 to-blue-100 flex items-center justify-center shrink-0">
                                            <Building2 className="w-6 h-6 text-cyan-600" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-bold text-gray-900">{school.name}</h3>
                                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">{boardLabel(school.board_type)}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tierColor(school.subscription_tier)}`}>{school.subscription_tier}</span>
                                                {!school.is_active && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">Disabled</span>}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-0.5">{[school.city, school.state].filter(Boolean).join(', ') || 'No location set'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-gray-500">
                                        <div className="flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" /> {school.total_students}</div>
                                        <div className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {school.total_teachers}</div>
                                        <div className="flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" /> {school.total_exams}</div>
                                        <button onClick={() => toggleSchool(school.id, school.is_active)}
                                            className={`px-3 py-1 rounded-lg text-xs font-bold ${school.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'} transition-colors`}>
                                            {school.is_active ? 'Disable' : 'Enable'}
                                        </button>
                                        <ChevronRight className="w-4 h-4 text-gray-300" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">No schools found. Click "Add School" to create one.</p>
                    </div>
                )}

                {/* Create School Modal */}
                {showCreate && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-3xl z-10">
                                <h2 className="text-lg font-bold text-gray-900">Create New School</h2>
                                <button onClick={() => setShowCreate(false)} className="p-1.5 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
                            </div>
                            <div className="p-6 space-y-5">
                                {/* School Info */}
                                <div>
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">School Information</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="sm:col-span-2">
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">School Name *</label>
                                            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 outline-none" placeholder="e.g. Delhi Public School" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">Short Name</label>
                                            <input value={form.shortName} onChange={e => setForm({...form, shortName: e.target.value})} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 outline-none" placeholder="DPS" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">Board Type</label>
                                            <div className="relative">
                                                <select value={form.boardType} onChange={e => setForm({...form, boardType: e.target.value})}
                                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 outline-none appearance-none pr-8">
                                                    {templates.map(t => <option key={t.board_type} value={t.board_type}>{t.name} — {t.description}</option>)}
                                                </select>
                                                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-2.5 pointer-events-none" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">City</label>
                                            <input value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 outline-none" placeholder="New Delhi" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">State</label>
                                            <input value={form.state} onChange={e => setForm({...form, state: e.target.value})} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 outline-none" placeholder="Delhi" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">Phone</label>
                                            <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 outline-none" placeholder="011-12345678" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">Principal Name</label>
                                            <input value={form.principalName} onChange={e => setForm({...form, principalName: e.target.value})} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">Subscription</label>
                                            <select value={form.subscriptionTier} onChange={e => setForm({...form, subscriptionTier: e.target.value})}
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 outline-none appearance-none">
                                                <option value="free">Free (500 students)</option>
                                                <option value="basic">Basic (1000 students)</option>
                                                <option value="premium">Premium (3000 students)</option>
                                                <option value="enterprise">Enterprise (Unlimited)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Admin Account */}
                                <div>
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">School Admin Account</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">Admin First Name</label>
                                            <input value={form.adminFirstName} onChange={e => setForm({...form, adminFirstName: e.target.value})} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 outline-none" placeholder="John" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">Admin Last Name</label>
                                            <input value={form.adminLastName} onChange={e => setForm({...form, adminLastName: e.target.value})} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 outline-none" placeholder="Doe" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">Admin Email *</label>
                                            <input value={form.adminEmail} onChange={e => setForm({...form, adminEmail: e.target.value})} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 outline-none" placeholder="admin@school.com" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-600 mb-1 block">Admin Password *</label>
                                            <input type="password" value={form.adminPassword} onChange={e => setForm({...form, adminPassword: e.target.value})} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 outline-none" placeholder="••••••••" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white rounded-b-3xl">
                                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                                <Button onClick={createSchool} disabled={creating || !form.name} className="bg-cyan-600 hover:bg-cyan-700 text-white gap-2">
                                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create School
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
