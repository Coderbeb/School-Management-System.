'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    Users, ArrowLeft, Loader2, CheckCircle, AlertTriangle, X,
    Zap, IndianRupee, Filter, ChevronDown, Pencil, Save
} from 'lucide-react';

interface UserData { id: string; email: string; firstName: string; lastName: string; role: string; }
interface ClassItem { id: string; name: string; display_order: number; }
interface SessionItem { id: string; name: string; is_current: boolean; }
interface FeeGroup { id: string; name: string; apply_to: string; is_default: boolean; }
interface AssignedGroup {
    fee_group_id: string;
    fee_group_name: string;
    apply_to: string;
    is_default: boolean;
    assignment_id: string;
}
interface StudentAssignment {
    student_id: string;
    first_name: string;
    last_name: string;
    admission_number: string;
    class_name: string;
    class_id: string;
    assigned_groups: AssignedGroup[];
    estimated_monthly: number;
    estimated_yearly: number;
}

interface PreviewSummary {
    groupId: string;
    groupName: string;
    studentCount: number;
    classes: string[];
}

export default function StudentGroupsPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const [sessions, setSessions] = useState<SessionItem[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [groups, setGroups] = useState<FeeGroup[]>([]);
    const [assignments, setAssignments] = useState<StudentAssignment[]>([]);

    const [selectedSession, setSelectedSession] = useState('');
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('');

    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
    const [bulkClassIds, setBulkClassIds] = useState<string[]>([]);
    const [bulkGroupId, setBulkGroupId] = useState('');

    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Auto-assign preview
    const [showPreview, setShowPreview] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewData, setPreviewData] = useState<{ totalAssignments: number; totalStudents: number; summary: PreviewSummary[] } | null>(null);

    // Bulk class assign panel
    const [showBulkPanel, setShowBulkPanel] = useState(false);

    // Edit single student
    const [editStudent, setEditStudent] = useState<StudentAssignment | null>(null);
    const [editStudentGroups, setEditStudentGroups] = useState<string[]>([]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin' && parsed.role !== 'developer') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchConfig(token);
    }, [router]);

    const getToken = () => localStorage.getItem('token') || '';
    const hdrs = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

    const fetchConfig = async (token: string) => {
        setLoading(true);
        try {
            const [sessRes, classRes, groupRes] = await Promise.all([
                fetch('/api/sms/sessions', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/sms/classes', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/api/fees/groups', { headers: { Authorization: `Bearer ${token}` } }),
            ]);

            const sessionsData = sessRes.ok ? (await sessRes.json()).sessions || [] : [];
            const classesData = classRes.ok ? (await classRes.json()).classes || [] : [];
            const groupsData = groupRes.ok ? (await groupRes.json()).groups || [] : [];

            setSessions(sessionsData);
            setClasses(classesData.sort((a: ClassItem, b: ClassItem) => (a.display_order || 0) - (b.display_order || 0)));
            setGroups(groupsData);

            const current = sessionsData.find((s: any) => s.is_current);
            if (current) {
                setSelectedSession(current.id);
                fetchAssignments(token, current.id, '');
            } else {
                setLoading(false);
            }
        } catch { setLoading(false); }
    };

    const fetchAssignments = async (token: string, sessionId: string, classId: string) => {
        if (!sessionId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/fees/student-groups?sessionId=${sessionId}${classId ? `&classId=${classId}` : ''}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setAssignments((await res.json()).assignments || []);
                setSelectedStudentIds([]);
            }
        } catch { /* silent */ }
        setLoading(false);
    };

    const handleFilterChange = (sessionId: string, classId: string) => {
        setSelectedSession(sessionId);
        setSelectedClass(classId);
        fetchAssignments(getToken(), sessionId, classId);
    };

    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    const toggleSelectStudent = (id: string) => {
        setSelectedStudentIds(prev =>
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedStudentIds.length === assignments.length) {
            setSelectedStudentIds([]);
        } else {
            setSelectedStudentIds(assignments.map(a => a.student_id));
        }
    };

    // Assign selected students to a fee group
    const handleAssignGroup = async () => {
        if (selectedStudentIds.length === 0) { setMessage({ type: 'error', text: 'Select at least one student' }); return; }
        if (!selectedGroup) { setMessage({ type: 'error', text: 'Select a Fee Group to assign' }); return; }

        setUpdating(true);
        setMessage(null);
        try {
            const res = await fetch('/api/fees/student-groups', {
                method: 'POST',
                headers: hdrs(),
                body: JSON.stringify({
                    studentIds: selectedStudentIds,
                    feeGroupId: selectedGroup,
                    sessionId: selectedSession
                })
            });

            if (res.ok) {
                const data = await res.json();
                setMessage({ type: 'success', text: `Assigned Fee Group to ${data.assigned || selectedStudentIds.length} students` });
                setSelectedStudentIds([]);
                setSelectedGroup('');
                fetchAssignments(getToken(), selectedSession, selectedClass);
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Failed to assign' });
            }
        } catch { setMessage({ type: 'error', text: 'Network error' }); }
        setUpdating(false);
    };

    // Bulk assign by class range
    const handleBulkClassAssign = async () => {
        if (bulkClassIds.length === 0) { setMessage({ type: 'error', text: 'Select at least one class' }); return; }
        if (!bulkGroupId) { setMessage({ type: 'error', text: 'Select a Fee Group' }); return; }

        setUpdating(true);
        setMessage(null);
        try {
            const res = await fetch('/api/fees/student-groups', {
                method: 'POST',
                headers: hdrs(),
                body: JSON.stringify({
                    classIds: bulkClassIds,
                    feeGroupId: bulkGroupId,
                    sessionId: selectedSession
                })
            });

            if (res.ok) {
                const data = await res.json();
                setMessage({ type: 'success', text: `Bulk assigned to ${data.assigned || 0} students across ${bulkClassIds.length} classes` });
                setBulkClassIds([]);
                setBulkGroupId('');
                setShowBulkPanel(false);
                fetchAssignments(getToken(), selectedSession, selectedClass);
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Failed to bulk assign' });
            }
        } catch { setMessage({ type: 'error', text: 'Network error' }); }
        setUpdating(false);
    };

    // Remove a single assignment
    const handleRemoveAssignment = async (studentId: string, feeGroupId: string) => {
        if (!confirm('Remove this fee group assignment?')) return;
        setUpdating(true);
        try {
            const res = await fetch(`/api/fees/student-groups?studentId=${studentId}&feeGroupId=${feeGroupId}&sessionId=${selectedSession}`, {
                method: 'DELETE',
                headers: hdrs()
            });
            if (res.ok) {
                setMessage({ type: 'success', text: 'Removed assignment' });
                fetchAssignments(getToken(), selectedSession, selectedClass);
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Failed to remove' });
            }
        } catch { setMessage({ type: 'error', text: 'Network error' }); }
        setUpdating(false);
    };

    const openEditStudent = (student: StudentAssignment) => {
        setEditStudent(student);
        setEditStudentGroups(student.assigned_groups?.map(g => g.fee_group_id) || []);
    };

    const toggleEditStudentGroup = (groupId: string) => {
        setEditStudentGroups(prev =>
            prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
        );
    };

    const handleSaveStudentEdit = async () => {
        if (!editStudent) return;
        setUpdating(true);
        setMessage(null);
        try {
            const res = await fetch('/api/fees/student-groups', {
                method: 'PUT',
                headers: hdrs(),
                body: JSON.stringify({
                    studentId: editStudent.student_id,
                    feeGroupIds: editStudentGroups,
                    sessionId: selectedSession
                })
            });
            if (res.ok) {
                setMessage({ type: 'success', text: `Updated groups for ${editStudent.first_name}` });
                setEditStudent(null);
                fetchAssignments(getToken(), selectedSession, selectedClass);
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Failed to update student groups' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Network error' });
        }
        setUpdating(false);
    };

    // Auto-assign preview
    const handlePreviewDefaults = async () => {
        setPreviewLoading(true);
        setShowPreview(true);
        try {
            const res = await fetch('/api/fees/auto-assign', {
                method: 'POST',
                headers: hdrs(),
                body: JSON.stringify({ sessionId: selectedSession, preview: true })
            });
            if (res.ok) {
                setPreviewData(await res.json());
            }
        } catch { /* silent */ }
        setPreviewLoading(false);
    };

    // Execute auto-assign
    const handleApplyDefaults = async () => {
        setUpdating(true);
        try {
            const res = await fetch('/api/fees/auto-assign', {
                method: 'POST',
                headers: hdrs(),
                body: JSON.stringify({ sessionId: selectedSession })
            });
            if (res.ok) {
                const data = await res.json();
                setMessage({ type: 'success', text: data.message || `Assigned ${data.totalAssigned} groups` });
                setShowPreview(false);
                setPreviewData(null);
                fetchAssignments(getToken(), selectedSession, selectedClass);
            } else {
                const err = await res.json();
                setMessage({ type: 'error', text: err.error || 'Failed to auto-assign' });
            }
        } catch { setMessage({ type: 'error', text: 'Network error' }); }
        setUpdating(false);
    };

    const toggleBulkClass = (classId: string) => {
        setBulkClassIds(prev => prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]);
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.push('/manage/fee-hub')} className="p-2 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer">
                            <ArrowLeft className="w-5 h-5 text-gray-500" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Assign Fee Groups</h1>
                            <p className="text-xs text-gray-500">Multi-group assignments per student · Bulk assign by class range</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowBulkPanel(!showBulkPanel)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all text-sm cursor-pointer">
                            <Filter className="w-4 h-4" /> Bulk Assign
                        </button>
                        <button onClick={handlePreviewDefaults}
                            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all text-sm cursor-pointer">
                            <Zap className="w-4 h-4" /> Apply Defaults
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white border border-gray-200 rounded-3xl p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">Academic Session</label>
                        <select value={selectedSession} onChange={e => handleFilterChange(e.target.value, selectedClass)}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                            {sessions.map(s => <option key={s.id} value={s.id}>{s.name} {s.is_current ? '(Current)' : ''}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase">Class Filter</label>
                        <select value={selectedClass} onChange={e => handleFilterChange(selectedSession, e.target.value)}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500">
                            <option value="">All Classes</option>
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>

                {/* ═══════ Bulk Class Assign Panel ═══════ */}
                {showBulkPanel && (
                    <div className="bg-blue-900 text-white rounded-3xl p-6 mb-6 shadow-xl animate-in fade-in slide-in-from-top-4">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-bold text-base">Bulk Assign by Class Range</h3>
                                <p className="text-blue-200 text-xs mt-0.5">Select classes and a fee group to assign to all students in those classes</p>
                            </div>
                            <button onClick={() => setShowBulkPanel(false)} className="p-1 hover:bg-blue-800 rounded-lg cursor-pointer"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-4">
                            {classes.map(c => (
                                <button key={c.id} onClick={() => toggleBulkClass(c.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${bulkClassIds.includes(c.id)
                                        ? 'bg-white text-blue-900 border-white shadow-sm'
                                        : 'bg-blue-800 text-blue-100 border-blue-700 hover:border-blue-500'
                                        }`}>
                                    {c.name}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-3">
                            <select value={bulkGroupId} onChange={e => setBulkGroupId(e.target.value)}
                                className="flex-1 px-3 py-2.5 border border-blue-700 bg-blue-800 text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-400">
                                <option value="">Select Fee Group</option>
                                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                            <button onClick={handleBulkClassAssign} disabled={updating || bulkClassIds.length === 0 || !bulkGroupId}
                                className="px-6 py-2.5 bg-white text-blue-900 font-bold rounded-xl text-sm hover:bg-blue-50 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap">
                                {updating ? 'Assigning...' : `Assign to ${bulkClassIds.length} class${bulkClassIds.length !== 1 ? 'es' : ''}`}
                            </button>
                        </div>
                    </div>
                )}

                {/* ═══════ Per-Student Selection Action Bar ═══════ */}
                {selectedStudentIds.length > 0 && (
                    <div className="bg-emerald-900 text-white p-4 rounded-2xl mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
                            <span className="font-semibold text-sm">{selectedStudentIds.length} students selected</span>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}
                                className="px-3 py-2 border border-emerald-700 bg-emerald-800 text-white rounded-xl text-xs focus:ring-2 focus:ring-emerald-400 flex-1 sm:w-48">
                                <option value="">Select Group to Assign</option>
                                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                            <button onClick={handleAssignGroup} disabled={updating}
                                className="px-4 py-2 bg-white text-emerald-950 font-bold rounded-xl text-xs hover:bg-emerald-50 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer">
                                {updating ? 'Assigning...' : 'Assign Group'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Message */}
                {message && (
                    <div className={`mb-4 p-3 rounded-xl text-sm flex items-center gap-2 ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                        {message.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        {message.text}
                    </div>
                )}

                {/* ═══════ Auto-Assign Preview Modal ═══════ */}
                {showPreview && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl">
                            <div className="flex items-center justify-between mb-5">
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Zap className="w-5 h-5 text-amber-500" /> Apply Default Groups</h2>
                                <button onClick={() => { setShowPreview(false); setPreviewData(null); }} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X className="w-5 h-5 text-gray-400" /></button>
                            </div>

                            {previewLoading ? (
                                <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-amber-500 animate-spin" /></div>
                            ) : previewData ? (
                                <div>
                                    {previewData.totalAssignments === 0 ? (
                                        <div className="text-center py-8">
                                            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                                            <p className="text-gray-700 font-bold">All defaults already applied!</p>
                                            <p className="text-gray-400 text-sm mt-1">Every student already has their default fee groups assigned.</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
                                                <p className="text-sm text-amber-800">
                                                    <span className="font-bold">{previewData.totalAssignments} new assignments</span> will be created for <span className="font-bold">{previewData.totalStudents} students</span>.
                                                </p>
                                            </div>

                                            <div className="space-y-3 mb-6 max-h-60 overflow-y-auto">
                                                {previewData.summary.map(s => (
                                                    <div key={s.groupId} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                        <div>
                                                            <p className="font-bold text-gray-900 text-sm">{s.groupName}</p>
                                                            <p className="text-xs text-gray-400">{s.classes.join(', ')}</p>
                                                        </div>
                                                        <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">{s.studentCount} students</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="flex gap-2">
                                                <button onClick={() => { setShowPreview(false); setPreviewData(null); }}
                                                    className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-200 transition-colors cursor-pointer">Cancel</button>
                                                <button onClick={handleApplyDefaults} disabled={updating}
                                                    className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl text-sm shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer">
                                                    {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                                    {updating ? 'Applying...' : 'Apply Now'}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>
                )}

                {/* ═══════ Edit Student Modal ═══════ */}
                {editStudent && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl">
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">Edit Student Groups</h2>
                                    <p className="text-xs text-gray-500 mt-0.5">{editStudent.first_name} {editStudent.last_name} ({editStudent.admission_number})</p>
                                </div>
                                <button onClick={() => setEditStudent(null)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X className="w-5 h-5 text-gray-400" /></button>
                            </div>

                            <div className="space-y-3 mb-6 max-h-[50vh] overflow-y-auto pr-2">
                                {groups.map(g => {
                                    const isSelected = editStudentGroups.includes(g.id);
                                    return (
                                        <div key={g.id} onClick={() => toggleEditStudentGroup(g.id)} className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${isSelected ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                                            <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 pointer-events-none" />
                                            <div>
                                                <p className={`font-bold text-sm ${isSelected ? 'text-emerald-900' : 'text-gray-900'}`}>{g.name}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex gap-2 pt-4 border-t border-gray-100">
                                <button onClick={() => setEditStudent(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl text-sm hover:bg-gray-200 transition-colors cursor-pointer">Cancel</button>
                                <button onClick={handleSaveStudentEdit} disabled={updating} className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl text-sm shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer">
                                    {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {updating ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════ Assignments Table ═══════ */}
                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
                ) : assignments.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-bold text-lg">No Students Enrolled</p>
                        <p className="text-gray-400 text-sm mt-1">Make sure you have active enrollments for this class and session.</p>
                    </div>
                ) : (
                    <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                        <table className="w-full border-collapse text-left text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold">
                                    <th className="p-4 w-12 text-center">
                                        <input type="checkbox" checked={selectedStudentIds.length === assignments.length && assignments.length > 0} onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 cursor-pointer" />
                                    </th>
                                    <th className="p-4">Student</th>
                                    <th className="p-4">Class</th>
                                    <th className="p-4">Assigned Fee Groups</th>
                                    <th className="p-4 text-right">Est. Yearly</th>
                                    <th className="p-4 text-center w-16">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {assignments.map(a => (
                                    <tr key={a.student_id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="p-4 text-center">
                                            <input type="checkbox" checked={selectedStudentIds.includes(a.student_id)} onChange={() => toggleSelectStudent(a.student_id)}
                                                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 cursor-pointer" />
                                        </td>
                                        <td className="p-4">
                                            <div className="font-bold text-gray-950">{a.first_name} {a.last_name}</div>
                                            <div className="text-xs text-gray-400">Adm #: {a.admission_number}</div>
                                        </td>
                                        <td className="p-4 text-gray-600 text-xs font-medium">{a.class_name}</td>
                                        <td className="p-4">
                                            {a.assigned_groups && a.assigned_groups.length > 0 ? (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {a.assigned_groups.map(g => (
                                                        <span key={g.fee_group_id} className="group relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-[11px] font-semibold hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all cursor-pointer"
                                                            onClick={() => handleRemoveAssignment(a.student_id, g.fee_group_id)}
                                                            title="Click to remove">
                                                            {g.fee_group_name}
                                                            <X className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-400 italic">Not Assigned</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            {a.estimated_yearly > 0 ? (
                                                <div>
                                                    <span className="font-bold text-gray-900">₹{a.estimated_yearly.toLocaleString('en-IN')}</span>
                                                    {a.estimated_monthly > 0 && (
                                                        <div className="text-[10px] text-gray-400">₹{a.estimated_monthly.toLocaleString('en-IN')}/mo</div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-300">—</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            <button onClick={() => openEditStudent(a)} className="p-2 bg-gray-100 hover:bg-emerald-100 text-gray-500 hover:text-emerald-700 rounded-xl transition-colors cursor-pointer" title="Edit Groups">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}
