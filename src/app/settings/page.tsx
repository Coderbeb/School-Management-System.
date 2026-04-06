'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Building2, Save, AlertTriangle, ArrowRightCircle, RotateCcw } from 'lucide-react';

interface User {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
}

type DeptType = 'regular' | 'vocational' | 'pg';

export default function SettingsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    
    // Batch Manager State
    const [selectedDeptType, setSelectedDeptType] = useState<DeptType>('regular');
    const [batchMappings, setBatchMappings] = useState<Record<number, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [loadingMappings, setLoadingMappings] = useState(false);
    const [refetchTrigger, setRefetchTrigger] = useState(0);
    const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');

        if (!token || !userData) {
            router.replace('/login');
            return;
        }

        try {
            const parsedUser = JSON.parse(userData);
            if (parsedUser.role !== 'super_admin') {
                router.replace('/dashboard'); // Only Super Admin allowed
                return;
            }
            setUser(parsedUser);
        } catch {
            router.replace('/login');
        }
        setLoading(false);
    }, [router]);

    // Fetch mappings when dept type changes
    useEffect(() => {
        const fetchCurrentMappings = async () => {
            if (!user) return;
            setLoadingMappings(true);
            try {
                const response = await fetch(`/api/settings/batch-upgrade?deptType=${selectedDeptType}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    
                    // Convert numeric batch values to strings for inputs
                    const stringMappings: Record<number, string> = {};
                    
                    // 1. Prefill with calculated defaults based on the academic calendar
                    const semCount = (selectedDeptType === 'vocational' || selectedDeptType === 'pg') ? 6 : 8;
                    const currentDate = new Date();
                    const currentYear = currentDate.getFullYear();
                    const isNewAcademicYear = currentDate.getMonth() >= 6; // July or later
                    
                    for (let i = 1; i <= semCount; i++) {
                        const yearIndex = Math.floor((i - 1) / 2);
                        const expectedBatch = isNewAcademicYear ? (currentYear - yearIndex) : (currentYear - 1 - yearIndex);
                        stringMappings[i] = String(expectedBatch);
                    }

                    // 2. Override with actual existing database mappings if they exist
                    if (data.mappings) {
                        Object.keys(data.mappings).forEach(sem => {
                            if (data.mappings[sem]) {
                                stringMappings[parseInt(sem)] = String(data.mappings[sem]);
                            }
                        });
                    }
                    
                    setBatchMappings(stringMappings);
                }
            } catch (err) {
                console.error("Failed to load mappings", err);
            } finally {
                setLoadingMappings(false);
            }
        };

        fetchCurrentMappings();
    }, [selectedDeptType, user, refetchTrigger]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    const getSemestersCount = (type: DeptType) => {
        return (type === 'vocational' || type === 'pg') ? 6 : 8;
    };

    const handleBatchChange = (semester: number, value: string) => {
        setBatchMappings(prev => ({ ...prev, [semester]: value }));
    };

    const resetToDefaults = () => {
        const semCount = getSemestersCount(selectedDeptType);
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const isNewAcademicYear = currentDate.getMonth() >= 6; // July or later

        const defaults: Record<number, string> = {};
        for (let i = 1; i <= semCount; i++) {
            const yearIndex = Math.floor((i - 1) / 2);
            const expectedBatch = isNewAcademicYear ? (currentYear - yearIndex) : (currentYear - 1 - yearIndex);
            defaults[i] = String(expectedBatch);
        }
        setBatchMappings(defaults);
        setMessage({ type: 'success', text: 'Reset to calculated defaults. Click Apply to save.' });
    };

    const handleApplyUpgrades = async () => {
        // Collect ALL mappings for saving the config (even blank ones are useful info)
        const allMappings = Object.entries(batchMappings)
            .filter(([_, batchYear]) => batchYear && !isNaN(parseInt(batchYear)))
            .map(([semester, batchYear]) => ({
                semester: parseInt(semester),
                batchYear: parseInt(batchYear)
            }));

        if (allMappings.length === 0) {
            setMessage({ type: 'error', text: 'Please enter at least one valid Batch Year.' });
            return;
        }

        if (!window.confirm('Are you sure you want to upgrade students to these semesters? This will change their current semester in the database.')) {
            return;
        }

        setIsSaving(true);
        setMessage(null);

        try {
            const response = await fetch('/api/settings/batch-upgrade', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    deptType: selectedDeptType,
                    mappings: allMappings
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to upgrade batches');
            }

            const data = await response.json();
            setMessage({ type: 'success', text: `Successfully upgraded ${data.updatedCount} students!` });
            
            // Refetch saved mappings so the UI reflects what was just saved
            setRefetchTrigger(prev => prev + 1);
            
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    if (loading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const semestersCount = getSemestersCount(selectedDeptType);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <MobileSidebar 
                isOpen={sidebarOpen} 
                onClose={() => setSidebarOpen(false)} 
                user={user} 
                onLogout={handleLogout}
            />

            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">
                <div className="max-w-4xl mx-auto">
                    
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Platform Settings</h1>
                        <p className="text-gray-500">Configure global platform configurations and perform batch overrides.</p>
                    </div>

                    {/* Batch Manager Section */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 sm:p-6 border-b border-gray-100 bg-gray-50/50">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0">
                                    <Building2 className="w-5 h-5" />
                                </div>
                                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Batch & Semester Manager</h2>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-500 mt-1">
                                Force upgrade students' current semester based on their admission batch year. Only their current semester index will be updated, preserving existing attendance and subjects.
                            </p>
                        </div>

                        <div className="p-4 sm:p-6">
                            {message && (
                                <div className={`p-4 rounded-xl mb-6 text-sm flex items-start gap-3 ${
                                    message.type === 'error' ? 'bg-red-50 text-red-800 border bg-red-100' : 'bg-green-50 text-green-800 border border-green-200'
                                }`}>
                                    {message.type === 'error' ? <AlertTriangle className="w-5 h-5 flex-shrink-0" /> : <Save className="w-5 h-5 flex-shrink-0" />}
                                    <p className="font-medium mt-0.5">{message.text}</p>
                                </div>
                            )}

                            {/* Dept Type Selector */}
                            <div className="mb-6 sm:mb-8">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Department Structure</label>
                                <div className="flex flex-wrap gap-2">
                                    {(['regular', 'vocational', 'pg'] as DeptType[]).map((type) => (
                                        <button
                                            key={type}
                                            onClick={() => { setSelectedDeptType(type); setBatchMappings({}); }}
                                            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
                                                selectedDeptType === type
                                                    ? 'bg-blue-600 text-white shadow-sm'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                        >
                                            <span className="block sm:inline">{type.charAt(0).toUpperCase() + type.slice(1)}</span>{' '}
                                            <span className="opacity-75 tracking-tight hidden sm:inline">({getSemestersCount(type)} Semesters)</span>
                                            <span className="opacity-75 tracking-tight sm:hidden text-[10px]">({getSemestersCount(type)} Sems)</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Semester Inputs */}
                            <div className="bg-gray-50 rounded-xl p-4 sm:p-6 border border-gray-100 mb-6">
                                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <ArrowRightCircle className="w-4 h-4 text-blue-500 shrink-0"/>
                                    Map Admission Year (Batch) to Semester
                                </h3>
                                
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                                    {Array.from({ length: semestersCount }, (_, i) => i + 1).map((sem) => (
                                        <div key={sem} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-between">
                                            <label className="block text-[10px] sm:text-xs font-bold text-gray-500 uppercase mb-1">
                                                Semester {sem}
                                            </label>
                                            <input
                                                type="number"
                                                placeholder={loadingMappings ? "Wait..." : "e.g. 2025"}
                                                value={batchMappings[sem] || ''}
                                                onChange={(e) => handleBatchChange(sem, e.target.value)}
                                                disabled={loadingMappings}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors font-medium text-gray-900"
                                            />
                                            <p className="text-[9px] sm:text-[10px] text-gray-400 mt-1 leading-tight min-h-[14px]">
                                                {batchMappings[sem] 
                                                    ? `Sets ${batchMappings[sem]}`
                                                    : 'Skip'}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col-reverse sm:flex-row gap-3">
                                <button
                                    onClick={resetToDefaults}
                                    disabled={isSaving}
                                    className="w-full sm:w-auto px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-[0.99]"
                                >
                                    <RotateCcw className="w-4 h-4" /> Reset
                                </button>
                                <button
                                    onClick={handleApplyUpgrades}
                                    disabled={isSaving || Object.keys(batchMappings).length === 0}
                                    className={`w-full sm:flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                                        isSaving || Object.keys(batchMappings).length === 0
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-blue-500/20 active:scale-[0.99]'
                                    }`}
                                >
                                    {isSaving ? (
                                        <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Upgrading...</>
                                    ) : (
                                        <><Save className="w-5 h-5 shrink-0" /> Apply {semestersCount} Semesters</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}
