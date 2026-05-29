'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    GraduationCap, CalendarDays, BarChart3, BookOpen, IndianRupee,
    ChevronRight, CheckCircle, XCircle, Clock, Loader2, User
} from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: string; }
interface StudentInfo { class_name: string; section_name: string; roll_number: number | null; admission_number: string; }
interface AttendanceSummary { total: number; present: number; absent: number; late: number; percentage: string; }

export default function StudentDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
    const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    const currentMonth = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'student') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchStudentData(token);
    }, [router]);

    const fetchStudentData = async (token: string) => {
        setLoading(true);
        try {
            // Fetch student info
            const infoRes = await fetch('/api/sms/student-subjects', { headers: { Authorization: `Bearer ${token}` } });
            if (infoRes.ok) {
                const infoData = await infoRes.json();
                if (infoData.subjects?.length > 0) {
                    const s = infoData.subjects[0];
                    setStudentInfo({ class_name: s.class_section_name?.split(' - ')[0] || '', section_name: s.class_section_name?.split(' - ')[1] || '', roll_number: null, admission_number: '' });
                }
            }

            // Fetch this month's attendance
            const now = new Date();
            const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const attendRes = await fetch(`/api/sms/student-attendance?month=${monthStr}`, { headers: { Authorization: `Bearer ${token}` } });
            if (attendRes.ok) {
                const attendData = await attendRes.json();
                const records = attendData.records || [];
                const total = records.length;
                const present = records.filter((r: any) => r.status === 'present').length;
                const absent = records.filter((r: any) => r.status === 'absent').length;
                const late = records.filter((r: any) => r.status === 'late').length;
                const pct = total > 0 ? ((present + late) / total * 100).toFixed(1) : '0.0';
                setAttendance({ total, present, absent, late, percentage: pct });
            }
        } catch { /* silent */ }
        setLoading(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const cards = [
        { title: 'My Attendance', desc: 'View your attendance calendar', icon: <CalendarDays className="w-6 h-6" />, href: '/student/attendance', gradient: 'from-emerald-100 to-teal-100', color: 'text-emerald-700', border: 'border-emerald-200' },
        { title: 'My Results', desc: 'Exam marks and report card', icon: <BarChart3 className="w-6 h-6" />, href: '/student/results', gradient: 'from-violet-100 to-purple-100', color: 'text-violet-700', border: 'border-violet-200' },
        { title: 'My Subjects', desc: 'Subjects and teachers', icon: <BookOpen className="w-6 h-6" />, href: '/student/subjects', gradient: 'from-blue-100 to-indigo-100', color: 'text-blue-700', border: 'border-blue-200' },
        { title: 'Fee Status', desc: 'Pending dues and receipts', icon: <IndianRupee className="w-6 h-6" />, href: '/student/fees', gradient: 'from-amber-100 to-orange-100', color: 'text-amber-700', border: 'border-amber-200' },
    ];

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">
                {/* Welcome Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-8 mb-8 shadow-xl">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" />
                    <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-20" />
                    <div className="relative z-10">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-xl font-bold mb-1">Hello, {user?.firstName}! 👋</h1>
                                <p className="text-emerald-200 text-sm">Welcome to your student portal.</p>
                            </div>
                            <GraduationCap className="w-10 h-10 text-white/30" />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium">
                                <CalendarDays className="w-3.5 h-3.5" /> {todayLabel}
                            </span>
                            {studentInfo && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-xs font-medium text-emerald-300">
                                    <User className="w-3.5 h-3.5" /> {studentInfo.class_name} {studentInfo.section_name ? `- ${studentInfo.section_name}` : ''}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center py-12 gap-3">
                        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                        <p className="text-gray-400 text-sm">Loading your data...</p>
                    </div>
                ) : (
                    <>
                        {/* This Month's Attendance Summary */}
                        {attendance && attendance.total > 0 && (
                            <div className="mb-6">
                                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">
                                    {currentMonth} — Attendance
                                </h2>
                                <div className="grid grid-cols-4 gap-2">
                                    <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-3 text-center">
                                        <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                                        <div className="text-lg font-bold text-emerald-700">{attendance.present}</div>
                                        <div className="text-[10px] text-emerald-600 font-medium">Present</div>
                                    </div>
                                    <div className="bg-red-50 rounded-xl border border-red-100 p-3 text-center">
                                        <XCircle className="w-4 h-4 text-red-500 mx-auto mb-1" />
                                        <div className="text-lg font-bold text-red-700">{attendance.absent}</div>
                                        <div className="text-[10px] text-red-600 font-medium">Absent</div>
                                    </div>
                                    <div className="bg-amber-50 rounded-xl border border-amber-100 p-3 text-center">
                                        <Clock className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                                        <div className="text-lg font-bold text-amber-700">{attendance.late}</div>
                                        <div className="text-[10px] text-amber-600 font-medium">Late</div>
                                    </div>
                                    <div className="bg-blue-50 rounded-xl border border-blue-100 p-3 text-center">
                                        <BarChart3 className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                                        <div className="text-lg font-bold text-blue-700">{attendance.percentage}%</div>
                                        <div className="text-[10px] text-blue-600 font-medium">Overall</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Quick Navigation Cards */}
                        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Quick Access</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-5">
                            {cards.map(card => (
                                <div key={card.href} onClick={() => router.push(card.href)}
                                    className={`group bg-white border ${card.border} rounded-2xl p-5 cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden relative`}>
                                    <div className={`absolute -right-6 -top-6 w-20 h-20 rounded-full bg-gradient-to-br ${card.gradient} opacity-20 group-hover:scale-150 transition-transform duration-500`} />
                                    <div className={`p-2.5 w-fit rounded-xl bg-gradient-to-br ${card.gradient} ${card.color} mb-3`}>{card.icon}</div>
                                    <p className="font-bold text-gray-900 text-sm">{card.title}</p>
                                    <p className="text-xs text-gray-500 mt-0.5 leading-snug">{card.desc}</p>
                                    <ChevronRight className="w-4 h-4 text-gray-300 mt-2 group-hover:text-blue-500 transition-colors" />
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
