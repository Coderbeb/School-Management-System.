'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import {
    Home, Phone, BedDouble, Users, Calendar, ClipboardList, Wrench,
    Plus, X, Loader2, CheckCircle, XCircle, Clock, AlertCircle, MapPin
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; schoolId?: string; studentId?: string; }

interface HostelInfo {
    hostel_name: string; room_number: string; floor: number; room_type: string;
    bed_number: string; from_date: string; monthly_rent: number;
    warden_name: string; warden_phone: string;
    assistant_warden_name: string; assistant_warden_phone: string;
    mess_type: string; mess_charge: number;
}

interface Roommate {
    student_name: string; admission_number: string; bed_number: string;
    class_name: string; section_name: string;
}

interface LeaveRequest {
    id: string; leave_type: string; from_date: string; to_date: string;
    reason: string; status: string; remarks: string; created_at: string;
}

interface Complaint {
    id: string; complaint_type: string; description: string; priority: string;
    status: string; resolution_notes: string; created_at: string;
}

const LEAVE_TYPES = [
    { value: 'home_visit', label: 'Home Visit' },
    { value: 'medical', label: 'Medical' },
    { value: 'festival', label: 'Festival' },
    { value: 'emergency', label: 'Emergency' },
    { value: 'other', label: 'Other' },
];

const COMPLAINT_TYPES = [
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'electrical', label: 'Electrical' },
    { value: 'plumbing', label: 'Plumbing' },
    { value: 'furniture', label: 'Furniture' },
    { value: 'cleanliness', label: 'Cleanliness' },
    { value: 'other', label: 'Other' },
];

function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        pending: 'bg-amber-50 text-amber-700',
        approved: 'bg-emerald-50 text-emerald-700',
        rejected: 'bg-red-50 text-red-700',
        open: 'bg-blue-50 text-blue-700',
        in_progress: 'bg-amber-50 text-amber-700',
        resolved: 'bg-emerald-50 text-emerald-700',
        closed: 'bg-gray-100 text-gray-500',
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
            {status.replace('_', ' ')}
        </span>
    );
}

export default function StudentHostelPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    const [hostelInfo, setHostelInfo] = useState<HostelInfo | null>(null);
    const [roommates, setRoommates] = useState<Roommate[]>([]);
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [complaints, setComplaints] = useState<Complaint[]>([]);
    const [hasAllocation, setHasAllocation] = useState(false);

    // Forms
    const [showLeaveForm, setShowLeaveForm] = useState(false);
    const [leaveForm, setLeaveForm] = useState({
        leaveType: 'home_visit', fromDate: '', toDate: '', reason: '', guardianPhone: ''
    });
    const [showComplaintForm, setShowComplaintForm] = useState(false);
    const [complaintForm, setComplaintForm] = useState({
        complaintType: 'maintenance', description: '', priority: 'medium'
    });

    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    }), [token]);

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        setUser(parsed);
    }, [router, token]);

    const fetchData = useCallback(async () => {
        if (!token || !user) return;
        setLoading(true);
        try {
            const hdrs = headers();

            // Get allocation info
            const allocRes = await fetch('/api/hostel/allocations?status=active', { headers: hdrs });
            const allocData = await allocRes.json();
            const allocs = allocData.allocations || [];

            // Find this student's allocation
            const myAlloc = allocs.find((a: any) => a.student_id === user.studentId || a.student_id === user.id);

            if (myAlloc) {
                setHasAllocation(true);

                // Get building details for warden info
                const bldRes = await fetch('/api/hostel/buildings', { headers: hdrs });
                const bldData = await bldRes.json();
                const bld = (bldData.buildings || []).find((b: any) => b.id === myAlloc.hostel_id);

                setHostelInfo({
                    hostel_name: myAlloc.hostel_name,
                    room_number: myAlloc.room_number,
                    floor: myAlloc.floor,
                    room_type: myAlloc.room_type,
                    bed_number: myAlloc.bed_number,
                    from_date: myAlloc.from_date,
                    monthly_rent: myAlloc.monthly_rent,
                    warden_name: bld?.warden_name || '',
                    warden_phone: bld?.warden_phone || '',
                    assistant_warden_name: bld?.assistant_warden_name || '',
                    assistant_warden_phone: bld?.assistant_warden_phone || '',
                    mess_type: bld?.mess_type || 'none',
                    mess_charge: bld?.mess_charge || 0,
                });

                // Get roommates
                const roomRes = await fetch(`/api/hostel/rooms?roomId=${myAlloc.room_id}`, { headers: hdrs });
                const roomData = await roomRes.json();
                const occ = (roomData.occupants || []).filter((o: any) => o.student_id !== (user.studentId || user.id));
                setRoommates(occ);
            } else {
                setHasAllocation(false);
            }

            // Get leaves
            const leaveRes = await fetch('/api/hostel/leave-requests', { headers: hdrs });
            const leaveData = await leaveRes.json();
            setLeaves(leaveData.leaves || []);

            // Get complaints
            const compRes = await fetch('/api/hostel/complaints', { headers: hdrs });
            const compData = await compRes.json();
            setComplaints(compData.complaints || []);

        } catch (err) { console.error(err); }
        setLoading(false);
    }, [token, user, headers]);

    useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    const submitLeave = async () => {
        setSaving(true); setError('');
        try {
            const body = { ...leaveForm, studentId: user?.studentId || user?.id };
            const r = await fetch('/api/hostel/leave-requests', {
                method: 'POST', headers: headers(), body: JSON.stringify(body)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed');
            setSuccess('Leave request submitted!');
            setShowLeaveForm(false);
            setLeaveForm({ leaveType: 'home_visit', fromDate: '', toDate: '', reason: '', guardianPhone: '' });
            fetchData();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    const submitComplaint = async () => {
        setSaving(true); setError('');
        try {
            const body = { ...complaintForm, studentId: user?.studentId || user?.id };
            const r = await fetch('/api/hostel/complaints', {
                method: 'POST', headers: headers(), body: JSON.stringify(body)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed');
            setSuccess('Complaint submitted!');
            setShowComplaintForm(false);
            setComplaintForm({ complaintType: 'maintenance', description: '', priority: 'medium' });
            fetchData();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-4xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-900 via-indigo-900 to-indigo-950 text-white p-6 sm:p-8 mb-6 shadow-2xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-pink-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2">
                            <Home className="w-4 h-4 text-pink-400" />
                            <span className="text-pink-400 font-bold tracking-wider uppercase text-xs">My Hostel</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black">Hostel Information</h1>
                        <p className="text-indigo-200 text-sm mt-1">Your room, warden details, leave requests & complaints</p>
                    </div>
                </div>

                {/* Messages */}
                {success && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center justify-between shadow-sm">
                        <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {success}</span>
                        <button onClick={() => setSuccess('')}><X className="w-4 h-4" /></button>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                        <p className="text-gray-400 text-sm">Loading hostel data...</p>
                    </div>
                ) : !hasAllocation ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
                        <Home className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <h3 className="text-lg font-bold text-gray-700">No Hostel Allocation</h3>
                        <p className="text-sm text-gray-400 mt-1">You are not currently allocated to any hostel room. Contact your school administration for hostel allocation.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Room Info Card */}
                        {hostelInfo && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><BedDouble className="w-5 h-5 text-pink-500" /> Your Room</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <div className="bg-indigo-50 rounded-xl p-3 text-center">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">Hostel</p>
                                        <p className="text-sm font-black text-indigo-800 mt-1">{hostelInfo.hostel_name}</p>
                                    </div>
                                    <div className="bg-pink-50 rounded-xl p-3 text-center">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">Room</p>
                                        <p className="text-sm font-black text-pink-800 mt-1">{hostelInfo.room_number}</p>
                                        <p className="text-[10px] text-gray-400">Floor {hostelInfo.floor} · Bed {hostelInfo.bed_number || 'N/A'}</p>
                                    </div>
                                    <div className="bg-purple-50 rounded-xl p-3 text-center">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">Type</p>
                                        <p className="text-sm font-black text-purple-800 mt-1 capitalize">{hostelInfo.room_type.replace('_', ' ')}</p>
                                    </div>
                                    <div className="bg-emerald-50 rounded-xl p-3 text-center">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">Since</p>
                                        <p className="text-sm font-black text-emerald-800 mt-1">{new Date(hostelInfo.from_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Warden Info */}
                        {hostelInfo && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-500" /> Your Warden</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {hostelInfo.warden_name && (
                                        <div className="bg-gray-50 rounded-xl p-4">
                                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Warden</p>
                                            <p className="font-bold text-gray-800">{hostelInfo.warden_name}</p>
                                            {hostelInfo.warden_phone && (
                                                <a href={`tel:${hostelInfo.warden_phone}`} className="text-indigo-600 font-semibold text-sm hover:underline flex items-center gap-1 mt-1">
                                                    <Phone className="w-3.5 h-3.5" /> {hostelInfo.warden_phone}
                                                </a>
                                            )}
                                        </div>
                                    )}
                                    {hostelInfo.assistant_warden_name && (
                                        <div className="bg-gray-50 rounded-xl p-4">
                                            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Assistant Warden</p>
                                            <p className="font-bold text-gray-800">{hostelInfo.assistant_warden_name}</p>
                                            {hostelInfo.assistant_warden_phone && (
                                                <a href={`tel:${hostelInfo.assistant_warden_phone}`} className="text-indigo-600 font-semibold text-sm hover:underline flex items-center gap-1 mt-1">
                                                    <Phone className="w-3.5 h-3.5" /> {hostelInfo.assistant_warden_phone}
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {hostelInfo.mess_type && hostelInfo.mess_type !== 'none' && (
                                    <div className="mt-4 bg-amber-50 rounded-xl p-3 text-sm">
                                        <span className="font-bold text-amber-800">Mess:</span>
                                        <span className="ml-2 capitalize text-amber-700">{hostelInfo.mess_type.replace('_', '-')} · ₹{hostelInfo.mess_charge}/month</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Roommates */}
                        {roommates.length > 0 && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-purple-500" /> Your Roommates</h3>
                                <div className="space-y-2">
                                    {roommates.map((rm, i) => (
                                        <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                                            <div>
                                                <p className="font-bold text-gray-900 text-sm">{rm.student_name}</p>
                                                <p className="text-[10px] text-gray-400 font-mono">{rm.admission_number} · {rm.class_name} {rm.section_name}</p>
                                            </div>
                                            <span className="text-xs font-bold text-indigo-600">Bed {rm.bed_number || 'N/A'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Leave Requests */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-amber-500" /> Leave Requests</h3>
                                <Button onClick={() => { setShowLeaveForm(true); setError(''); }} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 gap-1">
                                    <Plus className="w-3.5 h-3.5" /> Apply Leave
                                </Button>
                            </div>

                            {showLeaveForm && (
                                <div className="mb-5 bg-indigo-50/50 border border-indigo-200 rounded-xl p-4 space-y-3">
                                    {error && <div className="p-2 bg-red-50 border border-red-100 text-xs text-red-700 rounded-lg">{error}</div>}
                                    <div className="grid grid-cols-3 gap-3">
                                        <select value={leaveForm.leaveType} onChange={e => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}
                                            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none font-semibold">
                                            {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                        <input type="date" value={leaveForm.fromDate} onChange={e => setLeaveForm({ ...leaveForm, fromDate: e.target.value })}
                                            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none" placeholder="From" />
                                        <input type="date" value={leaveForm.toDate} onChange={e => setLeaveForm({ ...leaveForm, toDate: e.target.value })}
                                            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none" placeholder="To" />
                                    </div>
                                    <textarea value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none resize-none" rows={2} placeholder="Reason for leave..." />
                                    <input value={leaveForm.guardianPhone} onChange={e => setLeaveForm({ ...leaveForm, guardianPhone: e.target.value })}
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none" placeholder="Guardian phone (optional)" />
                                    <div className="flex justify-end gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setShowLeaveForm(false)} className="text-xs">Cancel</Button>
                                        <Button size="sm" onClick={submitLeave} disabled={saving || !leaveForm.fromDate || !leaveForm.reason}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs">
                                            {saving && <Loader2 className="w-3 h-3 animate-spin" />} Submit
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {leaves.length > 0 ? (
                                <div className="space-y-2">
                                    {leaves.map(l => (
                                        <div key={l.id} className="border border-gray-100 rounded-xl px-4 py-3">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="capitalize text-xs font-semibold bg-gray-100 px-2 py-0.5 rounded-lg">{l.leave_type.replace('_', ' ')}</span>
                                                    <StatusBadge status={l.status} />
                                                </div>
                                                <span className="text-[10px] text-gray-400">{new Date(l.created_at).toLocaleDateString('en-IN')}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(l.from_date).toLocaleDateString('en-IN')} — {new Date(l.to_date).toLocaleDateString('en-IN')}
                                            </p>
                                            <p className="text-xs text-gray-600 mt-1">{l.reason}</p>
                                            {l.remarks && <p className="text-xs text-indigo-600 mt-1 italic">Warden: {l.remarks}</p>}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400 text-center py-6">No leave requests yet.</p>
                            )}
                        </div>

                        {/* Complaints */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Wrench className="w-5 h-5 text-red-500" /> My Complaints</h3>
                                <Button onClick={() => { setShowComplaintForm(true); setError(''); }} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 gap-1">
                                    <Plus className="w-3.5 h-3.5" /> New Complaint
                                </Button>
                            </div>

                            {showComplaintForm && (
                                <div className="mb-5 bg-red-50/30 border border-red-200 rounded-xl p-4 space-y-3">
                                    {error && <div className="p-2 bg-red-50 border border-red-100 text-xs text-red-700 rounded-lg">{error}</div>}
                                    <div className="grid grid-cols-2 gap-3">
                                        <select value={complaintForm.complaintType} onChange={e => setComplaintForm({ ...complaintForm, complaintType: e.target.value })}
                                            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none font-semibold">
                                            {COMPLAINT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                        <select value={complaintForm.priority} onChange={e => setComplaintForm({ ...complaintForm, priority: e.target.value })}
                                            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none font-semibold">
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                            <option value="urgent">Urgent</option>
                                        </select>
                                    </div>
                                    <textarea value={complaintForm.description} onChange={e => setComplaintForm({ ...complaintForm, description: e.target.value })}
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none resize-none" rows={3} placeholder="Describe the issue..." />
                                    <div className="flex justify-end gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setShowComplaintForm(false)} className="text-xs">Cancel</Button>
                                        <Button size="sm" onClick={submitComplaint} disabled={saving || !complaintForm.description}
                                            className="bg-red-500 hover:bg-red-600 text-white text-xs">
                                            {saving && <Loader2 className="w-3 h-3 animate-spin" />} Submit
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {complaints.length > 0 ? (
                                <div className="space-y-2">
                                    {complaints.map(c => (
                                        <div key={c.id} className="border border-gray-100 rounded-xl px-4 py-3">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="capitalize text-xs font-semibold bg-gray-100 px-2 py-0.5 rounded-lg">{c.complaint_type}</span>
                                                <StatusBadge status={c.status} />
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                    c.priority === 'urgent' ? 'bg-red-50 text-red-700' :
                                                    c.priority === 'high' ? 'bg-orange-50 text-orange-700' :
                                                    c.priority === 'medium' ? 'bg-yellow-50 text-yellow-700' :
                                                    'bg-green-50 text-green-700'
                                                }`}>{c.priority}</span>
                                            </div>
                                            <p className="text-xs text-gray-600 mt-1">{c.description}</p>
                                            {c.resolution_notes && <p className="text-xs text-emerald-600 mt-1 italic">Resolution: {c.resolution_notes}</p>}
                                            <p className="text-[10px] text-gray-400 mt-1">{new Date(c.created_at).toLocaleDateString('en-IN')}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400 text-center py-6">No complaints raised.</p>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
