'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { BookOpen, Clock } from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: 'super_admin' | 'teacher' | 'accountant' | 'student'; }
interface SubjectInfo { subject_name: string; subject_code: string; teacher_name: string; class_section_name: string; }

export default function StudentSubjectsPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'student') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchSubjects(token);
    }, []);

    const fetchSubjects = async (token: string) => {
        setLoading(true);
        try {
            const res = await fetch('/api/sms/student-subjects', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSubjects(data.subjects || []);
            }
        } catch (err) {
            console.error('Failed to load subjects', err);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const colors = [
        { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-700' },
        { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' },
        { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
        { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
        { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-700' },
        { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', badge: 'bg-cyan-100 text-cyan-700' },
    ];

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-3xl mx-auto px-4 py-8 mt-16">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-2">
                    <BookOpen className="w-6 h-6 text-violet-600" /> My Subjects
                </h1>
                <p className="text-sm text-gray-500 mb-6">Subjects assigned to your current class and section.</p>

                {loading ? (
                    <div className="text-center py-12 text-gray-400">Loading subjects...</div>
                ) : subjects.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No subjects assigned yet.</p>
                        <p className="text-gray-400 text-sm mt-1">Contact your class teacher or school admin.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {subjects.map((s, i) => {
                            const color = colors[i % colors.length];
                            return (
                                <div key={i} className={`${color.bg} border ${color.border} rounded-2xl p-5 transition-all hover:shadow-md`}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className={`px-2 py-0.5 rounded-lg text-xs font-bold font-mono ${color.badge}`}>{s.subject_code}</span>
                                    </div>
                                    <h3 className={`text-lg font-bold ${color.text}`}>{s.subject_name}</h3>
                                    <div className="mt-3 space-y-1.5 text-sm text-gray-600">
                                        <p className="flex items-center gap-2">
                                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                                            Teacher: <span className="font-semibold">{s.teacher_name || 'Not assigned'}</span>
                                        </p>
                                        <p className="text-xs text-gray-400">{s.class_section_name}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
