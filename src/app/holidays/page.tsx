'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Calendar } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';

interface Holiday {
    id: string;
    name: string;
    date: string;
    description: string | null;
}

interface User {
    role: 'super_admin' | 'hod' | 'teacher';
}

export default function HolidaysPage() {
    const router = useRouter();
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({ name: '', date: '', description: '' });
    const [error, setError] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.push('/login');
            return;
        }
        setUser(JSON.parse(userData));
        fetchHolidays(token);
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    const fetchHolidays = async (token: string) => {
        try {
            const res = await fetch('/api/holidays', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                router.push('/login');
                return;
            }
            const data = await res.json();
            setHolidays(data.holidays || []);
        } catch (err) {
            console.error('Error fetching holidays:', err);
        }
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const token = localStorage.getItem('token');

        try {
            const res = await fetch('/api/holidays', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(formData),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Failed to save');
                return;
            }

            setShowModal(false);
            setFormData({ name: '', date: '', description: '' });
            fetchHolidays(token!);
        } catch (err) {
            setError('Network error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this holiday?')) return;
        const token = localStorage.getItem('token');

        try {
            await fetch(`/api/holidays/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            fetchHolidays(token!);
        } catch (err) {
            console.error('Error deleting:', err);
        }
    };

    // Format date for display
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return {
            day: date.getDate(),
            month: date.toLocaleDateString('en-US', { month: 'short' }),
            weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
            full: date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        };
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

    const isSuperAdmin = user?.role === 'super_admin';

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            {/* Mobile Sidebar */}
            {user && (
                <MobileSidebar
                    isOpen={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    user={{ ...user, role: user.role, firstName: (user as any).firstName || 'User', lastName: (user as any).lastName || '', email: (user as any).email || '' }}
                    onLogout={handleLogout}
                />
            )}

            {/* Navbar */}
            <Navbar user={user as any} onMenuClick={() => setSidebarOpen(true)} />

            {/* Page Header - Unified with Reports style */}
            <div className="bg-white shadow-sm border-b border-gray-200 mt-16">
                <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <span className="p-2 bg-cyan-100 text-cyan-700 rounded-lg">
                                <Calendar className="w-6 h-6" />
                            </span>
                            Holidays
                        </h1>
                        <p className="text-gray-500 text-sm mt-1 ml-11">
                            {holidays.length} holidays configured
                        </p>
                    </div>
                    {isSuperAdmin && (
                        <Button onClick={() => setShowModal(true)} className="bg-gray-900 hover:bg-gray-800 hidden md:flex">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Holiday
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex-1 py-8 max-w-7xl mx-auto w-full px-4">

                {/* Desktop Content */}
                <main className="hidden md:block max-w-7xl mx-auto px-4 py-8">
                    {holidays.length === 0 ? (
                        <Card>
                            <CardContent className="py-8 text-center text-gray-500">
                                No holidays found. {isSuperAdmin && 'Add your first holiday!'}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="bg-white rounded-lg shadow overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-sm font-semibold">Date</th>
                                        <th className="px-6 py-3 text-left text-sm font-semibold">Name</th>
                                        <th className="px-6 py-3 text-left text-sm font-semibold">Description</th>
                                        {isSuperAdmin && <th className="px-6 py-3 text-left text-sm font-semibold">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {holidays.map((holiday) => (
                                        <tr key={holiday.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 bg-cyan-50 text-cyan-700 rounded font-mono border border-cyan-100">
                                                    {new Date(holiday.date).toLocaleDateString()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-medium">{holiday.name}</td>
                                            <td className="px-6 py-4 text-gray-500">{holiday.description || '-'}</td>
                                            {isSuperAdmin && (
                                                <td className="px-6 py-4">
                                                    <Button variant="outline" size="sm" onClick={() => handleDelete(holiday.id)} className="text-red-500 hover:text-red-700">
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </main>

                {/* Mobile Content */}
                <main className="md:hidden px-4 py-2 pb-24">
                    {holidays.length === 0 ? (
                        <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
                            No holidays found. {isSuperAdmin && 'Add your first holiday!'}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {holidays.map((holiday) => {
                                const dateInfo = formatDate(holiday.date);
                                return (
                                    <div
                                        key={holiday.id}
                                        className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-cyan-400 flex gap-4"
                                    >
                                        {/* Date Box */}
                                        <div className="flex-shrink-0 w-14 h-14 bg-cyan-50 rounded-xl flex flex-col items-center justify-center">
                                            <span className="text-lg font-bold text-cyan-800">{dateInfo.day}</span>
                                            <span className="text-xs text-cyan-600">{dateInfo.month}</span>
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-base font-semibold text-gray-900 mb-1">
                                                {holiday.name}
                                            </h3>
                                            <p className="text-xs text-gray-500 mb-1">{dateInfo.weekday}</p>
                                            {holiday.description && (
                                                <p className="text-sm text-gray-600 truncate">{holiday.description}</p>
                                            )}
                                        </div>

                                        {/* Delete Button */}
                                        {isSuperAdmin && (
                                            <button
                                                onClick={() => handleDelete(holiday.id)}
                                                className="flex-shrink-0 p-2 rounded-lg hover:bg-red-50 transition-colors self-start"
                                            >
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </main>

                {/* Mobile Floating Add Button - Right Bottom */}
                {isSuperAdmin && (
                    <div className="md:hidden fixed bottom-6 right-6">
                        <button
                            onClick={() => setShowModal(true)}
                            className="w-14 h-14 bg-gray-900 text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center justify-center"
                        >
                            <Plus className="w-6 h-6" />
                        </button>
                    </div>
                )}

                {/* Modal */}
                {showModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                        <Card className="w-full max-w-md">
                            <CardHeader>
                                <CardTitle>Add Holiday</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <Label htmlFor="name">Holiday Name *</Label>
                                        <Input
                                            id="name"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="e.g., Independence Day"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="date">Date *</Label>
                                        <Input
                                            id="date"
                                            type="date"
                                            value={formData.date}
                                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="description">Description</Label>
                                        <Input
                                            id="description"
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            placeholder="Optional description"
                                        />
                                    </div>
                                    {error && <p className="text-red-500 text-sm">{error}</p>}
                                    <div className="flex gap-2 justify-end">
                                        <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                                            Cancel
                                        </Button>
                                        <Button type="submit">Save</Button>
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}
