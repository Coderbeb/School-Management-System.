'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { BarChart3, Lock, Unlock, ChevronDown, CheckCircle, Clock, AlertCircle, FileText, Loader2, Eye } from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface ExamOption { id: string; name: string; is_published: boolean; is_locked: boolean; }
interface Submission {
    id: string; status: string; submitted_at: string | null; locked_at: string | null;
    class_name: string; section_name: string; subject_name: string; subject_code: string;
    teacher_name: string; teacher_email: string; student_count: number; marks_entered: number;
}
interface Summary { totalExpected: number; totalSubmitted: number; totalDraft: number; totalLocked: number; totalPending: number; }

export default function MarksOverviewPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [exams, setExams] = useState<ExamOption[]>([]);
    const [selectedExam, setSelectedExam] = useState('');
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [exam, setExam] = useState<{ name: string; session_name: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingData, setLoadingData] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin' && parsed.role !== 'developer') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchExams(token);
        setLoading(false);
    }, [router]);

    const fetchExams = async (token: string) => {
        const res = await fetch('/api/exams', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setExams(data.exams || []);
    };

    const fetchOverview = async (examId: string) => {
        if (!examId) return;
        setLoadingData(true);
        const token = localStorage.getItem('token')!;
        const res = await fetch(`/api/marks/overview?examId=${examId}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setSubmissions(data.submissions || []);
        setSummary(data.summary || null);
        setExam(data.exam || null);
        setLoadingData(false);
    };

    const toggleLock = async (submissionId: string, action: 'lock' | 'unlock') => {
        const token = localStorage.getItem('token')!;
        await fetch('/api/marks/overview', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ submissionId, action }),
        });
        fetchOverview(selectedExam);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const statusBadge = (status: string) => {
        const map: Record<string, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
            draft: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Draft', icon: <Clock className="w-3 h-3" /> },
            submitted: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Submitted', icon: <CheckCircle className="w-3 h-3" /> },
            locked: { bg: 'bg-red-100', text: 'text-red-700', label: 'Locked', icon: <Lock className="w-3 h-3" /> },
            reopened: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Reopened', icon: <Unlock className="w-3 h-3" /> },
        };
        const s = map[status] || map.draft;
        return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${s.bg} ${s.text}`}>{s.icon} {s.label}</span>;
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-6xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-indigo-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <span className="text-blue-400 font-semibold tracking-wide uppercase text-sm">Marks Management</span>
                            <h1 className="text-2xl font-bold mt-1 mb-2 flex items-center gap-3">Submission Overview <BarChart3 className="w-6 h-6 text-blue-400" /></h1>
                            <p className="text-blue-100 text-sm">Track teacher submissions, lock marks, and publish results.</p>
                        </div>
                        <Button onClick={() => router.push('/marks/report-card')} className="bg-blue-500 hover:bg-blue-600 text-white gap-2 h-9 text-xs shadow-lg">
                            <FileText className="w-4 h-4" /> Report Cards
                        </Button>
                    </div>
                </div>

                {/* Exam Selector */}
                <div className="flex items-center gap-3 mb-6">
                    <label className="text-sm font-bold text-gray-600">Exam:</label>
                    <div className="relative">
                        <select value={selectedExam} onChange={e => { setSelectedExam(e.target.value); fetchOverview(e.target.value); }}
                            className="pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none appearance-none shadow-sm">
                            <option value="">Select an exam</option>
                            {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-2.5 pointer-events-none" />
                    </div>
                </div>

                {loadingData ? (
                    <div className="flex flex-col items-center py-16 gap-3"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /><p className="text-gray-400 text-sm">Loading...</p></div>
                ) : selectedExam && summary ? (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                            {[
                                { label: 'Submitted', value: summary.totalSubmitted, color: 'text-blue-600', bg: 'bg-blue-50' },
                                { label: 'Drafts', value: summary.totalDraft, color: 'text-amber-600', bg: 'bg-amber-50' },
                                { label: 'Locked', value: summary.totalLocked, color: 'text-red-600', bg: 'bg-red-50' },
                                { label: 'Pending', value: summary.totalPending, color: 'text-gray-600', bg: 'bg-gray-50' },
                            ].map(card => (
                                <div key={card.label} className={`${card.bg} rounded-2xl p-4 border border-gray-100`}>
                                    <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                                    <div className="text-xs font-medium text-gray-500 mt-1">{card.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Submissions Table */}
                        {submissions.length > 0 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                {/* Desktop */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 border-b border-gray-100">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Class</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Subject</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Teacher</th>
                                                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Status</th>
                                                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Entries</th>
                                                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {submissions.map(sub => (
                                                <tr key={sub.id} className="hover:bg-gray-50/50">
                                                    <td className="px-4 py-3 font-medium text-gray-900">{sub.class_name} - {sub.section_name}</td>
                                                    <td className="px-4 py-3"><span className="text-gray-900">{sub.subject_name}</span><span className="text-xs text-gray-400 ml-1">({sub.subject_code})</span></td>
                                                    <td className="px-4 py-3 text-gray-600 text-xs">{sub.teacher_name}</td>
                                                    <td className="px-4 py-3 text-center">{statusBadge(sub.status)}</td>
                                                    <td className="px-4 py-3 text-center text-xs text-gray-500">{sub.marks_entered}/{sub.student_count}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        {sub.status === 'locked' ? (
                                                            <button onClick={() => toggleLock(sub.id, 'unlock')} className="text-xs font-medium text-purple-600 hover:text-purple-800 flex items-center gap-1 ml-auto">
                                                                <Unlock className="w-3.5 h-3.5" /> Unlock
                                                            </button>
                                                        ) : sub.status === 'submitted' || sub.status === 'draft' ? (
                                                            <button onClick={() => toggleLock(sub.id, 'lock')} className="text-xs font-medium text-red-600 hover:text-red-800 flex items-center gap-1 ml-auto">
                                                                <Lock className="w-3.5 h-3.5" /> Lock
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs text-gray-400">-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {/* Mobile */}
                                <div className="md:hidden divide-y divide-gray-100">
                                    {submissions.map(sub => (
                                        <div key={sub.id} className="p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="font-bold text-gray-900 text-sm">{sub.class_name}-{sub.section_name} • {sub.subject_name}</div>
                                                {statusBadge(sub.status)}
                                            </div>
                                            <div className="text-xs text-gray-500 mb-2">{sub.teacher_name} • {sub.marks_entered}/{sub.student_count} entries</div>
                                            {sub.status === 'locked' ? (
                                                <button onClick={() => toggleLock(sub.id, 'unlock')} className="text-xs text-purple-600 font-bold">Unlock</button>
                                            ) : (sub.status === 'submitted' || sub.status === 'draft') ? (
                                                <button onClick={() => toggleLock(sub.id, 'lock')} className="text-xs text-red-600 font-bold">Lock</button>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                                <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500 text-sm">No submissions yet for this exam.</p>
                            </div>
                        )}
                    </>
                ) : !selectedExam ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <Eye className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">Select an exam above to see submission status.</p>
                    </div>
                ) : null}
            </main>
        </div>
    );
}
