import { useState } from 'react';
import { Menu, GraduationCap, ArrowLeft, LogOut, Lock } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { ChangePasswordModal } from './ChangePasswordModal';

interface User {
    firstName: string;
    lastName: string;
    role: string;
}

interface NavbarProps {
    user: User | null;
    onMenuClick: () => void;
    onLogout?: () => void;
    backUrl?: string;
    backLabel?: string;
}

export function Navbar({ user, onMenuClick, onLogout, backUrl, backLabel }: NavbarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    return (
        <>
            <header className="fixed top-0 w-full z-30 bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onMenuClick}
                            className="p-2 -ml-2 hover:bg-gray-100 rounded-lg md:hidden"
                        >
                            <Menu className="w-6 h-6 text-gray-600" />
                        </button>
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/dashboard')}>
                            <div className="bg-gradient-to-tr from-blue-600 to-purple-600 p-1.5 rounded-lg">
                                <GraduationCap className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-purple-700 hidden sm:block">
                                CollegeAttend
                            </span>
                        </div>
                        {!pathname.includes('/dashboard') && (
                            <div className="hidden md:flex items-center ml-2 pl-4 border-l border-gray-200 h-6">
                                <button
                                    onClick={() => router.push(backUrl || '/dashboard')}
                                    className="flex items-center gap-2 text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    {backLabel || 'Dashboard'}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        {user && (
                            <div className="flex items-center gap-3">
                                <div className="flex flex-col items-end mr-1">
                                    <span className="text-sm font-bold text-gray-900 leading-none">
                                        {user.firstName} {user.lastName}
                                    </span>
                                    <span className="text-[10px] font-medium text-gray-500 capitalize leading-tight mt-0.5">
                                        {user.role.replace('_', ' ')}
                                    </span>
                                </div>
                                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 p-0.5 shadow-sm">
                                    <div className="h-full w-full rounded-full bg-white flex items-center justify-center text-xs font-bold text-blue-700">
                                        {user.firstName?.[0]}{user.lastName?.[0]}
                                    </div>
                                </div>
                                {/* Desktop Actions */}
                                {pathname === '/dashboard' && (
                                    <div className="hidden md:flex items-center gap-2 ml-2">
                                        <button
                                            onClick={() => setShowPasswordModal(true)}
                                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Change Password"
                                        >
                                            <Lock className="w-4 h-4" />
                                        </button>
                                        {onLogout && (
                                            <button
                                                onClick={onLogout}
                                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <LogOut className="w-4 h-4" />
                                                <span>Logout</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

            </header >

            <ChangePasswordModal
                isOpen={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
            />
        </>
    );
}
