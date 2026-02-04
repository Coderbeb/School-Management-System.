'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Users, BookOpen, AlertCircle, AlertTriangle, Building2, TrendingUp, GraduationCap, ChevronRight } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';

interface User {
    id: string;
    role: 'super_admin' | 'hod' | 'teacher';
    firstName: string;
    lastName: string;
    email: string;
    departmentId?: string;
}

interface Department {
    id: string;
    name: string;
    code: string;
}

interface SemesterStat {
    semester: number;
    totalStudents: number;
    avgAttendance: number;
}

interface SubjectStat {
    id: string;
    name: string;
    code: string;
    semester: number;
    totalStudents: number;
    avgAttendance: number;
}

interface StudentAlert {
    id: string;
    rollNumber: string;
    name: string;
    semester: number;
    attendancePercentage: number;
}

interface DepartmentData {
    department: Department & { degreeType: string };
    overallStats: {
        totalStudents: number;
        totalSubjects: number;
        criticalCount: number;
        warningCount: number;
    };
    semesterStats: SemesterStat[];
    subjectStats: SubjectStat[];
    criticalStudents: StudentAlert[];
    warningStudents: StudentAlert[];
}

export default function DepartmentOverviewPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [data, setData] = useState<DepartmentData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'semester' | 'subject' | 'critical' | 'warning'>('semester');

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.push('/login');
            return;
        }
        const parsedUser = JSON.parse(userData);
        
        if (parsedUser.role === 'teacher') {
            router.push('/reports');
            return;
        }

        setUser({
            ...parsedUser,
            lastName: parsedUser.lastName || '',
            email: parsedUser.email || '',
            firstName: parsedUser.firstName || 'User'
        });

        if (parsedUser.role === 'super_admin') {
            fetchDepartments(token);
        } else {
            if (parsedUser.departmentId) {
                setSelectedDepartmentId(parsedUser.departmentId);
            } else {
                setLoading(false);
            }
        }
    }, [router]);

    useEffect(() => {
        if (selectedDepartmentId) {
            fetchDepartmentData();
        }
    }, [selectedDepartmentId]);

    const fetchDepartments = async (token: string) => {
        try {
            const res = await fetch('/api/departments', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const result = await res.json();
            const depts = result.departments || [];
            setDepartments(depts);
            if (depts.length > 0) {
                setSelectedDepartmentId(depts[0].id);
            } else {
                setLoading(false);
            }
        } catch (err) {
            console.error('Error fetching departments:', err);
            setLoading(false);
        }
    };

    const fetchDepartmentData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/reports/department?departmentId=${selectedDepartmentId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.push('/login');
                return;
            }
            if (res.status === 403) {
                router.push('/reports');
                return;
            }
            const result = await res.json();
            if (result.error) {
                setData(null);
            } else {
                setData(result);
            }
        } catch (err) {
            console.error('Error fetching department data:', err);
            setData(null);
        }
        setLoading(false);
    };

    const getAttendanceColor = (percentage: number) => {
        if (percentage >= 75) return 'text-emerald-600';
        if (percentage >= 60) return 'text-amber-600';
        return 'text-red-600';
    };

    const getProgressGradient = (percentage: number) => {
        if (percentage >= 75) return 'from-emerald-400 to-emerald-600';
        if (percentage >= 60) return 'from-amber-400 to-amber-600';
        return 'from-red-400 to-red-600';
    };

    const getBgColor = (percentage: number) => {
        if (percentage >= 75) return 'bg-emerald-50 border-emerald-200';
        if (percentage >= 60) return 'bg-amber-50 border-amber-200';
        return 'bg-red-50 border-red-200';
    };

    if (!user) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-indigo-50 flex flex-col pt-16">
            <MobileSidebar 
                isOpen={sidebarOpen} 
                onClose={() => setSidebarOpen(false)} 
                user={user}
                onLogout={handleLogout}
            />

            <Navbar 
                user={user} 
                onMenuClick={() => setSidebarOpen(true)}
                onLogout={handleLogout}
            />

            {/* Enhanced Header */}
            <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/2"></div>
                </div>
                
                <div className="max-w-7xl mx-auto px-4 py-8 relative">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center space-x-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push('/reports')}
                                className="text-white/90 hover:bg-white/20 hover:text-white"
                            >
                                <ArrowLeft className="w-4 h-4 mr-1" />
                                Back
                            </Button>
                            <div>
                                <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                                        <Building2 className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h1 className="text-2xl md:text-3xl font-bold">Department Overview</h1>
                                        {data?.department && (
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="px-2 py-0.5 bg-white/20 rounded-full text-sm backdrop-blur-sm">
                                                    {data.department.name}
                                                </span>
                                                <span className="px-2 py-0.5 bg-white/10 rounded-full text-xs">
                                                    {data.department.code}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Department selector */}
                        {user.role === 'super_admin' && departments.length > 0 && (
                            <select
                                value={selectedDepartmentId}
                                onChange={(e) => setSelectedDepartmentId(e.target.value)}
                                className="bg-white/20 text-white border border-white/30 rounded-xl px-4 py-2.5 text-sm backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/50"
                            >
                                {departments.map(dept => (
                                    <option key={dept.id} value={dept.id} className="text-gray-900">
                                        {dept.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                        <p className="text-gray-500">Loading department data...</p>
                    </div>
                ) : !data || !data.overallStats ? (
                    <Card className="p-12 text-center border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                        <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                            <AlertCircle className="w-10 h-10 text-gray-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">No Data Available</h3>
                        <p className="text-gray-500 max-w-md mx-auto">
                            No attendance data found for this department. Make sure attendance has been marked for students.
                        </p>
                    </Card>
                ) : (
                    <div className="space-y-8">
                        {/* Stats Cards - Enhanced */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                            <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500 to-purple-600 text-white overflow-hidden relative group hover:shadow-xl transition-shadow">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                <CardContent className="p-5 md:p-6 relative">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-purple-100 text-xs md:text-sm uppercase tracking-wide font-medium">Total Students</p>
                                            <p className="text-3xl md:text-4xl font-bold mt-2">{data.overallStats.totalStudents}</p>
                                        </div>
                                        <div className="p-2 md:p-3 bg-white/20 rounded-xl">
                                            <Users className="w-5 h-5 md:w-6 md:h-6" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            
                            <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white overflow-hidden relative group hover:shadow-xl transition-shadow">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                <CardContent className="p-5 md:p-6 relative">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-blue-100 text-xs md:text-sm uppercase tracking-wide font-medium">Subjects</p>
                                            <p className="text-3xl md:text-4xl font-bold mt-2">{data.overallStats.totalSubjects}</p>
                                        </div>
                                        <div className="p-2 md:p-3 bg-white/20 rounded-xl">
                                            <BookOpen className="w-5 h-5 md:w-6 md:h-6" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            
                            <Card className="border-0 shadow-lg bg-gradient-to-br from-red-500 to-rose-600 text-white overflow-hidden relative group hover:shadow-xl transition-shadow">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                <CardContent className="p-5 md:p-6 relative">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-red-100 text-xs md:text-sm uppercase tracking-wide font-medium">Critical (&lt;60%)</p>
                                            <p className="text-3xl md:text-4xl font-bold mt-2">{data.overallStats.criticalCount}</p>
                                        </div>
                                        <div className="p-2 md:p-3 bg-white/20 rounded-xl">
                                            <AlertCircle className="w-5 h-5 md:w-6 md:h-6" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            
                            <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white overflow-hidden relative group hover:shadow-xl transition-shadow">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                                <CardContent className="p-5 md:p-6 relative">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-amber-100 text-xs md:text-sm uppercase tracking-wide font-medium">Warning (60-75%)</p>
                                            <p className="text-3xl md:text-4xl font-bold mt-2">{data.overallStats.warningCount}</p>
                                        </div>
                                        <div className="p-2 md:p-3 bg-white/20 rounded-xl">
                                            <AlertTriangle className="w-5 h-5 md:w-6 md:h-6" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Tabs - Enhanced */}
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {[
                                { id: 'semester', label: 'Semester-wise', icon: GraduationCap, count: data.semesterStats.length },
                                { id: 'subject', label: 'Subject-wise', icon: BookOpen, count: data.subjectStats.length },
                                { id: 'critical', label: 'Critical', icon: AlertCircle, count: data.overallStats.criticalCount, color: 'red' },
                                { id: 'warning', label: 'Warning', icon: AlertTriangle, count: data.overallStats.warningCount, color: 'amber' },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                    className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                                        activeTab === tab.id
                                            ? 'bg-purple-600 text-white shadow-lg shadow-purple-200'
                                            : 'bg-white text-gray-600 hover:bg-gray-50 shadow-md'
                                    }`}
                                >
                                    <tab.icon className="w-4 h-4" />
                                    <span className="hidden sm:inline">{tab.label}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                                        activeTab === tab.id 
                                            ? 'bg-white/20' 
                                            : tab.color === 'red' 
                                                ? 'bg-red-100 text-red-600' 
                                                : tab.color === 'amber' 
                                                    ? 'bg-amber-100 text-amber-600' 
                                                    : 'bg-purple-100 text-purple-600'
                                    }`}>
                                        {tab.count}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
                            <CardContent className="p-6">
                                {/* Semester-wise Tab */}
                                {activeTab === 'semester' && (
                                    <div className="space-y-4">
                                        {data.semesterStats.length === 0 ? (
                                            <div className="text-center py-12">
                                                <GraduationCap className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                                                <p className="text-gray-500">No semester data available</p>
                                            </div>
                                        ) : (
                                            data.semesterStats.map(sem => (
                                                <div 
                                                    key={sem.semester} 
                                                    className={`flex items-center justify-between p-4 rounded-xl border transition-all hover:shadow-md ${getBgColor(sem.avgAttendance)}`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
                                                            <span className="text-lg font-bold text-purple-600">{sem.semester}</span>
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-gray-800">Semester {sem.semester}</p>
                                                            <p className="text-sm text-gray-500 flex items-center gap-1">
                                                                <Users className="w-3.5 h-3.5" />
                                                                {sem.totalStudents} students enrolled
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-32 hidden sm:block">
                                                            <div className="h-3 bg-gray-200/80 rounded-full overflow-hidden">
                                                                <div 
                                                                    className={`h-full rounded-full bg-gradient-to-r ${getProgressGradient(sem.avgAttendance)} transition-all duration-500`}
                                                                    style={{ width: `${Math.min(sem.avgAttendance, 100)}%` }}
                                                                ></div>
                                                            </div>
                                                        </div>
                                                        <span className={`text-xl font-bold ${getAttendanceColor(sem.avgAttendance)}`}>
                                                            {sem.avgAttendance}%
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {/* Subject-wise Tab */}
                                {activeTab === 'subject' && (
                                    <div className="space-y-4">
                                        {data.subjectStats.length === 0 ? (
                                            <div className="text-center py-12">
                                                <BookOpen className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                                                <p className="text-gray-500">No subject data available</p>
                                            </div>
                                        ) : (
                                            data.subjectStats.map(sub => (
                                                <div 
                                                    key={sub.id} 
                                                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all hover:shadow-md ${getBgColor(sub.avgAttendance)}`}
                                                >
                                                    <div className="flex items-start gap-4 mb-3 sm:mb-0">
                                                        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0">
                                                            <BookOpen className="w-5 h-5 text-blue-600" />
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-gray-800">{sub.name}</p>
                                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                                <span className="px-2 py-0.5 bg-white/80 rounded-full text-xs text-gray-600 font-medium">
                                                                    {sub.code}
                                                                </span>
                                                                <span className="px-2 py-0.5 bg-purple-100 rounded-full text-xs text-purple-600 font-medium">
                                                                    Sem {sub.semester}
                                                                </span>
                                                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                                                    <Users className="w-3 h-3" /> {sub.totalStudents}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4 pl-16 sm:pl-0">
                                                        <div className="w-24 hidden md:block">
                                                            <div className="h-2.5 bg-gray-200/80 rounded-full overflow-hidden">
                                                                <div 
                                                                    className={`h-full rounded-full bg-gradient-to-r ${getProgressGradient(sub.avgAttendance)} transition-all duration-500`}
                                                                    style={{ width: `${Math.min(sub.avgAttendance, 100)}%` }}
                                                                ></div>
                                                            </div>
                                                        </div>
                                                        <span className={`text-xl font-bold ${getAttendanceColor(sub.avgAttendance)}`}>
                                                            {sub.avgAttendance}%
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {/* Critical Students Tab */}
                                {activeTab === 'critical' && (
                                    <div className="space-y-4">
                                        {data.criticalStudents.length === 0 ? (
                                            <div className="text-center py-12">
                                                <div className="w-20 h-20 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
                                                    <TrendingUp className="w-10 h-10 text-emerald-500" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-emerald-600 mb-1">Excellent!</h3>
                                                <p className="text-gray-500">No students with critical attendance</p>
                                            </div>
                                        ) : (
                                            data.criticalStudents.map((student, index) => (
                                                <div 
                                                    key={student.id} 
                                                    className="flex items-center justify-between p-4 bg-gradient-to-r from-red-50 to-rose-50 rounded-xl border border-red-200 hover:shadow-md transition-all"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                                                            <span className="text-sm font-bold text-red-600">{index + 1}</span>
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-gray-800">{student.name}</p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-sm text-gray-500">Roll: {student.rollNumber}</span>
                                                                <span className="px-2 py-0.5 bg-purple-100 rounded-full text-xs text-purple-600">
                                                                    Sem {student.semester}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-2xl font-bold text-red-600">{student.attendancePercentage}%</span>
                                                        <ChevronRight className="w-5 h-5 text-gray-400" />
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {/* Warning Students Tab */}
                                {activeTab === 'warning' && (
                                    <div className="space-y-4">
                                        {data.warningStudents.length === 0 ? (
                                            <div className="text-center py-12">
                                                <div className="w-20 h-20 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
                                                    <TrendingUp className="w-10 h-10 text-emerald-500" />
                                                </div>
                                                <h3 className="text-lg font-semibold text-emerald-600 mb-1">Great News!</h3>
                                                <p className="text-gray-500">No students in warning zone</p>
                                            </div>
                                        ) : (
                                            data.warningStudents.map((student, index) => (
                                                <div 
                                                    key={student.id} 
                                                    className="flex items-center justify-between p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 hover:shadow-md transition-all"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                                                            <span className="text-sm font-bold text-amber-600">{index + 1}</span>
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-gray-800">{student.name}</p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-sm text-gray-500">Roll: {student.rollNumber}</span>
                                                                <span className="px-2 py-0.5 bg-purple-100 rounded-full text-xs text-purple-600">
                                                                    Sem {student.semester}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-2xl font-bold text-amber-600">{student.attendancePercentage}%</span>
                                                        <ChevronRight className="w-5 h-5 text-gray-400" />
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}
            </main>
        </div>
    );
}
