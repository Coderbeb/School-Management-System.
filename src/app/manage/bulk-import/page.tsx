'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { AccessDenied } from '@/components/ui/access-denied';
import { 
    School, 
    BookOpen, 
    Users, 
    GraduationCap, 
    Download, 
    Upload, 
    CheckCircle, 
    AlertTriangle, 
    Loader2, 
    ArrowRight,
    Sparkles
} from 'lucide-react';

interface User {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
}

interface ImportSummary {
    classesCreated?: number;
    sectionsCreated?: number;
    classSectionsCreated?: number;
    subjectsCreated?: number;
    subjectsMapped?: number;
    teachersCreated?: number;
    assignmentsCreated?: number;
    studentsCreated?: number;
    enrollmentsCreated?: number;
    missingClasses?: string[];
    missingSubjects?: string[];
    missingClassrooms?: string[];
}

export default function BulkImportPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Active Wizard Step
    const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);

    // Step Statuses
    const [stepStatus, setStepStatus] = useState<Record<number, 'pending' | 'success' | 'error' | 'uploading'>>({
        1: 'pending',
        2: 'pending',
        3: 'pending',
        4: 'pending'
    });

    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [summaries, setSummaries] = useState<Record<number, ImportSummary | null>>({
        1: null,
        2: null,
        3: null,
        4: null
    });

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');

        if (!token || !userData) {
            router.replace('/login');
            return;
        }

        try {
            const parsedUser = JSON.parse(userData);
            setUser(parsedUser);
        } catch {
            router.replace('/login');
        }
        setLoading(false);
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    // Helper to download CSV templates
    const downloadTemplate = (step: number) => {
        let headers = '';
        let filename = '';
        
        if (step === 1) {
            headers = 'Class Name,Sections\n1,"A, B, C, D"\n2,"A, B"\n3,\nClass 9,"A, B, C"\nClass 10,"A, B, C, D"';
            filename = '1_classes_config.csv';
        } else if (step === 2) {
            headers = 'Subject Name,Subject Code,Classes\nMathematics,MATH,"9, 10"\nScience,SCI,"8, 9"\nEnglish,ENG,"1, 2, 3, 4, 5"';
            filename = '2_subjects_config.csv';
        } else if (step === 3) {
            headers = 'First Name,Last Name,Email,Subject Code,Class,Sections\nJohn,Doe,john@school.com,MATH,10,ALL\nSarah,Connor,sarah@school.com,SCI,9,"A, B"\nMichael,Scott,michael@school.com,ENG,10,C';
            filename = '3_teachers_config.csv';
        } else {
            headers = 'First Name,Last Name,Email,Roll No,Class,Section\nRahul,Kumar,rahul@school.com,101,10,A\nSneha,Sharma,sneha@school.com,102,10,A\nJoy,Tribbiani,joy@school.com,103,10,B';
            filename = '4_students_config.csv';
        }

        const blob = new Blob([headers], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Upload & Parse Handler
    const handleFileUpload = (step: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setErrorMsg(null);
        setStepStatus(prev => ({ ...prev, [step]: 'uploading' }));

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const csvText = event.target?.result as string;
                const token = localStorage.getItem('token');
                
                let endpoint = '';
                if (step === 1) endpoint = '/api/bulk-import/classes';
                else if (step === 2) endpoint = '/api/bulk-import/subjects';
                else if (step === 3) endpoint = '/api/bulk-import/teachers';
                else endpoint = '/api/bulk-import/students';

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ csvData: csvText })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to import CSV data');
                }

                setSummaries(prev => ({ ...prev, [step]: data.summary }));
                setStepStatus(prev => ({ ...prev, [step]: 'success' }));
                
                // Automatically prompt next step if available
                if (step < 4) {
                    setTimeout(() => {
                        setActiveStep((step + 1) as any);
                    }, 800);
                }
            } catch (err: any) {
                console.error(err);
                setErrorMsg(err.message || 'An error occurred during file upload');
                setStepStatus(prev => ({ ...prev, [step]: 'error' }));
            }
        };

        reader.readAsText(file);
    };

    if (loading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-12 h-12 border-4 border-violet-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (user.role !== 'super_admin') {
        return <AccessDenied />;
    }

    // Step Definition Map
    const stepsDef = [
        {
            num: 1,
            title: 'Classes Configuration',
            desc: 'Map class names and sections. Auto-generates section mappings.',
            icon: <School className="w-6 h-6" />,
            color: 'from-blue-500 to-indigo-600',
            bg: 'bg-blue-50',
            textColor: 'text-blue-700 font-semibold'
        },
        {
            num: 2,
            title: 'Subjects Setup',
            desc: 'Create subjects in bulk and assign them to grade levels instantly.',
            icon: <BookOpen className="w-6 h-6" />,
            color: 'from-violet-500 to-fuchsia-600',
            bg: 'bg-violet-50',
            textColor: 'text-violet-700 font-semibold'
        },
        {
            num: 3,
            title: 'Teachers Setup & Schedule',
            desc: 'Register teachers and link them to classrooms and subjects (ALL sections supported).',
            icon: <Users className="w-6 h-6" />,
            color: 'from-amber-500 to-orange-600',
            bg: 'bg-amber-50',
            textColor: 'text-amber-700 font-semibold'
        },
        {
            num: 4,
            title: 'Students Enrollment',
            desc: 'Admit students and enroll them in classrooms to auto-link with teachers.',
            icon: <GraduationCap className="w-6 h-6" />,
            color: 'from-emerald-500 to-teal-600',
            bg: 'bg-emerald-50',
            textColor: 'text-emerald-700 font-semibold'
        }
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 mt-16">
                
                <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-3">
                            <Sparkles className="w-8 h-8 text-violet-600 animate-pulse" />
                            Bulk School Configurator
                        </h1>
                        <p className="text-gray-500 mt-1">Configure your entire school year in minutes using organized CSV worksheets.</p>
                    </div>
                </div>

                {errorMsg && (
                    <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 mb-6 flex items-start gap-3 animate-fade-in shadow-sm">
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold text-sm">Upload/Validation Failed</p>
                            <p className="text-xs text-red-700 mt-0.5">{errorMsg}</p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* WIZARD TRACKER SIDEBAR */}
                    <div className="lg:col-span-1 space-y-4">
                        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4 sticky top-24">
                            <h3 className="font-bold text-gray-800 text-base">Setup Progress Map</h3>
                            <div className="space-y-3">
                                {stepsDef.map(s => {
                                    const isActive = activeStep === s.num;
                                    const status = stepStatus[s.num];
                                    
                                    return (
                                        <button 
                                            key={s.num}
                                            onClick={() => setActiveStep(s.num as any)}
                                            className={`w-full text-left p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
                                                isActive 
                                                    ? 'bg-violet-50/50 border-violet-200 shadow-sm ring-2 ring-violet-500/10' 
                                                    : 'bg-white border-gray-100 hover:border-gray-200'
                                            }`}
                                        >
                                            <div className={`p-2 rounded-lg shrink-0 ${
                                                status === 'success' ? 'bg-green-100 text-green-700' :
                                                status === 'error' ? 'bg-red-100 text-red-700' :
                                                isActive ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400'
                                            }`}>
                                                {status === 'success' ? <CheckCircle className="w-4 h-4" /> : s.icon}
                                            </div>
                                            <div className="min-w-0">
                                                <p className={`text-xs ${isActive ? 'text-violet-600 font-bold' : 'text-gray-400 font-medium'}`}>Step {s.num}</p>
                                                <p className="text-sm font-semibold text-gray-800 truncate">{s.title}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* DYNAMIC ACTIVE CARD */}
                    <div className="lg:col-span-2 space-y-6">
                        {stepsDef.map(s => {
                            if (activeStep !== s.num) return null;
                            const status = stepStatus[s.num];
                            const summary = summaries[s.num];

                            return (
                                <div key={s.num} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
                                    {/* Header Banner */}
                                    <div className={`bg-gradient-to-r ${s.color} p-6 text-white`}>
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm shrink-0">
                                                {s.icon}
                                            </div>
                                            <div>
                                                <span className="text-xs font-bold uppercase tracking-wider text-white/80">Step {s.num} of 4</span>
                                                <h2 className="text-xl sm:text-2xl font-bold">{s.title}</h2>
                                            </div>
                                        </div>
                                        <p className="text-sm text-white/90 leading-relaxed mt-2">{s.desc}</p>
                                    </div>

                                    <div className="p-6 sm:p-8 space-y-6">
                                        {/* Actions */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Download */}
                                            <button 
                                                onClick={() => downloadTemplate(s.num)}
                                                className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 hover:border-violet-500 rounded-2xl bg-gray-50/50 hover:bg-violet-50/20 group transition-all"
                                            >
                                                <Download className="w-7 h-7 text-gray-400 group-hover:text-violet-600 mb-2 transition-colors" />
                                                <span className="font-bold text-gray-800 text-sm group-hover:text-violet-700">1. Download Template</span>
                                                <span className="text-xs text-gray-400 mt-1">Get formatting instructions</span>
                                            </button>

                                            {/* Upload File Input */}
                                            <div className="relative">
                                                <input 
                                                    type="file" 
                                                    accept=".csv"
                                                    onChange={(e) => handleFileUpload(s.num, e)}
                                                    disabled={status === 'uploading'}
                                                    id={`upload-file-${s.num}`}
                                                    className="peer hidden"
                                                />
                                                <label 
                                                    htmlFor={`upload-file-${s.num}`}
                                                    className={`flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 hover:border-violet-500 rounded-2xl bg-gray-50/50 hover:bg-violet-50/20 cursor-pointer group transition-all h-full ${
                                                        status === 'uploading' ? 'opacity-65 pointer-events-none' : ''
                                                    }`}
                                                >
                                                    {status === 'uploading' ? (
                                                        <Loader2 className="w-7 h-7 text-violet-600 animate-spin mb-2" />
                                                    ) : (
                                                        <Upload className="w-7 h-7 text-gray-400 group-hover:text-violet-600 mb-2 transition-colors" />
                                                    )}
                                                    <span className="font-bold text-gray-800 text-sm group-hover:text-violet-700">
                                                        {status === 'uploading' ? 'Importing...' : '2. Upload Filled CSV'}
                                                    </span>
                                                    <span className="text-xs text-gray-400 mt-1">Select completed worksheet</span>
                                                </label>
                                            </div>
                                        </div>

                                        {/* Status Message Overlay */}
                                        {status === 'success' && summary && (
                                            <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-3">
                                                <div className="flex items-center gap-2 text-green-800 font-bold text-sm">
                                                    <CheckCircle className="w-5 h-5 shrink-0" />
                                                    Data Import Success!
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                                    {summary.classesCreated !== undefined && (
                                                        <div className="bg-white p-2.5 rounded-lg border border-green-100">
                                                            <span className="text-gray-400 block font-medium">Classes Built</span>
                                                            <strong className="text-green-700 text-sm font-bold">{summary.classesCreated}</strong>
                                                        </div>
                                                    )}
                                                    {summary.classSectionsCreated !== undefined && (
                                                        <div className="bg-white p-2.5 rounded-lg border border-green-100">
                                                            <span className="text-gray-400 block font-medium">Classrooms Formed</span>
                                                            <strong className="text-green-700 text-sm font-bold">{summary.classSectionsCreated}</strong>
                                                        </div>
                                                    )}
                                                    {summary.subjectsCreated !== undefined && (
                                                        <div className="bg-white p-2.5 rounded-lg border border-green-100">
                                                            <span className="text-gray-400 block font-medium">Subjects Logged</span>
                                                            <strong className="text-green-700 text-sm font-bold">{summary.subjectsCreated}</strong>
                                                        </div>
                                                    )}
                                                    {summary.subjectsMapped !== undefined && (
                                                        <div className="bg-white p-2.5 rounded-lg border border-green-100">
                                                            <span className="text-gray-400 block font-medium">Class Mappings</span>
                                                            <strong className="text-green-700 text-sm font-bold">{summary.subjectsMapped}</strong>
                                                        </div>
                                                    )}
                                                    {summary.teachersCreated !== undefined && (
                                                        <div className="bg-white p-2.5 rounded-lg border border-green-100">
                                                            <span className="text-gray-400 block font-medium">Teachers Created</span>
                                                            <strong className="text-green-700 text-sm font-bold">{summary.teachersCreated}</strong>
                                                        </div>
                                                    )}
                                                    {summary.assignmentsCreated !== undefined && (
                                                        <div className="bg-white p-2.5 rounded-lg border border-green-100">
                                                            <span className="text-gray-400 block font-medium">Assignments Mapped</span>
                                                            <strong className="text-green-700 text-sm font-bold">{summary.assignmentsCreated}</strong>
                                                        </div>
                                                    )}
                                                    {summary.studentsCreated !== undefined && (
                                                        <div className="bg-white p-2.5 rounded-lg border border-green-100">
                                                            <span className="text-gray-400 block font-medium">Portal Accounts</span>
                                                            <strong className="text-green-700 text-sm font-bold">{summary.studentsCreated}</strong>
                                                        </div>
                                                    )}
                                                    {summary.enrollmentsCreated !== undefined && (
                                                        <div className="bg-white p-2.5 rounded-lg border border-green-100">
                                                            <span className="text-gray-400 block font-medium">Class Enrollments</span>
                                                            <strong className="text-green-700 text-sm font-bold">{summary.enrollmentsCreated}</strong>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Missing Class Warnings */}
                                                {summary.missingClasses && summary.missingClasses.length > 0 && (
                                                    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3.5 text-xs">
                                                        <strong className="block mb-1">⚠️ Missing Classes (Skipped Mapping):</strong>
                                                        <p className="text-gray-600">{summary.missingClasses.join(', ')}</p>
                                                    </div>
                                                )}

                                                {/* Missing Subject Warnings */}
                                                {summary.missingSubjects && summary.missingSubjects.length > 0 && (
                                                    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3.5 text-xs">
                                                        <strong className="block mb-1">⚠️ Missing Subject Codes (Skipped):</strong>
                                                        <p className="text-gray-600">{summary.missingSubjects.join(', ')}</p>
                                                    </div>
                                                )}

                                                {/* Missing Classrooms Warnings */}
                                                {summary.missingClassrooms && summary.missingClassrooms.length > 0 && (
                                                    <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3.5 text-xs">
                                                        <strong className="block mb-1">⚠️ Classroom Mappings Not Found (Skipped):</strong>
                                                        <p className="text-gray-600">{summary.missingClassrooms.join(', ')}</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Bottom Navigation */}
                                        <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                                            <button 
                                                disabled={s.num === 1}
                                                onClick={() => setActiveStep((s.num - 1) as any)}
                                                className={`text-sm font-bold ${
                                                    s.num === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-gray-800'
                                                }`}
                                            >
                                                Back
                                            </button>

                                            <button 
                                                onClick={() => {
                                                    if (s.num < 4) {
                                                        setActiveStep((s.num + 1) as any);
                                                    } else {
                                                        router.push('/dashboard');
                                                    }
                                                }}
                                                className="px-5 py-2.5 rounded-xl bg-gray-900 text-white font-bold hover:bg-gray-800 text-sm flex items-center gap-1.5 active:scale-95 transition-transform"
                                            >
                                                {s.num === 4 ? 'Finish Setup' : 'Next Step'}
                                                <ArrowRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </main>
        </div>
    );
}
