'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    ArrowLeft, MapPin, Radar, Clock, Save,
    Loader2, CheckCircle, XCircle, AlertCircle,
    Navigation, Settings, Timer, ShieldAlert, Lock, HelpCircle
} from 'lucide-react';

interface UserData {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'super_admin' | 'teacher' | 'accountant' | 'student';
}

interface AttendanceSettings {
    latitude: number | null;
    longitude: number | null;
    geofence_radius: number | null;
    entry_time: string;
    grace_period: number;
    exit_time: string;
}

export default function AttendanceSettingsPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [geoLoading, setGeoLoading] = useState(false);
    const [geoStatus, setGeoStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [geoError, setGeoError] = useState('');
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const [settings, setSettings] = useState<AttendanceSettings>({
        latitude: null,
        longitude: null,
        geofence_radius: null,
        entry_time: '08:00',
        grace_period: 15,
        exit_time: '15:30',
    });

    const [latInput, setLatInput] = useState('');
    const [lngInput, setLngInput] = useState('');
    const [showPreModal, setShowPreModal] = useState(false);
    const [showBlockedModal, setShowBlockedModal] = useState(false);
    const [showDeniedModal, setShowDeniedModal] = useState(false);

    useEffect(() => {
        setLatInput(settings.latitude !== null && settings.latitude !== undefined ? settings.latitude.toString() : '');
        setLngInput(settings.longitude !== null && settings.longitude !== undefined ? settings.longitude.toString() : '');
    }, [settings.latitude, settings.longitude]);

    const handleLatChange = (val: string) => {
        setLatInput(val);
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) {
            setSettings(prev => ({ ...prev, latitude: parsed }));
        } else if (val === '') {
            setSettings(prev => ({ ...prev, latitude: null }));
        }
    };

    const handleLngChange = (val: string) => {
        setLngInput(val);
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) {
            setSettings(prev => ({ ...prev, longitude: parsed }));
        } else if (val === '') {
            setSettings(prev => ({ ...prev, longitude: null }));
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin') { router.replace('/dashboard'); return; }
        setUser(parsed);
        fetchSettings(token);
    }, []);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    const fetchSettings = async (token: string) => {
        setLoading(true);
        try {
            const res = await fetch('/api/settings/staff-attendance', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.settings) {
                    setSettings(prev => ({
                        ...prev,
                        ...data.settings,
                    }));
                    if (data.settings.latitude && data.settings.longitude) {
                        setGeoStatus('success');
                    }
                }
            }
        } catch (err) {
            console.error('Failed to fetch settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCaptureClick = () => {
        const isSecure = typeof window !== 'undefined' && window.isSecureContext;
        const hasGeolocation = typeof navigator !== 'undefined' && navigator.geolocation;

        if (!hasGeolocation || !isSecure) {
            setShowBlockedModal(true);
            return;
        }

        setShowPreModal(true);
    };

    const triggerActualCapture = () => {
        setShowPreModal(false);
        setShowDeniedModal(false);
        setGeoLoading(true);
        setGeoError('');
        setGeoStatus('idle');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setSettings(prev => ({
                    ...prev,
                    latitude: parseFloat(position.coords.latitude.toFixed(6)),
                    longitude: parseFloat(position.coords.longitude.toFixed(6)),
                }));
                setGeoStatus('success');
                setGeoLoading(false);
            },
            (error) => {
                let msg = 'Failed to get location.';
                switch (error.code) {
                    case error.PERMISSION_DENIED: 
                        msg = 'Location permission denied. Please allow location access in your browser settings.'; 
                        setShowDeniedModal(true);
                        break;
                    case error.POSITION_UNAVAILABLE: 
                        msg = 'Location information is unavailable.'; 
                        break;
                    case error.TIMEOUT: 
                        msg = 'Location request timed out.'; 
                        break;
                }
                setGeoError(msg);
                setGeoStatus('error');
                setGeoLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const token = localStorage.getItem('token')!;
            const res = await fetch('/api/settings/staff-attendance', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(settings)
            });
            const data = await res.json();
            if (!res.ok) {
                setToast({ type: 'error', message: data.error || 'Failed to save settings' });
            } else {
                setToast({ type: 'success', message: 'Attendance settings saved successfully!' });
            }
        } catch {
            setToast({ type: 'error', message: 'Server error. Please try again.' });
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 mt-16">

                {/* Hero Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-6 sm:p-8 mb-6 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-orange-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-amber-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10">
                        <button
                            onClick={() => router.push('/manage/staff-attendance')}
                            className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white mb-4 transition-colors"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            Back to Staff Attendance
                        </button>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-amber-400 font-semibold tracking-wide uppercase text-sm">Configuration</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold mb-2 flex items-center gap-3">
                            Attendance Settings <span className="inline-block">⚙️</span>
                        </h1>
                        <p className="text-amber-100 text-sm max-w-xl">
                            Configure school location, geofence radius, and official timing rules for staff attendance tracking.
                        </p>
                    </div>
                </div>

                {/* Toast */}
                {toast && (
                    <div className={`mb-6 flex items-center gap-2 p-3.5 rounded-xl text-xs font-medium shadow-sm animate-fade-in ${
                        toast.type === 'success' ? 'bg-emerald-50 border border-emerald-100 text-emerald-800' : 'bg-red-50 border border-red-100 text-red-800'
                    }`}>
                        {toast.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" /> : <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                        <span>{toast.message}</span>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
                        <p className="text-gray-500 font-medium">Loading settings...</p>
                    </div>
                ) : (
                    <div className="space-y-6">

                        {/* Section 1: School Location */}
                        <div className="bg-white rounded-2xl border border-gray-150 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-rose-500" />
                                <h3 className="font-bold text-gray-900">School Location</h3>
                            </div>
                            <div className="p-5 space-y-4">
                                {settings.latitude && settings.longitude ? (
                                    <div className="flex items-center gap-3 bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                                        <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                                        <div>
                                            <p className="text-xs font-semibold text-emerald-800">Location configured ✓</p>
                                            <p className="text-[10px] text-emerald-600 font-mono mt-0.5">
                                                Lat: {settings.latitude} | Lng: {settings.longitude}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 bg-amber-50 rounded-xl p-3 border border-amber-100">
                                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                                        <div>
                                            <p className="text-xs font-semibold text-amber-800">Location not configured</p>
                                            <p className="text-[10px] text-amber-600 mt-0.5">
                                                Set the school location so staff can check-in within range.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={handleCaptureClick}
                                    disabled={geoLoading}
                                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded-xl text-sm font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                                >
                                    {geoLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Navigation className="w-4 h-4" />
                                    )}
                                    {geoLoading ? 'Capturing Location...' : '📍 Use My Current Location'}
                                </button>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Latitude</label>
                                        <input
                                            type="text"
                                            value={latInput}
                                            onChange={(e) => handleLatChange(e.target.value)}
                                            placeholder="e.g. 28.6139"
                                            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-xs bg-white text-gray-700 font-mono focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Longitude</label>
                                        <input
                                            type="text"
                                            value={lngInput}
                                            onChange={(e) => handleLngChange(e.target.value)}
                                            placeholder="e.g. 77.2090"
                                            className="w-full h-10 rounded-lg border border-gray-200 px-3 text-xs bg-white text-gray-700 font-mono focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                                <p className="text-[10px] text-gray-400">
                                    💡 You can capture coordinates automatically using the GPS button above, or manually type/paste them from Google Maps.
                                </p>

                                {geoStatus === 'error' && (
                                    <div className="flex items-center gap-2 bg-red-50 rounded-lg p-2.5 border border-red-100">
                                        <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                        <p className="text-[10px] text-red-700">{geoError}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Section 2: Geofence Radius */}
                        <div className="bg-white rounded-2xl border border-gray-150 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                                <Radar className="w-4 h-4 text-blue-500" />
                                <h3 className="font-bold text-gray-900">Geofence Radius</h3>
                            </div>
                            <div className="p-5 space-y-3">
                                <div>
                                    <label className="text-xs text-gray-600 font-medium block mb-1.5">Radius (in meters)</label>
                                    <input
                                        type="number"
                                        min={50}
                                        max={5000}
                                        value={settings.geofence_radius ?? ''}
                                        placeholder="e.g. 200"
                                        onChange={(e) => setSettings(prev => ({ ...prev, geofence_radius: e.target.value === '' ? null : (parseInt(e.target.value) || null) }))}
                                        className="w-full h-10 rounded-xl border border-gray-200 px-4 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-400 flex items-start gap-1.5">
                                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                    Teachers must be within this radius from the school location to mark attendance. (Prototype default is 200 meters if not set)
                                </p>
                            </div>
                        </div>

                        {/* Section 3: Official Timings */}
                        <div className="bg-white rounded-2xl border border-gray-150 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-amber-500" />
                                <h3 className="font-bold text-gray-900">Official Timings</h3>
                            </div>
                            <div className="p-5 space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-xs text-gray-600 font-medium block mb-1.5 flex items-center gap-1">
                                            <Timer className="w-3 h-3" />
                                            Entry Time
                                        </label>
                                        <input
                                            type="time"
                                            value={settings.entry_time}
                                            onChange={(e) => setSettings(prev => ({ ...prev, entry_time: e.target.value }))}
                                            className="w-full h-10 rounded-xl border border-gray-200 px-4 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-600 font-medium block mb-1.5">Grace Period (minutes)</label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={120}
                                            value={settings.grace_period}
                                            onChange={(e) => setSettings(prev => ({ ...prev, grace_period: parseInt(e.target.value) || 0 }))}
                                            className="w-full h-10 rounded-xl border border-gray-200 px-4 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-600 font-medium block mb-1.5">Exit Time</label>
                                        <input
                                            type="time"
                                            value={settings.exit_time}
                                            onChange={(e) => setSettings(prev => ({ ...prev, exit_time: e.target.value }))}
                                            className="w-full h-10 rounded-xl border border-gray-200 px-4 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>

                                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-2">Auto-Classification Rules</p>
                                    <ul className="text-[10px] text-amber-700 space-y-1.5">
                                        <li className="flex items-start gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0"></span>
                                            <span><strong>Present:</strong> Check-in before Entry Time + Grace Period</span>
                                        </li>
                                        <li className="flex items-start gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-amber-500 mt-1 shrink-0"></span>
                                            <span><strong>Late:</strong> Check-in after Entry Time + Grace Period</span>
                                        </li>
                                        <li className="flex items-start gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-orange-500 mt-1 shrink-0"></span>
                                            <span><strong>Half Day:</strong> Check-out before Exit Time (early departure)</span>
                                        </li>
                                        <li className="flex items-start gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-red-500 mt-1 shrink-0"></span>
                                            <span><strong>Absent:</strong> No check-in recorded for the day</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-2xl text-sm font-bold transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
                        >
                            {saving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4" />
                            )}
                            {saving ? 'Saving Settings...' : 'Save Attendance Settings'}
                        </button>
                    </div>
                )}
            </main>

            {/* Modal: Pre-Permission Request */}
            {showPreModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 flex flex-col items-center text-center transform transition-all duration-300 scale-100">
                        <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mb-4 ring-8 ring-rose-50/50">
                            <MapPin className="w-6 h-6 animate-pulse" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Allow Location Access?</h3>
                        <p className="text-xs text-gray-500 leading-relaxed mb-6">
                            YSM Attendance needs access to your device's GPS to configure the school boundary. Please make sure you are physically present at the school campus before capturing.
                        </p>
                        <div className="flex flex-col gap-2 w-full">
                            <button
                                type="button"
                                onClick={triggerActualCapture}
                                className="w-full py-3 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                            >
                                Allow GPS Capture
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowPreModal(false)}
                                className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold transition-all border border-gray-150 cursor-pointer"
                            >
                                Enter Coordinates Manually
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: GPS Access Restricted (Non-Secure HTTP) */}
            {showBlockedModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 flex flex-col items-center text-center transform transition-all duration-300 scale-100">
                        <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mb-4 ring-8 ring-amber-50/50">
                            <ShieldAlert className="w-6 h-6 animate-bounce" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">GPS Access Restricted</h3>
                        <p className="text-xs text-gray-500 leading-relaxed mb-6">
                            Mobile browsers require a secure <strong>HTTPS</strong> connection to access device location. Because you are on a non-secure local IP, automatic capture is disabled. 
                            <br/><br/>
                            Please type or paste the school coordinates manually below.
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowBlockedModal(false)}
                            className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                        >
                            Enter Manually
                        </button>
                    </div>
                </div>
            )}

            {/* Modal: Permission Denied */}
            {showDeniedModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 flex flex-col items-center text-center transform transition-all duration-300 scale-100">
                        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4 ring-8 ring-red-50/50">
                            <Lock className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Permission Denied</h3>
                        <p className="text-xs text-gray-500 leading-relaxed mb-6">
                            Location permission was denied. Please allow location access in your browser settings to automatically capture coordinates, or enter them manually.
                        </p>
                        <div className="flex flex-col gap-2 w-full">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowDeniedModal(false);
                                    triggerActualCapture();
                                }}
                                className="w-full py-3 bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                            >
                                Retry GPS Capture
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowDeniedModal(false)}
                                className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold transition-all border border-gray-150 cursor-pointer"
                            >
                                Enter Coordinates Manually
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
