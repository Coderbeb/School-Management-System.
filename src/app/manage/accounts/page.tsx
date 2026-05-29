'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserCog, Plus, Search, X, Check, ShieldAlert, BadgeAlert, BadgeCheck, Phone, Mail, Shield } from 'lucide-react';

interface UserData {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'super_admin' | 'teacher' | 'accountant' | 'student';
}

interface Account {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    role: 'super_admin' | 'accountant';
    is_active: boolean;
    created_at: string;
}

export default function AccountsPage() {
    const router = useRouter();
    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [showEditForm, setShowEditForm] = useState<Account | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [newAccount, setNewAccount] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        password: '',
        role: 'accountant' as 'super_admin' | 'accountant'
    });

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.replace('/login');
            return;
        }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin') {
            router.replace('/dashboard');
            return;
        }
        setUser(parsed);
        fetchAccounts(token);
    }, []);

    const fetchAccounts = async (token?: string, q = '') => {
        setLoading(true);
        const t = token || localStorage.getItem('token')!;
        const params = q ? `?search=${encodeURIComponent(q)}` : '';
        try {
            const res = await fetch(`/api/manage/accounts${params}`, {
                headers: { Authorization: `Bearer ${t}` }
            });
            const data = await res.json();
            setAccounts(data.accounts || []);
        } catch (err) {
            console.error('Fetch accounts error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (val: string) => {
        setSearch(val);
        fetchAccounts(undefined, val);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        const t = localStorage.getItem('token')!;

        try {
            const res = await fetch('/api/manage/accounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${t}`
                },
                body: JSON.stringify(newAccount)
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to create account');
                setSaving(false);
                return;
            }

            setNewAccount({
                firstName: '',
                lastName: '',
                email: '',
                phone: '',
                password: '',
                role: 'accountant'
            });
            setShowAddForm(false);
            fetchAccounts(t, search);
        } catch (err) {
            setError('Server error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showEditForm) return;
        setSaving(true);
        setError('');
        const t = localStorage.getItem('token')!;

        try {
            const res = await fetch('/api/manage/accounts', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${t}`
                },
                body: JSON.stringify({
                    id: showEditForm.id,
                    firstName: showEditForm.first_name,
                    lastName: showEditForm.last_name,
                    email: showEditForm.email,
                    phone: showEditForm.phone,
                    role: showEditForm.role,
                    isActive: showEditForm.is_active
                })
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to update account');
                setSaving(false);
                return;
            }

            setShowEditForm(null);
            fetchAccounts(t, search);
        } catch (err) {
            setError('Server error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const toggleStatus = async (account: Account) => {
        if (account.id === user?.id) {
            alert('You cannot deactivate your own account.');
            return;
        }
        const t = localStorage.getItem('token')!;
        try {
            const res = await fetch('/api/manage/accounts', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${t}`
                },
                body: JSON.stringify({
                    id: account.id,
                    isActive: !account.is_active
                })
            });
            if (res.ok) {
                fetchAccounts(t, search);
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to toggle status');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <UserCog className="w-7 h-7 text-indigo-600" />
                            User Accounts Management
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Admit, update, and manage accounts for institution Administrators and Accountants.
                        </p>
                    </div>

                    <Button onClick={() => setShowAddForm(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md flex items-center gap-2">
                        <Plus className="w-5 h-5" />
                        Add New User
                    </Button>
                </div>

                {/* Filter and Search */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center mb-6">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3.5 top-3 w-5 h-5 text-gray-400" />
                        <Input
                            placeholder="Search by name or email..."
                            value={search}
                            onChange={(e) => handleSearch(e.target.value)}
                            className="pl-11 pr-4 py-2.5 rounded-xl border-gray-200 focus:ring-indigo-500 focus:border-indigo-500 w-full"
                        />
                    </div>
                </div>

                {/* Grid List of Accounts */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-gray-500 font-medium">Loading user accounts...</p>
                    </div>
                ) : accounts.length === 0 ? (
                    <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                            <UserCog className="w-8 h-8" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">No Accounts Found</h3>
                        <p className="text-gray-500 max-w-sm mx-auto text-sm">
                            No administrative or accountant users matched your query. Click "Add New User" to create one.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {accounts.map((account) => (
                            <div key={account.id} className={`bg-white rounded-2xl border transition-all duration-300 shadow-sm overflow-hidden flex flex-col ${account.is_active ? 'border-gray-150 hover:shadow-md' : 'border-red-100 bg-red-50/10'}`}>
                                <div className="p-6 flex-1">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-inner ${
                                            account.role === 'super_admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                                        }`}>
                                            {account.first_name[0]}{account.last_name[0]}
                                        </div>

                                        <div className="flex flex-col items-end gap-1.5">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                                account.role === 'super_admin' ? 'bg-indigo-150 text-indigo-800' : 'bg-emerald-150 text-emerald-800'
                                            }`}>
                                                <Shield className="w-3 h-3" />
                                                {account.role === 'super_admin' ? 'Super Admin' : 'Accountant'}
                                            </span>

                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                                account.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                            }`}>
                                                {account.is_active ? (
                                                    <>
                                                        <BadgeCheck className="w-3 h-3" /> Active
                                                    </>
                                                ) : (
                                                    <>
                                                        <BadgeAlert className="w-3 h-3" /> Suspended
                                                    </>
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    <h3 className="text-lg font-bold text-gray-900 line-clamp-1">
                                        {account.first_name} {account.last_name}
                                    </h3>

                                    <div className="mt-4 space-y-2 text-sm text-gray-500">
                                        <div className="flex items-center gap-2">
                                            <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                                            <span className="truncate">{account.email}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                                            <span>{account.phone || 'No phone added'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={() => setShowEditForm(account)}
                                        className="h-8.5 rounded-lg border-gray-200 text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 text-xs font-medium py-1 px-3 shadow-sm"
                                    >
                                        Edit Details
                                    </Button>

                                    {account.id !== user?.id && (
                                        <Button
                                            onClick={() => toggleStatus(account)}
                                            className={`h-8.5 text-xs font-semibold rounded-lg py-1 px-3 shadow-sm ${
                                                account.is_active 
                                                    ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200' 
                                                    : 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200'
                                            }`}
                                        >
                                            {account.is_active ? 'Deactivate' : 'Activate'}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Add User Modal */}
            {showAddForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 w-full max-w-md overflow-hidden">
                        <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between text-white">
                            <h2 className="text-lg font-bold">Add Administrative User</h2>
                            <button onClick={() => setShowAddForm(false)} className="text-white/80 hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="p-6 space-y-4">
                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl flex items-center gap-2">
                                    <ShieldAlert className="w-5 h-5 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-gray-750 font-medium">First Name</Label>
                                    <Input
                                        required
                                        value={newAccount.firstName}
                                        onChange={(e) => setNewAccount({ ...newAccount, firstName: e.target.value })}
                                        className="mt-1 rounded-lg border-gray-200 focus:ring-indigo-500 w-full"
                                    />
                                </div>
                                <div>
                                    <Label className="text-gray-750 font-medium">Last Name</Label>
                                    <Input
                                        required
                                        value={newAccount.lastName}
                                        onChange={(e) => setNewAccount({ ...newAccount, lastName: e.target.value })}
                                        className="mt-1 rounded-lg border-gray-200 focus:ring-indigo-500 w-full"
                                    />
                                </div>
                            </div>

                            <div>
                                <Label className="text-gray-750 font-medium">Email Address</Label>
                                <Input
                                    type="email"
                                    required
                                    value={newAccount.email}
                                    onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })}
                                    className="mt-1 rounded-lg border-gray-200 focus:ring-indigo-500 w-full"
                                />
                            </div>

                            <div>
                                <Label className="text-gray-750 font-medium">Phone Number</Label>
                                <Input
                                    value={newAccount.phone}
                                    onChange={(e) => setNewAccount({ ...newAccount, phone: e.target.value })}
                                    className="mt-1 rounded-lg border-gray-200 focus:ring-indigo-500 w-full"
                                    placeholder="Optional"
                                />
                            </div>

                            <div>
                                <Label className="text-gray-750 font-medium">Password</Label>
                                <Input
                                    type="password"
                                    required
                                    value={newAccount.password}
                                    onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })}
                                    className="mt-1 rounded-lg border-gray-200 focus:ring-indigo-500 w-full"
                                />
                            </div>

                            <div>
                                <Label className="text-gray-750 font-medium">Institutional Role</Label>
                                <select
                                    value={newAccount.role}
                                    onChange={(e) => setNewAccount({ ...newAccount, role: e.target.value as any })}
                                    className="mt-1 w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-gray-800"
                                >
                                    <option value="accountant">Accountant (Fee/Finance Operations)</option>
                                    <option value="super_admin">Super Admin (Full Platform Control)</option>
                                </select>
                            </div>

                            <div className="pt-2 flex items-center justify-end gap-3 border-t border-gray-100">
                                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)} className="rounded-xl border-gray-200">
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md">
                                    {saving ? 'Creating...' : 'Create Account'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {showEditForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-3xl shadow-xl border border-gray-100 w-full max-w-md overflow-hidden">
                        <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between text-white">
                            <h2 className="text-lg font-bold">Edit Account Details</h2>
                            <button onClick={() => setShowEditForm(null)} className="text-white/80 hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleUpdate} className="p-6 space-y-4">
                            {error && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl flex items-center gap-2">
                                    <ShieldAlert className="w-5 h-5 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-gray-750 font-medium">First Name</Label>
                                    <Input
                                        required
                                        value={showEditForm.first_name}
                                        onChange={(e) => setShowEditForm({ ...showEditForm, first_name: e.target.value })}
                                        className="mt-1 rounded-lg border-gray-200 focus:ring-indigo-500 w-full"
                                    />
                                </div>
                                <div>
                                    <Label className="text-gray-750 font-medium">Last Name</Label>
                                    <Input
                                        required
                                        value={showEditForm.last_name}
                                        onChange={(e) => setShowEditForm({ ...showEditForm, last_name: e.target.value })}
                                        className="mt-1 rounded-lg border-gray-200 focus:ring-indigo-500 w-full"
                                    />
                                </div>
                            </div>

                            <div>
                                <Label className="text-gray-750 font-medium">Email Address</Label>
                                <Input
                                    type="email"
                                    required
                                    value={showEditForm.email}
                                    onChange={(e) => setShowEditForm({ ...showEditForm, email: e.target.value })}
                                    className="mt-1 rounded-lg border-gray-200 focus:ring-indigo-500 w-full"
                                />
                            </div>

                            <div>
                                <Label className="text-gray-750 font-medium">Phone Number</Label>
                                <Input
                                    value={showEditForm.phone || ''}
                                    onChange={(e) => setShowEditForm({ ...showEditForm, phone: e.target.value })}
                                    className="mt-1 rounded-lg border-gray-200 focus:ring-indigo-500 w-full"
                                />
                            </div>

                            {showEditForm.id !== user?.id && (
                                <div>
                                    <Label className="text-gray-750 font-medium">Institutional Role</Label>
                                    <select
                                        value={showEditForm.role}
                                        onChange={(e) => setShowEditForm({ ...showEditForm, role: e.target.value as any })}
                                        className="mt-1 w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-gray-800"
                                    >
                                        <option value="accountant">Accountant (Fee/Finance Operations)</option>
                                        <option value="super_admin">Super Admin (Full Platform Control)</option>
                                    </select>
                                </div>
                            )}

                            <div className="pt-2 flex items-center justify-end gap-3 border-t border-gray-100">
                                <Button type="button" variant="outline" onClick={() => setShowEditForm(null)} className="rounded-xl border-gray-200">
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md">
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
