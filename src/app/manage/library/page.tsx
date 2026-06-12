'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Button } from '@/components/ui/button';
import {
    BookOpen, Plus, X, Edit2, Trash2, Loader2, Search, CheckCircle,
    Users, BarChart3, Settings, BookMarked, RefreshCw, AlertTriangle,
    Calendar, DollarSign, Clock, ArrowRight, Star, TrendingUp,
    BookCopy, Filter, Eye, Tag, Hash, Globe, ImageIcon, Bookmark
} from 'lucide-react';

interface User { id: string; email: string; firstName: string; lastName: string; role: string; schoolId?: string; }
interface Category { id: string; name: string; description: string; display_order: number; is_active: boolean; }
interface Vendor { id: string; name: string; contact_person: string; phone: string; }
interface Book {
    id: string; title: string; author: string; isbn: string; publisher: string;
    edition: string; publication_year: number; category_id: string; category_name: string;
    language: string; description: string; cover_image_url: string;
    total_copies: number; available_copies: number; shelf_location: string;
    vendor_id?: string; vendor_name?: string; purchase_price?: string; purchase_date?: string;
    accession_number_prefix: string; is_active: boolean;
}
interface Transaction {
    id: string; book_title: string; book_author: string; isbn: string; cover_image_url: string;
    accession_number: string; barcode: string; student_name: string; admission_number: string;
    issued_by_name: string; issued_date: string; due_date: string; returned_date: string;
    renewed_count: number; is_overdue: boolean; overdue_days: number;
    fine_amount: number; fine_paid: boolean; transaction_type: string;
}
interface Reservation {
    id: string; book_title: string; book_author: string; cover_image_url: string;
    available_copies: number; student_name: string; admission_number: string;
    reserved_date: string; expiry_date: string; status: string;
}
interface Fine {
    id: string; amount: string; paid_amount: string; status: string;
    book_title: string; book_author: string; student_name: string; admission_number: string;
    due_date: string; returned_date: string; waived_by_name: string; waived_reason: string;
    paid_date: string; issued_date: string;
}
interface LibSettings {
    max_books_per_student: number; loan_duration_days: number; max_renewals: number;
    fine_per_day: string; fine_currency: string; allow_student_renewal: boolean;
    allow_student_reservation: boolean; overdue_alert_days_before: number; isbn_auto_fetch: boolean;
}
interface StudentResult { id: string; name: string; admission_number: string; class_name: string; section_name: string; }

type TabType = 'catalog' | 'circulation' | 'active_issues' | 'reservations' | 'fines' | 'reports' | 'settings' | 'vendors';

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3">
            {icon}
            <p className="text-sm text-gray-400 text-center max-w-md">{text}</p>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        available: 'bg-emerald-50 text-emerald-700',
        issued: 'bg-blue-50 text-blue-700',
        reserved: 'bg-amber-50 text-amber-700',
        active: 'bg-emerald-50 text-emerald-700',
        fulfilled: 'bg-blue-50 text-blue-700',
        expired: 'bg-gray-100 text-gray-500',
        cancelled: 'bg-gray-100 text-gray-500',
        pending: 'bg-amber-50 text-amber-700',
        paid: 'bg-emerald-50 text-emerald-700',
        waived: 'bg-blue-50 text-blue-700',
        partial: 'bg-orange-50 text-orange-700',
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
            {status.replace('_', ' ')}
        </span>
    );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
    return (
        <div className={`bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${color}`}>{icon}</div>
                <div>
                    <p className="text-2xl font-black text-gray-900">{value}</p>
                    <p className="text-[11px] text-gray-400 font-medium">{label}</p>
                </div>
            </div>
        </div>
    );
}

function LibModal({ show, onClose, title, error, children, footer }: {
    show: boolean; onClose: () => void; title: string;
    error?: string; children: React.ReactNode; footer: React.ReactNode;
}) {
    if (!show) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    {error && <div className="p-3 bg-red-50 border border-red-100 text-xs text-red-700 rounded-xl">{error}</div>}
                    {children}
                </div>
                <div className="p-6 border-t border-gray-100 flex justify-end gap-3 rounded-b-3xl shrink-0">
                    {footer}
                </div>
            </div>
        </div>
    );
}

function InputField({ label, value, onChange, placeholder, type = 'text', required = false }: any) {
    return (
        <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">{label} {required && '*'}</label>
            <input type={type} value={value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} placeholder={placeholder}
                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
        </div>
    );
}

export default function LibraryPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [tab, setTab] = useState<TabType>('catalog');
    const [loading, setLoading] = useState(true);

    // Data
    const [categories, setCategories] = useState<Category[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [books, setBooks] = useState<Book[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [fines, setFines] = useState<Fine[]>([]);
    const [finesSummary, setFinesSummary] = useState<any>(null);
    const [reportStats, setReportStats] = useState<any>(null);
    const [popularBooks, setPopularBooks] = useState<any[]>([]);
    const [overdueList, setOverdueList] = useState<any[]>([]);
    const [settings, setSettings] = useState<LibSettings | null>(null);

    // Pagination & Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [availableOnly, setAvailableOnly] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
    const [issueFilter, setIssueFilter] = useState('active');

    // Book Modal
    const [showBookModal, setShowBookModal] = useState(false);
    const [editingBook, setEditingBook] = useState<Book | null>(null);
    const [bookForm, setBookForm] = useState({
        title: '', author: '', isbn: '', publisher: '', edition: '',
        publicationYear: '', categoryId: '', language: 'English',
        description: '', coverImageUrl: '', totalCopies: '1',
        shelfLocation: '', accessionNumberPrefix: 'LB', vendorId: '', purchasePrice: '', purchaseDate: '', vendorId: '', purchasePrice: '', purchaseDate: ''
    });
    const [isbnLoading, setIsbnLoading] = useState(false);

    // Category Modal
    const [showCatModal, setShowCatModal] = useState(false);
    const [editingCat, setEditingCat] = useState<Category | null>(null);
    const [catForm, setCatForm] = useState({ name: '', description: '', displayOrder: '0' });

    // Vendors Modal
    const [showVendorModal, setShowVendorModal] = useState(false);
    const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
    const [vendorForm, setVendorForm] = useState({ name: '', contactPerson: '', email: '', phone: '', address: '' });

    // Barcode Modal
    const [showBarcodeModal, setShowBarcodeModal] = useState(false);
    const [barcodeBook, setBarcodeBook] = useState<Book | null>(null);
    const [bookCopies, setBookCopies] = useState<any[]>([]);

    // Bulk Import Modal
    const [showImportModal, setShowImportModal] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Issue Modal
    const [showIssueModal, setShowIssueModal] = useState(false);
    const [issueStudentSearch, setIssueStudentSearch] = useState('');
    const [issueStudentResults, setIssueStudentResults] = useState<StudentResult[]>([]);
    const [selectedIssueStudent, setSelectedIssueStudent] = useState<StudentResult | null>(null);
    const [selectedIssueBook, setSelectedIssueBook] = useState<Book | null>(null);
    const [issueBookSearch, setIssueBookSearch] = useState('');
    const [issueBookResults, setIssueBookResults] = useState<Book[]>([]);

    // Settings Form
    const [settingsForm, setSettingsForm] = useState({
        maxBooksPerStudent: '3', loanDurationDays: '14', maxRenewals: '2',
        finePerDay: '1.00', allowStudentRenewal: true, allowStudentReservation: true,
        overdueAlertDaysBefore: '2', isbnAutoFetch: true
    });

    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    }), [token]);

    // Use refs for filter values so fetchBooks identity stays stable
    const searchRef = useRef(searchQuery);
    const categoryRef = useRef(categoryFilter);
    const availableRef = useRef(availableOnly);
    searchRef.current = searchQuery;
    categoryRef.current = categoryFilter;
    availableRef.current = availableOnly;

    // ====== DATA FETCHING ======
    const fetchBooks = useCallback(async (page = 1) => {
        if (!token) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', page.toString());
            params.set('limit', '20');
            if (searchRef.current) params.set('search', searchRef.current);
            if (categoryRef.current) params.set('categoryId', categoryRef.current);
            if (availableRef.current) params.set('available', 'true');

            const res = await fetch(`/api/library/books?${params}`, { headers: headers() });
            const data = await res.json();
            setBooks(data.books || []);
            setPagination(data.pagination || { page: 1, total: 0, totalPages: 0 });
        } catch (err) { console.error(err); }
        setLoading(false);
    }, [token, headers]);

    const fetchVendors = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/library/vendors', { headers: headers() });
            const data = await res.json();
            setVendors(data.vendors || []);
        } catch (err) { console.error(err); }
    }, [token, headers]);

    const fetchCategories = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/library/categories', { headers: headers() });
            const data = await res.json();
            setCategories(data.categories || []);
        } catch (err) { console.error(err); }
    }, [token, headers]);

    const fetchTransactions = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch(`/api/library/circulation?status=${issueFilter}`, { headers: headers() });
            const data = await res.json();
            setTransactions(data.transactions || []);
        } catch (err) { console.error(err); }
    }, [token, issueFilter, headers]);

    const fetchReservations = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/library/reservations?status=active', { headers: headers() });
            const data = await res.json();
            setReservations(data.reservations || []);
        } catch (err) { console.error(err); }
    }, [token, headers]);

    const fetchFines = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/library/fines', { headers: headers() });
            const data = await res.json();
            setFines(data.fines || []);
            setFinesSummary(data.summary || null);
        } catch (err) { console.error(err); }
    }, [token, headers]);

    const fetchReports = useCallback(async () => {
        if (!token) return;
        try {
            const [statsRes, popRes, overdueRes] = await Promise.all([
                fetch('/api/library/reports?type=overview', { headers: headers() }),
                fetch('/api/library/reports?type=popular', { headers: headers() }),
                fetch('/api/library/reports?type=overdue', { headers: headers() }),
            ]);
            const [statsData, popData, overdueData] = await Promise.all([statsRes.json(), popRes.json(), overdueRes.json()]);
            setReportStats(statsData.stats || null);
            setPopularBooks(popData.popular || []);
            setOverdueList(overdueData.overdue || []);
        } catch (err) { console.error(err); }
    }, [token, headers]);

    const fetchSettings = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/library/settings', { headers: headers() });
            const data = await res.json();
            if (data.settings) {
                setSettings(data.settings);
                setSettingsForm({
                    maxBooksPerStudent: data.settings.max_books_per_student?.toString() || '3',
                    loanDurationDays: data.settings.loan_duration_days?.toString() || '14',
                    maxRenewals: data.settings.max_renewals?.toString() || '2',
                    finePerDay: data.settings.fine_per_day?.toString() || '1.00',
                    allowStudentRenewal: data.settings.allow_student_renewal ?? true,
                    allowStudentReservation: data.settings.allow_student_reservation ?? true,
                    overdueAlertDaysBefore: data.settings.overdue_alert_days_before?.toString() || '2',
                    isbnAutoFetch: data.settings.isbn_auto_fetch ?? true,
                });
            }
        } catch (err) { console.error(err); }
    }, [token, headers]);

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (!['developer', 'super_admin', 'teacher'].includes(parsed.role)) { router.replace('/dashboard'); return; }
        setUser(parsed);
    }, [router, token]);

    useEffect(() => {
        if (user) {
            fetchCategories();
            fetchVendors();
            fetchSettings();
            fetchBooks();
        }
    }, [user, fetchCategories, fetchVendors, fetchSettings, fetchBooks]);

    useEffect(() => {
        if (!user) return;
        if (tab === 'active_issues' || tab === 'circulation') fetchTransactions();
        else if (tab === 'reservations') fetchReservations();
        else if (tab === 'fines') fetchFines();
        else if (tab === 'reports') fetchReports();
    }, [tab, user, fetchTransactions, fetchReservations, fetchFines, fetchReports]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    // ====== ISBN AUTO-FETCH ======
    const lookupISBN = async () => {
        if (!bookForm.isbn.trim()) return;
        setIsbnLoading(true);
        try {
            const res = await fetch(`/api/library/isbn-lookup?isbn=${encodeURIComponent(bookForm.isbn)}`, { headers: headers() });
            const data = await res.json();
            if (data.found) {
                setBookForm(prev => ({
                    ...prev,
                    title: data.title || prev.title,
                    author: data.author || prev.author,
                    publisher: data.publisher || prev.publisher,
                    publicationYear: data.publicationYear?.toString() || prev.publicationYear,
                    coverImageUrl: data.coverImageUrl || prev.coverImageUrl,
                    description: data.description || prev.description,
                }));
                setSuccess('Book details auto-filled from ISBN!');
            } else {
                setError('No book found for this ISBN');
            }
        } catch (err) { setError('ISBN lookup failed'); }
        setIsbnLoading(false);
    };

    // ====== STUDENT SEARCH ======
    useEffect(() => {
        if (!issueStudentSearch.trim()) { setIssueStudentResults([]); return; }
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/students?search=${encodeURIComponent(issueStudentSearch)}`, { headers: headers() });
                if (res.ok) { const d = await res.json(); setIssueStudentResults(d.students || []); }
            } catch (err) { console.error(err); }
        }, 300);
        return () => clearTimeout(t);
    }, [issueStudentSearch, headers]);

    // ====== BOOK SEARCH FOR ISSUE ======
    useEffect(() => {
        if (!issueBookSearch.trim()) { setIssueBookResults([]); return; }
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/library/books?search=${encodeURIComponent(issueBookSearch)}&available=true&limit=10`, { headers: headers() });
                if (res.ok) { const d = await res.json(); setIssueBookResults(d.books || []); }
            } catch (err) { console.error(err); }
        }, 300);
        return () => clearTimeout(t);
    }, [issueBookSearch, headers]);

    // ====== HANDLERS ======
    const openAddBook = () => {
        setEditingBook(null);
        setBookForm({
            title: '', author: '', isbn: '', publisher: '', edition: '',
            publicationYear: '', categoryId: categories[0]?.id || '', language: 'English',
            description: '', coverImageUrl: '', totalCopies: '1',
            shelfLocation: '', accessionNumberPrefix: 'LB'
        });
        setError(''); setShowBookModal(true);
    };

    const openEditBook = (b: Book) => {
        setEditingBook(b);
        setBookForm({
            title: b.title, author: b.author || '', isbn: b.isbn || '',
            publisher: b.publisher || '', edition: b.edition || '',
            publicationYear: b.publication_year?.toString() || '',
            categoryId: b.category_id || '', language: b.language || 'English',
            description: b.description || '', coverImageUrl: b.cover_image_url || '',
            totalCopies: b.total_copies.toString(), shelfLocation: b.shelf_location || '',
            accessionNumberPrefix: b.accession_number_prefix || 'LB', vendorId: b.vendor_id || '', purchasePrice: b.purchase_price ? b.purchase_price.toString() : '', purchaseDate: b.purchase_date ? new Date(b.purchase_date).toISOString().split('T')[0] : ''
        });
        setError(''); setShowBookModal(true);
    };

    const saveBook = async () => {
        setSaving(true); setError('');
        try {
            const method = editingBook ? 'PUT' : 'POST';
            const body = { id: editingBook?.id, ...bookForm };
            const r = await fetch('/api/library/books', { method, headers: headers(), body: JSON.stringify(body) });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to save book');
            setSuccess(editingBook ? 'Book updated!' : 'Book added to catalog!');
            setShowBookModal(false);
            fetchBooks();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    const deleteBook = async (id: string) => {
        if (!confirm('Are you sure you want to remove this book from the catalog?')) return;
        try {
            const r = await fetch(`/api/library/books?id=${id}`, { method: 'DELETE', headers: headers() });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to delete');
            setSuccess('Book removed from catalog!');
            fetchBooks();
        } catch (err: any) { alert(err.message); }
    };

    const saveVendor = async () => {
        setSaving(true); setError('');
        try {
            const method = editingVendor ? 'PUT' : 'POST';
            const body = { id: editingVendor?.id, ...vendorForm };
            const r = await fetch('/api/library/vendors', { method, headers: headers(), body: JSON.stringify(body) });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to save vendor');
            setSuccess('Vendor saved!');
            setShowVendorModal(false);
            fetchVendors();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    const deleteVendor = async (id: string) => {
        if (!confirm('Delete this vendor?')) return;
        try {
            const r = await fetch(`/api/library/vendors?id=${id}`, { method: 'DELETE', headers: headers() });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to delete');
            setSuccess('Vendor deleted!');
            fetchVendors();
        } catch (err: any) { alert(err.message); }
    };

    const openBarcodes = async (b: Book) => {
        setBarcodeBook(b);
        setShowBarcodeModal(true);
        setBookCopies([]);
        try {
            const r = await fetch(`/api/library/books/${b.id}/copies`, { headers: headers() });
            const data = await r.json();
            setBookCopies(data.copies || []);
        } catch (e) { console.error(e); }
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSaving(true); setError('');
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(worksheet);

            const booksData = json.map((row: any) => ({
                title: row.Title || row.title,
                author: row.Author || row.author,
                isbn: row.ISBN || row.isbn,
                publisher: row.Publisher || row.publisher,
                edition: row.Edition || row.edition,
                publicationYear: row['Publication Year'] || row.publicationYear,
                totalCopies: row['Total Copies'] || row.totalCopies || 1,
                shelfLocation: row['Shelf Location'] || row.shelfLocation,
                accessionPrefix: row['Accession Prefix'] || row.accessionPrefix || 'LB',
                purchasePrice: row['Purchase Price'] || row.purchasePrice,
                purchaseDate: row['Purchase Date'] || row.purchaseDate,
            }));

            const r = await fetch('/api/library/bulk-import', {
                method: 'POST', headers: headers(),
                body: JSON.stringify({ books: booksData })
            });
            const resData = await r.json();
            if (!r.ok) throw new Error(resData.error || 'Import failed');
            setSuccess(`Imported ${resData.importedCount} books successfully!`);
            if (resData.errors?.length > 0) {
                console.error("Import Errors:", resData.errors);
                alert("Some rows failed to import. Check console.");
            }
            setShowImportModal(false);
            fetchBooks(1);
        } catch (err: any) { setError(err.message); }
        setSaving(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const saveCat = async () => {
        setSaving(true); setError('');
        try {
            const method = editingCat ? 'PUT' : 'POST';
            const body = { id: editingCat?.id, ...catForm };
            const r = await fetch('/api/library/categories', { method, headers: headers(), body: JSON.stringify(body) });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to save category');
            setSuccess('Category saved!');
            setShowCatModal(false);
            fetchCategories();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    const issueBook = async () => {
        if (!selectedIssueStudent || !selectedIssueBook) { setError('Select both student and book'); return; }
        setSaving(true); setError('');
        try {
            const r = await fetch('/api/library/circulation', {
                method: 'POST', headers: headers(),
                body: JSON.stringify({ bookId: selectedIssueBook.id, studentId: selectedIssueStudent.id })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to issue book');
            setSuccess(`Book "${selectedIssueBook.title}" issued to ${selectedIssueStudent.name}!`);
            setShowIssueModal(false);
            fetchTransactions(); fetchBooks();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    const returnBook = async (txnId: string) => {
        if (!confirm('Return this book?')) return;
        try {
            const r = await fetch('/api/library/circulation', {
                method: 'PUT', headers: headers(),
                body: JSON.stringify({ transactionId: txnId, action: 'return' })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to return');
            setSuccess(data.message || 'Book returned!');
            fetchTransactions(); fetchBooks();
        } catch (err: any) { alert(err.message); }
    };

    const renewBook = async (txnId: string) => {
        try {
            const r = await fetch('/api/library/circulation', {
                method: 'PUT', headers: headers(),
                body: JSON.stringify({ transactionId: txnId, action: 'renew' })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to renew');
            setSuccess(data.message || 'Book renewed!');
            fetchTransactions();
        } catch (err: any) { alert(err.message); }
    };

    const handleFineAction = async (fineId: string, action: string) => {
        try {
            const r = await fetch('/api/library/fines', {
                method: 'PUT', headers: headers(),
                body: JSON.stringify({ fineId, action })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed');
            setSuccess(data.message || 'Fine updated!');
            fetchFines();
        } catch (err: any) { alert(err.message); }
    };

    const saveSettings = async () => {
        setSaving(true); setError('');
        try {
            const r = await fetch('/api/library/settings', {
                method: 'PUT', headers: headers(), body: JSON.stringify(settingsForm)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed to save settings');
            setSuccess('Library settings saved!');
            fetchSettings();
        } catch (err: any) { setError(err.message); }
        setSaving(false);
    };

    // ====== TABS ======
    const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
        { key: 'catalog', label: 'Catalog', icon: <BookOpen className="w-4 h-4" /> },
        { key: 'circulation', label: 'Issue/Return', icon: <ArrowRight className="w-4 h-4" /> },
        { key: 'active_issues', label: 'Active Issues', icon: <BookMarked className="w-4 h-4" /> },
        { key: 'reservations', label: 'Reservations', icon: <Bookmark className="w-4 h-4" /> },
        { key: 'fines', label: 'Fines', icon: <DollarSign className="w-4 h-4" /> },
        { key: 'reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
        { key: 'vendors', label: 'Vendors', icon: <Globe className="w-4 h-4" /> },
        { key: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
    ];



    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-7xl mx-auto px-4 py-8 mt-16">
                {/* Hero Banner */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-900 via-teal-900 to-emerald-950 text-white p-6 sm:p-8 mb-6 shadow-2xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-teal-400 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-20"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <BookOpen className="w-4 h-4 text-teal-300" />
                                <span className="text-teal-300 font-bold tracking-wider uppercase text-xs">Library Portal</span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-black">Library Management</h1>
                            <p className="text-teal-200 text-sm mt-1">Catalog, circulation, reservations, fines & reports</p>
                        </div>
                        <div className="flex gap-2">
                            {tab === 'catalog' && (
                                <>
                                    <Button onClick={openAddBook} className="bg-teal-500 hover:bg-teal-600 text-white gap-2 shadow-lg h-10"><Plus className="w-4 h-4" /> Add Book</Button>
                                    <Button onClick={() => { setEditingCat(null); setCatForm({ name: '', description: '', displayOrder: '0' }); setError(''); setShowCatModal(true); }}
                                        className="bg-white/10 hover:bg-white/20 text-white gap-2 h-10 border border-white/20"><Tag className="w-4 h-4" /> Category</Button>
                                    <Button onClick={() => setShowImportModal(true)} className="bg-white/10 hover:bg-white/20 text-white gap-2 h-10 border border-white/20"><BookCopy className="w-4 h-4" /> Bulk Import</Button>
                                </>
                            )}
                            {(tab === 'circulation' || tab === 'active_issues') && (
                                <Button onClick={() => {
                                    setSelectedIssueStudent(null); setSelectedIssueBook(null);
                                    setIssueStudentSearch(''); setIssueBookSearch('');
                                    setError(''); setShowIssueModal(true);
                                }} className="bg-teal-500 hover:bg-teal-600 text-white gap-2 shadow-lg h-10"><Plus className="w-4 h-4" /> Issue Book</Button>
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

                {/* Tabs */}
                <div className="flex items-center gap-1 bg-white rounded-xl p-1 border border-gray-200 mb-5 w-fit overflow-x-auto">
                    {tabs.map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${tab === t.key ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>

                {loading && tab === 'catalog' ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
                        <p className="text-gray-400 text-sm">Loading library data...</p>
                    </div>
                ) : (
                    <>
                        {/* ===== CATALOG TAB ===== */}
                        {tab === 'catalog' && (
                            <div>
                                {/* Search & Filters */}
                                <div className="flex flex-wrap gap-3 mb-5">
                                    <div className="relative flex-1 min-w-[200px]">
                                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                                        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && fetchBooks(1)}
                                            placeholder="Search by title, author, ISBN..."
                                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
                                    </div>
                                    <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); fetchBooks(1); }}
                                        className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none">
                                        <option value="">All Categories</option>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <button onClick={() => { setAvailableOnly(!availableOnly); }} className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${availableOnly ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                                        <Filter className="w-3.5 h-3.5 inline mr-1" /> Available Only
                                    </button>
                                    <Button onClick={() => fetchBooks(1)} className="bg-teal-600 hover:bg-teal-700 text-white h-10">
                                        <Search className="w-4 h-4" />
                                    </Button>
                                </div>

                                {/* Book Grid */}
                                {books.length > 0 ? (
                                    <>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                            {books.map(b => (
                                                <div key={b.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-4 flex flex-col">
                                                    {/* Cover */}
                                                    <div className="w-full h-32 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-xl mb-3 flex items-center justify-center overflow-hidden">
                                                        {b.cover_image_url ? (
                                                            <img src={b.cover_image_url} alt={b.title} className="h-full object-contain" />
                                                        ) : (
                                                            <BookOpen className="w-10 h-10 text-teal-200" />
                                                        )}
                                                    </div>
                                                    {/* Info */}
                                                    <div className="flex-1">
                                                        <h3 className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight">{b.title}</h3>
                                                        <p className="text-xs text-gray-400 mt-0.5">{b.author || 'Unknown Author'}</p>
                                                        {b.category_name && (
                                                            <span className="inline-block mt-1.5 px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full text-[10px] font-bold">{b.category_name}</span>
                                                        )}
                                                    </div>
                                                    {/* Footer */}
                                                    <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                                                        <div className="text-xs">
                                                            <span className={`font-bold ${b.available_copies > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                {b.available_copies}
                                                            </span>
                                                            <span className="text-gray-400">/{b.total_copies} avail</span>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <button onClick={() => openBarcodes(b)} className="p-1.5 hover:bg-blue-50 rounded-lg" title="View Barcodes"><Hash className="w-3.5 h-3.5 text-blue-400" /></button>
                                                            <button onClick={() => openEditBook(b)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit2 className="w-3.5 h-3.5 text-gray-400" /></button>
                                                            <button onClick={() => deleteBook(b.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Pagination */}
                                        {pagination.totalPages > 1 && (
                                            <div className="flex justify-center gap-2 mt-6">
                                                {Array.from({ length: pagination.totalPages }, (_, i) => (
                                                    <button key={i} onClick={() => fetchBooks(i + 1)}
                                                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${pagination.page === i + 1 ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                                                        {i + 1}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-center text-xs text-gray-400 mt-2">{pagination.total} books total</p>
                                    </>
                                ) : (
                                    <EmptyState icon={<BookOpen className="w-12 h-12" />} text="No books in the catalog yet. Click 'Add Book' to start building your library." />
                                )}
                            </div>
                        )}

                        {/* ===== CIRCULATION TAB ===== */}
                        {tab === 'circulation' && (
                            <div>
                                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><ArrowRight className="w-5 h-5 text-teal-600" /> Quick Issue / Return</h3>
                                    <p className="text-sm text-gray-500 mb-4">Use the &quot;Issue Book&quot; button in the header to issue a new book. Use the Active Issues tab to return or renew books.</p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <StatCard icon={<BookMarked className="w-5 h-5 text-blue-600" />} label="Currently Issued" value={transactions.filter(t => !t.returned_date).length} color="bg-blue-50" />
                                        <StatCard icon={<AlertTriangle className="w-5 h-5 text-red-600" />} label="Overdue Books" value={transactions.filter(t => t.is_overdue).length} color="bg-red-50" />
                                        <StatCard icon={<RefreshCw className="w-5 h-5 text-purple-600" />} label="Renewed" value={transactions.filter(t => t.renewed_count > 0).length} color="bg-purple-50" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ===== ACTIVE ISSUES TAB ===== */}
                        {tab === 'active_issues' && (
                            <div>
                                <div className="flex gap-2 mb-4">
                                    {['active', 'overdue', 'returned', 'all'].map(f => (
                                        <button key={f} onClick={() => setIssueFilter(f)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${issueFilter === f ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                                            {f}
                                        </button>
                                    ))}
                                </div>

                                {transactions.length > 0 ? (
                                    <div className="space-y-3">
                                        {transactions.map(t => (
                                            <div key={t.id} className={`bg-white rounded-2xl border p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-4 ${t.is_overdue ? 'border-red-200 bg-red-50/30' : 'border-gray-100'}`}>
                                                <div className="w-12 h-16 bg-gradient-to-br from-teal-50 to-emerald-50 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                                                    {t.cover_image_url ? <img src={t.cover_image_url} alt="" className="h-full object-contain" /> : <BookOpen className="w-5 h-5 text-teal-200" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-sm font-bold text-gray-900 truncate">{t.book_title}</h4>
                                                    <p className="text-xs text-gray-400">{t.book_author} · {t.accession_number}</p>
                                                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs">
                                                        <span className="text-gray-500"><Users className="w-3 h-3 inline mr-0.5" /> {t.student_name} ({t.admission_number})</span>
                                                        <span className="text-gray-500"><Calendar className="w-3 h-3 inline mr-0.5" /> {new Date(t.issued_date).toLocaleDateString('en-IN')}</span>
                                                        <span className={t.is_overdue ? 'text-red-600 font-bold' : 'text-gray-500'}>
                                                            <Clock className="w-3 h-3 inline mr-0.5" /> Due: {new Date(t.due_date).toLocaleDateString('en-IN')}
                                                            {t.is_overdue && ` (${t.overdue_days}d overdue)`}
                                                        </span>
                                                        {t.renewed_count > 0 && <span className="text-purple-600"><RefreshCw className="w-3 h-3 inline mr-0.5" /> Renewed ×{t.renewed_count}</span>}
                                                    </div>
                                                </div>
                                                {!t.returned_date && (
                                                    <div className="flex gap-2 shrink-0">
                                                        <button onClick={() => renewBook(t.id)} className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-bold hover:bg-purple-100 transition-colors">
                                                            <RefreshCw className="w-3 h-3 inline mr-1" />Renew
                                                        </button>
                                                        <button onClick={() => returnBook(t.id)} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors">
                                                            <CheckCircle className="w-3 h-3 inline mr-1" />Return
                                                        </button>
                                                    </div>
                                                )}
                                                {t.returned_date && <StatusBadge status="returned" />}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState icon={<BookMarked className="w-12 h-12" />} text="No transactions found for the selected filter." />
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
                                                    <h4 className="text-sm font-bold text-gray-900">{r.book_title}</h4>
                                                    <p className="text-xs text-gray-400">{r.book_author}</p>
                                                    <div className="flex gap-3 mt-1 text-xs">
                                                        <span className="text-gray-500"><Users className="w-3 h-3 inline mr-0.5" /> {r.student_name} ({r.admission_number})</span>
                                                        <span className="text-gray-500"><Calendar className="w-3 h-3 inline mr-0.5" /> Reserved: {new Date(r.reserved_date).toLocaleDateString('en-IN')}</span>
                                                        <span className={`font-bold ${r.available_copies > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                            {r.available_copies > 0 ? '✓ Available' : '✗ Not Available'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <StatusBadge status={r.status} />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState icon={<Bookmark className="w-12 h-12" />} text="No active reservations." />
                                )}
                            </div>
                        )}

                        {/* ===== FINES TAB ===== */}
                        {tab === 'fines' && (
                            <div>
                                {/* Summary Cards */}
                                {finesSummary && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                                        <StatCard icon={<DollarSign className="w-5 h-5 text-amber-600" />} label="Pending Fines" value={`₹${parseFloat(finesSummary.total_pending || 0).toFixed(2)}`} color="bg-amber-50" />
                                        <StatCard icon={<CheckCircle className="w-5 h-5 text-emerald-600" />} label="Collected" value={`₹${parseFloat(finesSummary.total_collected || 0).toFixed(2)}`} color="bg-emerald-50" />
                                        <StatCard icon={<DollarSign className="w-5 h-5 text-blue-600" />} label="Waived" value={`₹${parseFloat(finesSummary.total_waived || 0).toFixed(2)}`} color="bg-blue-50" />
                                    </div>
                                )}

                                {fines.length > 0 ? (
                                    <div className="space-y-3">
                                        {fines.map(f => (
                                            <div key={f.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                                <div className="flex-1">
                                                    <h4 className="text-sm font-bold text-gray-900">{f.student_name} ({f.admission_number})</h4>
                                                    <p className="text-xs text-gray-400">{f.book_title}</p>
                                                    <div className="flex gap-3 mt-1 text-xs">
                                                        <span className="font-bold text-red-600">₹{parseFloat(f.amount).toFixed(2)}</span>
                                                        {parseFloat(f.paid_amount) > 0 && <span className="text-emerald-600">Paid: ₹{parseFloat(f.paid_amount).toFixed(2)}</span>}
                                                    </div>
                                                </div>
                                                <StatusBadge status={f.status} />
                                                {(f.status === 'pending' || f.status === 'partial') && (
                                                    <div className="flex gap-2 shrink-0">
                                                        <button onClick={() => handleFineAction(f.id, 'pay')} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100">
                                                            ✓ Pay
                                                        </button>
                                                        <button onClick={() => handleFineAction(f.id, 'waive')} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100">
                                                            Waive
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState icon={<DollarSign className="w-12 h-12" />} text="No fines recorded yet." />
                                )}
                            </div>
                        )}

                        {/* ===== REPORTS TAB ===== */}
                        {tab === 'reports' && reportStats && (
                            <div>
                                {/* Overview Stats */}
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                                    <StatCard icon={<BookOpen className="w-5 h-5 text-teal-600" />} label="Total Books" value={reportStats.total_books} color="bg-teal-50" />
                                    <StatCard icon={<BookCopy className="w-5 h-5 text-blue-600" />} label="Total Copies" value={reportStats.total_copies} color="bg-blue-50" />
                                    <StatCard icon={<BookMarked className="w-5 h-5 text-purple-600" />} label="Currently Issued" value={reportStats.active_issues} color="bg-purple-50" />
                                    <StatCard icon={<AlertTriangle className="w-5 h-5 text-red-600" />} label="Overdue" value={reportStats.overdue_books} color="bg-red-50" />
                                    <StatCard icon={<Users className="w-5 h-5 text-emerald-600" />} label="Total Members" value={reportStats.total_members} color="bg-emerald-50" />
                                </div>

                                {/* Popular Books */}
                                {popularBooks.length > 0 && (
                                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm mb-5">
                                        <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" /> Most Borrowed Books</h3>
                                        <div className="space-y-2">
                                            {popularBooks.slice(0, 10).map((b, i) => (
                                                <div key={b.id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-xl">
                                                    <span className="text-xs font-bold text-gray-300 w-5">#{i + 1}</span>
                                                    <div className="flex-1">
                                                        <span className="text-sm font-bold text-gray-900">{b.title}</span>
                                                        <span className="text-xs text-gray-400 ml-2">{b.author}</span>
                                                    </div>
                                                    <span className="text-xs font-bold text-teal-600">{b.borrow_count} borrows</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Overdue List */}
                                {overdueList.length > 0 && (
                                    <div className="bg-white rounded-2xl border border-red-100 p-5 shadow-sm">
                                        <h3 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Overdue Books ({overdueList.length})</h3>
                                        <div className="space-y-2">
                                            {overdueList.map(o => (
                                                <div key={o.id} className="flex items-center gap-3 py-2 px-3 bg-red-50/50 rounded-xl text-xs">
                                                    <div className="flex-1">
                                                        <span className="font-bold text-gray-900">{o.book_title}</span>
                                                        <span className="text-gray-400 ml-2">→ {o.student_name} ({o.admission_number})</span>
                                                    </div>
                                                    <span className="font-bold text-red-600">{o.overdue_days}d overdue</span>
                                                    <span className="font-bold text-red-700">₹{parseFloat(o.estimated_fine || 0).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        
                        {/* ===== VENDORS TAB ===== */}
                        {tab === 'vendors' && (
                            <div>
                                <div className="flex justify-between items-center mb-5">
                                    <h2 className="text-xl font-bold text-gray-900">Vendors</h2>
                                    <Button onClick={() => { setEditingVendor(null); setVendorForm({ name: '', contactPerson: '', email: '', phone: '', address: '' }); setShowVendorModal(true); }} className="bg-teal-600 hover:bg-teal-700 text-white"><Plus className="w-4 h-4 mr-2" /> Add Vendor</Button>
                                </div>
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-semibold">
                                            <tr><th className="p-4">Name</th><th className="p-4">Contact Person</th><th className="p-4">Phone</th><th className="p-4 text-right">Actions</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {vendors.map(v => (
                                                <tr key={v.id} className="hover:bg-gray-50">
                                                    <td className="p-4 font-medium text-gray-900">{v.name}</td>
                                                    <td className="p-4 text-gray-500">{v.contact_person || '-'}</td>
                                                    <td className="p-4 text-gray-500">{v.phone || '-'}</td>
                                                    <td className="p-4 flex justify-end gap-2">
                                                        <button onClick={() => { setEditingVendor(v); setVendorForm({ name: v.name, contactPerson: v.contact_person || '', email: (v as any).email || '', phone: v.phone || '', address: (v as any).address || '' }); setShowVendorModal(true); }} className="p-1.5 hover:bg-gray-200 rounded-lg"><Edit2 className="w-4 h-4 text-gray-500" /></button>
                                                        <button onClick={() => deleteVendor(v.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-red-500" /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ===== SETTINGS TAB ===== */}
                        {tab === 'settings' && (
                            <div className="max-w-xl">
                                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
                                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Settings className="w-5 h-5 text-teal-600" /> Library Settings</h3>

                                    <div className="grid grid-cols-2 gap-4">
                                        <InputField label="Max Books Per Student" value={settingsForm.maxBooksPerStudent} onChange={(v: string) => setSettingsForm({...settingsForm, maxBooksPerStudent: v})} type="number" />
                                        <InputField label="Loan Duration (Days)" value={settingsForm.loanDurationDays} onChange={(v: string) => setSettingsForm({...settingsForm, loanDurationDays: v})} type="number" />
                                        <InputField label="Max Renewals" value={settingsForm.maxRenewals} onChange={(v: string) => setSettingsForm({...settingsForm, maxRenewals: v})} type="number" />
                                        <InputField label="Fine Per Day (₹)" value={settingsForm.finePerDay} onChange={(v: string) => setSettingsForm({...settingsForm, finePerDay: v})} type="number" />
                                        <InputField label="Overdue Alert (Days Before)" value={settingsForm.overdueAlertDaysBefore} onChange={(v: string) => setSettingsForm({...settingsForm, overdueAlertDaysBefore: v})} type="number" />
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
                                            <input type="checkbox" checked={settingsForm.allowStudentRenewal} onChange={e => setSettingsForm({...settingsForm, allowStudentRenewal: e.target.checked})} className="w-4 h-4 accent-teal-600" />
                                            <div><span className="text-sm font-semibold text-gray-700">Allow Student Self-Renewal</span><p className="text-xs text-gray-400">Students can renew books from their portal</p></div>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
                                            <input type="checkbox" checked={settingsForm.allowStudentReservation} onChange={e => setSettingsForm({...settingsForm, allowStudentReservation: e.target.checked})} className="w-4 h-4 accent-teal-600" />
                                            <div><span className="text-sm font-semibold text-gray-700">Allow Student Reservations</span><p className="text-xs text-gray-400">Students can place holds on unavailable books</p></div>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
                                            <input type="checkbox" checked={settingsForm.isbnAutoFetch} onChange={e => setSettingsForm({...settingsForm, isbnAutoFetch: e.target.checked})} className="w-4 h-4 accent-teal-600" />
                                            <div><span className="text-sm font-semibold text-gray-700">ISBN Auto-Fetch</span><p className="text-xs text-gray-400">Auto-fill book details when ISBN is entered</p></div>
                                        </label>
                                    </div>

                                    {error && <div className="p-3 bg-red-50 border border-red-100 text-xs text-red-700 rounded-xl">{error}</div>}

                                    <Button onClick={saveSettings} disabled={saving} className="w-full bg-teal-600 hover:bg-teal-700 text-white h-11 font-bold">
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Settings'}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* ====== ADD/EDIT BOOK MODAL ====== */}
            <LibModal show={showBookModal} onClose={() => setShowBookModal(false)}
                title={editingBook ? 'Edit Book' : 'Add New Book'} error={error}
                footer={<>
                    <Button onClick={() => setShowBookModal(false)} variant="outline">Cancel</Button>
                    <Button onClick={saveBook} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        {editingBook ? 'Update Book' : 'Add Book'}
                    </Button>
                </>}>
                {/* ISBN Lookup */}
                <div className="flex gap-2">
                    <div className="flex-1">
                        <InputField label="ISBN" value={bookForm.isbn} onChange={(v: string) => setBookForm({...bookForm, isbn: v})} placeholder="e.g. 978-0134685991" />
                    </div>
                    <div className="flex items-end">
                        <Button onClick={lookupISBN} disabled={isbnLoading || !bookForm.isbn.trim()} className="bg-blue-600 hover:bg-blue-700 text-white h-10 gap-1">
                            {isbnLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                            Lookup
                        </Button>
                    </div>
                </div>
                <InputField label="Title" value={bookForm.title} onChange={(v: string) => setBookForm({...bookForm, title: v})} placeholder="Book title" required />
                <InputField label="Author" value={bookForm.author} onChange={(v: string) => setBookForm({...bookForm, author: v})} placeholder="Author name" />
                <div className="grid grid-cols-2 gap-3">
                    <InputField label="Publisher" value={bookForm.publisher} onChange={(v: string) => setBookForm({...bookForm, publisher: v})} />
                    <InputField label="Year" value={bookForm.publicationYear} onChange={(v: string) => setBookForm({...bookForm, publicationYear: v})} type="number" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-semibold text-gray-600 mb-1 block">Category</label>
                        <select value={bookForm.categoryId} onChange={e => setBookForm({...bookForm, categoryId: e.target.value})}
                            className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none">
                            <option value="">None</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <InputField label="Language" value={bookForm.language} onChange={(v: string) => setBookForm({...bookForm, language: v})} />
                </div>
                {!editingBook && (
                    <div className="grid grid-cols-2 gap-3">
                        <InputField label="Number of Copies" value={bookForm.totalCopies} onChange={(v: string) => setBookForm({...bookForm, totalCopies: v})} type="number" />
                        <InputField label="Shelf Location" value={bookForm.shelfLocation} onChange={(v: string) => setBookForm({...bookForm, shelfLocation: v})} placeholder="e.g. A-3-7" />
                    </div>
                )}
                {bookForm.coverImageUrl && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                        <img src={bookForm.coverImageUrl} alt="Cover" className="w-12 h-16 object-contain rounded" />
                        <span className="text-xs text-gray-500 flex-1 truncate">{bookForm.coverImageUrl}</span>
                    </div>
                )}
            </LibModal>

            {/* ====== CATEGORY MODAL ====== */}
            <LibModal show={showCatModal} onClose={() => setShowCatModal(false)}
                title={editingCat ? 'Edit Category' : 'Add Category'} error={error}
                footer={<>
                    <Button onClick={() => setShowCatModal(false)} variant="outline">Cancel</Button>
                    <Button onClick={saveCat} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Save
                    </Button>
                </>}>
                <InputField label="Category Name" value={catForm.name} onChange={(v: string) => setCatForm({...catForm, name: v})} placeholder="e.g. Science Fiction" required />
                <InputField label="Description" value={catForm.description} onChange={(v: string) => setCatForm({...catForm, description: v})} placeholder="Optional description" />
            </LibModal>

            {/* ====== ISSUE BOOK MODAL ====== */}
            <LibModal show={showIssueModal} onClose={() => setShowIssueModal(false)}
                title="Issue Book to Student" error={error}
                footer={<>
                    <Button onClick={() => setShowIssueModal(false)} variant="outline">Cancel</Button>
                    <Button onClick={issueBook} disabled={saving || !selectedIssueStudent || !selectedIssueBook}
                        className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookMarked className="w-4 h-4" />}
                        Issue Book
                    </Button>
                </>}>
                {/* Student Search */}
                <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Student *</label>
                    {selectedIssueStudent ? (
                        <div className="flex items-center justify-between p-3 bg-teal-50/50 border border-teal-200 rounded-xl text-xs font-bold text-teal-900">
                            <div>
                                <div>{selectedIssueStudent.name}</div>
                                <div className="text-[10px] text-teal-500 font-mono">{selectedIssueStudent.admission_number} · {selectedIssueStudent.class_name} {selectedIssueStudent.section_name}</div>
                            </div>
                            <button onClick={() => { setSelectedIssueStudent(null); setIssueStudentSearch(''); }} className="p-1 hover:bg-teal-100 rounded-full"><X className="w-3.5 h-3.5" /></button>
                        </div>
                    ) : (
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                            <input value={issueStudentSearch} onChange={e => setIssueStudentSearch(e.target.value)} placeholder="Search student..."
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
                            {issueStudentResults.length > 0 && (
                                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                    {issueStudentResults.map(st => (
                                        <button key={st.id} onClick={() => { setSelectedIssueStudent(st); setIssueStudentSearch(''); setIssueStudentResults([]); }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-teal-50 text-xs transition-colors border-b border-gray-50 last:border-0">
                                            <div className="font-bold text-gray-900">{st.name}</div>
                                            <div className="text-gray-400 font-mono text-[10px]">{st.admission_number} · {st.class_name} {st.section_name}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                {/* Book Search */}
                <div>
                    <label className="text-xs font-semibold text-gray-600 mb-1 block">Book (Available) *</label>
                    {selectedIssueBook ? (
                        <div className="flex items-center justify-between p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900">
                            <div>
                                <div>{selectedIssueBook.title}</div>
                                <div className="text-[10px] text-emerald-500">{selectedIssueBook.author} · {selectedIssueBook.available_copies} copies available</div>
                            </div>
                            <button onClick={() => { setSelectedIssueBook(null); setIssueBookSearch(''); }} className="p-1 hover:bg-emerald-100 rounded-full"><X className="w-3.5 h-3.5" /></button>
                        </div>
                    ) : (
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                            <input value={issueBookSearch} onChange={e => setIssueBookSearch(e.target.value)} placeholder="Search available books..."
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
                            {issueBookResults.length > 0 && (
                                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
                                    {issueBookResults.map(b => (
                                        <button key={b.id} onClick={() => { setSelectedIssueBook(b); setIssueBookSearch(''); setIssueBookResults([]); }}
                                            className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 text-xs transition-colors border-b border-gray-50 last:border-0">
                                            <div className="font-bold text-gray-900">{b.title}</div>
                                            <div className="text-gray-400 text-[10px]">{b.author} · {b.available_copies} available</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                {selectedIssueStudent && selectedIssueBook && settings && (
                    <div className="p-3 bg-blue-50 rounded-xl text-xs text-blue-700">
                        <strong>Loan Duration:</strong> {settings.loan_duration_days} days · <strong>Due Date:</strong> {new Date(Date.now() + settings.loan_duration_days * 86400000).toLocaleDateString('en-IN')}
                    </div>
                )}
            </LibModal>
        </div>
    );
}
