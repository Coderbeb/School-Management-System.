'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { FileText, ChevronDown, Loader2, AlertCircle, Trophy, TrendingUp, Award } from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface ExamOption { id: string; name: string; is_published: boolean; }
interface SubjectResult { subjectName: string; maxMarks: number; obtained: number; percentage: number; grade: string; gradePoint: number; isPassed: boolean; isAbsent: boolean; }
interface ReportCard {
    student: { name: string; className: string; sectionName: string; rollNumber: number; };
    subjects: SubjectResult[];
    coScholastic: { area_name: string; grade: string; }[];
    attendance: { totalDays: number; daysPresent: number; };
    summary: { grandTotal: number; grandMax: number; overallPercentage: number; cgpa: number; overallResult: string; };
}

export default function StudentResultsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [exams, setExams] = useState<ExamOption[]>([]);
    const [selectedExam, setSelectedExam] = useState('');
    const [reportCard, setReportCard] = useState<ReportCard | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [studentId, setStudentId] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        setUser(parsed);
        fetchExams(token);
        fetchStudentId(token, parsed);
    }, [router]);

    const fetchExams = async (token: string) => {
        const res = await fetch('/api/exams', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setExams((data.exams || []).filter((e: ExamOption) => e.is_published));
    };

    const fetchStudentId = async (token: string, userData: User) => {
        try {
            const res = await fetch(`/api/students?userId=${userData.id}`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (data.students?.length > 0) setStudentId(data.students[0].id);
            else if (data.student?.id) setStudentId(data.student.id);
        } catch { /* ignore */ }
    };

    const loadResult = async (examId: string) => {
        if (!examId || !studentId) return;
        setLoading(true); setError(''); setReportCard(null);
        const token = localStorage.getItem('token')!;
        try {
            const res = await fetch(`/api/marks/report-card?examId=${examId}&studentId=${studentId}`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Results not available'); setLoading(false); return; }
            if (data.reportCards?.length > 0) setReportCard(data.reportCards[0]);
            else setError('No results found');
        } catch { setError('Network error'); }
        setLoading(false);
    };

    useEffect(() => { if (selectedExam && studentId) loadResult(selectedExam); }, [selectedExam, studentId]);

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-4xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-amber-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-indigo-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10">
                        <span className="text-amber-400 font-semibold tracking-wide uppercase text-sm">My Academics</span>
                        <h1 className="text-2xl font-bold mt-1 mb-2 flex items-center gap-3">My Results <Trophy className="w-6 h-6 text-amber-400" /></h1>
                        <p className="text-amber-100 text-sm">View your exam results, grades, and report cards.</p>
                    </div>
                </div>

                {/* Exam Selector */}
                <div className="flex items-center gap-3 mb-6">
                    <label className="text-sm font-bold text-gray-600">Exam:</label>
                    <div className="relative flex-1 max-w-xs">
                        <select value={selectedExam} onChange={e => setSelectedExam(e.target.value)}
                            className="w-full pl-3 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none appearance-none shadow-sm">
                            <option value="">Select an exam</option>
                            {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-3 pointer-events-none" />
                    </div>
                </div>

                {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}

                {loading ? (
                    <div className="flex flex-col items-center py-16 gap-3"><Loader2 className="w-8 h-8 text-amber-500 animate-spin" /><p className="text-gray-400 text-sm">Loading results...</p></div>
                ) : reportCard ? (
                    <>
                        {/* Result Summary */}
                        <div className={`rounded-2xl p-6 mb-6 border-2 shadow-sm ${reportCard.summary.overallResult === 'PASS' ? 'bg-emerald-50 border-emerald-200' : reportCard.summary.overallResult === 'COMPARTMENT' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">{reportCard.student.name}</h2>
                                    <p className="text-sm text-gray-500">{reportCard.student.className} - {reportCard.student.sectionName} | Roll #{reportCard.student.rollNumber}</p>
                                </div>
                                <div className="text-right">
                                    <div className={`text-3xl font-black ${reportCard.summary.overallResult === 'PASS' ? 'text-emerald-600' : reportCard.summary.overallResult === 'COMPARTMENT' ? 'text-amber-600' : 'text-red-600'}`}>
                                        {reportCard.summary.overallResult}
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="bg-white rounded-xl p-3 text-center shadow-sm"><div className="text-xs text-gray-500">Total Marks</div><div className="text-lg font-bold text-gray-900">{reportCard.summary.grandTotal}/{reportCard.summary.grandMax}</div></div>
                                <div className="bg-white rounded-xl p-3 text-center shadow-sm"><div className="text-xs text-gray-500">Percentage</div><div className="text-lg font-bold text-gray-900">{reportCard.summary.overallPercentage}%</div></div>
                                <div className="bg-white rounded-xl p-3 text-center shadow-sm"><div className="text-xs text-gray-500">CGPA</div><div className="text-lg font-bold text-gray-900">{reportCard.summary.cgpa}</div></div>
                                <div className="bg-white rounded-xl p-3 text-center shadow-sm"><div className="text-xs text-gray-500">Attendance</div><div className="text-lg font-bold text-gray-900">{reportCard.attendance.daysPresent}/{reportCard.attendance.totalDays}</div></div>
                            </div>
                        </div>

                        {/* Subject-wise */}
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Subject-Wise Performance</h3>
                        <div className="space-y-2 mb-6">
                            {reportCard.subjects.map((sub, i) => (
                                <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <h4 className="font-bold text-gray-900 text-sm">{sub.subjectName}</h4>
                                            <div className="mt-1.5 w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                                <div className={`h-full rounded-full transition-all ${sub.isPassed ? 'bg-emerald-500' : 'bg-red-400'}`} style={{ width: `${Math.min(sub.percentage, 100)}%` }} />
                                            </div>
                                        </div>
                                        <div className="ml-4 text-right shrink-0">
                                            <div className="text-lg font-bold text-gray-900">{sub.isAbsent ? 'AB' : sub.obtained}<span className="text-xs text-gray-400">/{sub.maxMarks}</span></div>
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${sub.isPassed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                {sub.isAbsent ? 'Absent' : sub.grade}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Co-Scholastic */}
                        {reportCard.coScholastic.length > 0 && (
                            <>
                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2"><Award className="w-4 h-4" /> Co-Scholastic Areas</h3>
                                <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6 divide-y divide-gray-50">
                                    {reportCard.coScholastic.map((co, i) => (
                                        <div key={i} className="flex items-center justify-between px-4 py-3">
                                            <span className="text-sm text-gray-700">{co.area_name}</span>
                                            <span className="px-3 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">{co.grade}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                ) : !selectedExam ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <Trophy className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">Select an exam to view your results.</p>
                    </div>
                ) : null}
            </main>
        </div>
    );
}
