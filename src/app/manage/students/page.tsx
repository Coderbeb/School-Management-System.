'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
    GraduationCap, Plus, Search, Phone, User, Filter, 
    ChevronRight, Upload, Download, X, Check, ShieldAlert, Loader2, CheckCircle 
} from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: 'super_admin' | 'teacher' | 'accountant' | 'student'; }
interface Student {
    id: string; first_name: string; last_name: string; admission_number: string | null;
    gender: string | null; guardian_name: string | null; guardian_phone: string | null;
    class_section_name: string | null; roll_number: number | null;
    enrollment_status: string | null; is_active: boolean;
}
interface Session { id: string; name: string; is_current: boolean; }
interface ClassSection { id: string; display_name: string; }

export default function StudentsPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [students, setStudents] = useState<Student[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [classSections, setClassSections] = useState<ClassSection[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState('');
    const [sessionId, setSessionId] = useState('');
    const [classSectionId, setClassSectionId] = useState('');

    // Bulk CSV Importer States
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<any | null>(null);
    const [importError, setImportError] = useState('');

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
            setSessionId(curr.id);
            const csRes = await fetch(`/api/manage/class-sections?sessionId=${curr.id}`, { headers: { Authorization: `Bearer ${token}` } });
            const csData = await csRes.json();
            setClassSections(csData.classSections || []);
            fetchStudents(curr.id, '', '', token);
        } else {
            fetchStudents('', '', '', token);
        }
    };

    const fetchStudents = useCallback(async (sid = sessionId, csid = classSectionId, q = search, token?: string) => {
        setLoading(true);
        const t = token || localStorage.getItem('token')!;
        const params = new URLSearchParams();
        if (sid) params.set('sessionId', sid);
        if (csid) params.set('classSectionId', csid);
        if (q) params.set('search', q);
        const res = await fetch(`/api/manage/students?${params}`, { headers: { Authorization: `Bearer ${t}` } });
        const data = await res.json();
        setStudents(data.students || []);
        setTotal(data.total || 0);
        setLoading(false);
    }, [sessionId, classSectionId, search]);

    const handleSessionChange = async (sid: string) => {
        setSessionId(sid); setClassSectionId('');
        const t = localStorage.getItem('token')!;
        if (sid) {
            const csRes = await fetch(`/api/manage/class-sections?sessionId=${sid}`, { headers: { Authorization: `Bearer ${t}` } });
            const csData = await csRes.json();
            setClassSections(csData.classSections || []);
        }
        fetchStudents(sid, '', search);
    };

    const [importSummary, setImportSummary] = useState<string | null>(null);

    // Client CSV Downloader
    const downloadTemplate = () => {
        const headers = 'First Name,Last Name,Email,Roll No,Class,Section,Gender,Date of Birth,Blood Group,Address,Guardian Name,Guardian Relation,Guardian Phone,Guardian Email,Alt Phone Number,Admission Number,Admission Date\n' +
            'Jane,Doe,jane.doe@school.com,1,Class 10,A,female,2012-05-14,O+,123 Green Street,Robert Doe,Father,9876543210,robert@doe.com,,ADM-2026-001,2026-04-01\n' +
            'Mark,Twain,mark.twain@school.com,2,Class 9,B,male,2013-09-21,A-,456 Oak Avenue,Samuel Clemens,Father,9876543211,,,ADM-2026-002,2026-04-01\n' +
            'Lisa,Simpson,lisa.simpson@school.com,3,Class 10,C,female,2012-08-01,AB+,742 Evergreen Terrace,Homer Simpson,Father,9876543212,homer@simpson.com,9876543213,ADM-2026-003,2026-04-01';
        const blob = new Blob([headers], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'students_template.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        setImportError('');
        setImportSummary(null);

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const csvText = event.target?.result as string;
                const token = localStorage.getItem('token')!;
                const res = await fetch('/api/bulk-import/students', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ csvData: csvText })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Failed to import students CSV');
                }

                let summary = `Successfully imported: ${data.summary.studentsCreated} Students, ${data.summary.enrollmentsCreated} Enrollments!`;
                if (data.summary.missingClassrooms && data.summary.missingClassrooms.length > 0) {
                    summary += ` (Note: ${data.summary.missingClassrooms.length} classroom mappings were not found: ${data.summary.missingClassrooms.join(', ')})`;
                }
                setImportSummary(summary);
                fetchStudents(sessionId);
            } catch (err: any) {
                setImportError(err.message || 'An error occurred during import');
            } finally {
                setImporting(false);
            }
        };
        reader.readAsText(file);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const genderIcon = (g: string | null) => g === 'female' ? '👧' : g === 'male' ? '👦' : '🧑';

    return (
        <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8 mt-16">
                
                {/* Hero / Welcome Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-emerald-400 font-semibold tracking-wide uppercase text-sm">Directory</span>
                            </div>
                            <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
                                Students Directory <span className="inline-block animate-wave">🎓</span>
                            </h1>
                            <p className="text-emerald-100 text-sm max-w-xl">
                                Manage all student enrollments, admit new students, and import bulk data.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={downloadTemplate} variant="outline" className="gap-1.5 text-xs h-9 bg-white/10 text-white hover:bg-white/20 border-white/20">
                                <Download className="w-3.5 h-3.5" /> Template
                            </Button>
                            <label className={`cursor-pointer bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition-colors h-9 ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
                                {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                {importing ? 'Importing...' : 'Import CSV'}
                                <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
                            </label>
                            <Button 
                                onClick={() => router.push('/manage/students/new')} 
                                className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 text-xs h-9"
                            >
                                <Plus className="w-3.5 h-3.5" /> Admit Student
                            </Button>
                        </div>
                    </div>
                </div>

                {importSummary && (
                    <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl p-3.5 mb-6 text-xs flex items-center gap-2 shadow-sm animate-fade-in">
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{importSummary}</span>
                    </div>
                )}

                {importError && (
                    <div className="bg-red-50 border border-red-100 text-red-800 rounded-xl p-3.5 mb-6 text-xs flex items-center gap-2 shadow-sm animate-fade-in">
                        <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                        <span>{importError}</span>
                    </div>
                )}

                {/* Filters */}
                <div className="bg-white rounded-3xl border border-gray-150 p-6 mb-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4 text-sm font-bold text-gray-800">
                        <Filter className="w-4.5 h-4.5 text-emerald-600" /> Filter Criteria
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                            <Input 
                                value={search} 
                                onChange={e => setSearch(e.target.value)} 
                                onKeyDown={e => e.key === 'Enter' && fetchStudents()} 
                                placeholder="Search by name, phone, admission..." 
                                className="pl-10 rounded-xl border-gray-200" 
                            />
                        </div>
                        <select 
                            value={sessionId} 
                            onChange={e => handleSessionChange(e.target.value)} 
                            className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm bg-white text-gray-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        >
                            <option value="">All Academic Years</option>
                            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (Current)' : ''}</option>)}
                        </select>
                        <select 
                            value={classSectionId} 
                            onChange={e => { setClassSectionId(e.target.value); fetchStudents(sessionId, e.target.value, search); }} 
                            className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm bg-white text-gray-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none" 
                            disabled={!sessionId}
                        >
                            <option value="">All Classrooms</option>
                            {classSections.map(cs => <option key={cs.id} value={cs.id}>{cs.display_name}</option>)}
                        </select>
                    </div>
                </div>

                {/* Students Table */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-gray-500 font-medium">Loading student catalog...</p>
                    </div>
                ) : students.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm">
                        <GraduationCap className="w-14 h-14 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-500 font-semibold text-lg">No students found</p>
                        <p className="text-gray-400 text-sm mt-1">Try adjusting filters or import a CSV sheet.</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-3xl border border-gray-150 shadow-sm overflow-hidden">
                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50/50">
                                        <th className="text-left px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Student Details</th>
                                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Class Assigned</th>
                                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Primary Guardian</th>
                                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Guardian Phone</th>
                                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                        <th className="px-4 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {students.map(s => (
                                        <tr 
                                            key={s.id} 
                                            className="hover:bg-gray-50/40 transition-colors cursor-pointer" 
                                            onClick={() => router.push(`/manage/students/${s.id}`)}
                                        >
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center text-lg shadow-inner shrink-0">
                                                        {genderIcon(s.gender)}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-900 leading-tight">{s.first_name} {s.last_name}</p>
                                                        <p className="text-xs text-gray-400 mt-0.5">{s.admission_number || 'No admission code'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100">
                                                    {s.class_section_name || '—'}
                                                </span>
                                                {s.roll_number && <span className="ml-1.5 text-xs text-gray-450 font-mono">#{s.roll_number}</span>}
                                            </td>
                                            <td className="px-4 py-4 text-xs font-semibold text-gray-700">{s.guardian_name || '—'}</td>
                                            <td className="px-4 py-4 text-xs font-bold text-emerald-800 flex items-center gap-1.5 pt-6">
                                                <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                {s.guardian_phone || '—'}
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                    s.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                    {s.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <ChevronRight className="w-5 h-5 text-gray-300 inline" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile List View */}
                        <div className="block md:hidden divide-y divide-gray-100">
                            {students.map(s => (
                                <div 
                                    key={s.id} 
                                    className="p-4 active:bg-gray-50 flex items-center justify-between" 
                                    onClick={() => router.push(`/manage/students/${s.id}`)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-xl shrink-0">
                                            {genderIcon(s.gender)}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900 leading-tight">{s.first_name} {s.last_name}</p>
                                            <p className="text-[11px] text-gray-400 mt-0.5">{s.class_section_name || 'No classroom'} • #{s.roll_number || '—'}</p>
                                            <p className="text-[10px] text-emerald-700 font-semibold mt-0.5 flex items-center gap-1">
                                                <Phone className="w-3 h-3" /> {s.guardian_phone || '—'}
                                            </p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-gray-350 shrink-0" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>


        </div>
    );
}
