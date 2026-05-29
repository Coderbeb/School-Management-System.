'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarDays, Plus, CheckCircle, Pencil, X, Star } from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: 'super_admin' | 'teacher' | 'accountant' | 'student'; }
interface Session { id: string; name: string; start_date: string; end_date: string; is_current: boolean; }

export default function SessionsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', startDate: '', endDate: '', isCurrent: false });

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchSessions(token);
    }, [router]);

    const fetchSessions = async (token: string) => {
        setLoading(true);
        const res = await fetch('/api/manage/sessions', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setSessions(data.sessions || []);
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true); setError('');
        const token = localStorage.getItem('token')!;
        const method = editingId ? 'PUT' : 'POST';
        const body = editingId
            ? { id: editingId, name: form.name, startDate: form.startDate, endDate: form.endDate, isCurrent: form.isCurrent }
            : { name: form.name, startDate: form.startDate, endDate: form.endDate, isCurrent: form.isCurrent };

        const res = await fetch('/api/manage/sessions', { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Failed to save'); setSaving(false); return; }
        setShowForm(false); setEditingId(null); setForm({ name: '', startDate: '', endDate: '', isCurrent: false });
        fetchSessions(token);
        setSaving(false);
    };

    const startEdit = (s: Session) => { setEditingId(s.id); setForm({ name: s.name, startDate: s.start_date.split('T')[0], endDate: s.end_date.split('T')[0], isCurrent: s.is_current }); setShowForm(true); };
    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-4xl mx-auto px-4 py-8 mt-16">
                {/* Hero / Welcome Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-amber-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-amber-400 font-semibold tracking-wide uppercase text-sm">Directory</span>
                            </div>
                            <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                                Academic Sessions <span className="inline-block animate-wave">📅</span>
                            </h1>
                            <p className="text-amber-100 text-sm max-w-xl">
                                Create and manage academic years. One session should be marked as current.
                            </p>
                        </div>
                        <Button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', startDate: '', endDate: '', isCurrent: false }); }} className="bg-amber-500 hover:bg-amber-600 text-white gap-2 h-9 text-xs">
                            <Plus className="w-4 h-4" /> New Session
                        </Button>
                    </div>
                </div>

                {/* Form */}
                {showForm && (
                    <div className="bg-white border border-blue-100 rounded-2xl p-6 mb-6 shadow-sm">
                        <h2 className="font-bold text-gray-800 mb-4">{editingId ? 'Edit Session' : 'Create New Session'}</h2>
                        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2">
                                <Label>Session Name (e.g., 2026-2027)</Label>
                                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="2026-2027" required className="mt-1" />
                            </div>
                            <div>
                                <Label>Start Date</Label>
                                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required className="mt-1" />
                            </div>
                            <div>
                                <Label>End Date</Label>
                                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} required className="mt-1" />
                            </div>
                            <div className="sm:col-span-2 flex items-center gap-2">
                                <input type="checkbox" id="isCurrent" checked={form.isCurrent} onChange={e => setForm(f => ({ ...f, isCurrent: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
                                <Label htmlFor="isCurrent" className="cursor-pointer">Set as Current Active Session</Label>
                            </div>
                            {error && <p className="sm:col-span-2 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
                            <div className="sm:col-span-2 flex gap-3">
                                <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">{saving ? 'Saving...' : editingId ? 'Update Session' : 'Create Session'}</Button>
                                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Sessions List */}
                {loading ? (
                    <div className="text-center py-12 text-gray-400">Loading sessions...</div>
                ) : sessions.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No sessions yet. Create your first academic session.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sessions.map(s => (
                            <div key={s.id} className={`bg-white rounded-2xl border p-5 flex items-center justify-between shadow-sm ${s.is_current ? 'border-amber-300 bg-amber-50/30' : 'border-gray-100'}`}>
                                <div className="flex items-center gap-3">
                                    {s.is_current && <Star className="w-5 h-5 text-amber-500 fill-amber-400" />}
                                    <div>
                                        <p className="font-bold text-gray-900">{s.name}</p>
                                        <p className="text-sm text-gray-500">{new Date(s.start_date).toLocaleDateString()} → {new Date(s.end_date).toLocaleDateString()}</p>
                                    </div>
                                    {s.is_current && <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">CURRENT</span>}
                                </div>
                                <button onClick={() => startEdit(s)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-blue-600 transition-colors">
                                    <Pencil className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
