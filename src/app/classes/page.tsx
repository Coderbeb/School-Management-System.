'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { UsersRound } from 'lucide-react';
import { PageSkeleton } from '@/components/ui/PageSkeleton';

interface User {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
}

export default function ClassesPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');

        if (!token || !userData) {
            router.replace('/login');
            return;
        }

        try {
            setUser(JSON.parse(userData));
        } catch (e) {
            router.replace('/login');
        }
        setLoading(false);
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    if (loading) return <PageSkeleton type="classes" />;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Mobile Sidebar */}
            {user && (
                <MobileSidebar
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    user={{ ...user, role: user.role as any }}
                    onLogout={handleLogout}
                />
            )}

            {/* Navbar */}
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} />

            <main className="flex-1 pt-24 px-4 max-w-7xl mx-auto w-full">
                {/* Page Header */}
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                        <UsersRound className="w-6 h-6" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">My Classes</h1>
                </div>

                <Card className="border-dashed border-2 bg-gray-50/50">
                    <CardContent className="py-12 text-center text-gray-500">
                        <div className="bg-white p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center shadow-sm">
                            <UsersRound className="w-8 h-8 text-blue-500" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">My Classes</h3>
                        <p className="mb-4">Class assignment feature coming soon!</p>
                        <div className="text-sm bg-blue-50 text-blue-700 px-4 py-3 rounded-lg inline-block text-left">
                            <p className="font-semibold mb-1">This will show:</p>
                            <ul className="space-y-1">
                                <li>• Your assigned classes</li>
                                <li>• Class schedules and timings</li>
                                <li>• Student lists per class</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
