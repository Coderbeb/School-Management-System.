'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
    User, ArrowLeft, Mail, Phone, Calendar, Users, 
    Sparkles, ShieldCheck, X, Check, ClipboardCheck, Edit2
} from 'lucide-react';

interface UserData {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'super_admin' | 'teacher' | 'accountant' | 'student';
}

interface StudentDetails {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    date_of_birth: string | null;
    gender: 'male' | 'female' | 'other' | null;
    blood_group: string | null;
    address: string | null;
    photo_url: string | null;
    admission_number: string | null;
    admission_date: string | null;
    guardian_name: string | null;
    guardian_relation: string | null;
    guardian_phone: string | null;
    guardian_email: string | null;
    guardian_phone_alt: string | null;
    is_active: boolean;
    roll_number: number | null;
    enrollment_status: string | null;
    class_section_id: string | null;
    class_name: string | null;
    section_name: string | null;
    session_name: string | null;
    session_id: string | null;
}

interface Session { id: string; name: string; is_current: boolean; }
interface ClassSection { id: string; display_name: string; }

interface AttendanceStats {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
}

interface AttendanceLog {
    date: string;
    status: string;
    remarks: string | null;
    subject_name: string | null;
    subject_code: string | null;
}

export default function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id: studentId } = use(params);

    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [student, setStudent] = useState<StudentDetails | null>(null);
    const [stats, setStats] = useState<AttendanceStats | null>(null);
    const [logs, setLogs] = useState<AttendanceLog[]>([]);

    // Dropdowns for Edit Form
    const [sessions, setSessions] = useState<Session[]>([]);
    const [classSections, setClassSections] = useState<ClassSection[]>([]);

    // Modal forms states
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.replace('/login');
            return;
        }
        const parsed = JSON.parse(userData);
        setUser(parsed);
        loadStudentDetails(studentId, token);
    }, [studentId]);

    const loadStudentDetails = async (id: string, token: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/manage/students/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) {
                router.push('/manage/students');
                return;
            }
            setStudent(data.student);
            setStats(data.stats);
            setLogs(data.logs || []);

            // Setup form state
            setEditForm({
                firstName: data.student.first_name,
                lastName: data.student.last_name,
                email: data.student.email || '',
                password: '',
                phone: data.student.phone || '',
                dateOfBirth: data.student.date_of_birth ? data.student.date_of_birth.split('T')[0] : '',
                gender: data.student.gender || '',
                bloodGroup: data.student.blood_group || '',
                address: data.student.address || '',
                guardianName: data.student.guardian_name || '',
                guardianRelation: data.student.guardian_relation || '',
                guardianPhone: data.student.guardian_phone || '',
                guardianEmail: data.student.guardian_email || '',
                guardianPhoneAlt: data.student.guardian_phone_alt || '',
                admissionNumber: data.student.admission_number || '',
                admissionDate: data.student.admission_date ? data.student.admission_date.split('T')[0] : '',
                isActive: data.student.is_active,
                classSectionId: data.student.class_section_id || '',
                sessionId: data.student.session_id || '',
                rollNumber: data.student.roll_number ? String(data.student.roll_number) : '',
            });

            // Load dropdowns if admin
            if (parsed().role === 'super_admin') {
                loadDropdowns(token, data.student.session_id);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const parsed = () => {
        return JSON.parse(localStorage.getItem('user') || '{}');
    };

    const loadDropdowns = async (token: string, currentSessionId?: string) => {
        const sessRes = await fetch('/api/manage/sessions', { headers: { Authorization: `Bearer ${token}` } });
        const sessData = await sessRes.json();
        setSessions(sessData.sessions || []);
        
        const activeSessId = currentSessionId || (sessData.sessions || []).find((s: Session) => s.is_current)?.id || '';
        if (activeSessId) {
            loadClassSections(activeSessId, token);
        }
    };

    const loadClassSections = async (sessId: string, token?: string) => {
        const t = token || localStorage.getItem('token')!;
        const res = await fetch(`/api/manage/class-sections?sessionId=${sessId}`, { headers: { Authorization: `Bearer ${t}` } });
        const data = await res.json();
        setClassSections(data.classSections || []);
    };

    const handleSessionChange = (sessId: string) => {
        setEditForm((prev: any) => ({ ...prev, sessionId: sessId, classSectionId: '' }));
        loadClassSections(sessId);
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        const token = localStorage.getItem('token')!;

        try {
            const res = await fetch(`/api/manage/students/${studentId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...editForm,
                    rollNumber: editForm.rollNumber ? parseInt(editForm.rollNumber) : null,
                })
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to update student');
                setSaving(false);
                return;
            }

            setIsEditing(false);
            loadStudentDetails(studentId, token);
        } catch (err) {
            setError('Server error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium">Loading Student Profile...</p>
                </div>
            </div>
        );
    }

    if (!student || !user) return null;

    const attendPercentage = stats && stats.total > 0
        ? Math.round(((stats.present + stats.late * 0.5) / stats.total) * 100)
        : 100;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">
                
                {/* Header breadcrumb and back button */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                    <button 
                        onClick={() => router.push('/manage/students')}
                        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Student Directory
                    </button>

                    {user.role === 'super_admin' && (
                        <Button 
                            onClick={() => setIsEditing(true)} 
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md flex items-center gap-2"
                        >
                            <Edit2 className="w-4 h-4" />
                            Edit Profile
                        </Button>
                    )}
                </div>

                {/* Profile Card Banner */}
                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-8 relative">
                    <div className="h-32 bg-gradient-to-r from-emerald-500 to-teal-600 absolute top-0 left-0 right-0"></div>
                    <div className="relative pt-16 px-6 pb-6 flex flex-col md:flex-row items-center md:items-end gap-6">
                        <div className="w-24 h-24 rounded-2xl bg-white p-1.5 shadow-md flex items-center justify-center shrink-0">
                            <div className="w-full h-full bg-emerald-100 rounded-xl flex items-center justify-center font-bold text-3xl text-emerald-800">
                                {student.first_name[0]}{student.last_name[0]}
                            </div>
                        </div>

                        <div className="flex-1 text-center md:text-left mt-2 md:mt-0">
                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5 mb-1.5">
                                <h1 className="text-2xl font-bold text-gray-900">
                                    {student.first_name} {student.last_name}
                                </h1>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                    student.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                    {student.is_active ? 'Active' : 'Suspended'}
                                </span>
                            </div>

                            <p className="text-gray-500 text-sm flex items-center justify-center md:justify-start gap-1.5">
                                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                Admission No: <span className="font-semibold text-gray-800">{student.admission_number || '—'}</span>
                            </p>
                            {student.email && (
                                <p className="text-gray-500 text-sm flex items-center justify-center md:justify-start gap-1.5 mt-1">
                                    <Mail className="w-4 h-4 text-emerald-600" />
                                    Login Email: <span className="font-semibold text-gray-800">{student.email}</span>
                                </p>
                            )}
                        </div>

                        {/* Attendance Indicator Card */}
                        <div className="bg-emerald-50/70 border border-emerald-100 p-4 rounded-2xl flex items-center gap-4 shrink-0 shadow-inner w-full md:w-auto">
                            <div>
                                <p className="text-xs text-emerald-800 font-semibold uppercase tracking-wider">Attendance Rate</p>
                                <p className="text-2xl font-black text-emerald-950 mt-0.5">{attendPercentage}%</p>
                            </div>
                            <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                                <ClipboardCheck className="w-5 h-5" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Dashboard Subgrids */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Left 2 Cols: Details Panel */}
                    <div className="lg:col-span-2 space-y-8">
                        
                        {/* Student Personal Metadata */}
                        <div className="bg-white rounded-3xl border border-gray-150 p-6 shadow-sm">
                            <h3 className="text-base font-bold text-gray-800 mb-5 flex items-center gap-2 border-b border-gray-50 pb-3">
                                <User className="w-5 h-5 text-emerald-600" />
                                Personal & Demographic Details
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase">Gender</p>
                                    <p className="text-sm font-medium text-gray-800 mt-1 capitalize">{student.gender || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase">Date of Birth</p>
                                    <p className="text-sm font-medium text-gray-800 mt-1">
                                        {student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase">Blood Group</p>
                                    <p className="text-sm font-medium text-gray-800 mt-1">{student.blood_group || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase">Admission Date</p>
                                    <p className="text-sm font-medium text-gray-800 mt-1">
                                        {student.admission_date ? new Date(student.admission_date).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—'}
                                    </p>
                                </div>
                                <div className="sm:col-span-2">
                                    <p className="text-xs font-semibold text-gray-400 uppercase">Home Address</p>
                                    <p className="text-sm font-medium text-gray-800 mt-1 leading-relaxed">{student.address || 'No address added'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Guardian details */}
                        <div className="bg-white rounded-3xl border border-gray-150 p-6 shadow-sm">
                            <h3 className="text-base font-bold text-gray-800 mb-5 flex items-center gap-2 border-b border-gray-50 pb-3">
                                <Users className="w-5 h-5 text-emerald-600" />
                                Guardian & Contact Information
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase">Guardian Name</p>
                                    <p className="text-sm font-medium text-gray-800 mt-1">
                                        {student.guardian_name || '—'} {student.guardian_relation ? `(${student.guardian_relation})` : ''}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase">Guardian WhatsApp (Primary Phone)</p>
                                    <p className="text-sm font-bold text-emerald-800 mt-1 flex items-center gap-1.5">
                                        <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                                        {student.guardian_phone || '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase">Guardian Email</p>
                                    <p className="text-sm font-medium text-gray-800 mt-1 flex items-center gap-1.5">
                                        <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                                        {student.guardian_email || '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-gray-400 uppercase">Alt Phone Number</p>
                                    <p className="text-sm font-medium text-gray-800 mt-1">{student.guardian_phone_alt || '—'}</p>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Right 1 Col: Academic Enrollment + Attendance Mini logs */}
                    <div className="space-y-8">
                        
                        {/* Enrollment details */}
                        <div className="bg-white rounded-3xl border border-gray-150 p-6 shadow-sm">
                            <h3 className="text-base font-bold text-gray-800 mb-5 flex items-center gap-2 border-b border-gray-50 pb-3">
                                <Sparkles className="w-5 h-5 text-emerald-600" />
                                Active Enrollment
                            </h3>

                            <div className="space-y-4">
                                <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                    <p className="text-xs font-semibold text-gray-400 uppercase">Class & Section</p>
                                    <p className="text-base font-bold text-gray-900 mt-0.5">{student.class_name ? `${student.class_name} - ${student.section_name}` : 'Not Enrolled'}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                        <p className="text-xs font-semibold text-gray-400 uppercase">Roll Number</p>
                                        <p className="text-sm font-bold text-gray-900 mt-0.5">#{student.roll_number || '—'}</p>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                        <p className="text-xs font-semibold text-gray-400 uppercase">Session</p>
                                        <p className="text-sm font-bold text-gray-900 mt-0.5">{student.session_name || '—'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Recent logs */}
                        <div className="bg-white rounded-3xl border border-gray-150 p-6 shadow-sm">
                            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2 border-b border-gray-50 pb-3">
                                <Calendar className="w-5 h-5 text-emerald-600" />
                                Attendance Logs (Last 30)
                            </h3>

                            {logs.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-6">No attendance records today.</p>
                            ) : (
                                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                    {logs.map((log, idx) => (
                                        <div key={idx} className="flex items-center justify-between gap-3 text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                                            <div>
                                                <p className="font-semibold text-gray-800">{new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                                                <p className="text-gray-400 truncate max-w-[120px]">{log.subject_name || 'General'}</p>
                                            </div>

                                            <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${
                                                log.status === 'present' ? 'bg-green-100 text-green-800' :
                                                log.status === 'absent' ? 'bg-red-100 text-red-800' :
                                                log.status === 'late' ? 'bg-amber-100 text-amber-800' :
                                                'bg-blue-100 text-blue-800'
                                            }`}>
                                                {log.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>

                </div>

            </main>

            {/* Edit Profile Modal */}
            {isEditing && editForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 w-full max-w-2xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="bg-emerald-600 px-6 py-4 flex items-center justify-between text-white shrink-0">
                            <h2 className="text-lg font-bold">Edit Student Profile</h2>
                            <button onClick={() => setIsEditing(false)} className="text-white/80 hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleUpdate} className="p-6 space-y-6 overflow-y-auto flex-1">
                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl flex items-center gap-2">
                                    <X className="w-5 h-5 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Block A: Student Demographic */}
                            <div>
                                <h3 className="text-sm font-bold text-gray-800 mb-3 uppercase tracking-wider">Demographic Information</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-gray-750 font-medium">First Name</Label>
                                        <Input
                                            required
                                            value={editForm.firstName}
                                            onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                                            className="mt-1 rounded-lg border-gray-200"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-gray-750 font-medium">Last Name</Label>
                                        <Input
                                            required
                                            value={editForm.lastName}
                                            onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                                            className="mt-1 rounded-lg border-gray-200"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-gray-750 font-medium">Date of Birth</Label>
                                        <Input
                                            type="date"
                                            value={editForm.dateOfBirth}
                                            onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                                            className="mt-1 rounded-lg border-gray-200"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-gray-750 font-medium">Gender</Label>
                                        <select
                                            value={editForm.gender}
                                            onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                                            className="mt-1 w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                        >
                                            <option value="">Select Gender</option>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                            <option value="other">Other</option>
                                        </select>
                                    </div>
                                    <div>
                                        <Label className="text-gray-750 font-medium">Blood Group</Label>
                                        <Input
                                            value={editForm.bloodGroup}
                                            onChange={(e) => setEditForm({ ...editForm, bloodGroup: e.target.value })}
                                            className="mt-1 rounded-lg border-gray-200"
                                            placeholder="e.g. O+, A-"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-gray-750 font-medium">Admission Date</Label>
                                        <Input
                                            type="date"
                                            value={editForm.admissionDate}
                                            onChange={(e) => setEditForm({ ...editForm, admissionDate: e.target.value })}
                                            className="mt-1 rounded-lg border-gray-200"
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <Label className="text-gray-750 font-medium">Home Address</Label>
                                        <textarea
                                            value={editForm.address}
                                            onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                                            rows={2}
                                            className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Block B: Login Credentials */}
                            <div className="border-t border-gray-100 pt-6">
                                <h3 className="text-sm font-bold text-gray-800 mb-3 uppercase tracking-wider">Login Credentials</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-gray-750 font-medium">Student Login Email</Label>
                                        <Input
                                            type="email"
                                            value={editForm.email}
                                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                            className="mt-1 rounded-lg border-gray-200"
                                            placeholder="student@school.com"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-gray-750 font-medium">Change Password</Label>
                                        <Input
                                            type="text"
                                            value={editForm.password}
                                            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                                            className="mt-1 rounded-lg border-gray-200"
                                            placeholder="Leave blank to keep current"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Block B: Guardian */}
                            <div className="border-t border-gray-100 pt-6">
                                <h3 className="text-sm font-bold text-gray-800 mb-3 uppercase tracking-wider">Guardian Details</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-gray-750 font-medium">Guardian Name</Label>
                                        <Input
                                            required
                                            value={editForm.guardianName}
                                            onChange={(e) => setEditForm({ ...editForm, guardianName: e.target.value })}
                                            className="mt-1 rounded-lg border-gray-200"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-gray-750 font-medium">Relation to Student</Label>
                                        <Input
                                            required
                                            value={editForm.guardianRelation}
                                            onChange={(e) => setEditForm({ ...editForm, guardianRelation: e.target.value })}
                                            className="mt-1 rounded-lg border-gray-200"
                                            placeholder="e.g. Father, Mother, Uncle"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-gray-750 font-medium">WhatsApp Number (Primary)</Label>
                                        <Input
                                            required
                                            value={editForm.guardianPhone}
                                            onChange={(e) => setEditForm({ ...editForm, guardianPhone: e.target.value })}
                                            className="mt-1 rounded-lg border-gray-200"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-gray-750 font-medium">Guardian Email</Label>
                                        <Input
                                            type="email"
                                            value={editForm.guardianEmail}
                                            onChange={(e) => setEditForm({ ...editForm, guardianEmail: e.target.value })}
                                            className="mt-1 rounded-lg border-gray-200"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Block C: Enrollment */}
                            <div className="border-t border-gray-100 pt-6">
                                <h3 className="text-sm font-bold text-gray-800 mb-3 uppercase tracking-wider">Academic Enrollment</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-gray-750 font-medium">Admission Number</Label>
                                        <Input
                                            required
                                            value={editForm.admissionNumber}
                                            onChange={(e) => setEditForm({ ...editForm, admissionNumber: e.target.value })}
                                            className="mt-1 rounded-lg border-gray-200"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-gray-750 font-medium">Roll Number</Label>
                                        <Input
                                            type="number"
                                            value={editForm.rollNumber}
                                            onChange={(e) => setEditForm({ ...editForm, rollNumber: e.target.value })}
                                            className="mt-1 rounded-lg border-gray-200"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-gray-750 font-medium">Academic Year / Session</Label>
                                        <select
                                            value={editForm.sessionId}
                                            onChange={(e) => handleSessionChange(e.target.value)}
                                            className="mt-1 w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                        >
                                            <option value="">Select Session</option>
                                            {sessions.map((s) => (
                                                <option key={s.id} value={s.id}>{s.name} {s.is_current ? '(Current)' : ''}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <Label className="text-gray-750 font-medium">Classroom & Section</Label>
                                        <select
                                            value={editForm.classSectionId}
                                            onChange={(e) => setEditForm({ ...editForm, classSectionId: e.target.value })}
                                            className="mt-1 w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                            disabled={!editForm.sessionId}
                                        >
                                            <option value="">Select Classroom</option>
                                            {classSections.map((cs) => (
                                                <option key={cs.id} value={cs.id}>{cs.display_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <Label className="text-gray-750 font-medium">Enrollment Status</Label>
                                        <select
                                            value={editForm.isActive ? 'active' : 'inactive'}
                                            onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === 'active' })}
                                            className="mt-1 w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                        >
                                            <option value="active">Active Student</option>
                                            <option value="inactive">Suspended / Inactive</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100 shrink-0">
                                <Button type="button" variant="outline" onClick={() => setIsEditing(false)} className="rounded-xl border-gray-200">
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md">
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
