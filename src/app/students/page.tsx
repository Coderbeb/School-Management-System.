'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import {
    Pencil,
    Trash2,
    Search,
    Plus,
    FileUp,
    Download,
    X,
    FileSpreadsheet,
    AlertTriangle,
    Loader2,
    GraduationCap,
    ChevronDown,
    CheckCircle2,
    Sparkles
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Navbar } from '@/components/ui/Navbar';
import { AccessDenied } from '@/components/ui/access-denied';
import { parseStudentId, findDepartmentByCode, type ParsedStudentId } from '@/lib/parseStudentId';

interface Student {
    id: string;
    student_id: string | null;
    roll_number: string;
    first_name: string;
    last_name: string;
    email: string | null;
    department_id: string;
    current_semester: number;
    department_code: string;
    department_name: string;
}

interface Department {
    id: string;
    name: string;
    code: string;
    dept_type: 'regular' | 'vocational' | 'pg';
}

interface Subject {
    id: string;
    code: string;
    name: string;
    subjectType: string;
    semester: number;
    departmentId: string;
}

interface User {
    firstName: string;
    lastName: string;
    email: string;
    role: 'super_admin' | 'hod' | 'teacher';
    departmentId?: string;
}

export default function StudentsPage() {
    const router = useRouter();
    const [students, setStudents] = useState<Student[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Form States
    const [formData, setFormData] = useState({
        studentId: '',
        rollNumber: '',
        firstName: '',
        lastName: '',
        email: '',
        semester: '1',
        departmentId: ''
    });
    const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    const [parsedInfo, setParsedInfo] = useState<ParsedStudentId | null>(null);

    // Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDeptType, setFilterDeptType] = useState('');
    const [filterDepartmentId, setFilterDepartmentId] = useState('');
    const [filterSemester, setFilterSemester] = useState('');


    // Import States
    const [showImportModal, setShowImportModal] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [importResults, setImportResults] = useState<{ success: number; failed: number; errors: any[] } | null>(null);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Default academic year
    const [academicYear] = useState('2025-2026');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.push('/login');
            return;
        }
        setUser(JSON.parse(userData));
        fetchStudents(token);
        fetchDepartments(token);
        fetchSubjects(token);
    }, [router]);

    const fetchStudents = async (token: string) => {
        try {
            const res = await fetch('/api/students', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.push('/login');
                return;
            }
            const data = await res.json();
            setStudents(data.students || []);
        } catch (err) {
            console.error('Error fetching students:', err);
        }
        setLoading(false);
    };

    const fetchDepartments = async (token: string) => {
        try {
            const res = await fetch('/api/departments', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setDepartments(data.departments || []);
        } catch (err) {
            console.error('Error fetching departments:', err);
        }
    };

    const fetchSubjects = async (token: string) => {
        try {
            const res = await fetch('/api/subjects', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            setSubjects(data.subjects || []);
        } catch (err) {
            console.error('Error fetching subjects:', err);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    const handleEdit = async (student: Student) => {
        setFormData({
            studentId: student.student_id || '',
            rollNumber: student.roll_number,
            firstName: student.first_name,
            lastName: student.last_name,
            email: student.email || '',
            semester: student.current_semester.toString(),
            departmentId: student.department_id
        });
        setSelectedStudentId(student.id);

        // Fetch existing subject enrollments
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/student-subjects?studentId=${student.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.enrollments) {
                    setSelectedSubjects(data.enrollments.map((s: any) => s.subjectId));
                } else {
                    setSelectedSubjects([]);
                }
            }
        } catch (err) {
            console.error('Error fetching student subjects', err);
        }

        setShowModal(true);
        setError('');
        setSuccess('');
    };

    const resetForm = () => {
        const defaultDeptId = user?.role === 'hod' ? (user.departmentId || '') : '';
        setFormData({
            studentId: '',
            rollNumber: '',
            firstName: '',
            lastName: '',
            email: '',
            semester: '1',
            departmentId: defaultDeptId
        });
        setSelectedStudentId(null);
        setSelectedSubjects([]);
        setParsedInfo(null);
        setError('');
        setSuccess('');
    };

    // Handle Student ID input with auto-detection
    const handleStudentIdChange = (studentId: string) => {
        setFormData(prev => ({ ...prev, studentId }));

        // Don't parse if ID is too short
        if (studentId.length < 10) {
            setParsedInfo(null);
            return;
        }

        const parsed = parseStudentId(studentId);
        setParsedInfo(parsed);

        if (parsed.isValid) {
            // Auto-fill roll number
            if (parsed.rollNumber) {
                setFormData(prev => ({ ...prev, rollNumber: parsed.rollNumber!.toString() }));
            }

            // Auto-fill semester
            if (parsed.semester) {
                setFormData(prev => ({ ...prev, semester: parsed.semester!.toString() }));
            }

            // Auto-fill department (only for admin, HOD has fixed dept)
            if (user?.role === 'super_admin' && parsed.courseType) {
                const foundDept = findDepartmentByCode(departments, parsed);
                if (foundDept) {
                    setFormData(prev => ({ ...prev, departmentId: foundDept.id }));
                }
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        const token = localStorage.getItem('token');

        // HOD validation: prevent adding students from other departments
        if (user?.role === 'hod' && parsedInfo?.isValid && !selectedStudentId) {
            const foundDept = findDepartmentByCode(departments, parsedInfo);
            if (foundDept && foundDept.id !== user.departmentId) {
                const hodDept = departments.find(d => d.id === user.departmentId);
                setError(`This student belongs to ${foundDept.name}. You can only add students to ${hodDept?.name || 'your department'}.`);
                return;
            }
        }

        if (selectedSubjects.length === 0) {
            setError('Please select at least one subject');
            return;
        }

        try {
            if (selectedStudentId) {
                // UPDATE Existing Student
                const res = await fetch('/api/students', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        id: selectedStudentId,
                        ...formData,
                        currentSemester: parseInt(formData.semester)
                    }),
                });

                const data = await res.json();
                if (!res.ok) {
                    setError(data.error || 'Failed to update student');
                    return;
                }
                setSuccess('Student updated successfully!');

                // Sync Subjects
                if (selectedSubjects.length > 0) {
                    try {
                        const enrollRes = await fetch('/api/student-subjects', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({
                                studentId: selectedStudentId,
                                subjectIds: selectedSubjects,
                                academicYear: academicYear,
                                sync: true
                            }),
                        });
                        if (enrollRes.ok) {
                            setSuccess(`Student updated & Subjects synced!`);
                        }
                    } catch {
                        // ignore subject sync error for now
                    }
                }

            } else {
                // CREATE New Student
                const res = await fetch('/api/students', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        ...formData,
                        currentSemester: parseInt(formData.semester)
                    }),
                });

                const data = await res.json();
                if (!res.ok) {
                    setError(data.error || 'Failed to create student');
                    return;
                }
                const newStudentId = data.student.id;
                let successMessage = 'Student created successfully!';

                // Enroll in Subjects
                if (selectedSubjects.length > 0) {
                    try {
                        const enrollRes = await fetch('/api/student-subjects', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({
                                studentId: newStudentId,
                                subjectIds: selectedSubjects,
                                academicYear: academicYear
                            }),
                        });
                        if (enrollRes.ok) successMessage += ' & Subjects assigned!';
                    } catch {
                        // ignore
                    }
                }
                setSuccess(successMessage);
            }

            fetchStudents(token!);

            // Auto-close modal after success
            setTimeout(() => {
                setShowModal(false);
                resetForm();
            }, 1500);

        } catch {
            setError('Network error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this student?')) return;
        const token = localStorage.getItem('token');

        try {
            const res = await fetch(`/api/students?id=${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                fetchStudents(token!);
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to delete student');
            }
        } catch (err) {
            console.error('Error deleting:', err);
        }
    };

    // Filter helper
    const getFilteredSubjects = () => {
        const semester = parseInt(formData.semester);
        return subjects.filter(s =>
            s.semester === semester && s.departmentId === formData.departmentId
        );
    };

    // Import Logic
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportFile(file);
        setPreviewData([]);
        setImportResults(null);
        setError('');

        if (file.name.endsWith('.csv')) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => setPreviewData(results.data.slice(0, 5)),
                error: () => setError('Failed to parse CSV file')
            });
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                setPreviewData(data.slice(0, 5));
            };
            reader.readAsBinaryString(file);
        } else {
            setError('Please upload a valid CSV or Excel file');
            setImportFile(null);
        }
    };

    // Template for Regular students (BA/BSC/BCOM)
    const downloadRegularTemplate = () => {
        const headers = ['student_id*', 'first_name*', 'last_name*', 'email*', 'major_subject'];
        const dummyData = [
            ['BA2025HIS001', 'John', 'Doe', 'john@example.com', 'History'],
            ['BSC2025PHY002', 'Jane', 'Smith', 'jane@example.com', 'Physics'],
            ['BCOM2025COM003', 'Bob', 'Wilson', 'bob@example.com', 'Commerce'],
            ['BA2025ECO004', 'Alice', 'Brown', 'alice@example.com', 'Economics']
        ];
        const csvContent = [headers.join(','), ...dummyData.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'regular_students_template.csv';
        a.click();
    };

    // Template for Vocational students (BCA/BSCIT/BBA)
    const downloadVocationalTemplate = () => {
        const headers = ['student_id*', 'first_name*', 'last_name*', 'email*', 'core1', 'core2', 'ge1', 'ge2'];
        const dummyData = [
            ['BCA2025SC001', 'Rahul', 'Kumar', 'rahul@example.com', 'Programming', 'DBMS', 'Physics', 'Maths'],
            ['BSCIT2025IT002', 'Priya', 'Sharma', 'priya@example.com', 'Web Dev', 'Networking', 'Physics', 'Maths'],
            ['BBA2025BA003', 'Amit', 'Singh', 'amit@example.com', 'Management', 'Marketing', '', ''],
            ['BCA2025COM004', 'Neha', 'Gupta', 'neha@example.com', 'Programming', 'DBMS', 'Accounts', 'Business Studies']
        ];
        const csvContent = [headers.join(','), ...dummyData.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vocational_students_template.csv';
        a.click();
    };

    const normalizeData = (data: any[]) => {
        const keyMap: { [key: string]: string } = {
            'student id': 'student_id', 'studentid': 'student_id', 'id': 'student_id',
            'student_id*': 'student_id', 'studentid*': 'student_id',
            'roll number': 'roll_number', 'rollnumber': 'roll_number', 'roll': 'roll_number', 'roll_no': 'roll_number',
            'first name': 'first_name', 'firstname': 'first_name', 'name': 'first_name',
            'first_name*': 'first_name', 'firstname*': 'first_name',
            'last name': 'last_name', 'lastname': 'last_name', 'surname': 'last_name',
            'last_name*': 'last_name', 'lastname*': 'last_name',
            'email': 'email', 'email address': 'email', 'email*': 'email',
            'department': 'department_code', 'dept': 'department_code', 'course': 'department_code',
            'semester': 'semester', 'sem': 'semester',
            // Subject columns
            'major_subject': 'major_subject', 'majorsubject': 'major_subject', 'major subject': 'major_subject',
            'core1': 'core1', 'core 1': 'core1',
            'core2': 'core2', 'core 2': 'core2',
            'ge1': 'ge1', 'ge 1': 'ge1',
            'ge2': 'ge2', 'ge 2': 'ge2',
            'subject_codes': 'subject_codes', 'subjectcodes': 'subject_codes', 'subjects': 'subject_codes'
        };

        return data.map(row => {
            const newRow: any = {};
            Object.keys(row).forEach(key => {
                const lowerKey = key.toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                let mappedKey = null;
                for (const [mapK, mapV] of Object.entries(keyMap)) {
                    if (mapK.replace(/[^a-z0-9]/g, '') === lowerKey) {
                        mappedKey = mapV;
                        break;
                    }
                }
                newRow[mappedKey || key] = row[key];
            });
            return newRow;
        });
    };

    const handleImport = async () => {
        if (!importFile) return;
        setIsImporting(true);
        setError('');

        const processImport = async (rawData: any[]) => {
            const data = normalizeData(rawData);
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/students/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ students: data })
                });

                const result = await res.json();
                if (res.ok) {
                    setImportResults(result);
                    if (result.success > 0) fetchStudents(token!);
                } else {
                    setError(result.error || 'Import failed');
                }
            } catch {
                setError('Network error occurred during import');
            }
            setIsImporting(false);
        };

        if (importFile.name.endsWith('.csv')) {
            Papa.parse(importFile, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => processImport(results.data)
            });
        } else {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                processImport(data);
            };
            reader.readAsBinaryString(importFile);
        }
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-500 font-medium">Loading Students...</p>
            </div>
        </div>
    );

    if (user?.role === 'teacher') {
        return <AccessDenied message="Teachers do not have access to the Students page." />;
    }

    const filteredStudents = students.filter(student => {
        const matchesSearch =
            (student.first_name + ' ' + student.last_name).toLowerCase().includes(searchTerm.toLowerCase()) ||
            student.roll_number.includes(searchTerm) ||
            (student.student_id?.includes(searchTerm));

        const matchesDept = !filterDepartmentId || student.department_id === filterDepartmentId;
        const matchesSem = !filterSemester || student.current_semester.toString() === filterSemester;

        return matchesSearch && matchesDept && matchesSem;
    });

    const isSuperAdmin = user?.role === 'super_admin';
    const canManage = user?.role === 'super_admin' || user?.role === 'hod';

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Mobile Sidebar */}
            {user && (
                <MobileSidebar
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    user={{ ...user, role: user.role }}
                    onLogout={handleLogout}
                />
            )}

            {/* Navbar */}
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} />

            {/* Page Header */}
            <div className="bg-white shadow-sm border-b border-gray-200 mt-16">
                <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <span className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
                                <GraduationCap className="w-6 h-6" />
                            </span>
                            Students
                        </h1>
                        <p className="text-gray-500 text-sm mt-1 ml-11">
                            Manage student records and enrollments.
                        </p>
                    </div>
                    {canManage && (
                        <div className="flex gap-2 shrink-0">
                            <Button variant="outline" onClick={() => setShowImportModal(true)} className="hidden md:flex">
                                <FileUp className="w-4 h-4 mr-2" />
                                Import CSV
                            </Button>
                            <Button
                                onClick={() => {
                                    resetForm();
                                    setShowModal(true);
                                }}
                                className="bg-gray-900 hover:bg-gray-800 text-white shadow-sm hidden md:flex"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                <span className="hidden sm:inline">Add Student</span>
                                <span className="sm:hidden">Add</span>
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 py-8 px-4 max-w-7xl mx-auto w-full">

                {/* Filter and Search Bar */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
                    {/* Filters */}
                    <div className="md:col-span-4 flex gap-2">
                        {isSuperAdmin && (
                            <>
                                <div className="relative w-full">
                                    <select
                                        className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none cursor-pointer"
                                        value={filterDeptType}
                                        onChange={(e) => {
                                            setFilterDeptType(e.target.value);
                                            setFilterDepartmentId(''); // Reset department when type changes
                                        }}
                                    >
                                        <option value="">All Types</option>
                                        <option value="regular">Regular</option>
                                        <option value="vocational">Vocational</option>
                                        <option value="pg">PG</option>
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                </div>
                                <div className="relative w-full">
                                    <select
                                        className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none cursor-pointer"
                                        value={filterDepartmentId}
                                        onChange={(e) => setFilterDepartmentId(e.target.value)}
                                    >
                                        <option value="">All Departments</option>
                                        {departments
                                            .filter(dept => !filterDeptType || dept.dept_type === filterDeptType)
                                            .map((dept) => (
                                                <option key={dept.id} value={dept.id}>{dept.code}</option>
                                            ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                                </div>
                            </>
                        )}
                        <div className="relative w-full">
                            <select
                                className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none cursor-pointer"
                                value={filterSemester}
                                onChange={(e) => setFilterSemester(e.target.value)}
                            >
                                <option value="">All Semesters</option>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Sem {s}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className={`relative ${isSuperAdmin ? 'md:col-span-8' : 'md:col-span-8'}`}>
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search by name, roll no, or ID..."
                            className="pl-10 bg-white border-gray-200 rounded-xl focus:ring-blue-500/20"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Students List */}
                {filteredStudents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                        <div className="bg-blue-50 p-4 rounded-full mb-4">
                            <Search className="w-8 h-8 text-blue-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">No students found</h3>
                        <p className="text-gray-500 max-w-sm text-center mt-1">
                            {students.length === 0 ? "Get started by adding students to the system." : "Try adjusting your search or filters."}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Desktop View */}
                        <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Student Details</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                                        {canManage && <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredStudents.map((student) => (
                                        <tr key={student.id} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-emerald-100 to-teal-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                                                        {student.first_name[0]}{student.last_name[0]}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <div className="font-semibold text-gray-900">{student.first_name} {student.last_name}</div>
                                                            {student.department_code && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                                                    {student.department_code}
                                                                </span>
                                                            )}
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                                                                Sem {student.current_semester}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-500 font-mono mt-0.5">
                                                            ID: {student.student_id || 'N/A'} • Roll: {student.roll_number}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600">
                                                {student.email || <span className="text-gray-400 italic">No email</span>}
                                            </td>
                                            {canManage && (
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button onClick={() => handleEdit(student)} className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={() => handleDelete(student.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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

                        {/* Mobile Grid View */}
                        <div className="md:hidden grid grid-cols-1 gap-4">
                            {filteredStudents.map((student) => (
                                <div key={student.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold">
                                                {student.first_name[0]}{student.last_name[0]}
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-gray-900">{student.first_name} {student.last_name}</h3>
                                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                        ID: {student.student_id || 'N/A'}
                                                    </span>
                                                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                        Roll: {student.roll_number}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        {canManage && (
                                            <div className="flex">
                                                <button onClick={() => handleEdit(student)} className="p-2 text-gray-400 hover:text-emerald-600">
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDelete(student.id)} className="p-2 text-red-500 md:text-gray-400 hover:text-red-600">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 pt-3 border-t border-gray-50">
                                        {student.department_code && (
                                            <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-100">
                                                {student.department_code}
                                            </span>
                                        )}
                                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                                            Sem {student.current_semester}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </main>

            {/* Floating Action Buttons (Mobile) */}
            {canManage && (
                <div className="md:hidden fixed bottom-6 right-6 flex flex-col gap-3 z-30">
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="h-12 w-12 bg-white text-blue-600 rounded-full shadow-lg border border-blue-50 flex items-center justify-center"
                    >
                        <FileUp className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => { resetForm(); setShowModal(true); }}
                        className="h-14 w-14 bg-gray-900 text-white rounded-full shadow-lg hover:bg-gray-800 transition-all flex items-center justify-center active:scale-90"
                    >
                        <Plus className="w-6 h-6" />
                    </button>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <Card className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border-0">
                        <CardHeader className="bg-gray-50/50 border-b border-gray-100 pb-4 shrink-0 rounded-t-2xl">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-xl">{selectedStudentId ? 'Edit Student' : 'Add New Student'}</CardTitle>
                                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-lg transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </CardHeader>
                        <CardContent className="overflow-y-auto pt-6 custom-scrollbar">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="col-span-2 sm:col-span-1">
                                        <Label htmlFor="studentId" className="flex items-center gap-2">
                                            Student ID *
                                            {parsedInfo?.isValid && (
                                                <span className="flex items-center gap-1 text-emerald-600 text-xs font-normal">
                                                    <CheckCircle2 className="w-3 h-3" />
                                                    Auto-detected
                                                </span>
                                            )}
                                        </Label>
                                        <Input
                                            id="studentId"
                                            value={formData.studentId}
                                            onChange={(e) => handleStudentIdChange(e.target.value.toUpperCase())}
                                            placeholder={(() => {
                                                // Dynamic placeholder based on HOD's department
                                                if (user?.role === 'hod' && user.departmentId) {
                                                    const hodDept = departments.find(d => d.id === user.departmentId);
                                                    if (hodDept?.code === 'IT') return 'e.g., BCA2025SC021';
                                                    if (hodDept?.code === 'BBA') return 'e.g., BBA2025BA021';
                                                    if (hodDept?.code === 'MCOM') return 'e.g., MCOM2025COM021';
                                                    // Regular departments
                                                    return `e.g., BA2025${hodDept?.code || 'HIS'}021`;
                                                }
                                                return 'e.g., BA2025HIS069';
                                            })()}
                                            className={`rounded-xl border-gray-200 uppercase ${parsedInfo?.isValid ? 'border-emerald-300 bg-emerald-50/30' : ''} ${parsedInfo && !parsedInfo.isValid && formData.studentId.length >= 10 ? 'border-amber-300' : ''}`}
                                            required
                                        />
                                        {parsedInfo?.error && formData.studentId.length >= 10 && (
                                            <p className="text-amber-600 text-xs mt-1">⚠️ {parsedInfo.error}</p>
                                        )}
                                    </div>
                                    <div className="col-span-2 sm:col-span-1">
                                        <Label htmlFor="rollNumber" className="flex items-center gap-2">
                                            Roll Number *
                                            {parsedInfo?.rollNumber && (
                                                <span className="text-gray-400 text-xs font-normal">(auto-filled)</span>
                                            )}
                                        </Label>
                                        <Input
                                            id="rollNumber"
                                            type="number"
                                            value={formData.rollNumber}
                                            onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                                            placeholder="e.g., 21"
                                            className="rounded-xl border-gray-200"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Parsed Info Display */}
                                {parsedInfo?.isValid && (
                                    <div className="p-3 bg-gradient-to-r from-emerald-50 to-cyan-50 border border-emerald-200 rounded-xl">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Sparkles className="w-4 h-4 text-emerald-600" />
                                            <span className="text-sm font-medium text-emerald-800">Detected Information</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${parsedInfo.courseType === 'regular' ? 'bg-blue-100 text-blue-700' :
                                                parsedInfo.courseType === 'vocational' ? 'bg-purple-100 text-purple-700' :
                                                    'bg-amber-100 text-amber-700'
                                                }`}>
                                                {parsedInfo.courseType?.toUpperCase()}
                                            </span>
                                            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                                                Batch: {parsedInfo.batch}
                                            </span>
                                            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                                                Semester: {parsedInfo.semester}
                                            </span>
                                            {parsedInfo.programVariant && (
                                                <span className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded-full">
                                                    {parsedInfo.programVariant}
                                                </span>
                                            )}
                                            {parsedInfo.geSubjects && (
                                                <span className="px-2 py-1 text-xs bg-pink-100 text-pink-700 rounded-full">
                                                    GE: {parsedInfo.geSubjects.ge1} + {parsedInfo.geSubjects.ge2}
                                                </span>
                                            )}
                                        </div>
                                        {/* HOD Warning - if parsed department doesn't match their department */}
                                        {user?.role === 'hod' && parsedInfo.isValid && (() => {
                                            const foundDept = findDepartmentByCode(departments, parsedInfo);
                                            if (foundDept && foundDept.id !== user.departmentId) {
                                                const hodDept = departments.find(d => d.id === user.departmentId);
                                                return (
                                                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                                                        <p className="text-red-700 text-xs font-medium">
                                                            ⚠️ This student belongs to <strong>{foundDept.name}</strong>, but you can only add students to <strong>{hodDept?.name || 'your department'}</strong>.
                                                        </p>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="firstName">First Name *</Label>
                                        <Input
                                            id="firstName"
                                            value={formData.firstName}
                                            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                            className="rounded-xl border-gray-200"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="lastName">Last Name *</Label>
                                        <Input
                                            id="lastName"
                                            value={formData.lastName}
                                            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                            className="rounded-xl border-gray-200"
                                            required
                                        />
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="student@college.edu"
                                        className="rounded-xl border-gray-200"
                                    />
                                </div>

                                {isSuperAdmin ? (
                                    <div>
                                        <Label htmlFor="departmentId">Department *</Label>
                                        <select
                                            id="departmentId"
                                            className="w-full p-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:outline-none bg-white"
                                            value={formData.departmentId}
                                            onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                                            required
                                        >
                                            <option value="">Select Department</option>
                                            {departments.map((dept) => (
                                                <option key={dept.id} value={dept.id}>{dept.code} - {dept.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <input type="hidden" value={user?.departmentId || ''} />
                                )}

                                <div>
                                    <Label htmlFor="semester">Semester *</Label>
                                    <select
                                        id="semester"
                                        className="w-full p-2 border border-gray-200 rounded-xl bg-white"
                                        value={formData.semester}
                                        onChange={(e) => {
                                            setFormData({ ...formData, semester: e.target.value });
                                            if (!selectedStudentId) setSelectedSubjects([]);
                                        }}
                                    >
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                                            <option key={s} value={s}>Semester {s}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Subject Selection */}
                                {formData.departmentId ? (
                                    <div className="pt-4 border-t">
                                        <Label className="font-medium">Select Subjects *</Label>
                                        <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 rounded-xl p-2 space-y-2 bg-gray-50">
                                            {getFilteredSubjects().length === 0 ? (
                                                <p className="text-gray-500 text-sm p-2">No subjects available for Semester {formData.semester}.</p>
                                            ) : (
                                                getFilteredSubjects().map((subject) => (
                                                    <label key={subject.id} className="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer border border-transparent hover:border-gray-200 transition-colors">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedSubjects.includes(subject.id)}
                                                            onChange={() => {
                                                                if (selectedSubjects.includes(subject.id)) {
                                                                    setSelectedSubjects(selectedSubjects.filter(id => id !== subject.id));
                                                                } else {
                                                                    setSelectedSubjects([...selectedSubjects, subject.id]);
                                                                }
                                                            }}
                                                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <div className="text-sm">
                                                            <div className="font-medium">{subject.code} <span className="text-gray-400 mx-1">|</span> <span className="text-gray-600">{subject.name}</span></div>
                                                            <div className="mt-0.5">
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${subject.subjectType === 'core' ? 'bg-blue-100 text-blue-800' :
                                                                    subject.subjectType === 'generic' ? 'bg-green-100 text-green-800' :
                                                                        'bg-purple-100 text-purple-800'
                                                                    }`}>
                                                                    {subject.subjectType}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </label>
                                                ))
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1.5 ml-1">
                                            Selected: {selectedSubjects.length} subject(s)
                                        </p>
                                    </div>
                                ) : (
                                    <div className="pt-4 border-t">
                                        <p className="text-amber-600 text-sm bg-amber-50 p-3 rounded-xl border border-amber-100">
                                            Please select a department to view subjects.
                                        </p>
                                    </div>
                                )}

                                {error && (
                                    <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4" />
                                        {error}
                                    </div>
                                )}

                                {success && (
                                    <div className="p-3 bg-green-50 text-green-700 rounded-xl text-sm border border-green-100 flex flex-col gap-2">
                                        <div className="font-semibold flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                            Success
                                        </div>
                                        {success}
                                        {!selectedStudentId && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => { setShowModal(false); resetForm(); }}
                                                className="self-end bg-white"
                                            >
                                                Close
                                            </Button>
                                        )}
                                    </div>
                                )}

                                {(!success || selectedStudentId) && (
                                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-6">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setShowModal(false)}
                                            className="rounded-xl border-gray-200"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            className="bg-gray-900 text-white rounded-xl hover:bg-gray-800 shadow-lg shadow-gray-900/20"
                                        >
                                            {selectedStudentId ? 'Update Student' : 'Add Student'}
                                        </Button>
                                    </div>
                                )}
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border-0">
                        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 pb-4">
                            <CardTitle>Import Students</CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => setShowImportModal(false)}>
                                <X className="h-5 w-5 text-gray-400" />
                            </Button>
                        </CardHeader>
                        <CardContent className="overflow-y-auto pt-6 custom-scrollbar">
                            {!importResults ? (
                                <div className="space-y-6">
                                    {/* Upload Section */}
                                    <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center space-y-4 hover:bg-gray-50 transition-colors relative cursor-pointer group">
                                        <input
                                            type="file"
                                            accept=".csv,.xlsx,.xls"
                                            onChange={handleFileChange}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-blue-600 group-hover:scale-110 transition-transform">
                                            <FileSpreadsheet className="w-8 h-8" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-semibold text-gray-900">
                                                {importFile ? importFile.name : 'Click to Upload CSV or Excel'}
                                            </p>
                                            <p className="text-sm text-gray-500 mt-1">
                                                Drag & drop or browse from computer
                                            </p>
                                        </div>
                                    </div>

                                    {/* Template Download */}
                                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                                        <div className="mb-3">
                                            <h4 className="font-semibold text-emerald-900 text-sm">Download Template</h4>
                                            <p className="text-xs text-emerald-700 mt-0.5">Choose the template matching your student type.</p>
                                        </div>
                                        <div className="flex gap-2 flex-wrap">
                                            <Button variant="outline" onClick={downloadRegularTemplate} className="bg-white text-blue-700 border-blue-200 hover:bg-blue-50">
                                                <Download className="w-3.5 h-3.5 mr-2" />
                                                Regular (BA/BSC/BCOM)
                                            </Button>
                                            <Button variant="outline" onClick={downloadVocationalTemplate} className="bg-white text-purple-700 border-purple-200 hover:bg-purple-50">
                                                <Download className="w-3.5 h-3.5 mr-2" />
                                                Vocational (BCA/BBA)
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Preview */}
                                    {previewData.length > 0 && (
                                        <div>
                                            <h4 className="font-semibold mb-3 flex items-center gap-2 text-sm text-gray-700">
                                                <Search className="w-4 h-4" /> Preview (First 5 Rows)
                                            </h4>
                                            <div className="overflow-x-auto border border-gray-200 rounded-xl">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-gray-50 text-gray-600">
                                                        <tr>
                                                            {Object.keys(previewData[0]).map((header) => (
                                                                <th key={header} className="px-3 py-2 text-left font-medium uppercase tracking-wider">{header}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {previewData.map((row, i) => (
                                                            <tr key={i} className="hover:bg-gray-50">
                                                                {Object.values(row).map((val: any, j) => (
                                                                    <td key={j} className="px-3 py-2 whitespace-nowrap text-gray-600">{val}</td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex gap-3 justify-end pt-2">
                                        <Button variant="outline" onClick={() => setShowImportModal(false)} className="rounded-xl">
                                            Cancel
                                        </Button>
                                        <Button onClick={handleImport} disabled={!importFile || isImporting} className="rounded-xl bg-emerald-600 hover:bg-emerald-700">
                                            {isImporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</> : 'Start Import'}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                // Results View
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-green-50 p-6 rounded-2xl text-center border border-green-100">
                                            <div className="text-3xl font-bold text-green-600">{importResults.success}</div>
                                            <div className="text-sm font-medium text-green-800 mt-1">Successfully Imported</div>
                                        </div>
                                        <div className="bg-red-50 p-6 rounded-2xl text-center border border-red-100">
                                            <div className="text-3xl font-bold text-red-600">{importResults.failed}</div>
                                            <div className="text-sm font-medium text-red-800 mt-1">Failed Rows</div>
                                        </div>
                                    </div>

                                    {importResults.errors.length > 0 && (
                                        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                                            <h4 className="font-semibold mb-3 text-red-600 text-sm flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4" /> Error Log
                                            </h4>
                                            <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                                {importResults.errors.map((err, i) => (
                                                    <div key={i} className="flex gap-3 text-xs p-2.5 bg-white rounded-lg border border-red-100 shadow-sm">
                                                        <span className="font-mono text-gray-500 w-12 shrink-0">Row {err.row}</span>
                                                        <span className="text-red-600 flex-1">{err.error}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-end pt-4">
                                        <Button onClick={() => { setShowImportModal(false); setImportResults(null); }} className="w-full rounded-xl bg-gray-900 hover:bg-gray-800">
                                            Done
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {error && <p className="text-red-500 text-sm mt-4 text-center bg-red-50 p-2 rounded-lg border border-red-100">{error}</p>}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
