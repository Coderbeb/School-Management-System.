'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import {
    Home, Plus, X, Edit2, Trash2, Loader2, Phone, Calendar,
    CheckCircle, Users, Search, AlertCircle, MapPin, LayoutGrid, BedDouble,
    ClipboardList, UserCheck, Wrench, BarChart3, ArrowLeftRight,
    Clock, FileText, XCircle, Eye, ChevronDown
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; schoolId?: string; }

interface Building {
    id: string; name: string; type: 'boys' | 'girls' | 'coed';
    warden_name: string; warden_phone: string; total_capacity: number;
    room_count: number; student_count: number; total_bed_capacity: number;
    address: string; assistant_warden_name: string; assistant_warden_phone: string;
    mess_type: string; mess_charge: number; is_active: boolean; session_id: string;
}

interface Room {
    id: string; hostel_id: string; hostel_name: string; room_number: string;
    floor: number; room_type: string;
    capacity: number; monthly_rent: number; is_active: boolean; occupancy_count: number;
    amenities: string; remarks: string;
}

interface Allocation {
    id: string; student_id: string; student_name: string; admission_number: string;
    room_id: string; room_number: string; floor: number; room_type: string;
    monthly_rent: number; hostel_name: string; hostel_id: string;
    class_name: string; section_name: string;
    bed_number: string; from_date: string; to_date: string; status: string;
    guardian_consent: boolean; remarks: string;
}

interface LeaveRequest {
    id: string; student_id: string; student_name: string; admission_number: string;
    class_name: string; section_name: string;
    leave_type: string; from_date: string; to_date: string; reason: string;
    guardian_phone: string; status: string; approved_by_name: string;
    approved_at: string; remarks: string; created_at: string;
}

interface Visitor {
    id: string; student_id: string; student_name: string; admission_number: string;
    class_name: string; section_name: string; hostel_name: string; room_number: string;
    visitor_name: string; visitor_relation: string; visitor_phone: string;
    purpose: string; check_in: string; check_out: string; remarks: string;
}

interface Complaint {
    id: string; student_id: string; student_name: string; admission_number: string;
    room_id: string; room_number: string; hostel_name: string;
    complaint_type: string; description: string; priority: string;
    status: string; resolved_by_name: string; resolved_at: string;
    resolution_notes: string; created_at: string;
}

interface StudentResult { id: string; name: string; admission_number: string; class_name: string; section_name: string; }

type TabType = 'buildings' | 'rooms' | 'allocations' | 'leaves' | 'visitors' | 'complaints' | 'reports';

const ROOM_TYPES = [
    { value: 'single', label: 'Single' },
    { value: 'double', label: 'Double Sharing' },
    { value: 'triple', label: 'Triple Sharing' },
    { value: 'four_sharing', label: '4-Sharing' },
    { value: 'six_sharing', label: '6-Sharing' },
    { value: 'dormitory', label: 'Dormitory' },
];

const AMENITY_OPTIONS = ['Fan', 'AC', 'Attached Bathroom', 'Cupboard', 'Study Table', 'Wi-Fi', 'Geyser'];

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

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3">
            {icon}
            <p className="text-sm text-gray-400 text-center max-w-md">{text}</p>
        </div>
    );
}

function StatusBadge({ status, type = 'default' }: { status: string; type?: string }) {
    const colors: Record<string, string> = {
        active: 'bg-emerald-50 text-emerald-700',
        vacated: 'bg-gray-100 text-gray-500',
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

function PriorityBadge({ priority }: { priority: string }) {
    const colors: Record<string, string> = {
        low: 'bg-green-50 text-green-700',
        medium: 'bg-yellow-50 text-yellow-700',
        high: 'bg-orange-50 text-orange-700',
        urgent: 'bg-red-50 text-red-700 animate-pulse',
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colors[priority] || 'bg-gray-100 text-gray-600'}`}>
            {priority}
        </span>
    );
}

function StudentSearchField({
    label, search, setSearch, results, selected, setSelected, setResults
}: {
    label: string; search: string; setSearch: (v: string) => void;
    results: StudentResult[]; selected: StudentResult | null;
    setSelected: (v: StudentResult | null) => void;
    setResults: (v: StudentResult[]) => void;
}) {
    return (
        <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">{label} *</label>
            {selected ? (
                <div className="flex items-center justify-between p-3 bg-indigo-50/50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-900">
                    <div>
                        <div>{selected.name}</div>
                        <div className="text-[10px] text-indigo-500 font-mono">{selected.admission_number} · {selected.class_name} {selected.section_name}</div>
                    </div>
                    <button onClick={() => { setSelected(null); setSearch(''); setResults([]); }}
                        className="p-1 hover:bg-indigo-100 rounded-full"><X className="w-3.5 h-3.5" /></button>
                </div>
            ) : (
                <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Type student name or admission number..."
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                    {results.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                            {results.map(st => (
                                <button key={st.id} onClick={() => { setSelected(st); setSearch(''); setResults([]); }}
                                    className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-xs transition-colors border-b border-gray-50 last:border-0">
                                    <div className="font-bold text-gray-900">{st.name}</div>
                                    <div className="text-gray-400 font-mono text-[10px]">{st.admission_number} · {st.class_name} {st.section_name}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function Modal({ show, onClose, title, error, children, footer }: {
    show: boolean; onClose: () => void; title: string;
    error?: string; children: React.ReactNode; footer: React.ReactNode;
}) {
    if (!show) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    {error && <div className="p-3 bg-red-50 border border-red-100 text-xs text-red-700 rounded-xl">{error}</div>}
                    {children}
                </div>
                <div className="p-6 border-t border-gray-100 flex justify-end gap-3 rounded-b-3xl shrink-0">
                    {footer}
                </div>
            </div>
        </div>
    );
}

export default function HostelPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [tab, setTab] = useState<TabType>('buildings');
    const [loading, setLoading] = useState(true);

    const [buildings, setBuildings] = useState<Building[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [allocations, setAllocations] = useState<Allocation[]>([]);
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [visitors, setVisitors] = useState<Visitor[]>([]);
    const [complaints, setComplaints] = useState<Complaint[]>([]);
    const [reportData, setReportData] = useState<any>(null);

    // Search & Filter
    const [searchQuery, setSearchQuery] = useState('');
    const [hostelFilter, setHostelFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    // Building Modal
    const [showBuildingModal, setShowBuildingModal] = useState(false);
    const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
    const [buildingForm, setBuildingForm] = useState({
        name: '', type: 'boys' as string,
        wardenName: '', wardenPhone: '', totalCapacity: '100',
        address: '', assistantWardenName: '', assistantWardenPhone: '',
        messType: 'none', messCharge: '0', isActive: true
    });

    // Room Modal
    const [showRoomModal, setShowRoomModal] = useState(false);
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);
    const [roomForm, setRoomForm] = useState({
        hostelId: '', roomNumber: '', floor: '0',
        roomType: 'double', capacity: '2', monthlyRent: '1500',
        isActive: true, amenities: '' as string, remarks: ''
    });
    const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);

    // Allocation Modal
    const [showAllocModal, setShowAllocModal] = useState(false);
    const [studentSearch, setStudentSearch] = useState('');
    const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
    const [allocForm, setAllocForm] = useState({
        hostelId: '', roomId: '', bedNumber: '',
        fromDate: new Date().toISOString().split('T')[0],
        remarks: '', guardianConsent: false
    });

    // Leave Modal
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [leaveForm, setLeaveForm] = useState({
        studentId: '', leaveType: 'home_visit', fromDate: '', toDate: '',
        reason: '', guardianPhone: ''
    });
    const [leaveStudentSearch, setLeaveStudentSearch] = useState('');
    const [leaveStudentResults, setLeaveStudentResults] = useState<StudentResult[]>([]);
    const [selectedLeaveStudent, setSelectedLeaveStudent] = useState<StudentResult | null>(null);

    // Leave Action Modal (approve/reject)
    const [showLeaveActionModal, setShowLeaveActionModal] = useState(false);
    const [leaveActionTarget, setLeaveActionTarget] = useState<LeaveRequest | null>(null);
    const [leaveActionRemarks, setLeaveActionRemarks] = useState('');

    // Visitor Modal
    const [showVisitorModal, setShowVisitorModal] = useState(false);
    const [visitorStudentSearch, setVisitorStudentSearch] = useState('');
    const [visitorStudentResults, setVisitorStudentResults] = useState<StudentResult[]>([]);
    const [selectedVisitorStudent, setSelectedVisitorStudent] = useState<StudentResult | null>(null);
    const [visitorForm, setVisitorForm] = useState({
        visitorName: '', visitorRelation: 'father', visitorPhone: '', purpose: ''
    });

    // Complaint Modal
    const [showComplaintModal, setShowComplaintModal] = useState(false);
    const [complaintStudentSearch, setComplaintStudentSearch] = useState('');
    const [complaintStudentResults, setComplaintStudentResults] = useState<StudentResult[]>([]);
    const [selectedComplaintStudent, setSelectedComplaintStudent] = useState<StudentResult | null>(null);
    const [complaintForm, setComplaintForm] = useState({
        complaintType: 'maintenance', description: '', priority: 'medium'
    });

    // Complaint Update Modal
    const [showComplaintUpdateModal, setShowComplaintUpdateModal] = useState(false);
    const [complaintUpdateTarget, setComplaintUpdateTarget] = useState<Complaint | null>(null);
    const [complaintUpdateForm, setComplaintUpdateForm] = useState({ status: '', resolutionNotes: '' });

    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    }), [token]);

    // ====== DATA FETCHING ======
    const fetchData = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const hdrs = headers();
            const [bldRes, rmRes] = await Promise.all([
                fetch('/api/hostel/buildings', { headers: hdrs }),
                fetch(`/api/hostel/rooms${hostelFilter ? `?hostelId=${hostelFilter}` : ''}`, { headers: hdrs }),
            ]);
            const [bldData, rmData] = await Promise.all([bldRes.json(), rmRes.json()]);
            setBuildings(bldData.buildings || []);
            setRooms(rmData.rooms || []);
        } catch (err) { console.error(err); }
        setLoading(false);
    }, [token, hostelFilter, headers]);

    // Refs for filter values so fetchAllocations identity stays stable
    const hostelSearchRef = useRef(searchQuery);
    const hostelFilterRef = useRef(hostelFilter);
    hostelSearchRef.current = searchQuery;
    hostelFilterRef.current = hostelFilter;

    const fetchAllocations = useCallback(async () => {
        if (!token) return;
        try {
            const params = new URLSearchParams();
            if (hostelFilterRef.current) params.set('hostelId', hostelFilterRef.current);
            if (hostelSearchRef.current) params.set('search', hostelSearchRef.current);
            const url = `/api/hostel/allocations${params.toString() ? `?${params}` : ''}`;
            const res = await fetch(url, { headers: headers() });
            const data = await res.json();
            setAllocations(data.allocations || []);
        } catch (err) { console.error(err); }
    }, [token, headers]);

    const fetchLeaves = useCallback(async () => {
        if (!token) return;
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set('status', statusFilter);
            const url = `/api/hostel/leave-requests${params.toString() ? `?${params}` : ''}`;
            const res = await fetch(url, { headers: headers() });
            const data = await res.json();
            setLeaves(data.leaves || []);
        } catch (err) { console.error(err); }
    }, [token, statusFilter, headers]);

    const fetchVisitors = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/hostel/visitors?todayOnly=true', { headers: headers() });
            const data = await res.json();
            setVisitors(data.visitors || []);
        } catch (err) { console.error(err); }
    }, [token, headers]);

    const fetchComplaints = useCallback(async () => {
        if (!token) return;
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set('status', statusFilter);
            const url = `/api/hostel/complaints${params.toString() ? `?${params}` : ''}`;
            const res = await fetch(url, { headers: headers() });
            const data = await res.json();
            setComplaints(data.complaints || []);
        } catch (err) { console.error(err); }
    }, [token, statusFilter, headers]);

    const fetchReports = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/hostel/reports?type=occupancy', { headers: headers() });
            const data = await res.json();
            setReportData(data);
        } catch (err) { console.error(err); }
    }, [token, headers]);

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (!['developer', 'super_admin'].includes(parsed.role)) { router.replace('/dashboard'); return; }
        setUser(parsed);
    }, [router, token]);

    useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

    useEffect(() => {
        if (!user) return;
        if (tab === 'allocations') fetchAllocations();
        else if (tab === 'leaves') fetchLeaves();
        else if (tab === 'visitors') fetchVisitors();
        else if (tab === 'complaints') fetchComplaints();
        else if (tab === 'reports') fetchReports();
    }, [tab, user, fetchAllocations, fetchLeaves, fetchVisitors, fetchComplaints, fetchReports]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    // ====== STUDENT SEARCH HOOK ======
    function useStudentSearch(searchVal: string, setResults: (r: StudentResult[]) => void) {
        useEffect(() => {
            if (!searchVal.trim()) { setResults([]); return; }
            const t = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/students?search=${encodeURIComponent(searchVal)}`, { headers: headers() });
                    if (res.ok) { const d = await res.json(); setResults(d.students || []); }
                } catch (err) { console.error(err); }
            }, 300);
            return () => clearTimeout(t);
        }, [searchVal]);
    }
    useStudentSearch(studentSearch, setStudentResults);
    useStudentSearch(leaveStudentSearch, setLeaveStudentResults);
    useStudentSearch(visitorStudentSearch, setVisitorStudentResults);
    useStudentSearch(complaintStudentSearch, setComplaintStudentResults);

    // ====== BUILDING HANDLERS ======
    const openAddBuilding = () => {
        setEditingBuilding(null);
        setBuildingForm({
            name: '', type: 'boys', wardenName: '', wardenPhone: '', totalCapacity: '100',
            address: '', assistantWardenName: '', assistantWardenPhone: '',
            messType: 'none', messCharge: '0', isActive: true
        });
        setError('');
        setShowBuildingModal(true);
    };

    const openEditBuilding = (b: Building) => {
        setEditingBuilding(b);
        setBuildingForm({
            name: b.name, type: b.type,
            wardenName: b.warden_name || '', wardenPhone: b.warden_phone || '',
            totalCapacity: b.total_capacity.toString(),
            address: b.address || '',
            assistantWardenName: b.assistant_warden_name || '',
            assistantWardenPhone: b.assistant_warden_phone || '',
            messType: b.mess_type || 'none', messCharge: (b.mess_charge || 0).toString(),
            isActive: b.is_active !== false
        });
        setError('');
        setShowBuildingModal(true);
    };

    const saveBuilding = async () => {
        setSaving(true); setError('');
        try {
            const method = editingBuilding ? 'PUT' : 'POST';
            const body = { id: editingBuilding?.id, ...buildingForm };
            const r = await fetch('/api/hostel/buildings', { method, headers: headers(), body: JSON.stringify(body) });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to save building');
            setSuccess(editingBuilding ? 'Hostel building updated!' : 'Hostel building created!');
            setShowBuildingModal(false);
            fetchData();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    const deleteBuilding = async (id: string) => {
        if (!confirm('Are you sure you want to delete this hostel? All rooms and allocations will be deleted.')) return;
        try {
            const r = await fetch(`/api/hostel/buildings?id=${id}`, { method: 'DELETE', headers: headers() });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to delete');
            setSuccess('Hostel building deleted!');
            fetchData();
        } catch (err: any) { alert(err.message); }
    };

    // ====== ROOM HANDLERS ======
    const openAddRoom = () => {
        setEditingRoom(null);
        setRoomForm({
            hostelId: buildings[0]?.id || '', roomNumber: '', floor: '0',
            roomType: 'double', capacity: '2', monthlyRent: '1500',
            isActive: true, amenities: '', remarks: ''
        });
        setSelectedAmenities([]);
        setError('');
        setShowRoomModal(true);
    };

    const openEditRoom = (rm: Room) => {
        setEditingRoom(rm);
        const amens = rm.amenities ? rm.amenities.split(',').map(a => a.trim()) : [];
        setSelectedAmenities(amens);
        setRoomForm({
            hostelId: rm.hostel_id, roomNumber: rm.room_number, floor: rm.floor.toString(),
            roomType: rm.room_type, capacity: rm.capacity.toString(),
            monthlyRent: rm.monthly_rent.toString(), isActive: rm.is_active,
            amenities: rm.amenities || '', remarks: rm.remarks || ''
        });
        setError('');
        setShowRoomModal(true);
    };

    const saveRoom = async () => {
        setSaving(true); setError('');
        try {
            const method = editingRoom ? 'PUT' : 'POST';
            const body = { id: editingRoom?.id, ...roomForm, amenities: selectedAmenities.join(', ') };
            const r = await fetch('/api/hostel/rooms', { method, headers: headers(), body: JSON.stringify(body) });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to save room');
            setSuccess('Room saved successfully!');
            setShowRoomModal(false);
            fetchData();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    const deleteRoom = async (id: string) => {
        if (!confirm('Delete this room? This cannot be undone.')) return;
        try {
            const r = await fetch(`/api/hostel/rooms?id=${id}`, { method: 'DELETE', headers: headers() });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to delete room');
            setSuccess('Room deleted!');
            fetchData();
        } catch (err: any) { alert(err.message); }
    };

    // ====== ALLOCATION HANDLERS ======
    const openAllocModal = () => {
        setSelectedStudent(null); setStudentSearch(''); setStudentResults([]);
        setAllocForm({
            hostelId: buildings[0]?.id || '', roomId: '', bedNumber: '',
            fromDate: new Date().toISOString().split('T')[0], remarks: '', guardianConsent: false
        });
        setError(''); setShowAllocModal(true);
    };

    const saveAllocation = async () => {
        if (!selectedStudent) { setError('Please select a student'); return; }
        setSaving(true); setError('');
        try {
            const body = {
                studentId: selectedStudent.id, roomId: allocForm.roomId,
                bedNumber: allocForm.bedNumber, fromDate: allocForm.fromDate,
                remarks: allocForm.remarks, guardianConsent: allocForm.guardianConsent
            };
            const r = await fetch('/api/hostel/allocations', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to allocate room');
            setSuccess('Hostel room allocated successfully!');
            setShowAllocModal(false);
            fetchAllocations(); fetchData();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    const vacateStudent = async (allocId: string) => {
        if (!confirm('Are you sure you want to vacate this student from the hostel room?')) return;
        try {
            const r = await fetch('/api/hostel/allocations', {
                method: 'PUT', headers: headers(), body: JSON.stringify({ id: allocId })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to vacate');
            setSuccess('Student vacated from room.');
            fetchAllocations(); fetchData();
        } catch (err: any) { alert(err.message); }
    };

    // ====== LEAVE REQUEST HANDLERS ======
    const openLeaveModal = () => {
        setSelectedLeaveStudent(null); setLeaveStudentSearch('');
        setLeaveForm({ studentId: '', leaveType: 'home_visit', fromDate: '', toDate: '', reason: '', guardianPhone: '' });
        setError(''); setShowLeaveModal(true);
    };

    const saveLeave = async () => {
        if (!selectedLeaveStudent) { setError('Please select a student'); return; }
        setSaving(true); setError('');
        try {
            const body = { studentId: selectedLeaveStudent.id, ...leaveForm };
            const r = await fetch('/api/hostel/leave-requests', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to submit leave request');
            setSuccess('Leave request submitted!');
            setShowLeaveModal(false);
            fetchLeaves();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    const openLeaveAction = (leave: LeaveRequest) => {
        setLeaveActionTarget(leave);
        setLeaveActionRemarks('');
        setShowLeaveActionModal(true);
    };

    const processLeave = async (status: 'approved' | 'rejected') => {
        if (!leaveActionTarget) return;
        setSaving(true);
        try {
            const r = await fetch('/api/hostel/leave-requests', {
                method: 'PUT', headers: headers(),
                body: JSON.stringify({ id: leaveActionTarget.id, status, remarks: leaveActionRemarks })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed');
            setSuccess(`Leave ${status}!`);
            setShowLeaveActionModal(false);
            fetchLeaves();
        } catch (err: any) { alert(err.message); }
        setSaving(false);
    };

    // ====== VISITOR HANDLERS ======
    const openVisitorModal = () => {
        setSelectedVisitorStudent(null); setVisitorStudentSearch('');
        setVisitorForm({ visitorName: '', visitorRelation: 'father', visitorPhone: '', purpose: '' });
        setError(''); setShowVisitorModal(true);
    };

    const saveVisitor = async () => {
        if (!selectedVisitorStudent) { setError('Please select a student'); return; }
        setSaving(true); setError('');
        try {
            const body = { studentId: selectedVisitorStudent.id, ...visitorForm };
            const r = await fetch('/api/hostel/visitors', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to record visitor');
            setSuccess('Visitor checked in!');
            setShowVisitorModal(false);
            fetchVisitors();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    const checkOutVisitor = async (id: string) => {
        if (!confirm('Check out this visitor?')) return;
        try {
            const r = await fetch('/api/hostel/visitors', {
                method: 'PUT', headers: headers(), body: JSON.stringify({ id })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed');
            setSuccess('Visitor checked out!');
            fetchVisitors();
        } catch (err: any) { alert(err.message); }
    };

    // ====== COMPLAINT HANDLERS ======
    const openComplaintModal = () => {
        setSelectedComplaintStudent(null); setComplaintStudentSearch('');
        setComplaintForm({ complaintType: 'maintenance', description: '', priority: 'medium' });
        setError(''); setShowComplaintModal(true);
    };

    const saveComplaint = async () => {
        setSaving(true); setError('');
        try {
            const body = {
                studentId: selectedComplaintStudent?.id || null,
                ...complaintForm
            };
            const r = await fetch('/api/hostel/complaints', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to submit complaint');
            setSuccess('Complaint submitted!');
            setShowComplaintModal(false);
            fetchComplaints();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    const openComplaintUpdate = (c: Complaint) => {
        setComplaintUpdateTarget(c);
        setComplaintUpdateForm({ status: c.status, resolutionNotes: '' });
        setShowComplaintUpdateModal(true);
    };

    const updateComplaint = async () => {
        if (!complaintUpdateTarget) return;
        setSaving(true);
        try {
            const r = await fetch('/api/hostel/complaints', {
                method: 'PUT', headers: headers(),
                body: JSON.stringify({ id: complaintUpdateTarget.id, ...complaintUpdateForm })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed');
            setSuccess('Complaint updated!');
            setShowComplaintUpdateModal(false);
            fetchComplaints();
        } catch (err: any) { alert(err.message); }
        setSaving(false);
    };

    // Filter rooms by selected hostel in allocation modal
    const allocRooms = rooms.filter(r => r.hostel_id === allocForm.hostelId && r.is_active && r.occupancy_count < r.capacity);

    // ====== TABS CONFIG ======
    const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
        { key: 'buildings', label: 'Buildings', icon: <Home className="w-4 h-4" /> },
        { key: 'rooms', label: 'Rooms', icon: <LayoutGrid className="w-4 h-4" /> },
        { key: 'allocations', label: 'Allocations', icon: <Users className="w-4 h-4" /> },
        { key: 'leaves', label: 'Leave Requests', icon: <ClipboardList className="w-4 h-4" /> },
        { key: 'visitors', label: 'Visitors', icon: <UserCheck className="w-4 h-4" /> },
        { key: 'complaints', label: 'Complaints', icon: <Wrench className="w-4 h-4" /> },
        { key: 'reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
    ];

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-7xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-900 via-indigo-900 to-indigo-950 text-white p-6 sm:p-8 mb-6 shadow-2xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-pink-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-indigo-500 rounded-full mix-blend-screen filter blur-3xl opacity-20"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Home className="w-4 h-4 text-pink-400" />
                                <span className="text-pink-400 font-bold tracking-wider uppercase text-xs">Hostel Portal</span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-black">Hostel Management</h1>
                            <p className="text-indigo-200 text-sm mt-1">Buildings, rooms, allocations, leave, visitors, complaints & reports</p>
                        </div>
                        <div className="flex gap-2">
                            {tab === 'buildings' && <Button onClick={openAddBuilding} className="bg-pink-500 hover:bg-pink-600 text-white gap-2 shadow-lg h-10"><Plus className="w-4 h-4" /> Add Building</Button>}
                            {tab === 'rooms' && <Button onClick={openAddRoom} className="bg-pink-500 hover:bg-pink-600 text-white gap-2 shadow-lg h-10"><Plus className="w-4 h-4" /> Add Room</Button>}
                            {tab === 'allocations' && <Button onClick={openAllocModal} className="bg-pink-500 hover:bg-pink-600 text-white gap-2 shadow-lg h-10"><Plus className="w-4 h-4" /> Allocate Room</Button>}
                            {tab === 'leaves' && <Button onClick={openLeaveModal} className="bg-pink-500 hover:bg-pink-600 text-white gap-2 shadow-lg h-10"><Plus className="w-4 h-4" /> New Leave</Button>}
                            {tab === 'visitors' && <Button onClick={openVisitorModal} className="bg-pink-500 hover:bg-pink-600 text-white gap-2 shadow-lg h-10"><Plus className="w-4 h-4" /> Check-in Visitor</Button>}
                            {tab === 'complaints' && <Button onClick={openComplaintModal} className="bg-pink-500 hover:bg-pink-600 text-white gap-2 shadow-lg h-10"><Plus className="w-4 h-4" /> Raise Complaint</Button>}
                        </div>
                    </div>
                </div>

                {/* Messages */}
                {success && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center justify-between shadow-sm">
                        <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {success}</span>
                        <button onClick={() => setSuccess('')}><X className="w-4 h-4" /></button>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex items-center gap-1 bg-white rounded-xl p-1 border border-gray-200 mb-5 w-fit overflow-x-auto">
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => { setTab(t.key); setStatusFilter(''); setSearchQuery(''); }}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${tab === t.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                        <p className="text-gray-400 text-sm">Loading hostel data...</p>
                    </div>
                ) : (
                    <>
                        {/* ===== BUILDINGS TAB ===== */}
                        {tab === 'buildings' && (
                            buildings.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {buildings.map(b => {
                                        const occPercent = b.total_bed_capacity > 0 ? Math.round((b.student_count / b.total_bed_capacity) * 100) : 0;
                                        return (
                                            <div key={b.id} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow flex flex-col justify-between ${!b.is_active ? 'opacity-60' : ''}`}>
                                                <div>
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] uppercase font-bold text-gray-400">{b.type} HOSTEL</span>
                                                                {!b.is_active && <span className="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-bold">INACTIVE</span>}
                                                            </div>
                                                            <h3 className="text-lg font-black text-gray-900">{b.name}</h3>
                                                            {b.address && <p className="text-[11px] text-gray-400 mt-0.5">{b.address}</p>}
                                                        </div>
                                                        <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full">
                                                            {b.room_count} Rooms
                                                        </span>
                                                    </div>

                                                    <div className="space-y-2 text-sm bg-gray-50 p-3 rounded-xl mb-3">
                                                        <div className="flex justify-between">
                                                            <span className="text-xs text-gray-400 font-medium">Warden:</span>
                                                            <span className="font-bold text-gray-800">{b.warden_name || 'Not assigned'}</span>
                                                        </div>
                                                        {b.warden_phone && (
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs text-gray-400 font-medium">Phone:</span>
                                                                <a href={`tel:${b.warden_phone}`} className="text-indigo-600 font-bold hover:underline flex items-center gap-1 text-xs">
                                                                    <Phone className="w-3 h-3" /> {b.warden_phone}
                                                                </a>
                                                            </div>
                                                        )}
                                                        {b.assistant_warden_name && (
                                                            <div className="flex justify-between">
                                                                <span className="text-xs text-gray-400 font-medium">Asst. Warden:</span>
                                                                <span className="font-semibold text-gray-700 text-xs">{b.assistant_warden_name}</span>
                                                            </div>
                                                        )}
                                                        {b.mess_type && b.mess_type !== 'none' && (
                                                            <div className="flex justify-between">
                                                                <span className="text-xs text-gray-400 font-medium">Mess:</span>
                                                                <span className="font-semibold text-gray-700 text-xs capitalize">{b.mess_type.replace('_', '-')} · ₹{b.mess_charge}/month</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="mb-3">
                                                        <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1">
                                                            <span>Occupancy</span>
                                                            <span>{b.student_count} / {b.total_bed_capacity} beds</span>
                                                        </div>
                                                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                                            <div className={`h-full rounded-full transition-all ${occPercent >= 90 ? 'bg-red-500' : occPercent >= 75 ? 'bg-amber-500' : 'bg-pink-500'}`}
                                                                style={{ width: `${Math.min(occPercent, 100)}%` }} />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex justify-end gap-2 border-t border-gray-50 pt-3">
                                                    <button onClick={() => openEditBuilding(b)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"><Edit2 className="w-4 h-4" /></button>
                                                    <button onClick={() => deleteBuilding(b.id)} className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <EmptyState icon={<Home className="w-12 h-12" />} text='No hostel buildings created. Click "Add Building" to define one.' />
                            )
                        )}

                        {/* ===== ROOMS TAB ===== */}
                        {tab === 'rooms' && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-bold text-gray-400 uppercase">Filter Hostel:</label>
                                        <select value={hostelFilter} onChange={e => setHostelFilter(e.target.value)}
                                            className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none">
                                            <option value="">All Buildings</option>
                                            {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    </div>
                                    <Button size="sm" onClick={fetchData} className="text-xs h-8">Apply</Button>
                                </div>

                                {rooms.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                                        {rooms.map(rm => {
                                            const isFull = rm.occupancy_count >= rm.capacity;
                                            const typeLabel = ROOM_TYPES.find(t => t.value === rm.room_type)?.label || rm.room_type;
                                            return (
                                                <div key={rm.id}
                                                    className={`p-4 rounded-2xl border transition-all text-center relative group hover:shadow-md ${
                                                        !rm.is_active ? 'bg-gray-100/50 border-gray-200 opacity-60' :
                                                        isFull ? 'bg-red-50/50 border-red-200' : 'bg-white border-gray-150'
                                                    }`}>
                                                    <span className="text-[10px] uppercase font-bold text-gray-400 block">{rm.hostel_name}</span>
                                                    <h4 className="font-black text-gray-900 text-lg mt-1">Room {rm.room_number}</h4>
                                                    <p className="text-[10px] text-gray-500 font-semibold mt-0.5">{typeLabel} · Floor {rm.floor}</p>
                                                    {rm.amenities && (
                                                        <p className="text-[9px] text-indigo-500 font-medium mt-1 truncate" title={rm.amenities}>{rm.amenities}</p>
                                                    )}
                                                    <p className="text-xs font-bold text-emerald-700 mt-2">₹{rm.monthly_rent}/mo</p>
                                                    <div className="mt-3 flex items-center justify-center gap-1">
                                                        <BedDouble className="w-3.5 h-3.5 text-gray-400" />
                                                        <span className="text-[11px] font-bold text-gray-700">{rm.occupancy_count} / {rm.capacity}</span>
                                                    </div>
                                                    <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                                                        <button onClick={() => openEditRoom(rm)} className="p-1 bg-white/90 rounded-lg hover:bg-gray-100 shadow-sm"><Edit2 className="w-3 h-3 text-gray-500" /></button>
                                                        <button onClick={() => deleteRoom(rm.id)} className="p-1 bg-white/90 rounded-lg hover:bg-red-50 shadow-sm"><Trash2 className="w-3 h-3 text-red-500" /></button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <EmptyState icon={<LayoutGrid className="w-12 h-12" />} text="No rooms found." />
                                )}
                            </div>
                        )}

                        {/* ===== ALLOCATIONS TAB ===== */}
                        {tab === 'allocations' && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                                    <div className="relative sm:col-span-2">
                                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                                        <input type="text" placeholder="Search by student name or admission number..."
                                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                    </div>
                                    <select value={hostelFilter} onChange={e => setHostelFilter(e.target.value)}
                                        className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none">
                                        <option value="">All Hostels</option>
                                        {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>

                                {allocations.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse text-sm">
                                            <thead>
                                                <tr className="bg-gray-50 text-gray-400 font-bold uppercase border-b border-gray-100 text-xs">
                                                    <th className="py-3 px-4">Student</th>
                                                    <th className="py-3 px-4">Class</th>
                                                    <th className="py-3 px-4">Hostel / Room</th>
                                                    <th className="py-3 px-4">Bed #</th>
                                                    <th className="py-3 px-4">Since</th>
                                                    <th className="py-3 px-4 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {allocations.map(a => (
                                                    <tr key={a.id} className="hover:bg-gray-50/40 transition-colors">
                                                        <td className="py-3 px-4">
                                                            <div className="font-bold text-gray-900">{a.student_name}</div>
                                                            <div className="text-[10px] text-gray-400 font-mono">{a.admission_number}</div>
                                                        </td>
                                                        <td className="py-3 px-4 font-semibold text-gray-600">{a.class_name} - {a.section_name}</td>
                                                        <td className="py-3 px-4">
                                                            <div className="font-bold text-gray-800 flex items-center gap-1.5">
                                                                <Home className="w-3.5 h-3.5 text-pink-500 shrink-0" /> {a.hostel_name}
                                                            </div>
                                                            <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                                                                <MapPin className="w-3 h-3 text-gray-400 shrink-0" /> Room {a.room_number} (Floor {a.floor})
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4 font-mono font-bold text-indigo-700">{a.bed_number || 'N/A'}</td>
                                                        <td className="py-3 px-4 text-gray-600 font-medium text-xs">{new Date(a.from_date).toLocaleDateString('en-IN')}</td>
                                                        <td className="py-3 px-4 text-right">
                                                            {a.status === 'active' ? (
                                                                <button onClick={() => vacateStudent(a.id)}
                                                                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg text-xs transition-colors">
                                                                    Vacate
                                                                </button>
                                                            ) : (
                                                                <span className="text-[10px] text-gray-400 font-bold uppercase">VACATED</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <EmptyState icon={<Users className="w-12 h-12" />} text="No active allocations found." />
                                )}
                            </div>
                        )}

                        {/* ===== LEAVE REQUESTS TAB ===== */}
                        {tab === 'leaves' && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <div className="flex items-center gap-3 mb-5">
                                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none font-semibold">
                                        <option value="">All Status</option>
                                        <option value="pending">Pending</option>
                                        <option value="approved">Approved</option>
                                        <option value="rejected">Rejected</option>
                                    </select>
                                </div>

                                {leaves.length > 0 ? (
                                    <div className="space-y-3">
                                        {leaves.map(l => (
                                            <div key={l.id} className="border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
                                                <div className="flex flex-col sm:flex-row justify-between gap-3">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1.5">
                                                            <span className="font-bold text-gray-900 text-sm">{l.student_name}</span>
                                                            <span className="text-[10px] font-mono text-gray-400">{l.admission_number}</span>
                                                            <StatusBadge status={l.status} />
                                                        </div>
                                                        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                                                            <span className="flex items-center gap-1">
                                                                <Calendar className="w-3 h-3" />
                                                                {new Date(l.from_date).toLocaleDateString('en-IN')} — {new Date(l.to_date).toLocaleDateString('en-IN')}
                                                            </span>
                                                            <span className="capitalize bg-gray-100 px-2 py-0.5 rounded-lg font-semibold">{l.leave_type.replace('_', ' ')}</span>
                                                            {l.guardian_phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {l.guardian_phone}</span>}
                                                        </div>
                                                        <p className="text-xs text-gray-600 mt-2 bg-gray-50 p-2 rounded-lg">{l.reason}</p>
                                                        {l.remarks && <p className="text-xs text-indigo-600 mt-1 italic">Warden: {l.remarks}</p>}
                                                    </div>
                                                    {l.status === 'pending' && (
                                                        <div className="flex items-start gap-2 shrink-0">
                                                            <button onClick={() => openLeaveAction(l)}
                                                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs">
                                                                Review
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState icon={<ClipboardList className="w-12 h-12" />} text="No leave requests found." />
                                )}
                            </div>
                        )}

                        {/* ===== VISITORS TAB ===== */}
                        {tab === 'visitors' && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <p className="text-xs font-bold text-gray-400 uppercase mb-4">Today&apos;s Visitors</p>
                                {visitors.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse text-sm">
                                            <thead>
                                                <tr className="bg-gray-50 text-gray-400 font-bold uppercase border-b border-gray-100 text-xs">
                                                    <th className="py-3 px-4">Visitor</th>
                                                    <th className="py-3 px-4">Student</th>
                                                    <th className="py-3 px-4">Room</th>
                                                    <th className="py-3 px-4">Check-in</th>
                                                    <th className="py-3 px-4">Check-out</th>
                                                    <th className="py-3 px-4 text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {visitors.map(v => (
                                                    <tr key={v.id} className={`transition-colors ${!v.check_out ? 'bg-emerald-50/30' : ''}`}>
                                                        <td className="py-3 px-4">
                                                            <div className="font-bold text-gray-900">{v.visitor_name}</div>
                                                            <div className="text-[10px] text-gray-400 capitalize">{v.visitor_relation} · {v.visitor_phone || 'No phone'}</div>
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <div className="font-semibold text-gray-800">{v.student_name}</div>
                                                            <div className="text-[10px] text-gray-400 font-mono">{v.admission_number}</div>
                                                        </td>
                                                        <td className="py-3 px-4 text-gray-600 text-xs font-medium">
                                                            {v.hostel_name ? `${v.hostel_name} · Room ${v.room_number}` : 'N/A'}
                                                        </td>
                                                        <td className="py-3 px-4 text-xs font-medium text-gray-600">
                                                            {new Date(v.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                        </td>
                                                        <td className="py-3 px-4 text-xs font-medium">
                                                            {v.check_out
                                                                ? <span className="text-gray-500">{new Date(v.check_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                                                                : <span className="text-emerald-600 font-bold">IN CAMPUS</span>
                                                            }
                                                        </td>
                                                        <td className="py-3 px-4 text-right">
                                                            {!v.check_out && (
                                                                <button onClick={() => checkOutVisitor(v.id)}
                                                                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-lg text-xs">
                                                                    Check Out
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <EmptyState icon={<UserCheck className="w-12 h-12" />} text="No visitors today." />
                                )}
                            </div>
                        )}

                        {/* ===== COMPLAINTS TAB ===== */}
                        {tab === 'complaints' && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <div className="flex items-center gap-3 mb-5">
                                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                                        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none font-semibold">
                                        <option value="">All Status</option>
                                        <option value="open">Open</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="resolved">Resolved</option>
                                        <option value="closed">Closed</option>
                                    </select>
                                </div>

                                {complaints.length > 0 ? (
                                    <div className="space-y-3">
                                        {complaints.map(c => (
                                            <div key={c.id} className="border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
                                                <div className="flex flex-col sm:flex-row justify-between gap-3">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                            <PriorityBadge priority={c.priority} />
                                                            <StatusBadge status={c.status} />
                                                            <span className="capitalize bg-gray-100 px-2 py-0.5 rounded-lg text-[10px] font-bold text-gray-600">
                                                                {c.complaint_type}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-gray-800 font-medium">{c.description}</p>
                                                        <div className="flex flex-wrap gap-3 text-[11px] text-gray-400 mt-2">
                                                            {c.student_name && <span>By: {c.student_name}</span>}
                                                            {c.room_number && <span>Room {c.room_number} · {c.hostel_name}</span>}
                                                            <span>{new Date(c.created_at).toLocaleDateString('en-IN')}</span>
                                                        </div>
                                                        {c.resolution_notes && <p className="text-xs text-emerald-600 mt-2 italic">Resolution: {c.resolution_notes}</p>}
                                                    </div>
                                                    {(c.status === 'open' || c.status === 'in_progress') && (
                                                        <button onClick={() => openComplaintUpdate(c)}
                                                            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs h-fit shrink-0">
                                                            Update
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState icon={<Wrench className="w-12 h-12" />} text="No complaints found." />
                                )}
                            </div>
                        )}

                        {/* ===== REPORTS TAB ===== */}
                        {tab === 'reports' && reportData && (
                            <div className="space-y-6">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    {[
                                        { label: 'Total Buildings', value: reportData.totals?.totalBuildings || 0, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                                        { label: 'Total Rooms', value: reportData.totals?.totalRooms || 0, color: 'text-purple-600', bg: 'bg-purple-50' },
                                        { label: 'Occupied Beds', value: `${reportData.totals?.occupiedBeds || 0} / ${reportData.totals?.totalBeds || 0}`, color: 'text-pink-600', bg: 'bg-pink-50' },
                                        { label: 'Occupancy', value: `${reportData.totals?.occupancyPercent || 0}%`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                                    ].map((s, i) => (
                                        <div key={i} className={`${s.bg} rounded-2xl p-5 text-center`}>
                                            <p className="text-xs font-bold text-gray-500 uppercase mb-1">{s.label}</p>
                                            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Building-wise breakdown */}
                                {reportData.buildings?.length > 0 && (
                                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                        <h3 className="font-bold text-gray-800 mb-4">Building-wise Occupancy</h3>
                                        <div className="space-y-4">
                                            {reportData.buildings.map((b: any) => {
                                                const pct = b.total_beds > 0 ? Math.round((b.occupied_beds / b.total_beds) * 100) : 0;
                                                return (
                                                    <div key={b.id}>
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-sm font-bold text-gray-800">{b.name} <span className="text-xs text-gray-400 capitalize">({b.type})</span></span>
                                                            <span className="text-xs font-bold text-gray-600">{b.occupied_beds} / {b.total_beds} beds ({pct}%)</span>
                                                        </div>
                                                        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                                            <div className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                                                                style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* ===== MODALS ===== */}

                {/* Building Modal */}
                <Modal show={showBuildingModal} onClose={() => setShowBuildingModal(false)}
                    title={editingBuilding ? 'Edit Building Details' : 'Add Hostel Building'} error={error}
                    footer={<>
                        <Button variant="outline" onClick={() => setShowBuildingModal(false)}>Cancel</Button>
                        <Button onClick={saveBuilding} disabled={saving || !buildingForm.name}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4">
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
                        </Button>
                    </>}>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Building Name *</label>
                            <input value={buildingForm.name} onChange={e => setBuildingForm({ ...buildingForm, name: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Boys Hostel Block A" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Hostel Type *</label>
                            <select value={buildingForm.type} onChange={e => setBuildingForm({ ...buildingForm, type: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold">
                                <option value="boys">Boys Hostel</option>
                                <option value="girls">Girls Hostel</option>
                                <option value="coed">Co-Ed Hostel</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Address / Location</label>
                        <input value={buildingForm.address} onChange={e => setBuildingForm({ ...buildingForm, address: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Near main gate, campus east" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Warden Name</label>
                            <input value={buildingForm.wardenName} onChange={e => setBuildingForm({ ...buildingForm, wardenName: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Mr. Anil Jha" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Warden Phone</label>
                            <input value={buildingForm.wardenPhone} onChange={e => setBuildingForm({ ...buildingForm, wardenPhone: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="9876543210" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Asst. Warden Name</label>
                            <input value={buildingForm.assistantWardenName} onChange={e => setBuildingForm({ ...buildingForm, assistantWardenName: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Asst. Warden Phone</label>
                            <input value={buildingForm.assistantWardenPhone} onChange={e => setBuildingForm({ ...buildingForm, assistantWardenPhone: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Total Capacity</label>
                            <input type="number" value={buildingForm.totalCapacity} onChange={e => setBuildingForm({ ...buildingForm, totalCapacity: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Mess Type</label>
                            <select value={buildingForm.messType} onChange={e => setBuildingForm({ ...buildingForm, messType: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none font-semibold">
                                <option value="none">No Mess</option>
                                <option value="vegetarian">Vegetarian</option>
                                <option value="non_vegetarian">Non-Vegetarian</option>
                                <option value="both">Both (Veg + Non-Veg)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Mess Charge/mo</label>
                            <input type="number" value={buildingForm.messCharge} onChange={e => setBuildingForm({ ...buildingForm, messCharge: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                        </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                        <input type="checkbox" checked={buildingForm.isActive} onChange={e => setBuildingForm({ ...buildingForm, isActive: e.target.checked })}
                            id="buildingActive" className="w-4 h-4 text-indigo-600 rounded" />
                        <label htmlFor="buildingActive" className="text-xs font-semibold text-gray-600 cursor-pointer">Building is active</label>
                    </div>
                </Modal>

                {/* Room Modal */}
                <Modal show={showRoomModal} onClose={() => setShowRoomModal(false)}
                    title={editingRoom ? 'Edit Room Details' : 'Add Hostel Room'} error={error}
                    footer={<>
                        <Button variant="outline" onClick={() => setShowRoomModal(false)}>Cancel</Button>
                        <Button onClick={saveRoom} disabled={saving || !roomForm.roomNumber}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4">
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Room
                        </Button>
                    </>}>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Select Hostel *</label>
                            <select value={roomForm.hostelId} onChange={e => setRoomForm({ ...roomForm, hostelId: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none font-bold">
                                {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Room Number *</label>
                            <input value={roomForm.roomNumber} onChange={e => setRoomForm({ ...roomForm, roomNumber: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none font-bold" placeholder="101" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Floor</label>
                            <input type="number" value={roomForm.floor} onChange={e => setRoomForm({ ...roomForm, floor: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Room Type *</label>
                            <select value={roomForm.roomType} onChange={e => setRoomForm({ ...roomForm, roomType: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none">
                                {ROOM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Bed Capacity *</label>
                            <input type="number" value={roomForm.capacity} onChange={e => setRoomForm({ ...roomForm, capacity: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Monthly Rent</label>
                            <input type="number" value={roomForm.monthlyRent} onChange={e => setRoomForm({ ...roomForm, monthlyRent: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none font-bold" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-2 block">Amenities</label>
                        <div className="flex flex-wrap gap-2">
                            {AMENITY_OPTIONS.map(a => (
                                <label key={a} className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors border ${
                                    selectedAmenities.includes(a) ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                                }`}>
                                    <input type="checkbox" className="hidden"
                                        checked={selectedAmenities.includes(a)}
                                        onChange={e => setSelectedAmenities(e.target.checked ? [...selectedAmenities, a] : selectedAmenities.filter(x => x !== a))} />
                                    {a}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Remarks</label>
                        <textarea value={roomForm.remarks} onChange={e => setRoomForm({ ...roomForm, remarks: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none resize-none" rows={2} placeholder="Any notes..." />
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={roomForm.isActive} onChange={e => setRoomForm({ ...roomForm, isActive: e.target.checked })}
                            id="roomActive" className="w-4 h-4 text-indigo-600 rounded" />
                        <label htmlFor="roomActive" className="text-xs font-semibold text-gray-600 cursor-pointer">Room is active</label>
                    </div>
                </Modal>

                {/* Allocation Modal */}
                <Modal show={showAllocModal} onClose={() => setShowAllocModal(false)} title="Allocate Hostel Room" error={error}
                    footer={<>
                        <Button variant="outline" onClick={() => setShowAllocModal(false)}>Cancel</Button>
                        <Button onClick={saveAllocation} disabled={saving || !selectedStudent || !allocForm.roomId}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4">
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Allocate
                        </Button>
                    </>}>
                    <StudentSearchField label="Search Student" search={studentSearch} setSearch={setStudentSearch}
                        results={studentResults} selected={selectedStudent} setSelected={setSelectedStudent} setResults={setStudentResults} />
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Hostel Building</label>
                            <select value={allocForm.hostelId} onChange={e => setAllocForm({ ...allocForm, hostelId: e.target.value, roomId: '' })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none font-bold">
                                <option value="">Select Building</option>
                                {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Room *</label>
                            <select value={allocForm.roomId} onChange={e => setAllocForm({ ...allocForm, roomId: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none font-bold">
                                <option value="">Select Room</option>
                                {allocRooms.map(r => (
                                    <option key={r.id} value={r.id}>Room {r.room_number} ({r.occupancy_count}/{r.capacity})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Bed Number</label>
                            <input value={allocForm.bedNumber} onChange={e => setAllocForm({ ...allocForm, bedNumber: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" placeholder="A1" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">From Date</label>
                            <input type="date" value={allocForm.fromDate} onChange={e => setAllocForm({ ...allocForm, fromDate: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" checked={allocForm.guardianConsent} onChange={e => setAllocForm({ ...allocForm, guardianConsent: e.target.checked })}
                            id="guardianConsent" className="w-4 h-4 text-indigo-600 rounded" />
                        <label htmlFor="guardianConsent" className="text-xs font-semibold text-gray-600 cursor-pointer">Guardian consent received</label>
                    </div>
                </Modal>

                {/* Leave Request Modal */}
                <Modal show={showLeaveModal} onClose={() => setShowLeaveModal(false)} title="Submit Leave Request" error={error}
                    footer={<>
                        <Button variant="outline" onClick={() => setShowLeaveModal(false)}>Cancel</Button>
                        <Button onClick={saveLeave} disabled={saving || !selectedLeaveStudent || !leaveForm.fromDate || !leaveForm.reason}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4">
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Submit
                        </Button>
                    </>}>
                    <StudentSearchField label="Student" search={leaveStudentSearch} setSearch={setLeaveStudentSearch}
                        results={leaveStudentResults} selected={selectedLeaveStudent} setSelected={setSelectedLeaveStudent} setResults={setLeaveStudentResults} />
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Leave Type</label>
                            <select value={leaveForm.leaveType} onChange={e => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none font-semibold">
                                {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">From Date *</label>
                            <input type="date" value={leaveForm.fromDate} onChange={e => setLeaveForm({ ...leaveForm, fromDate: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">To Date *</label>
                            <input type="date" value={leaveForm.toDate} onChange={e => setLeaveForm({ ...leaveForm, toDate: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Reason *</label>
                        <textarea value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none resize-none" rows={3} placeholder="Reason for leave..." />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Guardian Phone (for contact)</label>
                        <input value={leaveForm.guardianPhone} onChange={e => setLeaveForm({ ...leaveForm, guardianPhone: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" placeholder="9876543210" />
                    </div>
                </Modal>

                {/* Leave Action Modal */}
                <Modal show={showLeaveActionModal} onClose={() => setShowLeaveActionModal(false)}
                    title={`Review Leave: ${leaveActionTarget?.student_name || ''}`} error={error}
                    footer={<>
                        <Button variant="outline" onClick={() => setShowLeaveActionModal(false)}>Cancel</Button>
                        <Button onClick={() => processLeave('rejected')} disabled={saving}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold text-xs px-4">
                            <XCircle className="w-4 h-4" /> Reject
                        </Button>
                        <Button onClick={() => processLeave('approved')} disabled={saving}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-4">
                            <CheckCircle className="w-4 h-4" /> Approve
                        </Button>
                    </>}>
                    {leaveActionTarget && (
                        <>
                            <div className="bg-gray-50 p-3 rounded-xl text-sm space-y-1">
                                <div className="flex justify-between"><span className="text-gray-400 text-xs">Type:</span><span className="font-semibold capitalize">{leaveActionTarget.leave_type.replace('_', ' ')}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400 text-xs">Dates:</span><span className="font-semibold">{new Date(leaveActionTarget.from_date).toLocaleDateString('en-IN')} — {new Date(leaveActionTarget.to_date).toLocaleDateString('en-IN')}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400 text-xs">Reason:</span><span className="font-medium">{leaveActionTarget.reason}</span></div>
                                {leaveActionTarget.guardian_phone && <div className="flex justify-between"><span className="text-gray-400 text-xs">Guardian:</span><span className="font-semibold">{leaveActionTarget.guardian_phone}</span></div>}
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1 block">Warden Remarks</label>
                                <textarea value={leaveActionRemarks} onChange={e => setLeaveActionRemarks(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none resize-none" rows={2} placeholder="Optional remarks..." />
                            </div>
                        </>
                    )}
                </Modal>

                {/* Visitor Modal */}
                <Modal show={showVisitorModal} onClose={() => setShowVisitorModal(false)} title="Check-in Visitor" error={error}
                    footer={<>
                        <Button variant="outline" onClick={() => setShowVisitorModal(false)}>Cancel</Button>
                        <Button onClick={saveVisitor} disabled={saving || !selectedVisitorStudent || !visitorForm.visitorName}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4">
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Check In
                        </Button>
                    </>}>
                    <StudentSearchField label="Visiting Student" search={visitorStudentSearch} setSearch={setVisitorStudentSearch}
                        results={visitorStudentResults} selected={selectedVisitorStudent} setSelected={setSelectedVisitorStudent} setResults={setVisitorStudentResults} />
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Visitor Name *</label>
                            <input value={visitorForm.visitorName} onChange={e => setVisitorForm({ ...visitorForm, visitorName: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" placeholder="Full name" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Relation</label>
                            <select value={visitorForm.visitorRelation} onChange={e => setVisitorForm({ ...visitorForm, visitorRelation: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none font-semibold">
                                <option value="father">Father</option>
                                <option value="mother">Mother</option>
                                <option value="guardian">Guardian</option>
                                <option value="sibling">Sibling</option>
                                <option value="relative">Relative</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Phone</label>
                            <input value={visitorForm.visitorPhone} onChange={e => setVisitorForm({ ...visitorForm, visitorPhone: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" placeholder="9876543210" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Purpose</label>
                            <input value={visitorForm.purpose} onChange={e => setVisitorForm({ ...visitorForm, purpose: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none" placeholder="Meeting, delivery..." />
                        </div>
                    </div>
                </Modal>

                {/* Complaint Modal */}
                <Modal show={showComplaintModal} onClose={() => setShowComplaintModal(false)} title="Raise Complaint" error={error}
                    footer={<>
                        <Button variant="outline" onClick={() => setShowComplaintModal(false)}>Cancel</Button>
                        <Button onClick={saveComplaint} disabled={saving || !complaintForm.description}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4">
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Submit
                        </Button>
                    </>}>
                    <StudentSearchField label="Student (optional — leave blank for warden complaints)" search={complaintStudentSearch} setSearch={setComplaintStudentSearch}
                        results={complaintStudentResults} selected={selectedComplaintStudent} setSelected={setSelectedComplaintStudent} setResults={setComplaintStudentResults} />
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Type</label>
                            <select value={complaintForm.complaintType} onChange={e => setComplaintForm({ ...complaintForm, complaintType: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none font-semibold">
                                {COMPLAINT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 mb-1 block">Priority</label>
                            <select value={complaintForm.priority} onChange={e => setComplaintForm({ ...complaintForm, priority: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none font-semibold">
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="urgent">Urgent</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Description *</label>
                        <textarea value={complaintForm.description} onChange={e => setComplaintForm({ ...complaintForm, description: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none resize-none" rows={4} placeholder="Describe the issue..." />
                    </div>
                </Modal>

                {/* Complaint Update Modal */}
                <Modal show={showComplaintUpdateModal} onClose={() => setShowComplaintUpdateModal(false)} title="Update Complaint" error={error}
                    footer={<>
                        <Button variant="outline" onClick={() => setShowComplaintUpdateModal(false)}>Cancel</Button>
                        <Button onClick={updateComplaint} disabled={saving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4">
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Update
                        </Button>
                    </>}>
                    {complaintUpdateTarget && (
                        <>
                            <div className="bg-gray-50 p-3 rounded-xl text-sm">
                                <p className="font-medium text-gray-800">{complaintUpdateTarget.description}</p>
                                <p className="text-xs text-gray-400 mt-1">
                                    {complaintUpdateTarget.student_name && `By ${complaintUpdateTarget.student_name} · `}
                                    {complaintUpdateTarget.room_number && `Room ${complaintUpdateTarget.room_number}`}
                                </p>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1 block">Status</label>
                                <select value={complaintUpdateForm.status} onChange={e => setComplaintUpdateForm({ ...complaintUpdateForm, status: e.target.value })}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none font-semibold">
                                    <option value="open">Open</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="resolved">Resolved</option>
                                    <option value="closed">Closed</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-600 mb-1 block">Resolution Notes</label>
                                <textarea value={complaintUpdateForm.resolutionNotes} onChange={e => setComplaintUpdateForm({ ...complaintUpdateForm, resolutionNotes: e.target.value })}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none resize-none" rows={3} placeholder="What was done to resolve..." />
                            </div>
                        </>
                    )}
                </Modal>
            </main>
        </div>
    );
}
