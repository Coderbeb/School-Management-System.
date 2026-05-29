import { useState, useEffect } from 'react';
import { Menu, School, ArrowLeft } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { ProfileModal } from './ProfileModal';
import { getInitials } from '@/lib/utils';

interface User {
    firstName: string;
    lastName: string;
    role: string;
}

interface SchoolBranding {
    schoolName: string;
    shortName: string;
    logoUrl: string | null;
    navbarTitle: string;
    primaryColor: string;
}

interface NavbarProps {
    user: User | null;
    onMenuClick: () => void;
    onLogout?: () => void;
    backUrl?: string;
    backLabel?: string;
}

const roleLabels: Record<string, string> = {
    developer: 'Platform Developer',
    super_admin: 'Administrator',
    teacher: 'Teacher',
    accountant: 'Accountant',
    student: 'Student',
};

export function Navbar({ user, onMenuClick, onLogout, backUrl, backLabel }: NavbarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [branding, setBranding] = useState<SchoolBranding | null>(null);

    // Fetch school branding on mount
    useEffect(() => {
        const fetchBranding = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) return;

                const res = await fetch('/api/settings/school-branding', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const data = await res.json();
                    setBranding(data.branding);
                }
            } catch (err) {
                // Silently fail — fallback to defaults
                console.error('Failed to fetch branding:', err);
            }
        };
        fetchBranding();
    }, []);

    const handleLogout = () => {
        if (onLogout) {
            onLogout();
        } else {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            router.replace('/login');
        }
    };

    // Determine the home dashboard based on the user's role
    const getDashboardPath = () => {
        if (!user) return '/dashboard';
        switch (user.role) {
            case 'developer': return '/developer/dashboard';
            case 'teacher': return '/teacher/dashboard';
            case 'accountant': return '/accountant/dashboard';
            case 'student': return '/student/dashboard';
            default: return '/dashboard';
        }
    };

    const displayTitle = branding?.navbarTitle || branding?.shortName || 'SMS';

    return (
        <>
            <header className="fixed top-0 w-full z-30 bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onMenuClick}
                            className="p-2 -ml-2 hover:bg-gray-100 rounded-lg"
                        >
                            <Menu className="w-6 h-6 text-gray-600" />
                        </button>
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push(getDashboardPath())}>
                            {branding?.logoUrl ? (
                                <div className="h-9 w-9 rounded-xl overflow-hidden shadow-sm border border-gray-100">
                                    <img
                                        src={branding.logoUrl}
                                        alt={branding.schoolName}
                                        className="h-full w-full object-cover"
                                    />
                                </div>
                            ) : (
                                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-1.5 rounded-xl h-9 w-9 flex items-center justify-center overflow-hidden shadow-sm">
                                    <School className="w-5 h-5 text-white" />
                                </div>
                            )}
                            <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-700 hidden sm:block">
                                {displayTitle}
                            </span>
                        </div>
                        {!pathname.includes('/dashboard') && (
                            <div className="hidden md:flex items-center ml-2 pl-4 border-l border-gray-200 h-6">
                                <button
                                    onClick={() => router.back()}
                                    className="flex items-center gap-2 text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    Back
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        {user && (
                            <div
                                className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-1.5 pr-2 rounded-full transition-colors"
                                onClick={() => setShowProfileModal(true)}
                            >
                                <div className="hidden sm:flex flex-col items-end mr-1">
                                    <span className="text-sm font-bold text-gray-900 leading-none">
                                        {user.firstName} {user.lastName}
                                    </span>
                                    <span className="text-[10px] font-medium text-gray-500 leading-tight mt-0.5">
                                        {roleLabels[user.role] || user.role.replace('_', ' ')}
                                    </span>
                                </div>
                                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 p-0.5 shadow-sm">
                                    <div className="h-full w-full rounded-full bg-white flex items-center justify-center text-xs font-bold text-blue-700">
                                        {getInitials(user.firstName, user.lastName)}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </header>

            {user && (
                <ProfileModal
                    isOpen={showProfileModal}
                    onClose={() => setShowProfileModal(false)}
                    user={user as any}
                    onLogout={handleLogout}
                />
            )}
        </>
    );
}
