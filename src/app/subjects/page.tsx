'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Pencil, Trash2, Search,
    Plus,
    ChevronDown,
    BookOpen
} from 'lucide-react';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Navbar } from '@/components/ui/Navbar';
import { AccessDenied } from '@/components/ui/access-denied';

interface Subject {
    id: string;
    code: string;
    name: string;
    semester: number;
    degreeType: string;
    credits: number;
}

interface GroupedSubject {
    code: string;
    name: string;
    degreeType: string;
    credits: number;
    semesters: number[];
    ids: string[];
}

interface Department {
    id: string;
    name: string;
    code: string;
    dept_type: string;
    degree_type: string;
}

interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: 'super_admin' | 'hod' | 'teacher';
    departmentId?: string;
}

export default function SubjectsPage() {
    const router = useRouter();
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [showModal, setShowModal] = useState(false);

    // Form data - with deptType and degreeType for degree selection
    const [formData, setFormData] = useState({
        code: '', name: '', credits: '3', deptType: 'regular', degreeType: 'ba'
    });
    const [selectedSemesters, setSelectedSemesters] = useState<number[]>([1]);
    const [selectedDegreeTypes, setSelectedDegreeTypes] = useState<string[]>(['it']); // For multi-select degree types (vocational)
    const [editingGroup, setEditingGroup] = useState<GroupedSubject | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Search & Filter
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDegreeType, setFilterDegreeType] = useState('');
    const [filterSemester, setFilterSemester] = useState('');


    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.push('/login');
            return;
        }
        setUser(JSON.parse(userData));
        fetchSubjects(token);
        fetchDepartments(token);
    }, [router]);

    const fetchSubjects = async (token: string) => {
        try {
            const res = await fetch('/api/subjects', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.push('/login');
                return;
            }
            const data = await res.json();
            setSubjects(data.subjects || []);
        } catch (err) {
            console.error('Error fetching subjects:', err);
        }
        setLoading(false);
    };

    const fetchDepartments = async (token: string) => {
        try {
            const res = await fetch('/api/departments', { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            setDepartments(data.departments || []);
        } catch (err) {
            console.error('Error fetching departments:', err);
        }
    };

    // Group subjects by code + degreeType
    const groupedSubjects = useMemo(() => {
        const groups: Map<string, GroupedSubject> = new Map();

        subjects.forEach(subject => {
            const key = `${subject.code}-${subject.degreeType}`;

            if (groups.has(key)) {
                const group = groups.get(key)!;
                if (!group.semesters.includes(subject.semester)) {
                    group.semesters.push(subject.semester);
                    group.ids.push(subject.id);
                }
            } else {
                groups.set(key, {
                    code: subject.code,
                    name: subject.name,
                    degreeType: subject.degreeType,
                    credits: subject.credits,
                    semesters: [subject.semester],
                    ids: [subject.id]
                });
            }
        });

        // Sort semesters within each group
        groups.forEach(group => group.semesters.sort((a, b) => a - b));

        return Array.from(groups.values());
    }, [subjects]);

    // Filter grouped subjects
    const filteredGroups = useMemo(() => {
        return groupedSubjects.filter(group => {
            const matchesSearch =
                group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                group.code.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesDegreeType = !filterDegreeType || group.degreeType === filterDegreeType;
            const matchesSem = !filterSemester || group.semesters.includes(parseInt(filterSemester));
            return matchesSearch && matchesDegreeType && matchesSem;
        });
    }, [groupedSubjects, searchTerm, filterDegreeType, filterSemester]);

    const handleEdit = (group: GroupedSubject) => {
        // Determine course type from degree type
        const getDeptTypeFromDegreeType = (dt: string) => {
            if (['ba', 'bsc', 'bcom'].includes(dt)) return 'regular';
            if (['it', 'bba'].includes(dt)) return 'vocational';
            if (dt === 'mcom') return 'pg';
            return 'regular';
        };

        setFormData({
            code: group.code,
            name: group.name,
            credits: group.credits.toString(),
            deptType: getDeptTypeFromDegreeType(group.degreeType),
            degreeType: group.degreeType
        });
        setSelectedSemesters([...group.semesters]);
        setEditingGroup(group);
        setShowModal(true);
        setError('');
        setSuccess('');
    };

    // Get HOD's department info for auto-detection
    const hodDeptInfo = useMemo(() => {
        if (user?.role !== 'hod' || !user.departmentId) return null;
        const hodDept = departments.find(d => d.id === user.departmentId);
        return hodDept ? { deptType: hodDept.dept_type, degreeType: hodDept.degree_type } : null;
    }, [user, departments]);

    // Get degree type label for display
    const getDegreeTypeLabel = (dt: string) => {
        const labels: Record<string, string> = {
            'ba': 'BA',
            'bsc': 'B.Sc',
            'bcom': 'B.Com',
            'it': 'BCA/IT',
            'bba': 'BBA',
            'mcom': 'M.Com'
        };
        return labels[dt] || dt.toUpperCase();
    };

    // Get default degree type based on course type
    const getDefaultDegreeType = (deptType: string) => {
        if (deptType === 'regular') return 'ba';
        if (deptType === 'vocational') return 'it';
        if (deptType === 'pg') return 'mcom';
        return 'ba';
    };

    const resetForm = () => {
        const defaultDeptType = hodDeptInfo?.deptType || 'regular';
        const defaultDegreeType = hodDeptInfo?.degreeType || getDefaultDegreeType(defaultDeptType);
        setFormData({ code: '', name: '', credits: '3', deptType: defaultDeptType, degreeType: defaultDegreeType });
        setSelectedSemesters([1]);
        setSelectedDegreeTypes([defaultDegreeType]);
        setEditingGroup(null);
        setError('');
        setSuccess('');
    };

    const toggleSemester = (sem: number) => {
        setSelectedSemesters(prev =>
            prev.includes(sem)
                ? prev.filter((s: number) => s !== sem)
                : [...prev, sem].sort((a, b) => a - b)
        );
    };

    const toggleAllSemesters = () => {
        if (selectedSemesters.length === 8) {
            setSelectedSemesters([]);
        } else {
            setSelectedSemesters([1, 2, 3, 4, 5, 6, 7, 8]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        const token = localStorage.getItem('token');

        if (selectedSemesters.length === 0) {
            setError('Please select at least one semester');
            return;
        }

        // For vocational, require at least one degree type selected
        if (formData.deptType === 'vocational' && selectedDegreeTypes.length === 0) {
            setError('Please select at least one degree type (BCA/IT or BBA)');
            return;
        }

        try {
            if (editingGroup) {
                // UPDATE - sync semesters
                const res = await fetch('/api/subjects', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        id: editingGroup.ids[0],
                        oldCode: editingGroup.code,
                        oldDegreeType: editingGroup.degreeType,  // Original degree type
                        newDegreeType: formData.degreeType,      // New degree type from form
                        code: formData.code,
                        name: formData.name,
                        credits: formData.credits,
                        semesters: selectedSemesters
                    }),
                });

                const data = await res.json();
                if (!res.ok) {
                    setError(data.error || 'Failed to update subject');
                    return;
                }
                setSuccess('Subject updated successfully!');
            } else {
                // CREATE - with degreeTypes array for vocational, single degreeType for others
                const degreeTypesToSend = formData.deptType === 'vocational'
                    ? selectedDegreeTypes
                    : [formData.degreeType];

                const res = await fetch('/api/subjects', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        code: formData.code,
                        name: formData.name,
                        credits: formData.credits,
                        degreeTypes: degreeTypesToSend,
                        semesters: selectedSemesters
                    }),
                });

                const data = await res.json();
                if (!res.ok) {
                    setError(data.error || 'Failed to create subject');
                    return;
                }
                setSuccess(`Subject created for ${data.count} semester/degree-type combination(s)!`);
            }

            fetchSubjects(token!);

            setTimeout(() => {
                setShowModal(false);
                resetForm();
            }, 1500);
        } catch {
            setError('Network error');
        }
    };

    const handleDelete = async (group: GroupedSubject) => {
        if (!confirm(`Are you sure you want to delete "${group.name}" from all ${group.semesters.length} semester(s)?`)) return;
        const token = localStorage.getItem('token');

        try {
            const res = await fetch(`/api/subjects?code=${encodeURIComponent(group.code)}&degreeType=${group.degreeType}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                fetchSubjects(token!);
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to delete subject');
            }
        } catch (err) {
            console.error('Error deleting:', err);
            alert('Network error while deleting subject');
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

    if (user?.role === 'teacher') {
        return <AccessDenied message="Teachers do not have access to the Subjects page." />;
    }

    const canManage = user?.role === 'super_admin' || user?.role === 'hod';

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Mobile Sidebar */}
            {user && (
                <MobileSidebar
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    user={user}
                    onLogout={() => {
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        router.push('/login');
                    }}
                />
            )}

            {/* Navbar (Unified) */}
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} />

            {/* Main Content */}
            <main className="flex-1 pt-24 pb-12 px-4 max-w-7xl mx-auto w-full">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <span className="p-2 rounded-xl bg-indigo-100 text-indigo-600">
                                <BookOpen className="w-8 h-8" />
                            </span>
                            Subjects
                        </h1>
                        <p className="text-gray-500 mt-1 ml-1">
                            Manage course curriculum and syllabus.
                        </p>
                    </div>
                    {canManage && (
                        <div className="flex gap-2 shrink-0">
                            <Button
                                onClick={() => {
                                    resetForm();
                                    setShowModal(true);
                                }}
                                className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl shadow-lg hidden md:flex"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Subject
                            </Button>
                        </div>
                    )}
                </div>

                {/* Search & Filter Controls */}
                <div className="mb-6 flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                        <div className="relative w-full md:w-auto">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                placeholder="Search subjects..."
                                className="w-full md:w-80 bg-gray-50 border border-transparent hover:bg-white hover:border-gray-200 focus:bg-white focus:border-blue-500 rounded-xl pl-10 pr-4 py-2 text-sm transition-all outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 w-full md:w-auto">
                        {user?.role === 'super_admin' && (
                            <div className="relative w-full md:w-auto">
                                <select
                                    className="w-full md:w-48 bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer"
                                    value={filterDegreeType}
                                    onChange={(e) => setFilterDegreeType(e.target.value)}
                                >
                                    <option value="">All Degrees</option>
                                    <option value="ba">BA (Bachelor of Arts)</option>
                                    <option value="bsc">B.Sc (Bachelor of Science)</option>
                                    <option value="bcom">B.Com (Bachelor of Commerce)</option>
                                    <option value="it">BCA / IT</option>
                                    <option value="bba">BBA</option>
                                    <option value="mcom">M.Com (Master of Commerce)</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                            </div>
                        )}
                        <div className="relative w-full md:w-auto">
                            <select
                                className="w-full md:w-40 bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer"
                                value={filterSemester}
                                onChange={(e) => setFilterSemester(e.target.value)}
                            >
                                <option value="">All Semesters</option>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                                    <option key={s} value={s}>Sem {s}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                </div>



                {/* Desktop Content */}
                {/* Desktop Content */}
                <div className="hidden md:block px-4 py-8">
                    {filteredGroups.length === 0 ? (
                        <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50 shadow-none">
                            <CardContent className="py-12 text-center">
                                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-gray-100">
                                    <BookOpen className="w-8 h-8 text-gray-300" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-1">No subjects found</h3>
                                <p className="text-gray-500 text-sm max-w-sm mx-auto mb-4">
                                    {searchTerm ? "We couldn't find any subjects matching your search." : "Get started by adding subjects to the curriculum."}
                                </p>
                                {canManage && !searchTerm && (
                                    <Button onClick={() => setShowModal(true)} variant="outline">
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add New Subject
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Subject Info</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Degree</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Semesters</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Credits</th>
                                        {canManage && <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredGroups.map((group) => (
                                        <tr key={`${group.code}-${group.degreeType}`} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm shadow-indigo-200">
                                                        {group.code.substring(0, 2)}
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-gray-900">{group.name}</div>
                                                        <div className="text-xs text-gray-500 font-mono mt-0.5">{group.code}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                                    {getDegreeTypeLabel(group.degreeType)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {group.semesters.map(sem => (
                                                        <span key={sem} className="w-6 h-6 rounded-full bg-gray-50 text-gray-600 border border-gray-100 flex items-center justify-center text-[10px] font-bold">
                                                            {sem}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-medium text-gray-700">{group.credits} <span className="text-gray-400 font-normal text-xs ml-0.5">Cr</span></div>
                                            </td>
                                            {canManage && (
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => handleEdit(group)}
                                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(group)}
                                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>


                {/* Mobile Content */}
                {/* Mobile Content */}
                <div className="md:hidden space-y-4 pt-4">
                    {filteredGroups.length === 0 ? (
                        <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm border border-gray-100">
                            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                <BookOpen className="w-6 h-6 text-gray-400" />
                            </div>
                            <p className="text-sm">{subjects.length === 0 ? "No subjects yet." : "No matching subjects."}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredGroups.map((group) => (
                                <div
                                    key={`${group.code}-${group.degreeType}`}
                                    className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 relative"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm shadow-blue-200">
                                                {group.code.substring(0, 2)}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 leading-tight">{group.name}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
                                                        {group.code}
                                                    </span>
                                                    <span className="text-xs text-gray-400">•</span>
                                                    <span className="text-xs text-gray-500">{group.credits} Credits</span>
                                                </div>
                                            </div>
                                        </div>
                                        {canManage && (
                                            <div className="flex gap-1 -mr-2 -mt-2">
                                                <button
                                                    onClick={() => handleEdit(group)}
                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(group)}
                                                    className="p-2 text-red-500 md:text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2 mt-3">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                            {getDegreeTypeLabel(group.degreeType)}
                                        </span>
                                    </div>

                                    <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-2 overflow-x-auto pb-1">
                                        <span className="text-xs text-gray-400 whitespace-nowrap">Semesters:</span>
                                        <div className="flex gap-1">
                                            {group.semesters.map(sem => (
                                                <span key={sem} className="w-5 h-5 rounded-full bg-gray-50 text-gray-600 border border-gray-100 flex items-center justify-center text-[10px] font-bold">
                                                    {sem}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Mobile Floating Add Button - Right Bottom */}
            {canManage && (
                <div className="md:hidden fixed bottom-6 right-6 z-40">
                    <button
                        onClick={() => {
                            resetForm();
                            setShowModal(true);
                        }}
                        className="w-14 h-14 bg-gray-900 text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center justify-center shadow-gray-900/20 active:scale-95"
                    >
                        <Plus className="w-6 h-6" />
                    </button>
                </div>
            )}

            {/* Add/Edit Subject Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
                        <CardHeader>
                            <CardTitle>{editingGroup ? 'Edit Subject' : 'Add Subject'}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="code">Code *</Label>
                                        <Input
                                            id="code"
                                            value={formData.code}
                                            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                            placeholder="e.g. CS101"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="credits">Credits *</Label>
                                        <Input
                                            id="credits"
                                            type="number"
                                            value={formData.credits}
                                            onChange={(e) => setFormData({ ...formData, credits: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="name">Subject Name *</Label>
                                    <Input
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>
                                {/* Multi-Semester Selection */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <Label>Semesters *</Label>
                                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedSemesters.length === 8}
                                                onChange={toggleAllSemesters}
                                                className="w-4 h-4"
                                            />
                                            Select All
                                        </label>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                                            <label
                                                key={sem}
                                                className={`flex items-center justify-center gap-2 p-2 border rounded cursor-pointer transition-colors ${selectedSemesters.includes(sem)
                                                    ? 'bg-cyan-100 border-cyan-500 text-cyan-800'
                                                    : 'bg-white hover:bg-gray-50'
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedSemesters.includes(sem)}
                                                    onChange={() => toggleSemester(sem)}
                                                    className="sr-only"
                                                />
                                                <span className="text-sm font-medium">Sem {sem}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Selected: {selectedSemesters.length} semester(s)
                                    </p>
                                </div>

                                {/* Course Type Selection - Only for Super Admin */}
                                {user?.role === 'super_admin' && (
                                    <div>
                                        <Label htmlFor="deptType">Course Type *</Label>
                                        <select
                                            id="deptType"
                                            className="w-full p-2 border rounded bg-gradient-to-r from-cyan-50 to-white"
                                            value={formData.deptType}
                                            onChange={(e) => {
                                                const newDeptType = e.target.value;
                                                const newDegreeType = newDeptType === 'regular' ? 'ba' :
                                                    newDeptType === 'vocational' ? 'it' : 'mcom';
                                                setFormData({
                                                    ...formData,
                                                    deptType: newDeptType,
                                                    degreeType: newDegreeType
                                                });
                                                // Reset selectedDegreeTypes based on course type
                                                if (newDeptType === 'vocational') {
                                                    setSelectedDegreeTypes(['it']); // Default to BCA/IT selected
                                                } else {
                                                    setSelectedDegreeTypes([newDegreeType]);
                                                }
                                            }}
                                        >
                                            <option value="regular">Regular (BA/BSc/BCom)</option>
                                            <option value="vocational">Vocational (BCA/IT, BBA)</option>
                                            <option value="pg">Postgraduate (MCom)</option>
                                        </select>
                                    </div>
                                )}

                                {/* Degree Type Selection - Only for Super Admin */}
                                {user?.role === 'super_admin' && (
                                    <div>
                                        <Label htmlFor="degreeType">Degree Type *</Label>

                                        {/* For Vocational - Multi-select checkboxes */}
                                        {formData.deptType === 'vocational' ? (
                                            <>
                                                <div className="grid grid-cols-2 gap-2 mt-2">
                                                    {[
                                                        { value: 'it', label: 'BCA / IT' },
                                                        { value: 'bba', label: 'BBA' }
                                                    ].map(opt => (
                                                        <label
                                                            key={opt.value}
                                                            className={`flex items-center justify-center gap-2 p-2 border rounded cursor-pointer transition-colors ${selectedDegreeTypes.includes(opt.value)
                                                                ? 'bg-purple-100 border-purple-500 text-purple-800'
                                                                : 'bg-white hover:bg-gray-50'
                                                                }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedDegreeTypes.includes(opt.value)}
                                                                onChange={() => {
                                                                    setSelectedDegreeTypes(prev =>
                                                                        prev.includes(opt.value)
                                                                            ? prev.filter(dt => dt !== opt.value)
                                                                            : [...prev, opt.value]
                                                                    );
                                                                }}
                                                                className="sr-only"
                                                            />
                                                            <span className="text-sm font-medium">{opt.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Selected: {selectedDegreeTypes.length === 0 ? 'None' : selectedDegreeTypes.map(dt => dt === 'it' ? 'BCA/IT' : 'BBA').join(', ')}
                                                </p>
                                            </>
                                        ) : (
                                            /* For Regular/PG - Single select dropdown */
                                            <>
                                                <select
                                                    id="degreeType"
                                                    className="w-full p-2 border rounded"
                                                    value={formData.degreeType}
                                                    onChange={(e) => {
                                                        setFormData({
                                                            ...formData,
                                                            degreeType: e.target.value
                                                        });
                                                    }}
                                                >
                                                    {formData.deptType === 'regular' && (
                                                        <>
                                                            <option value="ba">BA (Bachelor of Arts)</option>
                                                            <option value="bsc">B.Sc (Bachelor of Science)</option>
                                                            <option value="bcom">B.Com (Bachelor of Commerce)</option>
                                                        </>
                                                    )}
                                                    {formData.deptType === 'pg' && (
                                                        <option value="mcom">M.Com (Master of Commerce)</option>
                                                    )}
                                                </select>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Subject will be assigned to: {getDegreeTypeLabel(formData.degreeType)}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* For HOD, show their degree type (read-only) */}
                                {user?.role === 'hod' && hodDeptInfo && (
                                    <div>
                                        <Label>Degree Type</Label>
                                        <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded border">
                                            {getDegreeTypeLabel(hodDeptInfo.degreeType)}
                                        </p>
                                    </div>
                                )}

                                {error && <p className="text-red-500 text-sm">{error}</p>}
                                {success && <p className="text-green-600 text-sm bg-green-50 p-2 rounded">{success}</p>}
                                <div className="flex gap-2 justify-end">
                                    <Button type="button" variant="outline" onClick={() => { setShowModal(false); resetForm(); }}>
                                        Cancel
                                    </Button>
                                    <Button type="submit">{editingGroup ? 'Update' : 'Save'} Subject</Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
