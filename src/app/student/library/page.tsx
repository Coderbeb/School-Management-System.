'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import {
    BookOpen, Search, Loader2, CheckCircle, X, RefreshCw,
    Clock, Calendar, AlertTriangle, BookMarked, Bookmark,
    DollarSign, Star, Filter, Eye
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; schoolId?: string; }

interface CurrentBook {
    id: string; title: string; author: string; isbn: string; cover_image_url: string;
    accession_number: string; issued_date: string; due_date: string;
    renewed_count: number; transaction_type: string; is_overdue: boolean;
    overdue_days: number; days_remaining: number; can_renew: boolean;
}

interface HistoryBook {
    id: string; title: string; author: string; cover_image_url: string;
    issued_date: string; due_date: string; returned_date: string;
    renewed_count: number; fine_amount: number;
}

interface Reservation {
    id: string; title: string; author: string; cover_image_url: string;
    reserved_date: string; expiry_date: string; status: string; available_copies: number;
}

interface Fine {
    id: string; amount: string; paid_amount: string; status: string;
    book_title: string; paid_date: string; waived_reason: string;
}

interface CatalogBook {
    id: string; title: string; author: string; isbn: string; category_name: string;
    cover_image_url: string; available_copies: number; total_copies: number;
    language: string; publisher: string; shelf_location: string;
}

interface LibSettings {
    allowRenewal: boolean; allowReservation: boolean;
    maxRenewals: number; loanDurationDays: number;
}

type TabType = 'my_books' | 'catalog' | 'history' | 'reservations' | 'fines';

function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        active: 'bg-emerald-50 text-emerald-700',
        fulfilled: 'bg-blue-50 text-blue-700',
        expired: 'bg-gray-100 text-gray-500',
        cancelled: 'bg-gray-100 text-gray-500',
        pending: 'bg-amber-50 text-amber-700',
        paid: 'bg-emerald-50 text-emerald-700',
        waived: 'bg-blue-50 text-blue-700',
        partial: 'bg-orange-50 text-orange-700',
        returned: 'bg-gray-100 text-gray-500',
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
            {status.replace('_', ' ')}
        </span>
    );
}

export default function StudentLibraryPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [tab, setTab] = useState<TabType>('my_books');
    const [loading, setLoading] = useState(true);

    // Student library data
    const [currentBooks, setCurrentBooks] = useState<CurrentBook[]>([]);
    const [history, setHistory] = useState<HistoryBook[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [fines, setFines] = useState<Fine[]>([]);
    const [pendingFines, setPendingFines] = useState(0);
    const [settings, setSettings] = useState<LibSettings | null>(null);

    // Catalog data
    const [catalogBooks, setCatalogBooks] = useState<CatalogBook[]>([]);
    const [catalogSearch, setCatalogSearch] = useState('');
    const [catalogPagination, setCatalogPagination] = useState({ page: 1, total: 0, totalPages: 0 });
    const [catalogLoading, setCatalogLoading] = useState(false);

    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    }), [token]);

    // ====== FETCH STUDENT LIBRARY DATA ======
    const fetchMyLibrary = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch('/api/library/student', { headers: headers() });
            const data = await res.json();
            if (res.ok) {
                setCurrentBooks(data.currentBooks || []);
                setHistory(data.history || []);
                setReservations(data.reservations || []);
                setFines(data.fines || []);
                setPendingFines(data.pendingFines || 0);
                setSettings(data.settings || null);
            }
        } catch (err) { console.error(err); }
        setLoading(false);
    }, [token, headers]);

    // Ref for search so fetchCatalog identity stays stable
    const catalogSearchRef = useRef(catalogSearch);
    catalogSearchRef.current = catalogSearch;

    // ====== FETCH CATALOG ======
    const fetchCatalog = useCallback(async (page = 1) => {
        if (!token) return;
        setCatalogLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', page.toString());
            params.set('limit', '20');
            if (catalogSearchRef.current) params.set('search', catalogSearchRef.current);
            params.set('available', 'true');

            const res = await fetch(`/api/library/books?${params}`, { headers: headers() });
            const data = await res.json();
            setCatalogBooks(data.books || []);
            setCatalogPagination(data.pagination || { page: 1, total: 0, totalPages: 0 });
        } catch (err) { console.error(err); }
        setCatalogLoading(false);
    }, [token, headers]);

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'student') { router.replace('/dashboard'); return; }
        setUser(parsed);
    }, [router, token]);

    useEffect(() => { if (user) fetchMyLibrary(); }, [user, fetchMyLibrary]);
    useEffect(() => { if (user && tab === 'catalog') fetchCatalog(); }, [user, tab, fetchCatalog]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    // ====== SELF-RENEWAL ======
    const renewBook = async (transactionId: string) => {
        setSaving(true); setError('');
        try {
            const r = await fetch('/api/library/student', {
                method: 'POST', headers: headers(),
                body: JSON.stringify({ transactionId })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to renew');
            setSuccess(data.message || 'Book renewed successfully!');
            fetchMyLibrary();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    // ====== RESERVE BOOK ======
    const reserveBook = async (bookId: string) => {
        setSaving(true); setError('');
        try {
            const r = await fetch('/api/library/reservations', {
                method: 'POST', headers: headers(),
                body: JSON.stringify({ bookId })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to reserve');
            setSuccess('Book reserved! You will be notified when it\'s available.');
            fetchMyLibrary();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    // ====== CANCEL RESERVATION ======
    const cancelReservation = async (reservationId: string) => {
        if (!confirm('Cancel this reservation?')) return;
        try {
            const r = await fetch('/api/library/reservations', {
                method: 'PUT', headers: headers(),
                body: JSON.stringify({ reservationId, action: 'cancel' })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to cancel');
            setSuccess('Reservation cancelled.');
            fetchMyLibrary();
        } catch (err: any) { alert(err.message); }
    };

    const tabs: { key: TabType; label: string; icon: React.ReactNode; badge?: number }[] = [
        { key: 'my_books', label: 'My Books', icon: <BookMarked className="w-4 h-4" />, badge: currentBooks.length },
        { key: 'catalog', label: 'Browse Catalog', icon: <Search className="w-4 h-4" /> },
        { key: 'history', label: 'History', icon: <Clock className="w-4 h-4" /> },
        { key: 'reservations', label: 'Reservations', icon: <Bookmark className="w-4 h-4" />, badge: reservations.length },
        { key: 'fines', label: 'Fines', icon: <DollarSign className="w-4 h-4" />, badge: pendingFines > 0 ? 1 : undefined },
    ];

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-5xl mx-auto px-4 py-8 mt-16">
                {/* Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-900 via-cyan-900 to-teal-950 text-white p-6 sm:p-8 mb-6 shadow-2xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-cyan-400 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-teal-500 rounded-full mix-blend-screen filter blur-3xl opacity-20"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2">
                            <BookOpen className="w-4 h-4 text-cyan-300" />
                            <span className="text-cyan-300 font-bold tracking-wider uppercase text-xs">My Library</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black">Library Portal</h1>
                        <p className="text-cyan-200 text-sm mt-1">Browse books, manage your issues, and track reservations</p>

                        {/* Quick Stats */}
                        <div className="flex flex-wrap gap-4 mt-4">
                            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2">
                                <p className="text-xl font-black">{currentBooks.length}</p>
                                <p className="text-[10px] text-cyan-200 uppercase tracking-wider">Books Issued</p>
                            </div>
                            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2">
                                <p className="text-xl font-black">{currentBooks.filter(b => b.is_overdue).length}</p>
                                <p className="text-[10px] text-red-300 uppercase tracking-wider">Overdue</p>
                            </div>
                            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2">
                                <p className="text-xl font-black">{reservations.length}</p>
                                <p className="text-[10px] text-cyan-200 uppercase tracking-wider">Reservations</p>
                            </div>
                            {pendingFines > 0 && (
                                <div className="bg-red-500/20 backdrop-blur-sm rounded-xl px-4 py-2 border border-red-400/30">
                                    <p className="text-xl font-black">₹{pendingFines.toFixed(2)}</p>
                                    <p className="text-[10px] text-red-300 uppercase tracking-wider">Pending Fines</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Messages */}
                {success && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center justify-between shadow-sm">
                        <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {success}</span>
                        <button onClick={() => setSuccess('')}><X className="w-4 h-4" /></button>
                    </div>
                )}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center justify-between shadow-sm">
                        <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</span>
                        <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex items-center gap-1 bg-white rounded-xl p-1 border border-gray-200 mb-5 w-fit overflow-x-auto">
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${tab === t.key ? 'bg-cyan-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                            {t.icon} {t.label}
                            {t.badge !== undefined && t.badge > 0 && (
                                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${tab === t.key ? 'bg-white/20 text-white' : 'bg-cyan-100 text-cyan-700'}`}>{t.badge}</span>
                            )}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
                        <p className="text-gray-400 text-sm">Loading your library...</p>
                    </div>
                ) : (
                    <>
                        {/* ===== MY BOOKS TAB ===== */}
                        {tab === 'my_books' && (
                            <div>
                                {currentBooks.length > 0 ? (
                                    <div className="space-y-3">
                                        {currentBooks.map(b => {
                                            const daysLeft = b.days_remaining;
                                            const urgency = b.is_overdue ? 'border-red-200 bg-red-50/30' :
                                                daysLeft <= 2 ? 'border-amber-200 bg-amber-50/20' : 'border-gray-100';
                                            return (
                                                <div key={b.id} className={`bg-white rounded-2xl border p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-4 ${urgency}`}>
                                                    {/* Cover */}
                                                    <div className="w-14 h-20 bg-gradient-to-br from-cyan-50 to-teal-50 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                                                        {b.cover_image_url ? (
                                                            <img src={b.cover_image_url} alt="" className="h-full object-contain" />
                                                        ) : (
                                                            <BookOpen className="w-6 h-6 text-cyan-200" />
                                                        )}
                                                    </div>
                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-sm font-bold text-gray-900">{b.title}</h4>
                                                        <p className="text-xs text-gray-400">{b.author} · {b.accession_number}</p>
                                                        <div className="flex flex-wrap gap-3 mt-1.5 text-xs">
                                                            <span className="text-gray-500">
                                                                <Calendar className="w-3 h-3 inline mr-0.5" /> Issued: {new Date(b.issued_date).toLocaleDateString('en-IN')}
                                                            </span>
                                                            <span className={b.is_overdue ? 'text-red-600 font-bold' : daysLeft <= 2 ? 'text-amber-600 font-bold' : 'text-gray-500'}>
                                                                <Clock className="w-3 h-3 inline mr-0.5" />
                                                                Due: {new Date(b.due_date).toLocaleDateString('en-IN')}
                                                                {b.is_overdue ? ` (${b.overdue_days}d overdue!)` : daysLeft <= 2 ? ` (${daysLeft}d left)` : ''}
                                                            </span>
                                                            {b.renewed_count > 0 && (
                                                                <span className="text-purple-600"><RefreshCw className="w-3 h-3 inline mr-0.5" /> Renewed ×{b.renewed_count}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {/* Actions */}
                                                    {b.can_renew && settings?.allowRenewal && !b.is_overdue && (
                                                        <button onClick={() => renewBook(b.id)} disabled={saving}
                                                            className="px-4 py-2 bg-purple-50 text-purple-700 rounded-xl text-xs font-bold hover:bg-purple-100 transition-colors flex items-center gap-1.5 shrink-0">
                                                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                                            Renew
                                                        </button>
                                                    )}
                                                    {b.is_overdue && (
                                                        <span className="px-3 py-1.5 bg-red-50 text-red-700 rounded-xl text-xs font-bold flex items-center gap-1">
                                                            <AlertTriangle className="w-3.5 h-3.5" /> Overdue
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3">
                                        <BookMarked className="w-12 h-12" />
                                        <p className="text-sm text-gray-400 text-center max-w-md">No books currently issued. Browse the catalog to find your next read!</p>
                                        <Button onClick={() => setTab('catalog')} className="bg-cyan-600 hover:bg-cyan-700 text-white gap-2 mt-2">
                                            <Search className="w-4 h-4" /> Browse Catalog
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ===== CATALOG TAB ===== */}
                        {tab === 'catalog' && (
                            <div>
                                <div className="flex gap-3 mb-5">
                                    <div className="relative flex-1">
                                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                                        <input value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && fetchCatalog(1)}
                                            placeholder="Search by title, author, ISBN..."
                                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 outline-none" />
                                    </div>
                                    <Button onClick={() => fetchCatalog(1)} className="bg-cyan-600 hover:bg-cyan-700 text-white h-10">
                                        <Search className="w-4 h-4" />
                                    </Button>
                                </div>

                                {catalogLoading ? (
                                    <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-cyan-500 animate-spin" /></div>
                                ) : catalogBooks.length > 0 ? (
                                    <>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {catalogBooks.map(b => (
                                                <div key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-4 flex flex-col">
                                                    <div className="w-full h-28 bg-gradient-to-br from-cyan-50 to-teal-50 rounded-xl mb-3 flex items-center justify-center overflow-hidden">
                                                        {b.cover_image_url ? (
                                                            <img src={b.cover_image_url} alt={b.title} className="h-full object-contain" />
                                                        ) : (
                                                            <BookOpen className="w-10 h-10 text-cyan-200" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        <h3 className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight">{b.title}</h3>
                                                        <p className="text-xs text-gray-400 mt-0.5">{b.author || 'Unknown'}</p>
                                                        {b.category_name && (
                                                            <span className="inline-block mt-1 px-2 py-0.5 bg-cyan-50 text-cyan-700 rounded-full text-[10px] font-bold">{b.category_name}</span>
                                                        )}
                                                        {b.shelf_location && (
                                                            <p className="text-[10px] text-gray-400 mt-1">📍 Shelf: {b.shelf_location}</p>
                                                        )}
                                                    </div>
                                                    <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                                                        <span className={`text-xs font-bold ${b.available_copies > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                            {b.available_copies > 0 ? `${b.available_copies} available` : 'Not available'}
                                                        </span>
                                                        {b.available_copies === 0 && settings?.allowReservation && (
                                                            <button onClick={() => reserveBook(b.id)} disabled={saving}
                                                                className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors">
                                                                <Bookmark className="w-3 h-3 inline mr-1" /> Reserve
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {catalogPagination.totalPages > 1 && (
                                            <div className="flex justify-center gap-2 mt-6">
                                                {Array.from({ length: Math.min(catalogPagination.totalPages, 10) }, (_, i) => (
                                                    <button key={i} onClick={() => fetchCatalog(i + 1)}
                                                        className={`w-8 h-8 rounded-lg text-xs font-bold ${catalogPagination.page === i + 1 ? 'bg-cyan-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                                                        {i + 1}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3">
                                        <BookOpen className="w-12 h-12" />
                                        <p className="text-sm text-gray-400">No books found. Try a different search term.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ===== HISTORY TAB ===== */}
                        {tab === 'history' && (
                            <div>
                                {history.length > 0 ? (
                                    <div className="space-y-2">
                                        {history.map(h => (
                                            <div key={h.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center gap-4">
                                                <div className="w-10 h-14 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                                                    {h.cover_image_url ? (
                                                        <img src={h.cover_image_url} alt="" className="h-full object-contain" />
                                                    ) : (
                                                        <BookOpen className="w-4 h-4 text-gray-300" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-sm font-bold text-gray-900 truncate">{h.title}</h4>
                                                    <p className="text-xs text-gray-400">{h.author}</p>
                                                    <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
                                                        <span>Issued: {new Date(h.issued_date).toLocaleDateString('en-IN')}</span>
                                                        <span>Returned: {new Date(h.returned_date).toLocaleDateString('en-IN')}</span>
                                                        {h.renewed_count > 0 && <span className="text-purple-500">Renewed ×{h.renewed_count}</span>}
                                                        {h.fine_amount > 0 && <span className="text-red-500">Fine: ₹{h.fine_amount}</span>}
                                                    </div>
                                                </div>
                                                <StatusBadge status="returned" />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3">
                                        <Clock className="w-12 h-12" />
                                        <p className="text-sm text-gray-400">No reading history yet. Start by borrowing a book!</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ===== RESERVATIONS TAB ===== */}
                        {tab === 'reservations' && (
                            <div>
                                {reservations.length > 0 ? (
                                    <div className="space-y-3">
                                        {reservations.map(r => (
                                            <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center gap-4">
                                                <div className="w-10 h-14 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl flex items-center justify-center shrink-0">
                                                    <Bookmark className="w-5 h-5 text-amber-300" />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="text-sm font-bold text-gray-900">{r.title}</h4>
                                                    <p className="text-xs text-gray-400">{r.author}</p>
                                                    <div className="flex gap-3 mt-1 text-xs">
                                                        <span className="text-gray-500">Reserved: {new Date(r.reserved_date).toLocaleDateString('en-IN')}</span>
                                                        <span className={r.available_copies > 0 ? 'text-emerald-600 font-bold' : 'text-gray-400'}>
                                                            {r.available_copies > 0 ? '✓ Available — Visit library!' : 'Waiting...'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button onClick={() => cancelReservation(r.id)}
                                                    className="px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-colors">
                                                    Cancel
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3">
                                        <Bookmark className="w-12 h-12" />
                                        <p className="text-sm text-gray-400">No active reservations.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ===== FINES TAB ===== */}
                        {tab === 'fines' && (
                            <div>
                                {pendingFines > 0 && (
                                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 flex items-center gap-3">
                                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                                        <div>
                                            <p className="text-sm font-bold text-red-800">You have pending fines: ₹{pendingFines.toFixed(2)}</p>
                                            <p className="text-xs text-red-600">Please visit the library to clear your fines.</p>
                                        </div>
                                    </div>
                                )}
                                {fines.length > 0 ? (
                                    <div className="space-y-2">
                                        {fines.map(f => (
                                            <div key={f.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center gap-4">
                                                <div className="flex-1">
                                                    <h4 className="text-sm font-bold text-gray-900">{f.book_title}</h4>
                                                    <div className="flex gap-3 mt-1 text-xs">
                                                        <span className="font-bold text-red-600">₹{parseFloat(f.amount).toFixed(2)}</span>
                                                        {parseFloat(f.paid_amount) > 0 && <span className="text-emerald-600">Paid: ₹{parseFloat(f.paid_amount).toFixed(2)}</span>}
                                                        {f.paid_date && <span className="text-gray-400">on {new Date(f.paid_date).toLocaleDateString('en-IN')}</span>}
                                                        {f.waived_reason && <span className="text-blue-500">Waived: {f.waived_reason}</span>}
                                                    </div>
                                                </div>
                                                <StatusBadge status={f.status} />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3">
                                        <DollarSign className="w-12 h-12" />
                                        <p className="text-sm text-gray-400">No fines. Keep up the good work! 🎉</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
