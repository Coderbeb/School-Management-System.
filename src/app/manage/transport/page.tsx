'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import {
    Truck, Search, Loader2, Phone, Calendar,
    CheckCircle, XCircle, Clock, Filter, Plus, X,
    Edit2, Trash2, MapPin, Map, Users, AlertCircle, ArrowRight
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; schoolId?: string; }

interface Vehicle {
    id: string; vehicle_number: string; vehicle_type: string;
    capacity: number; driver_name: string; driver_phone: string;
    insurance_expiry: string; occupancy_count: number;
}

interface Stop {
    id?: string; stop_name: string; pickup_time: string; drop_time: string;
    sequence_order: number; monthly_fare: number;
}

interface RouteItem {
    id: string; route_name: string; vehicle_id: string; vehicle_number: string;
    driver_name: string; driver_phone: string; student_count: number; stops: Stop[];
}

interface Assignment {
    id: string; student_id: string; student_name: string; admission_number: string;
    route_id: string; route_name: string; stop_id: string; stop_name: string;
    pickup_time: string; drop_time: string; class_name: string; section_name: string;
    monthly_fare: number; status: string; from_date: string; to_date: string;
}

interface ClassItem { id: string; name: string; }
interface StudentResult { id: string; name: string; admission_number: string; class_name: string; section_name: string; }

export default function TransportPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [tab, setTab] = useState<'vehicles' | 'routes' | 'assignments'>('vehicles');
    const [loading, setLoading] = useState(true);

    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [routes, setRoutes] = useState<RouteItem[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);

    // Search and filters
    const [classFilter, setClassFilter] = useState('');
    const [routeFilter, setRouteFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Form modals
    const [showVehicleModal, setShowVehicleModal] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
    const [vehicleForm, setVehicleForm] = useState({
        vehicleNumber: '', vehicleType: 'bus', capacity: '40',
        driverName: '', driverPhone: '', insuranceExpiry: ''
    });

    const [showRouteModal, setShowRouteModal] = useState(false);
    const [editingRoute, setEditingRoute] = useState<RouteItem | null>(null);
    const [routeForm, setRouteForm] = useState<{
        routeName: string; vehicleId: string; stops: {
            id?: string; stopName: string; pickupTime: string; dropTime: string;
            sequenceOrder: number; monthlyFare: string;
        }[]
    }>({
        routeName: '', vehicleId: '', stops: []
    });

    const [showAssignModal, setShowAssignModal] = useState(false);
    const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
    const [studentSearch, setStudentSearch] = useState('');
    const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<StudentResult | null>(null);
    const [assignForm, setAssignForm] = useState({
        routeId: '', stopId: '', monthlyFare: '', fromDate: '', toDate: '', status: 'active'
    });

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [saving, setSaving] = useState(false);

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    }), [token]);

    const fetchData = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const hdrs = headers();
            const [vehRes, rtRes, classRes] = await Promise.all([
                fetch('/api/transport/vehicles', { headers: hdrs }),
                fetch('/api/transport/routes', { headers: hdrs }),
                fetch('/api/manage/classes', { headers: hdrs }),
            ]);

            const [vehData, rtData, classData] = await Promise.all([
                vehRes.json(), rtRes.json(), classRes.json()
            ]);

            setVehicles(vehData.vehicles || []);
            setRoutes(rtData.routes || []);
            setClasses(classData.classes || []);

            // Load assignments with active filters
            let assignUrl = '/api/transport/assignments';
            const params = [];
            if (classFilter) params.push(`classId=${classFilter}`);
            if (routeFilter) params.push(`routeId=${routeFilter}`);
            if (searchQuery) params.push(`search=${encodeURIComponent(searchQuery)}`);
            if (params.length) assignUrl += `?${params.join('&')}`;

            const assignRes = await fetch(assignUrl, { headers: hdrs });
            const assignData = await assignRes.json();
            setAssignments(assignData.assignments || []);
        } catch (err) {
            console.error('Failed to load data', err);
        }
        setLoading(false);
    }, [token, classFilter, routeFilter, searchQuery, headers]);

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (!['developer', 'super_admin'].includes(parsed.role)) { router.replace('/dashboard'); return; }
        setUser(parsed);
    }, [router, token]);

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user, fetchData]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    // --- Search Students ---
    useEffect(() => {
        if (!studentSearch.trim()) {
            setStudentResults([]);
            return;
        }
        const delayDebounce = setTimeout(async () => {
            try {
                const res = await fetch(`/api/students?search=${encodeURIComponent(studentSearch)}`, {
                    headers: headers()
                });
                if (res.ok) {
                    const data = await res.json();
                    setStudentResults(data.students || []);
                }
            } catch (err) {
                console.error(err);
            }
        }, 300);
        return () => clearTimeout(delayDebounce);
    }, [studentSearch, headers]);

    // --- Vehicle Handlers ---
    const openAddVehicle = () => {
        setEditingVehicle(null);
        setVehicleForm({
            vehicleNumber: '', vehicleType: 'bus', capacity: '40',
            driverName: '', driverPhone: '', insuranceExpiry: ''
        });
        setError('');
        setShowVehicleModal(true);
    };

    const openEditVehicle = (veh: Vehicle) => {
        setEditingVehicle(veh);
        setVehicleForm({
            vehicleNumber: veh.vehicle_number,
            vehicleType: veh.vehicle_type,
            capacity: veh.capacity.toString(),
            driverName: veh.driver_name || '',
            driverPhone: veh.driver_phone || '',
            insuranceExpiry: veh.insurance_expiry ? veh.insurance_expiry.split('T')[0] : ''
        });
        setError('');
        setShowVehicleModal(true);
    };

    const saveVehicle = async () => {
        setSaving(true);
        setError('');
        try {
            const method = editingVehicle ? 'PUT' : 'POST';
            const body = {
                id: editingVehicle?.id,
                ...vehicleForm
            };
            const res = await fetch('/api/transport/vehicles', {
                method,
                headers: headers(),
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save vehicle');
            setSuccess(editingVehicle ? 'Vehicle updated successfully!' : 'Vehicle added successfully!');
            setShowVehicleModal(false);
            fetchData();
        } catch (err: any) {
            setError(err.message || 'Error saving vehicle');
        }
        setSaving(false);
    };

    const deleteVehicle = async (id: string) => {
        if (!confirm('Are you sure you want to delete this vehicle?')) return;
        try {
            const res = await fetch(`/api/transport/vehicles?id=${id}`, {
                method: 'DELETE',
                headers: headers()
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to delete vehicle');
            setSuccess('Vehicle deleted successfully!');
            fetchData();
        } catch (err: any) {
            alert(err.message || 'Error deleting vehicle');
        }
    };

    // --- Route Handlers ---
    const openAddRoute = () => {
        setEditingRoute(null);
        setRouteForm({
            routeName: '',
            vehicleId: '',
            stops: [{ stopName: '', pickupTime: '07:30', dropTime: '14:30', sequenceOrder: 1, monthlyFare: '800' }]
        });
        setError('');
        setShowRouteModal(true);
    };

    const openEditRoute = (rt: RouteItem) => {
        setEditingRoute(rt);
        setRouteForm({
            routeName: rt.route_name,
            vehicleId: rt.vehicle_id || '',
            stops: rt.stops.map(s => ({
                id: s.id,
                stopName: s.stop_name,
                pickupTime: s.pickup_time ? s.pickup_time.slice(0, 5) : '',
                dropTime: s.drop_time ? s.drop_time.slice(0, 5) : '',
                sequenceOrder: s.sequence_order,
                monthlyFare: s.monthly_fare.toString()
            }))
        });
        setError('');
        setShowRouteModal(true);
    };

    const saveRoute = async () => {
        setSaving(true);
        setError('');
        try {
            const method = editingRoute ? 'PUT' : 'POST';
            const body = {
                id: editingRoute?.id,
                routeName: routeForm.routeName,
                vehicleId: routeForm.vehicleId || null,
                stops: routeForm.stops.map((s, idx) => ({
                    ...s,
                    sequenceOrder: idx + 1
                }))
            };
            const res = await fetch('/api/transport/routes', {
                method,
                headers: headers(),
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save route');
            setSuccess(editingRoute ? 'Route updated successfully!' : 'Route created successfully!');
            setShowRouteModal(false);
            fetchData();
        } catch (err: any) {
            setError(err.message || 'Error saving route');
        }
        setSaving(false);
    };

    const deleteRoute = async (id: string) => {
        if (!confirm('Are you sure you want to delete this route?')) return;
        try {
            const res = await fetch(`/api/transport/routes?id=${id}`, {
                method: 'DELETE',
                headers: headers()
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to delete route');
            setSuccess('Route deleted successfully!');
            fetchData();
        } catch (err: any) {
            alert(err.message || 'Error deleting route');
        }
    };

    const addStopToForm = () => {
        setRouteForm(prev => {
            const lastStop = prev.stops[prev.stops.length - 1];
            return {
                ...prev,
                stops: [
                    ...prev.stops,
                    {
                        stopName: '',
                        pickupTime: lastStop ? lastStop.pickupTime : '07:30',
                        dropTime: lastStop ? lastStop.dropTime : '14:30',
                        sequenceOrder: prev.stops.length + 1,
                        monthlyFare: lastStop ? lastStop.monthlyFare : '800'
                    }
                ]
            };
        });
    };

    const removeStopFromForm = (idx: number) => {
        setRouteForm(prev => {
            const newStops = prev.stops.filter((_, i) => i !== idx);
            return {
                ...prev,
                stops: newStops.map((s, i) => ({ ...s, sequenceOrder: i + 1 }))
            };
        });
    };

    // --- Assignment Handlers ---
    const openAssignModal = () => {
        setEditingAssignment(null);
        setSelectedStudent(null);
        setStudentSearch('');
        setStudentResults([]);
        setAssignForm({
            routeId: '', stopId: '', monthlyFare: '',
            fromDate: new Date().toISOString().split('T')[0], toDate: '', status: 'active'
        });
        setError('');
        setShowAssignModal(true);
    };

    const openEditAssignment = (asg: Assignment) => {
        setEditingAssignment(asg);
        setSelectedStudent({
            id: asg.student_id,
            name: asg.student_name,
            admission_number: asg.admission_number,
            class_name: asg.class_name,
            section_name: asg.section_name
        });
        setAssignForm({
            routeId: asg.route_id,
            stopId: asg.stop_id,
            monthlyFare: asg.monthly_fare.toString(),
            fromDate: asg.from_date ? asg.from_date.split('T')[0] : '',
            toDate: asg.to_date ? asg.to_date.split('T')[0] : '',
            status: asg.status
        });
        setError('');
        setShowAssignModal(true);
    };

    const saveAssignment = async () => {
        if (!selectedStudent) {
            setError('Please select a student');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const method = editingAssignment ? 'PUT' : 'POST';
            const body = {
                id: editingAssignment?.id,
                studentId: selectedStudent.id,
                ...assignForm
            };
            const res = await fetch('/api/transport/assignments', {
                method,
                headers: headers(),
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save transport assignment');
            setSuccess(editingAssignment ? 'Assignment updated!' : 'Student assigned to route!');
            setShowAssignModal(false);
            fetchData();
        } catch (err: any) {
            setError(err.message || 'Error saving assignment');
        }
        setSaving(false);
    };

    const deleteAssignment = async (id: string) => {
        if (!confirm('Are you sure you want to remove this transport assignment?')) return;
        try {
            const res = await fetch(`/api/transport/assignments?id=${id}`, {
                method: 'DELETE',
                headers: headers()
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to delete assignment');
            setSuccess('Assignment removed successfully!');
            fetchData();
        } catch (err: any) {
            alert(err.message || 'Error removing assignment');
        }
    };

    const handleRouteChangeInAssign = (routeId: string) => {
        const route = routes.find(r => r.id === routeId);
        const firstStop = route?.stops?.[0];
        setAssignForm(prev => ({
            ...prev,
            routeId,
            stopId: firstStop?.id || '',
            monthlyFare: firstStop ? firstStop.monthly_fare.toString() : ''
        }));
    };

    const handleStopChangeInAssign = (stopId: string) => {
        const route = routes.find(r => r.id === assignForm.routeId);
        const stop = route?.stops?.find(s => s.id === stopId);
        setAssignForm(prev => ({
            ...prev,
            stopId,
            monthlyFare: stop ? stop.monthly_fare.toString() : prev.monthlyFare
        }));
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-7xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-900 via-indigo-900 to-violet-900 text-white p-6 sm:p-8 mb-6 shadow-2xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-cyan-500 rounded-full mix-blend-screen filter blur-3xl opacity-20"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Truck className="w-4 h-4 text-emerald-400" />
                                <span className="text-emerald-400 font-bold tracking-wider uppercase text-xs">Transport</span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-black">Transport Management</h1>
                            <p className="text-blue-200 text-sm mt-1">Manage school vehicles, routes, stops, and student transport plans</p>
                        </div>
                        <div className="flex gap-2">
                            {tab === 'vehicles' && (
                                <Button onClick={openAddVehicle} className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2 shadow-lg h-10">
                                    <Plus className="w-4 h-4" /> Add Vehicle
                                </Button>
                            )}
                            {tab === 'routes' && (
                                <Button onClick={openAddRoute} className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2 shadow-lg h-10">
                                    <Plus className="w-4 h-4" /> Create Route
                                </Button>
                            )}
                            {tab === 'assignments' && (
                                <Button onClick={openAssignModal} className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2 shadow-lg h-10">
                                    <Plus className="w-4 h-4" /> Assign Student
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Notifications */}
                {success && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center justify-between">
                        <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {success}</span>
                        <button onClick={() => setSuccess('')}><X className="w-4 h-4" /></button>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex items-center gap-1 bg-white rounded-xl p-1 border border-gray-200 mb-5 w-fit">
                    <button onClick={() => setTab('vehicles')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'vehicles' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <Truck className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Vehicles
                    </button>
                    <button onClick={() => setTab('routes')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'routes' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <Map className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Routes & Stops
                    </button>
                    <button onClick={() => setTab('assignments')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'assignments' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <Users className="w-4 h-4 inline mr-1.5 -mt-0.5" /> Student Assignments
                    </button>
                </div>

                {/* Main Content */}
                {loading ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                        <p className="text-gray-400 text-sm">Loading transport data...</p>
                    </div>
                ) : (
                    <>
                        {/* VEHICLES TAB */}
                        {tab === 'vehicles' && (
                            vehicles.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {vehicles.map(veh => {
                                        const usagePercent = veh.capacity > 0 ? Math.round((veh.occupancy_count / veh.capacity) * 100) : 0;
                                        const isExpiringSoon = veh.insurance_expiry && (new Date(veh.insurance_expiry).getTime() - new Date().getTime()) < 30 * 24 * 60 * 60 * 1000;
                                        return (
                                            <div key={veh.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between">
                                                <div>
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div>
                                                            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{veh.vehicle_type}</span>
                                                            <h3 className="text-lg font-black text-gray-900">{veh.vehicle_number}</h3>
                                                        </div>
                                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${usagePercent >= 90 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                                            {usagePercent}% Full
                                                        </span>
                                                    </div>

                                                    {/* Driver Info */}
                                                    <div className="space-y-2 text-sm text-gray-600 mb-4 bg-gray-50 p-3 rounded-xl">
                                                        <div className="flex justify-between">
                                                            <span className="text-xs text-gray-400 font-medium">Driver:</span>
                                                            <span className="font-bold text-gray-800">{veh.driver_name || 'Not assigned'}</span>
                                                        </div>
                                                        {veh.driver_phone && (
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs text-gray-400 font-medium">Phone:</span>
                                                                <a href={`tel:${veh.driver_phone}`} className="text-indigo-600 font-bold hover:underline flex items-center gap-1">
                                                                    <Phone className="w-3.5 h-3.5" /> {veh.driver_phone}
                                                                </a>
                                                            </div>
                                                        )}
                                                        {veh.insurance_expiry && (
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs text-gray-400 font-medium">Insurance:</span>
                                                                <span className={`text-xs font-bold flex items-center gap-1 ${isExpiringSoon ? 'text-amber-600' : 'text-gray-700'}`}>
                                                                    {isExpiringSoon && <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                                                    {new Date(veh.insurance_expiry).toLocaleDateString()}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Occupancy Indicator */}
                                                    <div className="mb-4">
                                                        <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1">
                                                            <span>Occupancy</span>
                                                            <span>{veh.occupancy_count} / {veh.capacity} seats</span>
                                                        </div>
                                                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                                            <div className={`h-full rounded-full transition-all ${usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                                                style={{ width: `${Math.min(usagePercent, 100)}%` }} />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex justify-end gap-2 border-t border-gray-50 pt-3 mt-2">
                                                    <button onClick={() => openEditVehicle(veh)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => deleteVehicle(veh.id)} className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <EmptyState icon={<Truck className="w-12 h-12" />} text='No vehicles registered yet. Click "Add Vehicle" to register one.' />
                            )
                        )}

                        {/* ROUTES & STOPS TAB */}
                        {tab === 'routes' && (
                            routes.length > 0 ? (
                                <div className="space-y-6">
                                    {routes.map(rt => (
                                        <div key={rt.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-50 pb-4 mb-4">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Map className="w-5 h-5 text-indigo-600" />
                                                        <h3 className="text-lg font-black text-gray-900">{rt.route_name}</h3>
                                                    </div>
                                                    <p className="text-xs text-gray-500">
                                                        Vehicle: <span className="font-semibold text-gray-700">{rt.vehicle_number || 'Unassigned'}</span> 
                                                        {rt.driver_name && ` (Driver: ${rt.driver_name})`}
                                                        {rt.student_count > 0 && ` • ${rt.student_count} active student${rt.student_count > 1 ? 's' : ''}`}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => openEditRoute(rt)} className="gap-1.5 h-9 text-xs">
                                                        <Edit2 className="w-3.5 h-3.5" /> Edit Route & Stops
                                                    </Button>
                                                    <Button variant="outline" size="sm" onClick={() => deleteRoute(rt.id)} className="gap-1.5 h-9 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
                                                        <Trash2 className="w-3.5 h-3.5" /> Delete
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Stops Timeline/List */}
                                            {rt.stops && rt.stops.length > 0 ? (
                                                <div className="relative border-l-2 border-indigo-100 ml-3 pl-6 space-y-4 py-2">
                                                    {rt.stops.map((st, sIdx) => (
                                                        <div key={st.id || sIdx} className="relative">
                                                            {/* Bullet dot */}
                                                            <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 border-indigo-600 bg-white flex items-center justify-center">
                                                                <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                                                            </div>
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                                                <div>
                                                                    <h4 className="font-bold text-sm text-gray-800">{st.stop_name}</h4>
                                                                    <p className="text-xs text-gray-400">Stop Sequence: {st.sequence_order}</p>
                                                                </div>
                                                                <div className="flex items-center gap-4 text-xs font-semibold">
                                                                    {(st.pickup_time || st.drop_time) && (
                                                                        <span className="text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                                                            <Clock className="w-3 h-3 text-indigo-500" />
                                                                            {st.pickup_time ? st.pickup_time.slice(0, 5) : '--:--'} / {st.drop_time ? st.drop_time.slice(0, 5) : '--:--'}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                                                                        ₹{st.monthly_fare}/month
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-400 italic">No stops added to this route yet.</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState icon={<Map className="w-12 h-12" />} text='No routes created yet. Click "Create Route" to define a route with stops.' />
                            )
                        )}

                        {/* STUDENT ASSIGNMENTS TAB */}
                        {tab === 'assignments' && (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                {/* Search and Filters */}
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
                                    <div className="relative sm:col-span-2">
                                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                                        <input type="text" placeholder="Search by student name or admission number..."
                                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                    </div>
                                    <div>
                                        <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
                                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                                            <option value="">All Classes</option>
                                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <select value={routeFilter} onChange={e => setRouteFilter(e.target.value)}
                                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                                            <option value="">All Routes</option>
                                            {routes.map(r => <option key={r.id} value={r.id}>{r.route_name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Trigger assignment refresh when filters change */}
                                <div className="flex justify-end mb-4">
                                    <Button variant="outline" onClick={fetchData} className="text-xs h-8">Apply Filters / Refresh</Button>
                                </div>

                                {assignments.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse text-sm">
                                            <thead>
                                                <tr className="border-b border-gray-100 text-gray-400 font-semibold text-xs uppercase bg-gray-50/50">
                                                    <th className="py-3 px-4">Student</th>
                                                    <th className="py-3 px-4">Class</th>
                                                    <th className="py-3 px-4">Route / Stop</th>
                                                    <th className="py-3 px-4">Fare</th>
                                                    <th className="py-3 px-4">Status</th>
                                                    <th className="py-3 px-4 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {assignments.map(asg => (
                                                    <tr key={asg.id} className="hover:bg-gray-50/40 transition-colors">
                                                        <td className="py-3 px-4">
                                                            <div className="font-bold text-gray-900">{asg.student_name}</div>
                                                            <div className="text-xs text-gray-400 font-mono">{asg.admission_number}</div>
                                                        </td>
                                                        <td className="py-3 px-4 text-gray-600 font-medium">
                                                            {asg.class_name} - {asg.section_name}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                                                                <Map className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                                                {asg.route_name}
                                                            </div>
                                                            <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                                                <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                                                                {asg.stop_name} ({asg.pickup_time ? asg.pickup_time.slice(0, 5) : '--:--'} / {asg.drop_time ? asg.drop_time.slice(0, 5) : '--:--'})
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4 font-bold text-emerald-700">
                                                            ₹{asg.monthly_fare}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                asg.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                                                                asg.status === 'suspended' ? 'bg-amber-50 text-amber-700' :
                                                                'bg-red-50 text-red-700'
                                                            }`}>
                                                                {asg.status.toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4 text-right">
                                                            <div className="flex justify-end gap-1.5">
                                                                <button onClick={() => openEditAssignment(asg)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                                                                    <Edit2 className="w-4 h-4" />
                                                                </button>
                                                                <button onClick={() => deleteAssignment(asg.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <EmptyState icon={<Users className="w-12 h-12" />} text="No transport assignments found with current filters." />
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* --- VEHICLE FORM MODAL --- */}
                {showVehicleModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowVehicleModal(false)}>
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                <h2 className="text-lg font-bold text-gray-900">{editingVehicle ? 'Edit Vehicle Details' : 'Register New Vehicle'}</h2>
                                <button onClick={() => setShowVehicleModal(false)} className="p-1.5 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                {error && <div className="p-3 bg-red-50 border border-red-100 text-xs text-red-700 rounded-xl">{error}</div>}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Vehicle Number *</label>
                                        <input value={vehicleForm.vehicleNumber} onChange={e => setVehicleForm({ ...vehicleForm, vehicleNumber: e.target.value })}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="BR-01-AB-1234" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Vehicle Type *</label>
                                        <select value={vehicleForm.vehicleType} onChange={e => setVehicleForm({ ...vehicleForm, vehicleType: e.target.value })}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                                            <option value="bus">Bus</option>
                                            <option value="van">Van</option>
                                            <option value="auto">Auto</option>
                                            <option value="other">Other</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Seating Capacity *</label>
                                        <input type="number" value={vehicleForm.capacity} onChange={e => setVehicleForm({ ...vehicleForm, capacity: e.target.value })}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Insurance Expiry</label>
                                        <input type="date" value={vehicleForm.insuranceExpiry} onChange={e => setVehicleForm({ ...vehicleForm, insuranceExpiry: e.target.value })}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Driver Name</label>
                                        <input value={vehicleForm.driverName} onChange={e => setVehicleForm({ ...vehicleForm, driverName: e.target.value })}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Ramesh Singh" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Driver Phone</label>
                                        <input value={vehicleForm.driverPhone} onChange={e => setVehicleForm({ ...vehicleForm, driverPhone: e.target.value })}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="9876543210" />
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 rounded-b-3xl">
                                <Button variant="outline" onClick={() => setShowVehicleModal(false)}>Cancel</Button>
                                <Button onClick={saveVehicle} disabled={saving || !vehicleForm.vehicleNumber || !vehicleForm.capacity}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Save Vehicle
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- ROUTE & STOPS FORM MODAL --- */}
                {showRouteModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowRouteModal(false)}>
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-3xl z-10">
                                <h2 className="text-lg font-bold text-gray-900">{editingRoute ? 'Edit Route & Stops' : 'Create Route & Stops'}</h2>
                                <button onClick={() => setShowRouteModal(false)} className="p-1.5 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                {error && <div className="p-3 bg-red-50 border border-red-100 text-xs text-red-700 rounded-xl">{error}</div>}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Route Name *</label>
                                        <input value={routeForm.routeName} onChange={e => setRouteForm({ ...routeForm, routeName: e.target.value })}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Route A: Patna Jn to School" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Assigned Vehicle</label>
                                        <select value={routeForm.vehicleId} onChange={e => setRouteForm({ ...routeForm, vehicleId: e.target.value })}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                                            <option value="">Unassigned</option>
                                            {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_number} ({v.driver_name || 'No driver'})</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="border-t border-gray-100 pt-4">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-indigo-500" /> Stops List (Ordered Sequence)</h3>
                                        <button onClick={addStopToForm} className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1">
                                            <Plus className="w-3.5 h-3.5" /> Add Stop
                                        </button>
                                    </div>

                                    <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                                        {routeForm.stops.map((st, idx) => (
                                            <div key={idx} className="bg-gray-50 rounded-xl p-3.5 border border-gray-150 flex items-start gap-3">
                                                <span className="bg-indigo-100 text-indigo-800 font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-2">{idx + 1}</span>
                                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 flex-1">
                                                    <div className="sm:col-span-2">
                                                        <label className="text-[10px] text-gray-400 font-bold block mb-0.5">Stop Name *</label>
                                                        <input value={st.stopName} onChange={e => {
                                                            const copy = [...routeForm.stops];
                                                            copy[idx].stopName = e.target.value;
                                                            setRouteForm({ ...routeForm, stops: copy });
                                                        }}
                                                            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="Stop location" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 font-bold block mb-0.5">Fare (INR) *</label>
                                                        <input type="number" value={st.monthlyFare} onChange={e => {
                                                            const copy = [...routeForm.stops];
                                                            copy[idx].monthlyFare = e.target.value;
                                                            setRouteForm({ ...routeForm, stops: copy });
                                                        }}
                                                            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 font-bold block mb-0.5">Pickup / Drop</label>
                                                        <div className="flex gap-1">
                                                            <input type="text" placeholder="07:30" value={st.pickupTime} onChange={e => {
                                                                const copy = [...routeForm.stops];
                                                                copy[idx].pickupTime = e.target.value;
                                                                setRouteForm({ ...routeForm, stops: copy });
                                                            }}
                                                                className="w-full px-1 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] text-center focus:ring-1 focus:ring-indigo-500 outline-none" />
                                                            <input type="text" placeholder="14:30" value={st.dropTime} onChange={e => {
                                                                const copy = [...routeForm.stops];
                                                                copy[idx].dropTime = e.target.value;
                                                                setRouteForm({ ...routeForm, stops: copy });
                                                            }}
                                                                className="w-full px-1 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] text-center focus:ring-1 focus:ring-indigo-500 outline-none" />
                                                        </div>
                                                    </div>
                                                </div>
                                                <button onClick={() => removeStopFromForm(idx)} disabled={routeForm.stops.length <= 1}
                                                    className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg disabled:opacity-50 mt-1">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white rounded-b-3xl z-10">
                                <Button variant="outline" onClick={() => setShowRouteModal(false)}>Cancel</Button>
                                <Button onClick={saveRoute} disabled={saving || !routeForm.routeName || routeForm.stops.some(s => !s.stopName || !s.monthlyFare)}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Save Route
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- ASSIGN STUDENT MODAL --- */}
                {showAssignModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowAssignModal(false)}>
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                <h2 className="text-lg font-bold text-gray-900">{editingAssignment ? 'Update Transport Details' : 'Assign Student to Route'}</h2>
                                <button onClick={() => setShowAssignModal(false)} className="p-1.5 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                {error && <div className="p-3 bg-red-50 border border-red-100 text-xs text-red-700 rounded-xl">{error}</div>}

                                {/* Student Search */}
                                {!editingAssignment ? (
                                    <div className="relative">
                                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Search Student *</label>
                                        <div className="relative">
                                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                                            <input value={studentSearch} onChange={e => { setStudentSearch(e.target.value); if (selectedStudent) setSelectedStudent(null); }}
                                                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Type student name or roll..." />
                                        </div>

                                        {/* Dropdown Results */}
                                        {studentResults.length > 0 && !selectedStudent && (
                                            <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-150 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-gray-50">
                                                {studentResults.map(st => (
                                                    <div key={st.id} onClick={() => { setSelectedStudent(st); setStudentSearch(''); setStudentResults([]); }}
                                                        className="p-3 hover:bg-indigo-50/50 cursor-pointer flex justify-between items-center text-xs">
                                                        <div>
                                                            <div className="font-bold text-gray-900">{st.name}</div>
                                                            <div className="text-[10px] text-gray-400 font-mono">Roll/Adm: {st.admission_number}</div>
                                                        </div>
                                                        <span className="text-[10px] font-semibold text-gray-500">{st.class_name} - {st.section_name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Selected Student Confirmation */}
                                        {selectedStudent && (
                                            <div className="mt-2.5 p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-center justify-between text-xs">
                                                <div>
                                                    <div className="font-bold text-indigo-900">{selectedStudent.name}</div>
                                                    <div className="text-[10px] text-indigo-500 font-mono">Adm: {selectedStudent.admission_number} • Class: {selectedStudent.class_name}</div>
                                                </div>
                                                <button onClick={() => setSelectedStudent(null)} className="p-1 text-indigo-500 hover:bg-indigo-100 rounded-full"><X className="w-4 h-4" /></button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* Read only edit info */
                                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-xs">
                                        <div className="font-bold text-gray-800">{selectedStudent?.name}</div>
                                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">Adm: {selectedStudent?.admission_number} • Class: {selectedStudent?.class_name} - {selectedStudent?.section_name}</div>
                                    </div>
                                )}

                                {/* Route Selection */}
                                <div>
                                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Select Route *</label>
                                    <select value={assignForm.routeId} onChange={e => handleRouteChangeInAssign(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                                        <option value="">Choose route</option>
                                        {routes.map(r => <option key={r.id} value={r.id}>{r.route_name}</option>)}
                                    </select>
                                </div>

                                {/* Stop Selection */}
                                {assignForm.routeId && (
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Select Stop *</label>
                                        <select value={assignForm.stopId} onChange={e => handleStopChangeInAssign(e.target.value)}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                                            <option value="">Choose stop</option>
                                            {routes.find(r => r.id === assignForm.routeId)?.stops.map(st => (
                                                <option key={st.id} value={st.id}>{st.stop_name} (₹{st.monthly_fare})</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Monthly Fare & From Date */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Monthly Fare *</label>
                                        <input type="number" value={assignForm.monthlyFare} onChange={e => setAssignForm({ ...assignForm, monthlyFare: e.target.value })}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Start Date *</label>
                                        <input type="date" value={assignForm.fromDate} onChange={e => setAssignForm({ ...assignForm, fromDate: e.target.value })}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                    </div>
                                </div>

                                {/* Status if Editing */}
                                {editingAssignment && (
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Status</label>
                                        <select value={assignForm.status} onChange={e => setAssignForm({ ...assignForm, status: e.target.value })}
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                                            <option value="active">Active</option>
                                            <option value="suspended">Suspended</option>
                                            <option value="cancelled">Cancelled</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 rounded-b-3xl">
                                <Button variant="outline" onClick={() => setShowAssignModal(false)}>Cancel</Button>
                                <Button onClick={saveAssignment} disabled={saving || !selectedStudent || !assignForm.routeId || !assignForm.stopId || !assignForm.monthlyFare}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Save Assignment
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200 shadow-sm">
            <div className="text-gray-300 mx-auto mb-3 flex justify-center">{icon}</div>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">{text}</p>
        </div>
    );
}
