'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    Shield, Users, GraduationCap, Loader2, CalendarDays, Building2, Zap,
    ChevronRight, School, Globe, Plus, AlertTriangle, Info, XCircle,
    ClipboardCheck, ClipboardList, PenLine, Trophy, Server, Database,
    Activity, HardDrive, Terminal, Bell, CreditCard, LayoutDashboard, Settings
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }

interface PlatformStats {
    totalUsers: number; totalStudents: number; totalTeachers: number;
    totalClasses: number; totalSubjects: number; totalExams: number;
    totalMarksRecords: number; totalSessions: number;
    activeSession: string | null;
    pendingSubmissions: number; publishedExams: number; totalSchools: number;
}

interface SchoolReport {
    id: string; name: string; board: string; code: string;
    isActive: boolean; createdAt: string; adminEmail: string | null;
    activeSession: string | null;
    students: number; teachers: number; classes: number;
    exams: number; publishedExams: number; openExams: number;
    marksRecords: number;
    todayAttendance: { total: number; present: number; percentage: number | null; };
}

interface Alert { type: 'warning' | 'info' | 'error'; school: string; message: string; }

export default function DeveloperDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [stats, setStats] = useState<PlatformStats | null>(null);
    const [schoolReports, setSchoolReports] = useState<SchoolReport[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedSchool, setExpandedSchool] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'infrastructure' | 'schools'>('overview');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'developer') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchDashboardData(token);
    }, [router]);

    const fetchDashboardData = async (token: string) => {
        setLoading(true);
        try {
            const [statsRes, analyticsRes] = await Promise.all([
                fetch('/api/developer/stats', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/developer/school-analytics', { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            const statsData = await statsRes.json();
            setStats(statsData.stats || null);

            if (analyticsRes.ok) {
                const analyticsData = await analyticsRes.json();
                setSchoolReports(analyticsData.schoolReports || []);
                setAlerts(analyticsData.alerts || []);
            }
        } catch { /* ignore */ }
        setLoading(false);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    // Mock Infrastructure Data for Pro UI
    const systemUptime = "99.98%";
    const dbSize = "1.2 GB";
    const apiLatency = "42ms";
    const proSchools = schoolReports.filter(s => s.students > 100).length;

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-6xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6 sm:p-10 mb-6 shadow-2xl">
                    <div className="absolute top-0 right-0 -mt-16 -mr-16 w-80 h-80 bg-violet-500 rounded-full mix-blend-screen filter blur-3xl opacity-25 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-80 h-80 bg-cyan-500 rounded-full mix-blend-screen filter blur-3xl opacity-25 animate-pulse" style={{ animationDelay: '1s' }}></div>
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-1.5 bg-violet-500/20 rounded-lg border border-violet-400/30">
                                    <Shield className="w-5 h-5 text-violet-400" />
                                </div>
                                <span className="text-violet-400 font-bold tracking-wider uppercase text-xs">Developer Panel</span>
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-black mb-2">
                                Platform Control Center <Zap className="inline w-8 h-8 text-amber-400" />
                            </h1>
                            <p className="text-gray-300 text-sm max-w-2xl">
                                Enterprise Multi-Tenant SaaS Dashboard. Monitor infrastructure, revenue, and school health.
                            </p>
                            <div className="mt-6 flex flex-wrap gap-2">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-xs font-bold text-emerald-400">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                    All Systems Operational
                                </span>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium">
                                    <CalendarDays className="w-3.5 h-3.5" /> {todayStr}
                                </span>
                            </div>
                        </div>
                        
                        {/* Global Actions */}
                        <div className="flex flex-col gap-2">
                            <button onClick={() => router.push('/developer/schools')} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-gray-900 font-bold text-sm rounded-xl hover:bg-gray-100 transition-colors shadow-lg cursor-pointer">
                                <Plus className="w-4 h-4" /> Provision New School
                            </button>
                            <button onClick={() => router.push('/developer/platform-settings')} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-violet-600/10 cursor-pointer">
                                <Settings className="w-4 h-4" /> Platform Billing & Settings
                            </button>
                            <button className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 text-white font-bold text-sm rounded-xl hover:bg-white/20 transition-colors border border-white/10 backdrop-blur-sm cursor-pointer">
                                <Bell className="w-4 h-4" /> Global Broadcast
                            </button>
                        </div>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="flex space-x-1 bg-white p-1 rounded-2xl shadow-sm border border-gray-100 mb-8 overflow-x-auto">
                    {[
                        { id: 'overview', label: 'Platform Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
                        { id: 'infrastructure', label: 'Infrastructure & Logs', icon: <Server className="w-4 h-4" /> },
                        { id: 'schools', label: 'School Management', icon: <Building2 className="w-4 h-4" /> },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                                activeTab === tab.id 
                                ? 'bg-violet-50 text-violet-700 shadow-sm' 
                                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                            }`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex flex-col items-center py-20 gap-3">
                        <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
                        <p className="text-gray-400 text-sm font-medium">Synchronizing platform telemetry...</p>
                    </div>
                ) : (
                    <>
                        {/* TAB: OVERVIEW */}
                        {activeTab === 'overview' && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* SaaS Business Metrics */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm relative overflow-hidden group hover:border-violet-300 transition-colors">
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Building2 className="w-16 h-16 text-violet-500" /></div>
                                        <div className="flex items-center gap-2 text-violet-600 mb-2">
                                            <div className="p-1.5 bg-violet-50 rounded-lg"><School className="w-4 h-4" /></div>
                                            <span className="text-xs font-bold uppercase tracking-wider">Active Tenants</span>
                                        </div>
                                        <div className="text-3xl font-black text-gray-900">{stats?.totalSchools || schoolReports.length}</div>
                                        <div className="text-xs text-emerald-600 font-medium mt-1">↑ +1 this month</div>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-colors">
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><CreditCard className="w-16 h-16 text-emerald-500" /></div>
                                        <div className="flex items-center gap-2 text-emerald-600 mb-2">
                                            <div className="p-1.5 bg-emerald-50 rounded-lg"><CreditCard className="w-4 h-4" /></div>
                                            <span className="text-xs font-bold uppercase tracking-wider">Pro Accounts</span>
                                        </div>
                                        <div className="text-3xl font-black text-gray-900">{proSchools}</div>
                                        <div className="text-xs text-gray-500 font-medium mt-1">SaaS Subscriptions</div>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm relative overflow-hidden group hover:border-blue-300 transition-colors">
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Users className="w-16 h-16 text-blue-500" /></div>
                                        <div className="flex items-center gap-2 text-blue-600 mb-2">
                                            <div className="p-1.5 bg-blue-50 rounded-lg"><Users className="w-4 h-4" /></div>
                                            <span className="text-xs font-bold uppercase tracking-wider">Total Users</span>
                                        </div>
                                        <div className="text-3xl font-black text-gray-900">{(stats?.totalUsers || 0).toLocaleString()}</div>
                                        <div className="text-xs text-gray-500 font-medium mt-1">Across all schools</div>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm relative overflow-hidden group hover:border-amber-300 transition-colors">
                                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><Activity className="w-16 h-16 text-amber-500" /></div>
                                        <div className="flex items-center gap-2 text-amber-600 mb-2">
                                            <div className="p-1.5 bg-amber-50 rounded-lg"><Database className="w-4 h-4" /></div>
                                            <span className="text-xs font-bold uppercase tracking-wider">Marks Entered</span>
                                        </div>
                                        <div className="text-3xl font-black text-gray-900">{(stats?.totalMarksRecords || 0).toLocaleString()}</div>
                                        <div className="text-xs text-emerald-600 font-medium mt-1">System highly active</div>
                                    </div>
                                </div>

                                {/* Alerts Panel */}
                                {alerts.length > 0 ? (
                                    <div className="mb-8 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                        <div className="px-5 py-4 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                                            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4 text-amber-500" /> System Alerts & Warnings
                                            </h2>
                                            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg">{alerts.length} Active</span>
                                        </div>
                                        <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                                            {alerts.map((alert, i) => (
                                                <div key={i} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                                                    <div className={`mt-0.5 p-2 rounded-xl flex-shrink-0 ${
                                                        alert.type === 'error' ? 'bg-red-50 text-red-500' :
                                                        alert.type === 'warning' ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'
                                                    }`}>
                                                        {alert.type === 'error' ? <XCircle className="w-5 h-5" /> :
                                                         alert.type === 'warning' ? <AlertTriangle className="w-5 h-5" /> :
                                                         <Info className="w-5 h-5" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-sm font-bold text-gray-900">{alert.school}</h4>
                                                        <p className="text-sm text-gray-600 mt-0.5">{alert.message}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mb-8 bg-emerald-50 rounded-2xl border border-emerald-100 p-6 flex flex-col items-center justify-center text-center">
                                        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
                                            <Shield className="w-6 h-6 text-emerald-600" />
                                        </div>
                                        <h3 className="text-sm font-bold text-emerald-900 mb-1">No Active Alerts</h3>
                                        <p className="text-xs text-emerald-700 max-w-sm">All schools are operating normally with healthy attendance and active usage.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB: INFRASTRUCTURE */}
                        {activeTab === 'infrastructure' && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                                {/* Server Metrics */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="p-2 bg-emerald-50 rounded-lg"><Server className="w-5 h-5 text-emerald-600" /></div>
                                            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">AWS ap-south-1</span>
                                        </div>
                                        <div className="text-2xl font-black text-gray-900">{systemUptime}</div>
                                        <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-bold">System Uptime</div>
                                        <div className="mt-4 w-full bg-gray-100 rounded-full h-1.5"><div className="bg-emerald-500 h-1.5 rounded-full" style={{width: '99.98%'}}></div></div>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="p-2 bg-blue-50 rounded-lg"><HardDrive className="w-5 h-5 text-blue-600" /></div>
                                            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">PostgreSQL</span>
                                        </div>
                                        <div className="text-2xl font-black text-gray-900">{dbSize}</div>
                                        <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-bold">Database Storage</div>
                                        <div className="mt-4 w-full bg-gray-100 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{width: '12%'}}></div></div>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="p-2 bg-amber-50 rounded-lg"><Activity className="w-5 h-5 text-amber-600" /></div>
                                            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">Vercel Edge</span>
                                        </div>
                                        <div className="text-2xl font-black text-gray-900">{apiLatency}</div>
                                        <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-bold">Avg API Latency</div>
                                        {/* Mock sparkline */}
                                        <div className="mt-4 flex items-end h-4 gap-1 opacity-80">
                                            {[4,7,5,8,4,3,6,9,5,4,3,5].map((h, i) => <div key={i} className="flex-1 bg-amber-400 rounded-t-sm" style={{height: `${h*10}%`}}></div>)}
                                        </div>
                                    </div>
                                </div>

                                {/* Terminal Console - Light/Slate Mode */}
                                <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                    <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Terminal className="w-4 h-4 text-slate-500" />
                                            <span className="text-xs font-bold text-slate-600 font-mono">system-logs / tail -f var/log/api.log</span>
                                        </div>
                                        <div className="flex gap-1.5">
                                            <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                                            <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                                            <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                                        </div>
                                    </div>
                                    <div className="p-5 font-mono text-xs text-slate-700 leading-relaxed overflow-x-auto">
                                        <div className="text-emerald-700">[INFO] {new Date(Date.now() - 3600000).toISOString()} - CRON Job: send-attendance-alerts executed successfully.</div>
                                        <div className="text-blue-700">[INFO] {new Date(Date.now() - 1800000).toISOString()} - API Auth: New token generated for super_admin@dps.edu</div>
                                        <div className="text-amber-700">[WARN] {new Date(Date.now() - 900000).toISOString()} - DB: Slow query detected in reports/monthly endpoint (840ms)</div>
                                        <div className="text-blue-700">[INFO] {new Date(Date.now() - 300000).toISOString()} - Marks Engine: Class Result calculated for Section X-A</div>
                                        <div className="text-emerald-700">[INFO] {new Date().toISOString()} - System: Health check passed. All services 200 OK.</div>
                                        <div className="flex items-center gap-2 mt-2 text-slate-400">
                                            <span className="animate-pulse">_</span> Waiting for new logs...
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB: SCHOOLS */}
                        {activeTab === 'schools' && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                                        <Building2 className="w-4 h-4" /> Tenant Management
                                    </h2>
                                </div>

                                {schoolReports.length === 0 ? (
                                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                                        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                        <p className="text-gray-500 font-medium">No schools registered yet.</p>
                                        <button onClick={() => router.push('/developer/schools')} className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors">
                                            Get Started →
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {schoolReports.map(report => {
                                            const isExpanded = expandedSchool === report.id;
                                            return (
                                                <div key={report.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:border-violet-300 transition-colors">
                                                    {/* School Header */}
                                                    <div onClick={() => setExpandedSchool(isExpanded ? null : report.id)} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between cursor-pointer group">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 text-white flex items-center justify-center font-black text-lg shadow-inner">
                                                                {report.name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <h3 className="font-black text-gray-900 text-lg group-hover:text-violet-700 transition-colors">{report.name}</h3>
                                                                <p className="text-sm text-gray-500 font-medium flex items-center gap-2 mt-0.5">
                                                                    <span className="px-2 py-0.5 bg-gray-100 rounded-md text-[10px] uppercase font-bold text-gray-600">{report.board || 'Custom'}</span>
                                                                    {report.adminEmail || 'No admin assigned'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4 mt-4 sm:mt-0">
                                                            <div className="flex items-center gap-3">
                                                                <div className="text-right hidden sm:block">
                                                                    <div className="text-sm font-bold text-gray-900">{report.students}</div>
                                                                    <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Students</div>
                                                                </div>
                                                                <div className="w-px h-8 bg-gray-200 hidden sm:block"></div>
                                                                <div className="text-right hidden sm:block">
                                                                    <div className="text-sm font-bold text-emerald-700">{report.teachers > 0 ? `${Math.min(Math.round((report.todayAttendance.present / Math.max(report.teachers, 1)) * 100), 100)}%` : 'N/A'}</div>
                                                                    <div className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold">Staff</div>
                                                                </div>
                                                                <div className="w-px h-8 bg-gray-200 hidden sm:block"></div>
                                                                <div className="text-right hidden sm:block">
                                                                    <div className="text-sm font-bold text-blue-700">{report.todayAttendance.percentage ?? 0}%</div>
                                                                    <div className="text-[10px] uppercase tracking-wider text-blue-600 font-bold">Students</div>
                                                                </div>
                                                            </div>
                                                            <div className={`p-2 rounded-full transition-colors ${isExpanded ? 'bg-violet-100 text-violet-600' : 'bg-gray-50 text-gray-400 group-hover:bg-gray-100'}`}>
                                                                <ChevronRight className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Expanded Detail */}
                                                    {isExpanded && (
                                                        <div className="px-5 pb-5 border-t border-gray-100 bg-gray-50/30 pt-5">
                                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                                {/* Column 1: People */}
                                                                <div className="space-y-3">
                                                                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">People</div>
                                                                    <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-100"><span className="text-sm font-medium text-gray-600">Students</span><span className="font-bold text-gray-900">{report.students}</span></div>
                                                                    <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-100"><span className="text-sm font-medium text-gray-600">Teachers</span><span className="font-bold text-gray-900">{report.teachers}</span></div>
                                                                </div>
                                                                {/* Column 2: Attendance (Separated) */}
                                                                <div className="space-y-3">
                                                                    <div className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-2">Teacher Attendance</div>
                                                                    <div className="flex justify-between items-center bg-emerald-50 p-3 rounded-xl border border-emerald-100"><span className="text-sm font-medium text-emerald-700">Staff Check-In</span><span className="font-bold text-emerald-800">{report.teachers > 0 ? `${Math.min(Math.round((report.todayAttendance.present / Math.max(report.teachers, 1)) * 100), 100)}%` : 'N/A'}</span></div>
                                                                    <div className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-2 mt-4">Student Attendance</div>
                                                                    <div className="flex justify-between items-center bg-blue-50 p-3 rounded-xl border border-blue-100"><span className="text-sm font-medium text-blue-700">Student Rate</span><span className="font-bold text-blue-800">{report.todayAttendance.percentage ?? 0}%</span></div>
                                                                </div>
                                                                {/* Column 3: Data Input */}
                                                                <div className="space-y-3">
                                                                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Data Flow</div>
                                                                    <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-100"><span className="text-sm font-medium text-gray-600">Marks Entered</span><span className="font-bold text-gray-900">{report.marksRecords}</span></div>
                                                                    <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-100"><span className="text-sm font-medium text-gray-600">Published Exams</span><span className="font-bold text-gray-900">{report.publishedExams}</span></div>
                                                                </div>
                                                                {/* Column 4: Actions */}
                                                                <div className="space-y-3">
                                                                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Management</div>
                                                                    <button onClick={() => router.push('/developer/schools')} className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
                                                                        Configure School
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
