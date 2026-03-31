'use client';

import { useEffect, useState } from 'react';
import { X, LogOut, User, Mail, Shield, Lock, Settings, LayoutDashboard, Building2, BookOpen, Users, GraduationCap, CalendarDays, BarChart3, ClipboardCheck, UsersRound, ChevronRight } from 'lucide-react';
import { ChangePasswordModal } from './ChangePasswordModal';
import { useRouter } from 'next/navigation';
import { getInitials } from '@/lib/utils';

interface MobileSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    user: {
        firstName: string;
        lastName: string;
        email: string;
        role: string;
    };
    onLogout: () => void;
}

export function MobileSidebar({ isOpen, onClose, user, onLogout }: MobileSidebarProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible) return null;

    const roleLabel = user.role.replace('_', ' ').toUpperCase();

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/50 z-40 ${isOpen ? 'animate-fade-in' : 'animate-fade-out'}`}
                onClick={onClose}
            />

            {/* Sidebar */}
            <div className={`fixed left-0 top-0 h-full w-64 bg-white shadow-xl z-50 flex flex-col ${isOpen ? 'animate-slide-in-left' : 'animate-slide-out-left'}`}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-600" />
                    </button>
                </div>

                {/* Profile Info */}
                <div className="p-6 border-b">
                    {/* Avatar */}
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <span className="text-2xl font-bold text-white">
                            {getInitials(user.firstName, user.lastName)}
                        </span>
                    </div>

                    {/* Name */}
                    <h3 className="text-center text-xl font-semibold text-gray-900">
                        {user.firstName} {user.lastName}
                    </h3>

                    {/* Role Badge */}
                    <div className="flex justify-center mt-2">
                        <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-purple-100 text-purple-800 rounded-full">
                            <Shield className="w-3 h-3" />
                            {roleLabel}
                        </span>
                    </div>
                </div>

                {/* Navigation & User Details */}
                <div className="flex-1 p-4 overflow-y-auto">
                    {/* Navigation Links */}
                    <div className="space-y-1">
                        {(() => {
                            const commonLinks = [
                                { id: 'dashboard', title: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
                            ];
                            let navLinks = commonLinks;
                            if (user.role === 'super_admin') {
                                navLinks = [
                                    ...commonLinks,
                                    { id: 'departments', title: 'Departments', href: '/departments', icon: <Building2 className="w-5 h-5" /> },
                                    { id: 'subjects', title: 'Subjects', href: '/subjects', icon: <BookOpen className="w-5 h-5" /> },
                                    { id: 'teachers', title: 'Teachers', href: '/teachers', icon: <Users className="w-5 h-5" /> },
                                    { id: 'students', title: 'Students', href: '/students', icon: <GraduationCap className="w-5 h-5" /> },
                                    { id: 'holidays', title: 'Holidays', href: '/holidays', icon: <CalendarDays className="w-5 h-5" /> },
                                    { id: 'reports', title: 'Reports', href: '/reports', icon: <BarChart3 className="w-5 h-5" /> },
                                ];
                            } else if (user.role === 'hod') {
                                navLinks = [
                                    ...commonLinks,
                                    { id: 'attendance', title: 'Attendance', href: '/attendance', icon: <ClipboardCheck className="w-5 h-5" /> },
                                    { id: 'teachers', title: 'My Teachers', href: '/teachers', icon: <Users className="w-5 h-5" /> },
                                    { id: 'students', title: 'My Students', href: '/students', icon: <GraduationCap className="w-5 h-5" /> },
                                    { id: 'subjects', title: 'My Subjects', href: '/subjects', icon: <BookOpen className="w-5 h-5" /> },
                                    { id: 'reports', title: 'Reports', href: '/reports', icon: <BarChart3 className="w-5 h-5" /> },
                                ];
                            } else {
                                navLinks = [
                                    ...commonLinks,
                                    { id: 'attendance', title: 'Mark Attendance', href: '/attendance', icon: <ClipboardCheck className="w-5 h-5" /> },
                                    { id: 'classes', title: 'My Classes', href: '/classes', icon: <UsersRound className="w-5 h-5" /> },
                                    { id: 'reports', title: 'Reports', href: '/reports', icon: <BarChart3 className="w-5 h-5" /> },
                                ];
                            }

                            return navLinks.map((link) => (
                                <button
                                    key={link.id}
                                    onClick={() => { onClose(); router.push(link.href); }}
                                    className="w-full group flex items-center justify-between p-3 rounded-xl hover:bg-blue-50 text-gray-700 hover:text-blue-700 font-medium transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="text-gray-400 group-hover:text-blue-600 transition-colors">
                                            {link.icon}
                                        </div>
                                        {link.title}
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 transition-colors" />
                                </button>
                            ));
                        })()}
                    </div>

                    {/* Profile Details */}
                    <div className="pt-4 mt-4 border-t space-y-3">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 mb-1">Profile Info</div>
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <User className="w-5 h-5 text-gray-500" />
                            <div>
                                <p className="text-xs text-gray-500">Full Name</p>
                                <p className="text-sm font-medium text-gray-900">
                                    {user.firstName} {user.lastName}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <Mail className="w-5 h-5 text-gray-500" />
                            <div>
                                <p className="text-xs text-gray-500">Email</p>
                                <p className="text-sm font-medium text-gray-900 break-all">
                                    {user.email}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t space-y-2">
                    {user.role === 'super_admin' && (
                        <button
                            onClick={() => { onClose(); router.push('/settings'); }}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl font-medium hover:bg-blue-100 transition-colors"
                        >
                            <Settings className="w-5 h-5" />
                            Settings
                        </button>
                    )}
                    <button
                        onClick={() => setShowPasswordModal(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 text-gray-700 rounded-xl font-medium hover:bg-gray-100 transition-colors"
                    >
                        <Lock className="w-5 h-5" />
                        Change Password
                    </button>
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        Log Out
                    </button>
                </div>
            </div>

            <ChangePasswordModal
                isOpen={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
            />
        </>
    );
}
