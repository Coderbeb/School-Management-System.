'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { BarChart3, ChevronDown, Loader2, AlertCircle, Trophy, Medal, TrendingUp, Users, Target, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface ExamOption { id: string; name: string; }
interface ClassSectionOption { id: string; class_name: string; section_name: string; }
interface StudentResult {
    student_id: string; student_name: string; roll_number: number | null;
    total_obtained: number; total_max: number; percentage: number; grade: string;
    subjects_passed: number; subjects_failed: number; total_subjects: number;
    result: string; rank: number;
}
interface SubjectStat {
    subject_name: string; subject_code: string; max_marks: number;
    highest: number; lowest: number; average: number;
    pass_count: number; fail_count: number; total_students: number;
}
interface ClassSummary {
    totalStudents: number; totalPassed: number; totalFailed: number; totalCompartment: number;
    passPercentage: number; classAverage: number; highestPercentage: number; lowestPercentage: number;
}

export default function ClassResultsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [exams, setExams] = useState<ExamOption[]>([]);
    const [classSections, setClassSections] = useState<ClassSectionOption[]>([]);
    const [selectedExam, setSelectedExam] = useState('');
    const [selectedClassSection, setSelectedClassSection] = useState('');

    const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
    const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);
    const [summary, setSummary] = useState<ClassSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [activeView, setActiveView] = useState<'rankings' | 'subjects'>('rankings');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (!['super_admin', 'developer'].includes(parsed.role)) { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchInitial(token);
    }, [router]);

    const fetchInitial = async (token: string) => {
        const [examsRes, csRes] = await Promise.all([
            fetch('/api/exams', { headers: { Authorization: `Bearer ${token}` } }),
            fetch('/api/manage/class-sections?withEnrollments=true', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const [examsData, csData] = await Promise.all([examsRes.json(), csRes.json()]);
        setExams(examsData.exams || []);
        setClassSections(csData.classSections || []);
    };

    const loadResults = useCallback(async () => {
        if (!selectedExam || !selectedClassSection) return;
        setLoading(true); setError('');
        const token = localStorage.getItem('token')!;
        try {
            const res = await fetch(`/api/marks/class-results?examId=${selectedExam}&classSectionId=${selectedClassSection}`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to load'); setLoading(false); return; }
            setStudentResults(data.studentResults || []);
            setSubjectStats(data.subjectStats || []);
            setSummary(data.summary || null);
        } catch { setError('Network error'); }
        setLoading(false);
    }, [selectedExam, selectedClassSection]);

    useEffect(() => { loadResults(); }, [loadResults]);

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const rankBadge = (rank: number) => {
        if (rank === 1) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold"><Trophy className="w-3 h-3" /> 1st</span>;
        if (rank === 2) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-bold"><Medal className="w-3 h-3" /> 2nd</span>;
        if (rank === 3) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold"><Medal className="w-3 h-3" /> 3rd</span>;
        return <span className="text-xs text-gray-500 font-medium">{rank}</span>;
    };

    const resultBadge = (result: string) => {
        const map: Record<string, string> = { PASS: 'bg-emerald-100 text-emerald-700', FAIL: 'bg-red-100 text-red-700', COMPARTMENT: 'bg-amber-100 text-amber-700' };
        return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${map[result] || 'bg-gray-100 text-gray-700'}`}>{result}</span>;
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-6xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-amber-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-rose-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10">
                        <span className="text-amber-400 font-semibold tracking-wide uppercase text-sm">Marks Management</span>
                        <h1 className="text-2xl font-bold mt-1 mb-2 flex items-center gap-3">Class Results & Analytics <TrendingUp className="w-6 h-6 text-amber-400" /></h1>
                        <p className="text-amber-100 text-sm max-w-xl">View class rankings, toppers, subject-wise statistics, and pass/fail analysis.</p>
                    </div>
                </div>

                {/* Selectors */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Exam</label>
                            <div className="relative">
                                <select value={selectedExam} onChange={e => { setSelectedExam(e.target.value); setStudentResults([]); }}
                                    className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none appearance-none">
                                    <option value="">Select exam</option>
                                    {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-3 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 block">Class</label>
                            <div className="relative">
                                <select value={selectedClassSection} onChange={e => setSelectedClassSection(e.target.value)} disabled={!selectedExam}
                                    className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none appearance-none disabled:opacity-50">
                                    <option value="">Select class</option>
                                    {classSections.map(cs => <option key={cs.id} value={cs.id}>{cs.class_name} - {cs.section_name}</option>)}
                                </select>
                                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-3 pointer-events-none" />
                            </div>
                        </div>
                    </div>
                </div>

                {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}

                {loading ? (
                    <div className="flex flex-col items-center py-16 gap-3"><Loader2 className="w-8 h-8 text-amber-500 animate-spin" /><p className="text-gray-400 text-sm">Calculating results...</p></div>
                ) : summary && studentResults.length > 0 ? (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                                <div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-blue-500" /><span className="text-xs text-gray-500 font-medium">Total Students</span></div>
                                <div className="text-2xl font-bold text-gray-900">{summary.totalStudents}</div>
                            </div>
                            <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                                <div className="flex items-center gap-2 mb-1"><ArrowUpRight className="w-4 h-4 text-emerald-500" /><span className="text-xs text-emerald-600 font-medium">Pass Rate</span></div>
                                <div className="text-2xl font-bold text-emerald-700">{summary.passPercentage}%</div>
                                <div className="text-xs text-emerald-600 mt-0.5">{summary.totalPassed} passed</div>
                            </div>
                            <div className="bg-red-50 rounded-2xl p-4 border border-red-100">
                                <div className="flex items-center gap-2 mb-1"><ArrowDownRight className="w-4 h-4 text-red-500" /><span className="text-xs text-red-600 font-medium">Failed</span></div>
                                <div className="text-2xl font-bold text-red-700">{summary.totalFailed}</div>
                                {summary.totalCompartment > 0 && <div className="text-xs text-amber-600 mt-0.5">{summary.totalCompartment} compartment</div>}
                            </div>
                            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                                <div className="flex items-center gap-2 mb-1"><Target className="w-4 h-4 text-purple-500" /><span className="text-xs text-gray-500 font-medium">Class Average</span></div>
                                <div className="text-2xl font-bold text-gray-900">{summary.classAverage}%</div>
                                <div className="text-xs text-gray-400 mt-0.5">High: {summary.highestPercentage}% | Low: {summary.lowestPercentage}%</div>
                            </div>
                        </div>

                        {/* View Toggle */}
                        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm mb-6 w-fit">
                            <button onClick={() => setActiveView('rankings')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeView === 'rankings' ? 'bg-amber-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                                🏆 Student Rankings
                            </button>
                            <button onClick={() => setActiveView('subjects')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeView === 'subjects' ? 'bg-amber-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                                📊 Subject Analysis
                            </button>
                        </div>

                        {/* Rankings Table */}
                        {activeView === 'rankings' && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 border-b border-gray-100">
                                            <tr>
                                                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase w-16">Rank</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Student</th>
                                                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Marks</th>
                                                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Percentage</th>
                                                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Grade</th>
                                                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Subjects</th>
                                                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">Result</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {studentResults.map(student => (
                                                <tr key={student.student_id} className={`hover:bg-gray-50/50 ${student.rank <= 3 ? 'bg-amber-50/30' : ''}`}>
                                                    <td className="px-4 py-3 text-center">{rankBadge(student.rank)}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-gray-900">{student.student_name}</div>
                                                        {student.roll_number && <div className="text-xs text-gray-400">Roll #{student.roll_number}</div>}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-bold text-gray-900">{student.total_obtained}<span className="text-xs text-gray-400 font-normal">/{student.total_max}</span></td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="inline-flex items-center gap-1.5">
                                                            <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                                <div className={`h-full rounded-full ${student.percentage >= 60 ? 'bg-emerald-500' : student.percentage >= 33 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(student.percentage, 100)}%` }} />
                                                            </div>
                                                            <span className="font-bold text-gray-900 text-xs">{student.percentage}%</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${student.percentage >= 75 ? 'bg-emerald-100 text-emerald-700' : student.percentage >= 45 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                            {student.grade}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-xs">
                                                        <span className="text-emerald-600 font-bold">{student.subjects_passed}P</span>
                                                        {student.subjects_failed > 0 && <span className="text-red-500 font-bold ml-1">{student.subjects_failed}F</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">{resultBadge(student.result)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Subject Analysis */}
                        {activeView === 'subjects' && (
                            <div className="space-y-3">
                                {subjectStats.map((stat, idx) => (
                                    <div key={idx} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <h3 className="font-bold text-gray-900">{stat.subject_name}</h3>
                                                <span className="text-xs text-gray-400">{stat.subject_code} • Max: {stat.max_marks}</span>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-bold text-gray-900">Avg: {stat.average}%</div>
                                                <div className="text-xs text-gray-400">
                                                    <span className="text-emerald-600 font-medium">{stat.pass_count} Pass</span> / <span className="text-red-500 font-medium">{stat.fail_count} Fail</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="bg-emerald-50 rounded-xl p-3 text-center">
                                                <div className="text-xs text-emerald-600 font-medium">Highest</div>
                                                <div className="text-xl font-bold text-emerald-700">{stat.highest}</div>
                                            </div>
                                            <div className="bg-blue-50 rounded-xl p-3 text-center">
                                                <div className="text-xs text-blue-600 font-medium">Average</div>
                                                <div className="text-xl font-bold text-blue-700">{stat.average}</div>
                                            </div>
                                            <div className="bg-red-50 rounded-xl p-3 text-center">
                                                <div className="text-xs text-red-600 font-medium">Lowest</div>
                                                <div className="text-xl font-bold text-red-700">{stat.lowest}</div>
                                            </div>
                                        </div>
                                        {/* Pass bar */}
                                        <div className="mt-3">
                                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stat.total_students > 0 ? (stat.pass_count / stat.total_students) * 100 : 0}%` }} />
                                            </div>
                                            <div className="text-xs text-gray-400 mt-1 text-right">{stat.total_students > 0 ? Math.round((stat.pass_count / stat.total_students) * 100) : 0}% pass rate</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : selectedExam && selectedClassSection && !loading ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">No results data found. Make sure marks have been entered and submitted for this exam.</p>
                    </div>
                ) : !selectedExam ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <Trophy className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">Select an exam and class to view results and analytics.</p>
                    </div>
                ) : null}
            </main>
        </div>
    );
}
