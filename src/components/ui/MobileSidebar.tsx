'use client';

import { useEffect, useState } from 'react';
import { 
    X, 
    Settings, 
    LayoutDashboard, 
    Building2, 
    BookOpen, 
    Users, 
    GraduationCap, 
    CalendarDays, 
    BarChart3, 
    ClipboardCheck,
    ClipboardList,
    UsersRound, 
    User,
    TrendingUp,
    Sparkles,
    PenLine,
    FileText,
    Trophy,
    Award,
    UserCog,
    Send,
    IndianRupee
} from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { getInitials } from '@/lib/utils';
import { ProfileModal } from './ProfileModal';

interface NavLink {
    id: string;
    title: string;
    href: string;
    icon: React.ReactNode;
}

interface NavSection {
    label: string;
    color: string; // tailwind text color class for the section header
    links: NavLink[];
}

interface MobileSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    user: {
        role: string;
        [key: string]: any;
    } | null;
    onLogout?: () => void;
}

export function MobileSidebar({ isOpen, onClose, user, onLogout }: MobileSidebarProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            // Allow DOM to mount before triggering transition
            const timer = setTimeout(() => setIsMounted(true), 10);
            return () => clearTimeout(timer);
        } else {
            setIsMounted(false);
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible || !user) return null;

    const navigateTo = (href: string) => {
        onClose();
        router.push(href);
    };

    const getNavSections = (): NavSection[] => {
        if (user.role === 'super_admin') {
            return [
                {
                    label: 'Dashboard',
                    color: 'text-gray-400',
                    links: [
                        { id: 'dashboard', title: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
                    ]
                },
                {
                    label: 'Core Administration',
                    color: 'text-gray-400',
                    links: [
                        { id: 'sessions', title: 'Academic Sessions', href: '/manage/sessions', icon: <CalendarDays className="w-5 h-5" /> },
                        { id: 'classes', title: 'Classes & Sections', href: '/manage/classes', icon: <Building2 className="w-5 h-5" /> },
                        { id: 'subjects', title: 'Subjects', href: '/manage/subjects', icon: <BookOpen className="w-5 h-5" /> },
                        { id: 'accounts', title: 'User Accounts', href: '/manage/accounts', icon: <UsersRound className="w-5 h-5" /> },
                        { id: 'bulk-import', title: 'Bulk Configurator', href: '/manage/bulk-import', icon: <Sparkles className="w-5 h-5 text-violet-600" /> },
                    ]
                },
                {
                    label: 'Teacher Attendance System',
                    color: 'text-emerald-500',
                    links: [
                        { id: 'teachers', title: 'Teachers Directory', href: '/manage/teachers', icon: <Users className="w-5 h-5" /> },
                        { id: 'staff-attendance', title: 'Staff Attendance', href: '/manage/staff-attendance', icon: <UserCog className="w-5 h-5" /> },
                    ]
                },
                {
                    label: 'Student Attendance System',
                    color: 'text-blue-500',
                    links: [
                        { id: 'students', title: 'Students Directory', href: '/manage/students', icon: <GraduationCap className="w-5 h-5" /> },
                        { id: 'attendance', title: 'Student Attendance', href: '/attendance', icon: <ClipboardCheck className="w-5 h-5" /> },
                        { id: 'holidays', title: 'Holidays Calendar', href: '/holidays', icon: <CalendarDays className="w-5 h-5" /> },
                    ]
                },
                {
                    label: 'Exams & Academics',
                    color: 'text-gray-400',
                    links: [
                        { id: 'exams', title: 'Exam Management', href: '/manage/exams', icon: <ClipboardList className="w-5 h-5" /> },
                        { id: 'grading', title: 'Grading Scales', href: '/manage/grading', icon: <GraduationCap className="w-5 h-5" /> },
                        { id: 'co-scholastic', title: 'Co-Scholastic', href: '/manage/co-scholastic', icon: <Award className="w-5 h-5" /> },
                        { id: 'marks-overview', title: 'Marks Overview', href: '/marks/overview', icon: <BarChart3 className="w-5 h-5" /> },
                        { id: 'class-results', title: 'Class Results', href: '/marks/class-results', icon: <Trophy className="w-5 h-5" /> },
                        { id: 'report-cards', title: 'Report Cards', href: '/marks/report-card', icon: <FileText className="w-5 h-5" /> },
                    ]
                },
                {
                    label: 'Finance & Salary',
                    color: 'text-emerald-500',
                    links: [
                        { id: 'finance', title: 'Finance Dashboard', href: '/manage/finance', icon: <IndianRupee className="w-5 h-5" /> },
                    ]
                },
                {
                    label: 'Reports',
                    color: 'text-gray-400',
                    links: [
                        { id: 'reports', title: 'Reports', href: '/reports', icon: <BarChart3 className="w-5 h-5" /> },
                    ]
                },
            ];
        } else if (user.role === 'teacher') {
            return [
                {
                    label: 'My Attendance (Teacher Portal)',
                    color: 'text-emerald-500',
                    links: [
                        { id: 'dashboard', title: 'Teacher Dashboard', href: '/teacher/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
                        { id: 'my-attendance', title: 'My Attendance Logs', href: '/teacher/my-attendance', icon: <CalendarDays className="w-5 h-5" /> },
                        { id: 'apply-leave', title: 'Apply for Leave', href: '/teacher/apply-leave', icon: <Send className="w-5 h-5" /> },
                    ]
                },
                {
                    label: 'Classroom (Student Portal)',
                    color: 'text-blue-500',
                    links: [
                        { id: 'attendance', title: 'Mark Student Attendance', href: '/attendance/mark', icon: <ClipboardCheck className="w-5 h-5" /> },
                        { id: 'marks-entry', title: 'Marks Entry', href: '/marks/entry', icon: <PenLine className="w-5 h-5" /> },
                        { id: 'co-scholastic', title: 'Co-Scholastic', href: '/manage/co-scholastic', icon: <Award className="w-5 h-5" /> },
                        { id: 'reports', title: 'Student Reports', href: '/reports', icon: <BarChart3 className="w-5 h-5" /> },
                    ]
                },
            ];
        } else if (user.role === 'student') {
            return [
                {
                    label: 'My Portal',
                    color: 'text-blue-500',
                    links: [
                        { id: 'dashboard', title: 'Dashboard', href: '/student/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
                        { id: 'attendance', title: 'My Attendance', href: '/student/attendance', icon: <ClipboardCheck className="w-5 h-5" /> },
                        { id: 'apply-leave', title: 'Apply for Leave', href: '/student/apply-leave', icon: <Send className="w-5 h-5" /> },
                        { id: 'results', title: 'My Results', href: '/student/results', icon: <TrendingUp className="w-5 h-5" /> },
                        { id: 'subjects', title: 'My Subjects', href: '/student/subjects', icon: <BookOpen className="w-5 h-5" /> },
                        { id: 'fees', title: 'Fee Status', href: '/student/fees', icon: <ClipboardList className="w-5 h-5" /> },
                    ]
                },
            ];
        } else if (user.role === 'developer') {
            return [
                {
                    label: 'Platform',
                    color: 'text-violet-500',
                    links: [
                        { id: 'dashboard', title: 'Developer Panel', href: '/developer/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
                        { id: 'schools', title: 'Manage Schools', href: '/developer/schools', icon: <Building2 className="w-5 h-5" /> },
                    ]
                },
            ];
        } else {
            // accountant
            return [
                {
                    label: 'Finance Portal',
                    color: 'text-emerald-500',
                    links: [
                        { id: 'finance', title: 'Finance Dashboard', href: '/manage/finance', icon: <IndianRupee className="w-5 h-5" /> },
                        { id: 'collect', title: 'Collect Fee', href: '/manage/finance?tab=collect', icon: <ClipboardList className="w-5 h-5" /> },
                        { id: 'payments', title: 'Payment History', href: '/manage/finance?tab=payments', icon: <BarChart3 className="w-5 h-5" /> },
                        { id: 'defaulters', title: 'Defaulters', href: '/manage/finance?tab=defaulters', icon: <Users className="w-5 h-5" /> },
                    ]
                },
            ];
        }
    };

    const navSections = getNavSections();

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-slate-900/40 z-40 transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            {/* Sidebar */}
            <div 
                className={`fixed left-0 top-0 h-full w-72 bg-white/80 backdrop-blur-md border-r border-gray-100 shadow-xl z-50 flex flex-col transition-transform duration-300 ease-out ${isMounted ? 'translate-x-0' : '-translate-x-full'}`}
            >
                {/* Header App Branding */}
                <div className="flex flex-col border-b border-gray-100">
                    <div className="flex items-start justify-between p-4">
                        <div className="flex flex-col gap-3 w-full">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-0.5 shadow-sm">
                                    <div className="w-full h-full rounded-full border-2 border-white bg-white flex items-center justify-center">
                                        <span className="text-base font-bold bg-clip-text text-transparent bg-gradient-to-br from-blue-600 to-purple-600">
                                            {getInitials(user.firstName || '', user.lastName || '')}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-lg font-bold text-gray-900 leading-tight">
                                        {user.firstName || 'User'} {user.lastName || ''}
                                    </h2>
                                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{user.role?.replace('_', ' ')}</p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-1.5 -mt-3 -mr-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            
                            <button
                                onClick={() => setShowProfileModal(true)}
                                className="w-fit inline-flex flex-row items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 hover:border-blue-300 text-xs font-semibold text-gray-700 hover:text-blue-600 rounded-full shadow-sm hover:shadow transition-all"
                            >
                                <User className="w-3.5 h-3.5" />
                                View Profile Details
                            </button>
                        </div>
                    </div>
                </div>

                {/* Navigation Links — Grouped by Section */}
                <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin scrollbar-thumb-gray-200">
                    {navSections.map((section, sectionIdx) => (
                        <div key={sectionIdx}>
                            <p className={`px-3 text-[10px] font-extrabold uppercase tracking-widest mb-2 ${section.color}`}>
                                {section.label}
                            </p>
                            <div className="space-y-1">
                                {section.links.map((link) => {
                                    const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
                                    return (
                                        <button
                                            key={link.id}
                                            onClick={() => navigateTo(link.href)}
                                            className={`w-full group flex items-center justify-between p-3 rounded-2xl transition-all duration-200 ${
                                                isActive 
                                                ? 'bg-blue-50/80 text-blue-700 shadow-sm border border-blue-100/50' 
                                                : 'hover:bg-gray-50 text-gray-600 hover:text-gray-900 border border-transparent'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`transition-transform duration-300 ${isActive ? 'text-blue-600 scale-110' : 'text-gray-400 group-hover:text-gray-600 group-hover:scale-110'}`}>
                                                    {link.icon}
                                                </div>
                                                <span className={`text-sm tracking-wide ${isActive ? 'font-bold' : 'font-medium'}`}>
                                                    {link.title}
                                                </span>
                                            </div>
                                            
                                            {isActive && (
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.8)]" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-2">
                    {user.role === 'super_admin' && (
                        <button
                            onClick={() => navigateTo('/settings')}
                            className={`w-full group flex items-center justify-between p-3.5 rounded-2xl transition-all duration-200 ${
                                pathname.startsWith('/settings') 
                                ? 'bg-blue-50/80 text-blue-700 shadow-sm border border-blue-100/50' 
                                : 'bg-white text-gray-700 hover:text-blue-700 border border-gray-100 hover:border-blue-200 shadow-sm hover:shadow-md'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`transition-transform duration-300 ${pathname.startsWith('/settings') ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-500'}`}>
                                    <Settings className="w-5 h-5" />
                                </div>
                                <span className={`text-sm tracking-wide ${pathname.startsWith('/settings') ? 'font-bold' : 'font-medium'}`}>
                                    Settings & Config
                                </span>
                            </div>
                        </button>
                    )}
                </div>
            </div>

            <ProfileModal
                isOpen={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                user={user as any}
                onLogout={onLogout}
            />
        </>
    );
}
