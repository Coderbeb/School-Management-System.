'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { FileText, Download, ChevronDown, Loader2, AlertCircle, Printer, ArrowLeft, Layers } from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface ExamOption { id: string; name: string; is_published: boolean; generates_report_card: boolean; is_teacher_test: boolean; }
interface ExamGroupOption { id: string; name: string; exam_count: number; total_weightage: number; }
interface ClassSectionOption { id: string; class_name: string; section_name: string; }

interface SubjectResult { subjectName: string; subjectCode: string; maxMarks: number; obtained: number; percentage: number; grade: string; gradePoint: number; isPassed: boolean; isAbsent: boolean; componentMarks: { name: string; shortName: string; maxMarks: number; obtained: number; }[]; }
interface ReportCard {
    student: { name: string; fatherName: string; admissionNumber: string; rollNumber: number; className: string; sectionName: string; dateOfBirth: string; };
    subjects: SubjectResult[];
    coScholastic: { area_name: string; grade: string; }[];
    attendance: { totalDays: number; daysPresent: number; };
    summary: { grandTotal: number; grandMax: number; overallPercentage: number; cgpa: number; overallResult: string; failedSubjects: number; };
}

export default function ReportCardPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [exams, setExams] = useState<ExamOption[]>([]);
    const [examGroups, setExamGroups] = useState<ExamGroupOption[]>([]);
    const [classSections, setClassSections] = useState<ClassSectionOption[]>([]);
    const [selectedExam, setSelectedExam] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('');
    const [selectedClassSection, setSelectedClassSection] = useState('');
    const [reportMode, setReportMode] = useState<'exam' | 'group'>('exam');
    const [reportCards, setReportCards] = useState<ReportCard[]>([]);
    const [examInfo, setExamInfo] = useState<{ name: string; sessionName: string } | null>(null);
    const [schoolSettings, setSchoolSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin' && parsed.role !== 'developer') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchInitial(token);
    }, [router]);

    const fetchInitial = async (token: string) => {
        const [examsRes, csRes, groupsRes] = await Promise.all([
            fetch('/api/exams?onlyFormal=true', { headers: { Authorization: `Bearer ${token}` } }),
            fetch('/api/manage/class-sections?withEnrollments=true', { headers: { Authorization: `Bearer ${token}` } }),
            fetch('/api/exam-groups', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const [examsData, csData, groupsData] = await Promise.all([examsRes.json(), csRes.json(), groupsRes.json()]);
        const allExams = examsData.exams || [];
        setExams(allExams.filter((e: ExamOption) => e.generates_report_card));
        setClassSections(csData.classSections || []);
        setExamGroups(groupsData.groups || []);
    };

    const generateReportCards = async () => {
        if (!selectedClassSection) return;
        if (reportMode === 'exam' && !selectedExam) return;
        if (reportMode === 'group' && !selectedGroup) return;
        setLoading(true); setError(''); setReportCards([]);
        const token = localStorage.getItem('token')!;
        try {
            const param = reportMode === 'group'
                ? `examGroupId=${selectedGroup}&classSectionId=${selectedClassSection}`
                : `examId=${selectedExam}&classSectionId=${selectedClassSection}`;
            const res = await fetch(`/api/marks/report-card?${param}`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to generate'); setLoading(false); return; }
            setReportCards(data.reportCards || []);
            setExamInfo(data.exam || null);
            setSchoolSettings(data.schoolSettings || {});
        } catch { setError('Network error'); }
        setLoading(false);
    };

    const printReportCard = (card: ReportCard) => {
        const schoolName = schoolSettings.school_name || 'School Name';
        const schoolAddress = schoolSettings.school_address || '';
        const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/college-logo.png` : '/college-logo.png';

        const hasComponents = card.subjects.some(s => s.componentMarks.length > 0);
        const componentHeaders = hasComponents ? card.subjects.find(s => s.componentMarks.length > 0)?.componentMarks.map(c => c.shortName) || [] : [];

        const html = `<!DOCTYPE html><html><head><title>Report Card - ${card.student.name}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600;700&display=swap');
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Inter',sans-serif; background:#fff; color:#1e293b; padding:15mm; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
@page { size:A4; margin:0; }
.container { border:2px solid #1e3a8a; min-height:257mm; position:relative; }
.top-bar { height:5px; background:linear-gradient(90deg,#1e3a8a 0%,#1e3a8a 85%,#b45309 85%,#b45309 100%); }
.content { padding:20px 25px; }
.header { display:flex; align-items:center; gap:15px; border-bottom:2px solid #e2e8f0; padding-bottom:15px; margin-bottom:15px; }
.logo { height:55px; width:auto; object-fit:contain; }
.school-name { font-family:'Playfair Display',serif; font-size:20px; color:#1e3a8a; text-transform:uppercase; letter-spacing:0.5px; }
.school-sub { font-size:9px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
.title-box { text-align:center; background:#1e3a8a; color:white; padding:8px; margin-bottom:15px; border-radius:4px; }
.title-box h2 { font-size:13px; text-transform:uppercase; letter-spacing:2px; }
.info-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; margin-bottom:15px; font-size:11px; background:#eff6ff; padding:12px; border-radius:4px; border-left:4px solid #1e3a8a; }
.info-grid .label { color:#64748b; font-weight:600; }
.info-grid .value { color:#1e293b; font-weight:700; }
table { width:100%; border-collapse:collapse; margin-bottom:12px; font-size:10px; }
th { background:#1e3a8a; color:white; padding:6px 8px; text-align:center; font-weight:600; text-transform:uppercase; font-size:9px; letter-spacing:0.5px; }
th:first-child, td:first-child { text-align:left; }
td { padding:5px 8px; border-bottom:1px solid #e2e8f0; text-align:center; }
tr:nth-child(even) { background:#f8fafc; }
.grade-badge { display:inline-block; padding:1px 6px; border-radius:50px; font-size:9px; font-weight:700; }
.pass { background:#dcfce7; color:#166534; }
.fail { background:#fee2e2; color:#991b1b; }
.result-box { display:flex; justify-content:space-between; align-items:center; padding:12px; border:2px solid #1e3a8a; border-radius:4px; margin-bottom:12px; }
.result-label { font-size:11px; color:#64748b; font-weight:600; }
.result-value { font-size:16px; font-weight:700; color:#1e3a8a; }
.result-pass { color:#166534; } .result-fail { color:#991b1b; } .result-comp { color:#b45309; }
.co-table { margin-bottom:12px; }
.footer { display:flex; justify-content:space-between; font-size:9px; color:#64748b; text-transform:uppercase; letter-spacing:1px; padding-top:10px; border-top:1px solid #e2e8f0; margin-top:auto; }
.sig-line { border-top:1px solid #1e293b; width:120px; text-align:center; padding-top:4px; font-size:9px; color:#64748b; }
.watermark { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:250px; opacity:0.03; pointer-events:none; z-index:0; filter:grayscale(100%); }
</style></head><body>
<div class="container">
<div class="top-bar"></div>
<img src="${logoUrl}" class="watermark" />
<div class="content">
<div class="header">
    <img src="${logoUrl}" class="logo" alt="Logo" />
    <div><div class="school-name">${schoolName}</div><div class="school-sub">${schoolAddress}</div><div class="school-sub">Academic Session: ${examInfo?.sessionName || ''}</div></div>
</div>
<div class="title-box"><h2>Report Card — ${examInfo?.name || 'Examination'}</h2></div>
<div class="info-grid">
    <div><span class="label">Student Name: </span><span class="value">${card.student.name}</span></div>
    <div><span class="label">Father's Name: </span><span class="value">${card.student.fatherName}</span></div>
    <div><span class="label">Class: </span><span class="value">${card.student.className} - ${card.student.sectionName}</span></div>
    <div><span class="label">Roll No: </span><span class="value">${card.student.rollNumber || '-'}</span></div>
    <div><span class="label">Admission No: </span><span class="value">${card.student.admissionNumber}</span></div>
    <div><span class="label">DOB: </span><span class="value">${card.student.dateOfBirth ? new Date(card.student.dateOfBirth).toLocaleDateString('en-IN') : '-'}</span></div>
</div>
<table>
<thead><tr><th style="text-align:left">Subject</th>${hasComponents ? componentHeaders.map(h => `<th>${h}</th>`).join('') : ''}<th>Max</th><th>Obtained</th><th>%</th><th>Grade</th><th>Result</th></tr></thead>
<tbody>
${card.subjects.map(s => `<tr>
    <td style="text-align:left;font-weight:600">${s.subjectName}</td>
    ${hasComponents ? componentHeaders.map(h => { const c = s.componentMarks.find(cm => cm.shortName === h); return `<td>${c ? (s.isAbsent ? 'AB' : c.obtained) : '-'}</td>`; }).join('') : ''}
    <td>${s.maxMarks}</td>
    <td style="font-weight:700">${s.isAbsent ? 'AB' : s.obtained}</td>
    <td>${s.isAbsent ? '-' : s.percentage + '%'}</td>
    <td><span class="grade-badge ${s.isPassed ? 'pass' : 'fail'}">${s.isAbsent ? 'AB' : s.grade}</span></td>
    <td style="font-weight:600;color:${s.isPassed ? '#166534' : '#991b1b'}">${s.isAbsent ? 'AB' : s.isPassed ? 'Pass' : 'Fail'}</td>
</tr>`).join('')}
</tbody>
</table>
${card.coScholastic.length > 0 ? `
<table class="co-table"><thead><tr><th style="text-align:left" colspan="2">Co-Scholastic Areas</th></tr></thead>
<tbody>${card.coScholastic.map(c => `<tr><td style="text-align:left">${c.area_name}</td><td style="width:60px">${c.grade}</td></tr>`).join('')}</tbody></table>` : ''}
<div class="result-box">
    <div><div class="result-label">Total Marks</div><div class="result-value">${card.summary.grandTotal} / ${card.summary.grandMax}</div></div>
    <div><div class="result-label">Percentage</div><div class="result-value">${card.summary.overallPercentage}%</div></div>
    <div><div class="result-label">CGPA</div><div class="result-value">${card.summary.cgpa}</div></div>
    <div><div class="result-label">Attendance</div><div class="result-value">${card.attendance.daysPresent}/${card.attendance.totalDays}</div></div>
    <div><div class="result-label">Result</div><div class="result-value ${card.summary.overallResult === 'PASS' ? 'result-pass' : card.summary.overallResult === 'COMPARTMENT' ? 'result-comp' : 'result-fail'}">${card.summary.overallResult}</div></div>
</div>
<div style="display:flex;justify-content:space-between;margin-top:30px">
    <div class="sig-line">Class Teacher</div>
    <div class="sig-line">Principal</div>
    <div class="sig-line">Parent/Guardian</div>
</div>
<div class="footer"><div>Generated on: ${new Date().toLocaleDateString('en-IN')}</div><div>${schoolName}</div></div>
</div></div>
<script>window.onload=function(){setTimeout(function(){window.print();},500);}</script>
</body></html>`;

        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />
            <main className="max-w-6xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-rose-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-amber-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10">
                        <button onClick={() => router.push('/marks/overview')} className="flex items-center gap-1 text-rose-300 hover:text-white text-sm mb-3 transition-colors"><ArrowLeft className="w-4 h-4" /> Back to Overview</button>
                        <span className="text-rose-400 font-semibold tracking-wide uppercase text-sm">Marks Management</span>
                        <h1 className="text-2xl font-bold mt-1 mb-2 flex items-center gap-3">Report Card Generator <FileText className="w-6 h-6 text-rose-400" /></h1>
                        <p className="text-rose-100 text-sm">Generate professional PDF report cards for individual students or entire classes.</p>
                    </div>
                </div>

                {/* Selection */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6 shadow-sm space-y-4">
                    {/* Mode Toggle */}
                    {examGroups.length > 0 && (
                        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                            <button onClick={() => { setReportMode('exam'); setReportCards([]); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${reportMode === 'exam' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                                📝 Individual Exam
                            </button>
                            <button onClick={() => { setReportMode('group'); setReportCards([]); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${reportMode === 'group' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                                <Layers className="w-3.5 h-3.5" /> Consolidated
                            </button>
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">
                                {reportMode === 'group' ? 'Exam Group' : 'Exam'}
                            </label>
                            <div className="relative">
                                {reportMode === 'exam' ? (
                                    <select value={selectedExam} onChange={e => setSelectedExam(e.target.value)}
                                        className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-rose-500 outline-none appearance-none">
                                        <option value="">Select exam</option>
                                        {exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                    </select>
                                ) : (
                                    <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}
                                        className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-rose-500 outline-none appearance-none">
                                        <option value="">Select exam group</option>
                                        {examGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.exam_count} exams)</option>)}
                                    </select>
                                )}
                                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-3 pointer-events-none" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Class</label>
                            <div className="relative">
                                <select value={selectedClassSection} onChange={e => setSelectedClassSection(e.target.value)}
                                    className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-rose-500 outline-none appearance-none">
                                    <option value="">Select class</option>
                                    {classSections.map(cs => <option key={cs.id} value={cs.id}>{cs.class_name} - {cs.section_name}</option>)}
                                </select>
                                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-3 pointer-events-none" />
                            </div>
                        </div>
                        <Button onClick={generateReportCards}
                            disabled={loading || !selectedClassSection || (reportMode === 'exam' ? !selectedExam : !selectedGroup)}
                            className="bg-rose-600 hover:bg-rose-700 text-white gap-2 h-[42px]">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Generate
                        </Button>
                    </div>
                </div>

                {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}

                {/* Report Cards Preview */}
                {reportCards.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-900">{reportCards.length} Report Card{reportCards.length > 1 ? 's' : ''} Generated</h2>
                        </div>
                        {reportCards.map((card, i) => (
                            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="font-bold text-gray-900">{card.student.name}</h3>
                                        <p className="text-xs text-gray-500">{card.student.className} - {card.student.sectionName} | Roll #{card.student.rollNumber} | {card.student.admissionNumber}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${card.summary.overallResult === 'PASS' ? 'bg-emerald-100 text-emerald-700' : card.summary.overallResult === 'COMPARTMENT' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                            {card.summary.overallResult}
                                        </span>
                                        <Button onClick={() => printReportCard(card)} variant="outline" size="sm" className="gap-1.5 text-xs">
                                            <Printer className="w-3.5 h-3.5" /> Print
                                        </Button>
                                    </div>
                                </div>
                                {/* Quick summary */}
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                                    <div className="bg-gray-50 rounded-xl p-2"><div className="text-xs text-gray-500">Total</div><div className="font-bold text-gray-900">{card.summary.grandTotal}/{card.summary.grandMax}</div></div>
                                    <div className="bg-gray-50 rounded-xl p-2"><div className="text-xs text-gray-500">Percentage</div><div className="font-bold text-gray-900">{card.summary.overallPercentage}%</div></div>
                                    <div className="bg-gray-50 rounded-xl p-2"><div className="text-xs text-gray-500">CGPA</div><div className="font-bold text-gray-900">{card.summary.cgpa}</div></div>
                                    <div className="bg-gray-50 rounded-xl p-2"><div className="text-xs text-gray-500">Attendance</div><div className="font-bold text-gray-900">{card.attendance.daysPresent}/{card.attendance.totalDays}</div></div>
                                    <div className="bg-gray-50 rounded-xl p-2"><div className="text-xs text-gray-500">Subjects</div><div className="font-bold text-gray-900">{card.subjects.length}</div></div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
