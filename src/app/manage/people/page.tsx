'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Navbar } from '@/components/ui/Navbar';
import {
    Users,
    GraduationCap,
    UserCog,
    ChevronRight,
    ArrowLeft,
} from 'lucide-react';

interface User {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'developer' | 'super_admin' | 'teacher' | 'accountant' | 'student';
}

interface DashboardCard {
    id: string;
    title: string;
    description: string;
    href: string;
    iconComponent: React.ReactNode;
    gradient: string;
    textColor: string;
    borderColor: string;
    comingSoon?: boolean;
}

export default function PeopleManagementPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');

        if (!token || !userData) {
            router.replace('/login');
            return;
        }

        try {
            const parsed = JSON.parse(userData);
            if (parsed.role !== 'super_admin') {
                router.replace('/login');
                return;
            }
            setUser(parsed);
        } catch {
            router.replace('/login');
        }
        setLoading(false);
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium">Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) return null;

    const cards: DashboardCard[] = [
        {
            id: 'students', title: 'Students', description: 'Admit students & manage enrollments',
            href: '/manage/students', iconComponent: <GraduationCap className="w-6 h-6" />,
            gradient: 'from-emerald-100 to-teal-100', textColor: 'text-emerald-700', borderColor: 'border-emerald-200'
        },
        {
            id: 'teachers', title: 'Teachers & Staff', description: 'Manage teachers & assign classes',
            href: '/manage/teachers', iconComponent: <Users className="w-6 h-6" />,
            gradient: 'from-rose-100 to-pink-100', textColor: 'text-rose-700', borderColor: 'border-rose-200'
        },
        {
            id: 'accounts', title: 'User Accounts', description: 'Manage accountant & admin accounts',
            href: '/manage/accounts', iconComponent: <UserCog className="w-6 h-6" />,
            gradient: 'from-slate-100 to-gray-200', textColor: 'text-slate-700', borderColor: 'border-slate-300'
        },
    ];

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
                {/* Hero Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gray-900 text-white p-8 mb-8 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-rose-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-pink-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>

                    <div className="relative z-10">
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="inline-flex items-center gap-1.5 text-sm text-rose-200 hover:text-white mb-4 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Dashboard
                        </button>
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-bold mb-2">People Management</h1>
                                <p className="text-rose-100 text-sm max-w-xl">
                                    Manage students, teachers, staff and user accounts across your institution.
                                </p>
                            </div>
                            <Users className="hidden sm:block w-12 h-12 text-rose-200 opacity-80" />
                        </div>
                    </div>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
                    {cards.map((card) => (
                        <CardComponent key={card.id} card={card} onClick={() => router.push(card.href)} />
                    ))}
                </div>
            </main>
        </div>
    );
}

function CardComponent({ card, onClick }: { card: DashboardCard; onClick: () => void }) {
    return (
        <div
            onClick={card.comingSoon ? undefined : onClick}
            className={`group relative bg-white p-4 sm:p-6 rounded-2xl shadow-sm border ${card.borderColor} transition-all duration-300 overflow-hidden ${card.comingSoon ? 'opacity-60 cursor-default' : 'hover:shadow-lg hover:-translate-y-1 cursor-pointer'}`}
        >
            <div className={`absolute -right-8 -top-8 w-24 h-24 rounded-full bg-gradient-to-br ${card.gradient} opacity-20 group-hover:scale-150 transition-transform duration-500`}></div>

            {card.comingSoon && (
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-gray-900/80 text-white text-[10px] font-bold uppercase tracking-wider z-10">
                    Coming Soon
                </div>
            )}

            <div className="relative flex items-start justify-between mb-3 sm:mb-4">
                <div className={`p-2.5 sm:p-3 rounded-xl bg-gradient-to-br ${card.gradient} ${card.textColor}`}>
                    {card.iconComponent}
                </div>
                {!card.comingSoon && (
                    <div className="p-1.5 sm:p-2 rounded-full bg-gray-50 text-gray-300 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                )}
            </div>

            <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1">
                {card.title}
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed line-clamp-2">
                {card.description}
            </p>
        </div>
    );
}
