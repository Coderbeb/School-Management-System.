'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { Navbar } from '@/components/ui/Navbar';
import {
    IndianRupee, LayoutDashboard, CreditCard, Receipt, Clock, AlertTriangle,
    Banknote, Settings, Search, Plus, X, Loader2, CheckCircle,
    Trash2, Edit3, Save, Users, CalendarDays, FileText, Zap, Globe, School,
    User, ToggleLeft, ToggleRight,
    ClipboardList, Pencil, Info, BarChart3, FileCheck,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────
interface UserData { id: string; email: string; firstName: string; lastName: string; role: string; }
interface FeeHead { id: string; name: string; category: string; is_taxable: boolean; tax_rate: string; hsn_code: string | null; }
interface FeeGroup { id: string; name: string; description: string | null; heads: GroupHead[]; target_class_ids: string[]; is_default: boolean; apply_to: 'all' | 'specific_classes' | 'individual'; is_active: boolean; assigned_students: number; }
interface GroupHead { fee_head_id: string; head_name: string; amount: string; frequency: string; }
interface ClassItem { id: string; name: string; display_order: number; }
interface SessionItem { id: string; name: string; is_current: boolean; }
interface Payment { id: string; student_name: string; admission_number: string; fee_name: string; amount_paid: string; fee_amount: string; payment_mode: string; payment_date: string; receipt_number: string; payment_status: string; collected_by_name: string; }
interface SalaryStructure { id: string; user_id: string; staff_name: string; staff_email: string; role_target: string; designation: string; base_salary: string; allowances: Record<string, number>; deductions: Record<string, number>; net_salary: string; effective_from: string; is_active: boolean; }
interface SalaryPayment { id: string; user_id: string; staff_name: string; staff_email: string; month: string; gross_amount: string; deductions_amount: string; net_amount: string; payment_mode: string; payment_date: string; reference_number: string; remarks: string; status: string; designation: string; }
interface Defaulter { student_name: string; admission_number: string; class_name: string; guardian_phone: string; total_due: string; overdue_days: number; }
interface PlatformCharge { id: string; billing_month: string; total_amount: string; due_date: string; status: string; description: string; payment_mode?: string; charge_model?: string; payment_date?: string; }
interface StudentAssignment { student_id: string; first_name: string; last_name: string; admission_number: string; class_name: string; class_id: string; assigned_groups: { fee_group_id: string; fee_group_name: string; assignment_id: string; }[]; estimated_monthly: number; estimated_yearly: number; }

type Section = 'home' | 'collect' | 'reports' | 'fee-setup' | 'salary' | 'settings';
type ReportView = 'payments' | 'defaulters';

const FREQUENCIES = [
    { value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' },
    { value: 'half_yearly', label: 'Half Yearly' }, { value: 'yearly', label: 'Yearly' },
    { value: 'one_time', label: 'One Time' },
];
const HEAD_CATEGORIES = [
    { value: 'academic', label: 'Academic' }, { value: 'transport', label: 'Transport' },
    { value: 'hostel', label: 'Hostel' }, { value: 'activity', label: 'Activity' },
    { value: 'one_time', label: 'One Time' }, { value: 'other', label: 'Other' },
];

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════
import React, { Suspense } from 'react';

export default function FinanceDashboard() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950"><Loader2 className="w-10 h-10 text-emerald-500 animate-spin" /></div>}>
            <FinanceDashboardContent />
        </Suspense>
    );
}

function FinanceDashboardContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [user, setUser] = useState<UserData | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeSection, setActiveSection] = useState<Section>('home');

    // ── Shared data ──
    const [sessions, setSessions] = useState<SessionItem[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [feeGroups, setFeeGroups] = useState<FeeGroup[]>([]);
    const [feeHeads, setFeeHeads] = useState<FeeHead[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);

    // ── Collect fee ──
    const [collectSearch, setCollectSearch] = useState('');
    const [collectResults, setCollectResults] = useState<any[]>([]);
    const [collectStudent, setCollectStudent] = useState<any>(null);
    const [studentInvoices, setStudentInvoices] = useState<any[]>([]);
    const [collectForm, setCollectForm] = useState({ invoiceId: '', amountPaid: '', paymentMode: 'cash', remarks: '' });
    const [collecting, setCollecting] = useState(false);
    const [collectMsg, setCollectMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
    // Browse by class
    const [browseClass, setBrowseClass] = useState('');
    const [browseSession, setBrowseSession] = useState('');
    const [classSections, setClassSections] = useState<any[]>([]);
    const [browseStudents, setBrowseStudents] = useState<any[]>([]);
    const [browseLoading, setBrowseLoading] = useState(false);

    // ── Reports ──
    const [reportView, setReportView] = useState<ReportView>('payments');
    const [defaulters, setDefaulters] = useState<Defaulter[]>([]);
    const [defaultersLoading, setDefaultersLoading] = useState(false);
    const [paySearch, setPaySearch] = useState('');
    const [payDateFilter, setPayDateFilter] = useState('');
    const [payModeFilter, setPayModeFilter] = useState('');

    // ── Fee Setup (wizard) ──
    const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1);
    const [setupMsg, setSetupMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    // Head form
    const [showHeadForm, setShowHeadForm] = useState(false);
    const [editHeadId, setEditHeadId] = useState<string | null>(null);
    const [headForm, setHeadForm] = useState({ name: '', category: 'academic', isTaxable: false, taxRate: '0', hsnCode: '' });
    const [savingHead, setSavingHead] = useState(false);
    // Group form
    const [showGroupForm, setShowGroupForm] = useState(false);
    const [editGroupId, setEditGroupId] = useState<string | null>(null);
    const [groupName, setGroupName] = useState('');
    const [groupDesc, setGroupDesc] = useState('');
    const [groupHeadRows, setGroupHeadRows] = useState<{ feeHeadId: string; amount: string; frequency: string }[]>([{ feeHeadId: '', amount: '', frequency: 'monthly' }]);
    const [groupApplyTo, setGroupApplyTo] = useState<'all' | 'specific_classes' | 'individual'>('all');
    const [groupTargetClasses, setGroupTargetClasses] = useState<string[]>([]);
    const [groupIsDefault, setGroupIsDefault] = useState(false);
    const [savingGroup, setSavingGroup] = useState(false);
    // Assign
    const [assignSession, setAssignSession] = useState('');
    const [assignClass, setAssignClass] = useState('');
    const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
    const [assignLoading, setAssignLoading] = useState(false);
    const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
    const [assignGroupId, setAssignGroupId] = useState('');
    const [assigning, setAssigning] = useState(false);

    // ── Invoice Generation ──
    const [showInvoiceForm, setShowInvoiceForm] = useState(false);
    const [invoiceDueDate, setInvoiceDueDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 15); return d.toISOString().split('T')[0]; });
    const [invoiceClassFilter, setInvoiceClassFilter] = useState('');
    const [generatingInvoices, setGeneratingInvoices] = useState(false);
    const [invoiceMsg, setInvoiceMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // ── Salary & Charges ──
    const [salaryStructures, setSalaryStructures] = useState<SalaryStructure[]>([]);
    const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([]);
    const [platformCharges, setPlatformCharges] = useState<PlatformCharge[]>([]);
    const [staffList, setStaffList] = useState<any[]>([]);
    const [salaryLoading, setSalaryLoading] = useState(false);
    const [showSalaryModal, setShowSalaryModal] = useState(false);
    const [editingSalary, setEditingSalary] = useState<SalaryStructure | null>(null);
    const [salaryForm, setSalaryForm] = useState({ userId: '', designation: '', baseSalary: '', allowances: {} as Record<string, string>, deductions: {} as Record<string, string>, netSalary: '', effectiveFrom: new Date().toISOString().split('T')[0] });
    const [salaryStaffSearch, setSalaryStaffSearch] = useState('');
    const [salaryStaffResults, setSalaryStaffResults] = useState<any[]>([]);
    const [selectedSalaryStaff, setSelectedSalaryStaff] = useState<any>(null);
    const [savingSalary, setSavingSalary] = useState(false);
    const [newAllowanceKey, setNewAllowanceKey] = useState('');
    const [newDeductionKey, setNewDeductionKey] = useState('');
    const [payMonth, setPayMonth] = useState(new Date().toISOString().slice(0, 7));
    const [payingId, setPayingId] = useState<string | null>(null);
    const [salarySubTab, setSalarySubTab] = useState<'payroll' | 'history' | 'billing'>('payroll');
    const [payrollRoleFilter, setPayrollRoleFilter] = useState<'all' | 'teacher' | 'accountant' | 'super_admin'>('all');
    const [showPlatformOfflineModal, setPlatformOfflineModal] = useState(false);
    const [selectedPlatformCharge, setSelectedPlatformCharge] = useState<PlatformCharge | null>(null);
    const [platformOfflinePaymentMode, setPlatformOfflinePaymentMode] = useState('cash');
    const [platformOfflineReference, setPlatformOfflineReference] = useState('');
    const [platformOfflinePaymentDate, setPlatformOfflinePaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [payingPlatformOffline, setPayingPlatformOffline] = useState(false);
    const [payingPlatformOnlineId, setPayingPlatformOnlineId] = useState<string | null>(null);

    // ── Settings ──
    const [lateFeeEnabled, setLateFeeEnabled] = useState(false);
    const [concessionEnabled, setConcessionEnabled] = useState(false);
    const [gatewayStatus, setGatewayStatus] = useState('');
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // ─── Auth ────────────────────────────────────────────────────
    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) { router.replace('/login'); return; }
        const parsed = JSON.parse(userData);
        if (parsed.role !== 'super_admin' && parsed.role !== 'accountant') { router.replace('/dashboard'); return; }
        setUser(parsed);
    }, [router]);

    useEffect(() => {
        const tab = searchParams.get('tab') as Section | null;
        if (tab) setActiveSection(tab);
    }, [searchParams]);

    const isAdmin = user?.role === 'super_admin';
    const getToken = () => localStorage.getItem('token') || '';
    const hdrs = useCallback(() => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }), []);
    const handleLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); router.replace('/login'); };

    // ─── Data Loaders ────────────────────────────────────────────
    const loadCore = useCallback(async () => {
        setLoading(true);
        try {
            const [sessRes, classRes, groupRes, headRes, payRes] = await Promise.all([
                fetch('/api/manage/sessions', { headers: hdrs() }),
                fetch('/api/manage/classes', { headers: hdrs() }),
                fetch('/api/fees/groups', { headers: hdrs() }),
                fetch('/api/fees/heads', { headers: hdrs() }),
                fetch('/api/fees/payments', { headers: hdrs() }),
            ]);
            if (sessRes.status === 401 || headRes.status === 401) {
                handleLogout();
                return;
            }
            const sessData = sessRes.ok ? (await sessRes.json()).sessions || [] : [];
            const classData = classRes.ok ? (await classRes.json()).classes || [] : [];
            const groupData = groupRes.ok ? (await groupRes.json()).groups || [] : [];
            const headData = headRes.ok ? (await headRes.json()).heads || [] : [];
            const payData = payRes.ok ? (await payRes.json()).payments || [] : [];
            setSessions(sessData); setClasses(classData.sort((a: ClassItem, b: ClassItem) => a.display_order - b.display_order));
            setFeeGroups(groupData); setFeeHeads(headData); setPayments(payData);
            const cur = sessData.find((s: SessionItem) => s.is_current);
            if (cur) setAssignSession(cur.id);
        } catch { }
        setLoading(false);
    }, [hdrs]);

    const loadDefaulters = useCallback(async () => {
        setDefaultersLoading(true);
        try { const r = await fetch('/api/fees/defaulters', { headers: hdrs() }); if (r.ok) setDefaulters((await r.json()).defaulters || []); } catch { }
        setDefaultersLoading(false);
    }, [hdrs]);

    const loadAssignments = useCallback(async (sessId: string, classId: string) => {
        if (!sessId) return;
        setAssignLoading(true);
        try { const r = await fetch(`/api/fees/student-groups?sessionId=${sessId}${classId ? `&classId=${classId}` : ''}`, { headers: hdrs() }); if (r.ok) setAssignments((await r.json()).assignments || []); } catch { }
        setAssignLoading(false);
    }, [hdrs]);

    const loadSalaryData = useCallback(async () => {
        setSalaryLoading(true);
        try {
            const [sRes, pRes, staffRes, pcRes] = await Promise.all([
                fetch('/api/salary/structures', { headers: hdrs() }),
                fetch('/api/salary/payments', { headers: hdrs() }),
                fetch('/api/manage/staff', { headers: hdrs() }),
                fetch('/api/platform-billing', { headers: hdrs() }),
            ]);
            if (sRes.ok) setSalaryStructures((await sRes.json()).structures || []);
            if (pRes.ok) setSalaryPayments((await pRes.json()).payments || []);
            if (staffRes.ok) setStaffList((await staffRes.json()).staff || []);
            if (pcRes.ok) setPlatformCharges((await pcRes.json()).charges || []);
        } catch { }
        setSalaryLoading(false);
    }, [hdrs]);

    const loadSettings = useCallback(async () => {
        try {
            const [cfgRes, gwRes] = await Promise.all([
                fetch('/api/schools/fee-config', { headers: hdrs() }),
                fetch('/api/settings/payment-gateway', { headers: hdrs() }),
            ]);
            if (cfgRes.ok) { const d = await cfgRes.json(); setLateFeeEnabled(d.lateFeeEnabled || false); setConcessionEnabled(d.concessionEnabled || false); }
            if (gwRes.ok) { const d = await gwRes.json(); setGatewayStatus(d.status || 'not_configured'); }
        } catch { }
    }, [hdrs]);

    useEffect(() => { if (user) loadCore(); }, [user, loadCore]);
    useEffect(() => { if (user && activeSection === 'reports' && reportView === 'defaulters') loadDefaulters(); }, [user, activeSection, reportView, loadDefaulters]);
    useEffect(() => { if (user && activeSection === 'fee-setup' && setupStep === 3) loadAssignments(assignSession, assignClass); }, [user, activeSection, setupStep, assignSession, assignClass, loadAssignments]);
    useEffect(() => { if (user && activeSection === 'salary') loadSalaryData(); }, [user, activeSection, loadSalaryData]);
    useEffect(() => { if (user && activeSection === 'settings') loadSettings(); }, [user, activeSection, loadSettings]);

    // ── Auto-calc net salary ──
    useEffect(() => {
        const b = parseFloat(salaryForm.baseSalary) || 0;
        const a = Object.values(salaryForm.allowances).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        const d = Object.values(salaryForm.deductions).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        setSalaryForm(f => ({ ...f, netSalary: (b + a - d).toFixed(2) }));
    }, [salaryForm.baseSalary, salaryForm.allowances, salaryForm.deductions]);

    // ─── Stats ───────────────────────────────────────────────────
    const todayStr = new Date().toISOString().split('T')[0];
    const totalCollected = payments.filter(p => p.payment_status === 'completed' || p.payment_status === 'partial').reduce((s, p) => s + parseFloat(p.amount_paid || '0'), 0);
    const todayCollected = payments.filter(p => p.payment_date === todayStr).reduce((s, p) => s + parseFloat(p.amount_paid || '0'), 0);
    const todayCount = payments.filter(p => p.payment_date === todayStr).length;
    const monthlyBill = salaryStructures.filter(s => s.is_active).reduce((s, st) => s + parseFloat(st.net_salary || '0'), 0);

    // ─── Collect Fee Handlers ────────────────────────────────────
    const searchStudents = async (term: string) => {
        setCollectSearch(term);
        if (term.length < 2) { setCollectResults([]); return; }
        try {
            const r = await fetch(`/api/manage/students?search=${encodeURIComponent(term)}`, { headers: hdrs() });
            if (r.ok) {
                const data = await r.json();
                const mapped = (data.students || []).slice(0, 8).map((s: any) => ({
                    ...s,
                    class_name: s.class_section_name || s.class_name || '—',
                }));
                setCollectResults(mapped);
            }
        } catch { }
    };
    const selectStudent = async (s: any) => {
        setCollectStudent(s); setCollectSearch(''); setCollectResults([]);
        setCollectForm(f => ({ ...f, invoiceId: '', amountPaid: '' }));
        try { const r = await fetch(`/api/fees/student-summary?studentId=${s.id}`, { headers: hdrs() }); if (r.ok) setStudentInvoices((await r.json()).invoices || []); } catch { setStudentInvoices([]); }
    };
    const handleCollect = async () => {
        if (!collectStudent || !collectForm.invoiceId || !collectForm.amountPaid) return;
        setCollecting(true); setCollectMsg(null);
        try {
            const r = await fetch('/api/fees/payments', { method: 'POST', headers: hdrs(), body: JSON.stringify({ studentId: collectStudent.id, invoiceId: collectForm.invoiceId, amountPaid: parseFloat(collectForm.amountPaid), paymentMode: collectForm.paymentMode, remarks: collectForm.remarks }) });
            if (r.ok) {
                const d = await r.json(); const pid = d.payment?.id || null; setLastPaymentId(pid);
                setCollectMsg({ type: 'success', text: `✅ Payment recorded! Receipt: ${d.payment?.receipt_number || '—'}` });
                setCollectForm({ invoiceId: '', amountPaid: '', paymentMode: 'cash', remarks: '' }); setCollectStudent(null); setStudentInvoices([]);
                loadCore();
                // Refresh class browse if active
                if (browseClass && browseSession) loadClassStudents(browseClass, browseSession);
            } else { const e = await r.json(); setCollectMsg({ type: 'error', text: e.error || 'Failed' }); }
        } catch { setCollectMsg({ type: 'error', text: 'Network error' }); }
        setCollecting(false);
    };

    // ─── Browse by Class ─────────────────────────────────────────
    const initBrowse = useCallback(async () => {
        if (sessions.length === 0) return;
        const currentSession = sessions.find(s => s.is_current) || sessions[0];
        if (!browseSession) setBrowseSession(currentSession.id);
        const sid = browseSession || currentSession.id;
        try {
            const r = await fetch(`/api/manage/class-sections?sessionId=${sid}`, { headers: hdrs() });
            if (r.ok) { const d = await r.json(); setClassSections(d.classSections || []); }
        } catch { }
    }, [sessions, browseSession]);

    useEffect(() => { if (activeSection === 'collect') initBrowse(); }, [activeSection, initBrowse]);

    const loadClassStudents = async (classSectionId: string, sessionId: string) => {
        setBrowseLoading(true);
        try {
            // Fetch students in this class-section
            const sRes = await fetch(`/api/manage/students?classSectionId=${classSectionId}&sessionId=${sessionId}`, { headers: hdrs() });
            const sData = sRes.ok ? await sRes.json() : { students: [] };
            const students = sData.students || [];

            // Fetch invoices for this session
            const iRes = await fetch(`/api/fees/invoices?sessionId=${sessionId}`, { headers: hdrs() });
            const iData = iRes.ok ? await iRes.json() : { invoices: [] };
            const allInvoices = iData.invoices || [];

            // Merge: for each student, find their invoices and compute status
            const merged = students.map((s: any) => {
                const sInvoices = allInvoices.filter((inv: any) => inv.student_id === s.id);
                const totalDue = sInvoices.reduce((sum: number, inv: any) => sum + parseFloat(inv.total_amount || '0'), 0);
                const totalPaid = sInvoices.reduce((sum: number, inv: any) => sum + parseFloat(inv.paid_amount || '0'), 0);
                const balance = Math.max(0, totalDue - totalPaid);
                const hasInvoices = sInvoices.length > 0;
                let status: 'paid' | 'partial' | 'unpaid' | 'no_invoice' = 'no_invoice';
                if (hasInvoices) {
                    if (balance === 0) status = 'paid';
                    else if (totalPaid > 0) status = 'partial';
                    else status = 'unpaid';
                }
                return { ...s, class_name: s.class_section_name || '—', invoices: sInvoices, totalDue, totalPaid, balance, status };
            });
            setBrowseStudents(merged);
        } catch { setBrowseStudents([]); }
        setBrowseLoading(false);
    };

    const handleBrowseClassChange = (csId: string) => {
        setBrowseClass(csId);
        if (csId && browseSession) loadClassStudents(csId, browseSession);
        else setBrowseStudents([]);
    };

    // ─── Fee Heads CRUD ──────────────────────────────────────────
    const openCreateHead = () => { setHeadForm({ name: '', category: 'academic', isTaxable: false, taxRate: '0', hsnCode: '' }); setEditHeadId(null); setShowHeadForm(true); setSetupMsg(null); };
    const openEditHead = (h: FeeHead) => { setHeadForm({ name: h.name, category: h.category, isTaxable: h.is_taxable, taxRate: h.tax_rate, hsnCode: h.hsn_code || '' }); setEditHeadId(h.id); setShowHeadForm(true); };
    const saveHead = async () => {
        if (!headForm.name) { setSetupMsg({ type: 'error', text: 'Name required' }); return; }
        setSavingHead(true);
        const body = { name: headForm.name, category: headForm.category, isTaxable: headForm.isTaxable, taxRate: parseFloat(headForm.taxRate || '0'), hsnCode: headForm.hsnCode || null };
        try { const r = await fetch('/api/fees/heads', { method: editHeadId ? 'PUT' : 'POST', headers: hdrs(), body: JSON.stringify(editHeadId ? { id: editHeadId, ...body } : body) }); if (r.ok) { setSetupMsg({ type: 'success', text: editHeadId ? 'Updated!' : 'Created!' }); setShowHeadForm(false); loadCore(); } else { const e = await r.json(); setSetupMsg({ type: 'error', text: e.error || 'Failed' }); } } catch { setSetupMsg({ type: 'error', text: 'Network error' }); }
        setSavingHead(false);
    };
    const deleteHead = async (id: string, name: string) => { if (!confirm(`Delete "${name}"?`)) return; try { const r = await fetch(`/api/fees/heads?id=${id}`, { method: 'DELETE', headers: hdrs() }); if (r.ok) { setSetupMsg({ type: 'success', text: 'Deleted' }); loadCore(); } } catch { } };

    // ─── Fee Groups CRUD ─────────────────────────────────────────
    const openCreateGroup = () => { setGroupName(''); setGroupDesc(''); setGroupHeadRows([{ feeHeadId: '', amount: '', frequency: 'monthly' }]); setGroupApplyTo('all'); setGroupTargetClasses([]); setGroupIsDefault(false); setEditGroupId(null); setShowGroupForm(true); setSetupMsg(null); };
    const openEditGroup = (g: FeeGroup) => { setGroupName(g.name); setGroupDesc(g.description || ''); setGroupHeadRows(g.heads.length > 0 ? g.heads.map(h => ({ feeHeadId: h.fee_head_id, amount: h.amount, frequency: h.frequency })) : [{ feeHeadId: '', amount: '', frequency: 'monthly' }]); setGroupApplyTo(g.apply_to || 'all'); setGroupTargetClasses(Array.isArray(g.target_class_ids) ? g.target_class_ids : []); setGroupIsDefault(g.is_default || false); setEditGroupId(g.id); setShowGroupForm(true); };
    const saveGroup = async () => {
        if (!groupName) { setSetupMsg({ type: 'error', text: 'Group Name required' }); return; }
        const validHeads = groupHeadRows.filter(h => h.feeHeadId && h.amount);
        if (validHeads.length === 0) { setSetupMsg({ type: 'error', text: 'Add at least one fee item' }); return; }
        setSavingGroup(true);
        const body = { name: groupName, description: groupDesc || null, heads: validHeads, applyTo: groupApplyTo, targetClassIds: groupApplyTo === 'specific_classes' ? groupTargetClasses : [], isDefault: groupIsDefault, isActive: true };
        try { const r = await fetch('/api/fees/groups', { method: editGroupId ? 'PUT' : 'POST', headers: hdrs(), body: JSON.stringify(editGroupId ? { id: editGroupId, ...body } : body) }); if (r.ok) { setSetupMsg({ type: 'success', text: editGroupId ? 'Updated!' : 'Created!' }); setShowGroupForm(false); loadCore(); } else { const e = await r.json(); setSetupMsg({ type: 'error', text: e.error || 'Failed' }); } } catch { setSetupMsg({ type: 'error', text: 'Network error' }); }
        setSavingGroup(false);
    };
    const deleteGroup = async (id: string, name: string) => { if (!confirm(`Delete "${name}"?`)) return; try { await fetch(`/api/fees/groups?id=${id}`, { method: 'DELETE', headers: hdrs() }); setSetupMsg({ type: 'success', text: 'Deleted' }); loadCore(); } catch { } };

    // ─── Assign ──────────────────────────────────────────────────
    const handleAssignGroup = async () => {
        if (selectedStudents.length === 0 || !assignGroupId) return;
        setAssigning(true);
        try { const r = await fetch('/api/fees/student-groups', { method: 'POST', headers: hdrs(), body: JSON.stringify({ studentIds: selectedStudents, feeGroupId: assignGroupId, sessionId: assignSession }) }); if (r.ok) { setSetupMsg({ type: 'success', text: `Assigned to ${selectedStudents.length} students` }); setSelectedStudents([]); setAssignGroupId(''); loadAssignments(assignSession, assignClass); } } catch { }
        setAssigning(false);
    };
    const handleAutoAssign = async () => {
        if (!confirm('Auto-assign default fee groups to all unassigned students?')) return;
        setAssigning(true);
        try { const r = await fetch('/api/fees/auto-assign', { method: 'POST', headers: hdrs(), body: JSON.stringify({ sessionId: assignSession }) }); if (r.ok) { const d = await r.json(); setSetupMsg({ type: 'success', text: d.message || 'Done!' }); loadAssignments(assignSession, assignClass); } } catch { }
        setAssigning(false);
    };

    // ─── Generate Invoices ───────────────────────────────────────
    const handleGenerateInvoices = async () => {
        if (!assignSession || !invoiceDueDate) { setInvoiceMsg({ type: 'error', text: 'Session and due date are required' }); return; }
        if (!confirm(`Generate invoices for ${invoiceClassFilter ? 'selected class' : 'ALL students'} with due date ${new Date(invoiceDueDate).toLocaleDateString('en-IN')}?`)) return;
        setGeneratingInvoices(true); setInvoiceMsg(null);
        try {
            const body: any = { sessionId: assignSession, dueDate: invoiceDueDate };
            if (invoiceClassFilter) body.classId = invoiceClassFilter;
            const r = await fetch('/api/fees/invoices', { method: 'POST', headers: hdrs(), body: JSON.stringify(body) });
            if (r.ok) {
                const d = await r.json();
                setInvoiceMsg({ type: 'success', text: d.message || `Generated ${d.count || 0} invoices!` });
                loadCore();
            } else {
                const e = await r.json();
                setInvoiceMsg({ type: 'error', text: e.error || 'Failed to generate invoices' });
            }
        } catch { setInvoiceMsg({ type: 'error', text: 'Network error' }); }
        setGeneratingInvoices(false);
    };

    // ─── Salary CRUD ─────────────────────────────────────────────
    const searchSalaryStaff = (term: string) => { setSalaryStaffSearch(term); if (term.length < 2) { setSalaryStaffResults([]); return; } setSalaryStaffResults(staffList.filter(s => `${s.first_name} ${s.last_name}`.toLowerCase().includes(term.toLowerCase())).slice(0, 8)); };
    const openCreateSalary = () => { setEditingSalary(null); setSalaryForm({ userId: '', designation: '', baseSalary: '', allowances: {}, deductions: {}, netSalary: '', effectiveFrom: new Date().toISOString().split('T')[0] }); setSelectedSalaryStaff(null); setSalaryStaffSearch(''); setShowSalaryModal(true); };
    const openEditSalary = (s: SalaryStructure) => {
        setEditingSalary(s);
        const al: Record<string, string> = {}; const de: Record<string, string> = {};
        if (s.allowances) Object.entries(s.allowances).forEach(([k, v]) => { al[k] = String(v); });
        if (s.deductions) Object.entries(s.deductions).forEach(([k, v]) => { de[k] = String(v); });
        setSalaryForm({ userId: s.user_id, designation: s.designation || '', baseSalary: s.base_salary, allowances: al, deductions: de, netSalary: s.net_salary, effectiveFrom: s.effective_from?.split('T')[0] || '' });
        setSelectedSalaryStaff({ id: s.user_id, first_name: s.staff_name?.split(' ')[0], last_name: s.staff_name?.split(' ').slice(1).join(' '), email: s.staff_email });
        setShowSalaryModal(true);
    };
    const saveSalaryStructure = async () => {
        if (!salaryForm.userId || !salaryForm.baseSalary) { alert('Staff and Base Salary required'); return; }
        setSavingSalary(true);
        const an: Record<string, number> = {}; const dn: Record<string, number> = {};
        Object.entries(salaryForm.allowances).forEach(([k, v]) => { an[k] = parseFloat(v) || 0; });
        Object.entries(salaryForm.deductions).forEach(([k, v]) => { dn[k] = parseFloat(v) || 0; });
        const body: any = { userId: salaryForm.userId, roleTarget: 'teacher', designation: salaryForm.designation, baseSalary: parseFloat(salaryForm.baseSalary), allowances: an, deductions: dn, netSalary: parseFloat(salaryForm.netSalary || '0'), effectiveFrom: salaryForm.effectiveFrom };
        if (editingSalary) body.id = editingSalary.id;
        try { const r = await fetch('/api/salary/structures', { method: editingSalary ? 'PUT' : 'POST', headers: hdrs(), body: JSON.stringify(body) }); if (r.ok) { setShowSalaryModal(false); loadSalaryData(); } else { const e = await r.json(); alert(e.error || 'Failed'); } } catch { alert('Failed'); }
        setSavingSalary(false);
    };
    const handlePaySalary = async (s: SalaryStructure) => {
        setPayingId(s.id);
        const gross = parseFloat(s.base_salary) + Object.values(s.allowances || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
        const ded = Object.values(s.deductions || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
        try { const r = await fetch('/api/salary/payments', { method: 'POST', headers: hdrs(), body: JSON.stringify({ userId: s.user_id, salaryStructureId: s.id, month: payMonth, grossAmount: gross, deductionsAmount: ded, netAmount: parseFloat(s.net_salary), paymentMode: 'bank_transfer', referenceNumber: '', paymentDate: todayStr }) }); if (r.ok) { alert(`Salary paid to ${s.staff_name}!`); loadSalaryData(); } else { const e = await r.json(); alert(e.error || 'Failed'); } } catch { alert('Failed'); }
        setPayingId(null);
    };

    const handlePayPlatformOffline = async () => {
        if (!selectedPlatformCharge) return;
        setPayingPlatformOffline(true);
        try {
            const res = await fetch('/api/platform-billing/pay-offline', {
                method: 'POST',
                headers: hdrs(),
                body: JSON.stringify({
                    chargeId: selectedPlatformCharge.id,
                    paymentMode: platformOfflinePaymentMode,
                    paymentReference: platformOfflineReference,
                    paymentDate: platformOfflinePaymentDate,
                })
            });
            const data = await res.json();
            if (res.ok) {
                alert('Offline system charge payment recorded successfully!');
                setPlatformOfflineModal(false);
                setSelectedPlatformCharge(null);
                setPlatformOfflineReference('');
                loadSalaryData();
            } else {
                alert(data.error || 'Failed to record payment');
            }
        } catch {
            alert('Network error');
        }
        setPayingPlatformOffline(false);
    };

    const handlePayPlatformOnline = async (charge: PlatformCharge) => {
        setPayingPlatformOnlineId(charge.id);
        try {
            // 1. Create order
            const orderRes = await fetch('/api/platform-billing/pay', {
                method: 'POST',
                headers: hdrs(),
                body: JSON.stringify({ chargeId: charge.id })
            });
            const orderData = await orderRes.json();
            if (!orderRes.ok) throw new Error(orderData.error || 'Failed to create order');

            // 2. Load SDK
            const loadSdk = () => {
                return new Promise((resolve) => {
                    const script = document.createElement('script');
                    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
                    script.onload = () => resolve(true);
                    script.onerror = () => resolve(false);
                    document.body.appendChild(script);
                });
            };
            const loaded = await loadSdk();
            if (!loaded) throw new Error('Razorpay SDK failed to load');

            // 3. Open Razorpay
            const options = {
                key: orderData.keyId,
                amount: orderData.amount,
                currency: orderData.currency,
                name: 'YSM Developer Platform',
                description: `System Charges (${charge.billing_month})`,
                order_id: orderData.orderId,
                handler: async function (response: any) {
                    try {
                        const verifyRes = await fetch('/api/platform-billing/verify', {
                            method: 'POST',
                            headers: hdrs(),
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                chargeId: charge.id
                            })
                        });
                        const verifyData = await verifyRes.json();
                        if (!verifyRes.ok) throw new Error(verifyData.error || 'Verification failed');
                        alert('✓ Online payment verified and processed successfully!');
                        loadSalaryData();
                    } catch (err: any) {
                        alert(err.message || 'Payment verification failed');
                    }
                },
                modal: {
                    ondismiss: function() {
                        setPayingPlatformOnlineId(null);
                    }
                }
            };
            const rzp = new (window as any).Razorpay(options);
            rzp.open();
        } catch (err: any) {
            alert(err.message || 'Payment initiation failed');
        }
        setPayingPlatformOnlineId(null);
    };

    // ─── Settings ────────────────────────────────────────────────
    const saveSettings = async () => {
        setSavingSettings(true); setSettingsMsg(null);
        try { const r = await fetch('/api/schools/fee-config', { method: 'PUT', headers: hdrs(), body: JSON.stringify({ lateFeeEnabled, concessionEnabled }) }); if (r.ok) setSettingsMsg({ type: 'success', text: 'Saved!' }); else setSettingsMsg({ type: 'error', text: 'Failed' }); } catch { setSettingsMsg({ type: 'error', text: 'Network error' }); }
        setSavingSettings(false);
    };

    // ─── Helpers ─────────────────────────────────────────────────
    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = { paid: 'bg-emerald-50 border-emerald-200 text-emerald-700', partially_paid: 'bg-blue-50 border-blue-200 text-blue-700', unpaid: 'bg-amber-50 border-amber-200 text-amber-700', void: 'bg-gray-100 border-gray-200 text-gray-400', overdue: 'bg-red-50 border-red-200 text-red-700', completed: 'bg-emerald-50 border-emerald-200 text-emerald-700', partial: 'bg-blue-50 border-blue-200 text-blue-700' };
        return styles[status] || 'bg-gray-50 border-gray-200 text-gray-600';
    };
    const filteredPayments = payments.filter(p => {
        if (payDateFilter && !p.payment_date.startsWith(payDateFilter)) return false;
        if (payModeFilter && p.payment_mode !== payModeFilter) return false;
        if (paySearch) { const q = paySearch.toLowerCase(); return p.student_name.toLowerCase().includes(q) || p.admission_number?.toLowerCase().includes(q) || p.receipt_number?.toLowerCase().includes(q); }
        return true;
    });
    const pendingCharge = platformCharges.find(c => c.status === 'pending');

    // ─── Section definitions ─────────────────────────────────────
    const sections: { id: Section; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
        { id: 'home' as Section, label: 'Home', icon: <LayoutDashboard className="w-4 h-4" /> },
        { id: 'collect' as Section, label: 'Collect Fee', icon: <CreditCard className="w-4 h-4" /> },
        { id: 'reports' as Section, label: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
        { id: 'fee-setup' as Section, label: 'Fee Setup', icon: <ClipboardList className="w-4 h-4" />, adminOnly: true },
        { id: 'salary' as Section, label: 'Salary & Charges', icon: <Banknote className="w-4 h-4" /> },
        { id: 'settings' as Section, label: 'Settings', icon: <Settings className="w-4 h-4" />, adminOnly: true },
    ];
    const visibleSections = sections.filter(s => !s.adminOnly || isAdmin);

    if (!user) return <div className="min-h-screen flex items-center justify-center bg-slate-950"><Loader2 className="w-10 h-10 text-emerald-500 animate-spin" /></div>;

    // ═══════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════
    return (
        <div className="min-h-screen bg-slate-50 font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">

                {/* ── Hero ── */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white p-7 mb-6 shadow-2xl">
                    <div className="absolute inset-0 overflow-hidden"><div className="absolute -top-20 -right-20 w-80 h-80 bg-emerald-500 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-pulse" /><div className="absolute -bottom-10 -left-10 w-56 h-56 bg-teal-400 rounded-full mix-blend-screen filter blur-3xl opacity-15" /></div>
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><IndianRupee className="w-5 h-5 text-emerald-300" /> Finance Dashboard</h1>
                            <p className="text-emerald-200 text-sm mt-1">Hello, {user.firstName} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                        </div>
                        <button onClick={() => setActiveSection('collect')} className="hidden sm:flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-2xl shadow-lg text-sm cursor-pointer transition-all">
                            <Plus className="w-4 h-4" /> Collect Fee
                        </button>
                    </div>
                </div>

                {/* ── Section Nav ── */}
                <div className="flex gap-1 bg-white border border-gray-200 p-1.5 rounded-2xl mb-6 overflow-x-auto shadow-sm no-scrollbar">
                    {visibleSections.map(s => (
                        <button key={s.id} onClick={() => setActiveSection(s.id)}
                            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${activeSection === s.id ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'}`}>
                            {s.icon} {s.label}
                        </button>
                    ))}
                </div>

                {/* ═══════════════════════════════════════════════════════ */}
                {/* SECTION 1: HOME                                        */}
                {/* ═══════════════════════════════════════════════════════ */}
                {activeSection === 'home' && (
                    <div className="space-y-6">
                        {/* Stats */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { label: 'Total Collected', value: `₹${totalCollected.toLocaleString('en-IN')}`, sub: 'All time', color: 'emerald', icon: <IndianRupee className="w-5 h-5" /> },
                                { label: "Today's Collection", value: `₹${todayCollected.toLocaleString('en-IN')}`, sub: `${todayCount} receipts`, color: 'blue', icon: <CreditCard className="w-5 h-5" /> },
                                { label: 'Fee Groups', value: feeGroups.length, sub: `${feeHeads.length} fee heads`, color: 'violet', icon: <ClipboardList className="w-5 h-5" /> },
                                { label: 'Staff Payroll', value: `₹${monthlyBill.toLocaleString('en-IN')}`, sub: `${salaryStructures.filter(s => s.is_active).length} active staff`, color: 'amber', icon: <Banknote className="w-5 h-5" /> },
                            ].map((s, i) => (
                                <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-all">
                                    <div className={`inline-flex p-2 rounded-xl mb-3 ${s.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' : s.color === 'blue' ? 'bg-blue-50 text-blue-600' : s.color === 'violet' ? 'bg-violet-50 text-violet-600' : 'bg-amber-50 text-amber-600'}`}>{s.icon}</div>
                                    <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                                    <p className={`text-2xl font-bold mt-0.5 ${s.color === 'emerald' ? 'text-emerald-600' : s.color === 'blue' ? 'text-blue-600' : s.color === 'violet' ? 'text-violet-600' : 'text-amber-600'}`}>{loading ? '—' : s.value}</p>
                                    <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
                                </div>
                            ))}
                        </div>

                        {/* Quick Actions */}
                        <div className="bg-white border border-gray-200 rounded-2xl p-5">
                            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-4">Quick Actions</h2>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { label: 'Collect Fee', icon: <CreditCard className="w-5 h-5" />, section: 'collect' as Section, color: 'emerald' },
                                    { label: 'Reports', icon: <BarChart3 className="w-5 h-5" />, section: 'reports' as Section, color: 'blue' },
                                    ...(isAdmin ? [
                                        { label: 'Fee Setup', icon: <ClipboardList className="w-5 h-5" />, section: 'fee-setup' as Section, color: 'violet' },
                                        { label: 'Generate Invoices', icon: <FileCheck className="w-5 h-5" />, section: 'fee-setup' as Section, color: 'blue', onClick: () => { setActiveSection('fee-setup'); setSetupStep(3); setShowInvoiceForm(true); } },
                                        { label: 'Pay Salary', icon: <Banknote className="w-5 h-5" />, section: 'salary' as Section, color: 'amber' },
                                    ] : []),
                                ].map(a => (
                                    <button key={a.label} onClick={() => { if ((a as any).onClick) (a as any).onClick(); else setActiveSection(a.section); }}
                                        className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all cursor-pointer text-left group">
                                        <div className={`p-2 rounded-xl ${a.color === 'emerald' ? 'bg-emerald-100 text-emerald-600' : a.color === 'blue' ? 'bg-blue-100 text-blue-600' : a.color === 'violet' ? 'bg-violet-100 text-violet-600' : 'bg-amber-100 text-amber-600'} group-hover:scale-110 transition-transform`}>{a.icon}</div>
                                        <span className="text-sm font-bold text-gray-800">{a.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Recent Payments */}
                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                            <div className="px-5 py-4 border-b flex items-center justify-between">
                                <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Recent Payments</h2>
                                <button onClick={() => setActiveSection('reports')} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 cursor-pointer">View All →</button>
                            </div>
                            {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>
                            : payments.slice(0, 5).length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">No payments yet</div>
                            : <div className="divide-y divide-gray-50">{payments.slice(0, 5).map(p => (
                                <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/50">
                                    <div><p className="text-sm font-bold text-gray-900">{p.student_name}</p><p className="text-xs text-gray-400">{p.fee_name} · {p.receipt_number}</p></div>
                                    <div className="text-right"><p className="text-sm font-bold text-emerald-600">₹{parseFloat(p.amount_paid).toLocaleString('en-IN')}</p><p className="text-xs text-gray-400">{new Date(p.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p></div>
                                </div>
                            ))}</div>}
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════ */}
                {/* SECTION 2: COLLECT FEE                                 */}
                {/* ═══════════════════════════════════════════════════════ */}
                {activeSection === 'collect' && (
                    <div className="space-y-5">
                        {/* Success / Error Message */}
                        {collectMsg && (
                            <div className={`p-4 rounded-xl flex items-start gap-3 text-sm ${collectMsg.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
                                {collectMsg.type === 'error' ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> : <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                                <div className="flex-1">
                                    <span>{collectMsg.text}</span>
                                    {collectMsg.type === 'success' && lastPaymentId && (
                                        <a href={`/receipt/${lastPaymentId}`} target="_blank" rel="noopener noreferrer"
                                            className="ml-2 inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 cursor-pointer no-underline">
                                            <Receipt className="w-3 h-3" /> Print Receipt
                                        </a>
                                    )}
                                </div>
                                <button onClick={() => { setCollectMsg(null); setLastPaymentId(null); }} className="cursor-pointer"><X className="w-4 h-4" /></button>
                            </div>
                        )}

                        {/* ─── Payment Form (when student selected) ─── */}
                        {collectStudent && (
                            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                                <h2 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2"><CreditCard className="w-5 h-5 text-emerald-600" /> Collect Fee Payment</h2>
                                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 mb-5">
                                    <div className="w-10 h-10 rounded-full bg-emerald-200 flex items-center justify-center text-sm font-bold text-emerald-800 shrink-0">{collectStudent.first_name?.[0]}{collectStudent.last_name?.[0]}</div>
                                    <div className="flex-1"><p className="font-bold text-gray-900">{collectStudent.first_name} {collectStudent.last_name}</p><p className="text-xs text-gray-500">Adm: {collectStudent.admission_number} · {collectStudent.class_name}</p></div>
                                    <button onClick={() => { setCollectStudent(null); setStudentInvoices([]); }} className="p-1.5 rounded-lg hover:bg-emerald-100 cursor-pointer"><X className="w-4 h-4 text-gray-400" /></button>
                                </div>

                                {/* Invoices */}
                                {studentInvoices.filter((inv: any) => inv.status !== 'paid' && inv.status !== 'void').length === 0 ? (
                                    <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl text-center text-sm text-amber-700 mb-5"><Info className="w-4 h-4 inline mr-1" /> No pending invoices for this student.</div>
                                ) : (
                                    <div className="space-y-2 mb-5">
                                        <label className="block text-sm font-bold text-gray-700">Select Invoice</label>
                                        {studentInvoices.filter((inv: any) => inv.status !== 'paid' && inv.status !== 'void').map((inv: any) => {
                                            const balance = parseFloat(inv.total_amount) - parseFloat(inv.paid_amount || '0');
                                            return (
                                                <label key={inv.id} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${collectForm.invoiceId === inv.id ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                                    <input type="radio" name="invoice" checked={collectForm.invoiceId === inv.id}
                                                        onChange={() => setCollectForm(f => ({ ...f, invoiceId: inv.id, amountPaid: String(balance) }))} className="accent-emerald-600" />
                                                    <div className="flex-1"><p className="text-sm font-bold text-gray-900">{inv.invoice_number}</p><p className="text-xs text-gray-500">Due: {new Date(inv.due_date).toLocaleDateString('en-IN')}</p></div>
                                                    <div className="text-right"><p className="text-sm font-bold text-red-600">₹{balance.toLocaleString('en-IN')}</p><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadge(inv.status)}`}>{inv.status.replace('_', ' ').toUpperCase()}</span></div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Payment form */}
                                {collectForm.invoiceId && (
                                    <div className="space-y-4 border-t border-gray-100 pt-5">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Amount (₹) *</label>
                                                <input type="number" value={collectForm.amountPaid} onChange={e => setCollectForm(f => ({ ...f, amountPaid: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" /></div>
                                            <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Mode</label>
                                                <select value={collectForm.paymentMode} onChange={e => setCollectForm(f => ({ ...f, paymentMode: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                                                    <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank Transfer</option><option value="cheque">Cheque</option><option value="card">Card</option></select></div>
                                        </div>
                                        <div><label className="block text-xs font-bold text-gray-600 mb-1.5">Remarks</label>
                                            <input type="text" value={collectForm.remarks} onChange={e => setCollectForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Cheque no., transaction ID, etc." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" /></div>
                                        <button onClick={handleCollect} disabled={collecting || !collectForm.amountPaid}
                                            className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer text-sm transition-all hover:shadow-xl">
                                            {collecting ? <><Loader2 className="w-4 h-4 animate-spin" /> Recording...</> : <><CheckCircle className="w-4 h-4" /> Record Payment</>}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── Quick Search Bar ─── */}
                        {!collectStudent && (
                            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                                <div className="relative">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="text" placeholder="🔍 Quick search: type student name or admission number..." value={collectSearch} onChange={e => searchStudents(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
                                    {collectResults.length > 0 && (
                                        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                                            {collectResults.map(s => (
                                                <button key={s.id} onClick={() => selectStudent(s)} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-b-0 cursor-pointer">
                                                    <p className="font-semibold text-gray-900 text-sm">{s.first_name} {s.last_name}</p>
                                                    <p className="text-xs text-gray-400">Adm: {s.admission_number} · {s.class_name}</p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ─── Browse by Class ─── */}
                        {!collectStudent && (
                            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
                                    <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2"><Users className="w-4 h-4 text-emerald-600" /> Browse by Class</h2>
                                    <div className="flex items-center gap-2 ml-auto">
                                        <select value={browseSession} onChange={e => { setBrowseSession(e.target.value); setBrowseClass(''); setBrowseStudents([]); }}
                                            className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white outline-none focus:ring-2 focus:ring-emerald-500 font-semibold">
                                            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' ✦' : ''}</option>)}
                                        </select>
                                        <select value={browseClass} onChange={e => handleBrowseClassChange(e.target.value)}
                                            className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white outline-none focus:ring-2 focus:ring-emerald-500 font-semibold min-w-[140px]">
                                            <option value="">Select Class...</option>
                                            {classSections.map((cs: any) => <option key={cs.id} value={cs.id}>{cs.display_name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {!browseClass ? (
                                    <div className="text-center py-12 text-gray-400">
                                        <School className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                        <p className="text-sm">Select a class to view students and their fee status</p>
                                    </div>
                                ) : browseLoading ? (
                                    <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>
                                ) : browseStudents.length === 0 ? (
                                    <div className="text-center py-12 text-gray-400">
                                        <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                        <p className="text-sm">No students found in this class</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Summary bar */}
                                        {(() => {
                                            const total = browseStudents.length;
                                            const paidCount = browseStudents.filter(s => s.status === 'paid').length;
                                            const partialCount = browseStudents.filter(s => s.status === 'partial').length;
                                            const unpaidCount = browseStudents.filter(s => s.status === 'unpaid').length;
                                            const noInvCount = browseStudents.filter(s => s.status === 'no_invoice').length;
                                            const totalCollected = browseStudents.reduce((s: number, st: any) => s + st.totalPaid, 0);
                                            const totalPending = browseStudents.reduce((s: number, st: any) => s + st.balance, 0);
                                            return (
                                                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-4 text-xs">
                                                    <span className="font-bold text-gray-600">{total} Students</span>
                                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> {paidCount} Paid</span>
                                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> {partialCount} Partial</span>
                                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> {unpaidCount} Unpaid</span>
                                                    {noInvCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300"></span> {noInvCount} No Invoice</span>}
                                                    <span className="ml-auto font-bold text-emerald-600">Collected: ₹{totalCollected.toLocaleString('en-IN')}</span>
                                                    {totalPending > 0 && <span className="font-bold text-red-600">Pending: ₹{totalPending.toLocaleString('en-IN')}</span>}
                                                </div>
                                            );
                                        })()}

                                        {/* Student list */}
                                        <div className="divide-y divide-gray-50">
                                            {browseStudents.map((s: any) => (
                                                <div key={s.id} className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors ${s.status === 'paid' ? 'opacity-60' : ''}`}>
                                                    {/* Avatar */}
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                                        s.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                                        s.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                                                        s.status === 'unpaid' ? 'bg-red-100 text-red-700' :
                                                        'bg-gray-100 text-gray-500'
                                                    }`}>{s.first_name?.[0]}{s.last_name?.[0]}</div>
                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-gray-900 text-sm truncate">{s.first_name} {s.last_name}</p>
                                                        <p className="text-[10px] text-gray-400">Adm: {s.admission_number || '—'}{s.roll_number ? ` · Roll: ${s.roll_number}` : ''}</p>
                                                    </div>
                                                    {/* Status */}
                                                    <div className="text-right shrink-0">
                                                        {s.status === 'paid' && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">✓ Paid</span>}
                                                        {s.status === 'partial' && <div><span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">⏳ ₹{s.balance.toLocaleString('en-IN')} due</span></div>}
                                                        {s.status === 'unpaid' && <div><span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">✗ ₹{s.balance.toLocaleString('en-IN')} due</span></div>}
                                                        {s.status === 'no_invoice' && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-400 border border-gray-200">No Invoice</span>}
                                                    </div>
                                                    {/* Action */}
                                                    <div className="shrink-0">
                                                        {(s.status === 'unpaid' || s.status === 'partial') ? (
                                                            <button onClick={() => selectStudent(s)}
                                                                className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 cursor-pointer transition-colors">
                                                                Pay
                                                            </button>
                                                        ) : s.status === 'paid' ? (
                                                            <span className="text-[10px] text-gray-400">—</span>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-400">—</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════ */}
                {/* SECTION 3: REPORTS (Payments + Defaulters)             */}
                {/* ═══════════════════════════════════════════════════════ */}
                {activeSection === 'reports' && (
                    <div className="space-y-5">
                        {/* Toggle */}
                        <div className="flex items-center gap-1 bg-white border border-gray-200 p-1 rounded-xl w-fit">
                            {([['payments', 'Payments', <Receipt className="w-4 h-4" />], ['defaulters', 'Defaulters', <AlertTriangle className="w-4 h-4" />]] as const).map(([id, label, icon]) => (
                                <button key={id} onClick={() => setReportView(id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all ${reportView === id ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{icon} {label}</button>
                            ))}
                        </div>

                        {reportView === 'payments' && (
                            <>
                                <div className="bg-white border border-gray-200 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Month</label>
                                        <input type="month" value={payDateFilter} onChange={e => setPayDateFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500" /></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Mode</label>
                                        <select value={payModeFilter} onChange={e => setPayModeFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none bg-white focus:ring-2 focus:ring-emerald-500">
                                            <option value="">All</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank Transfer</option><option value="cheque">Cheque</option></select></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Search</label>
                                        <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                            <input type="text" placeholder="Name, receipt #" value={paySearch} onChange={e => setPaySearch(e.target.value)} className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500" /></div></div>
                                </div>
                                <p className="text-sm text-gray-500">{filteredPayments.length} payments · ₹{filteredPayments.reduce((s, p) => s + parseFloat(p.amount_paid || '0'), 0).toLocaleString('en-IN')} total</p>
                                {filteredPayments.length === 0 ? (
                                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200"><Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 font-bold">No payments found</p></div>
                                ) : (
                                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm"><div className="overflow-x-auto"><table className="w-full text-sm text-left">
                                        <thead><tr className="bg-gray-50 border-b text-gray-500 font-bold text-xs uppercase"><th className="px-5 py-3">Receipt</th><th className="px-5 py-3">Student</th><th className="px-5 py-3">Fee</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3">Mode</th><th className="px-5 py-3">Date</th><th className="px-5 py-3 w-16"></th></tr></thead>
                                        <tbody className="divide-y divide-gray-50">{filteredPayments.map(p => (
                                            <tr key={p.id} className="hover:bg-gray-50/50">
                                                <td className="px-5 py-3 font-mono text-xs text-gray-500">{p.receipt_number || '—'}</td>
                                                <td className="px-5 py-3"><p className="font-bold text-gray-900">{p.student_name}</p><p className="text-xs text-gray-400">{p.admission_number}</p></td>
                                                <td className="px-5 py-3 text-xs text-gray-600">{p.fee_name}</td>
                                                <td className="px-5 py-3 text-right font-bold text-emerald-600">₹{parseFloat(p.amount_paid).toLocaleString('en-IN')}</td>
                                                <td className="px-5 py-3 text-xs text-gray-500 uppercase">{p.payment_mode?.replace('_', ' ')}</td>
                                                <td className="px-5 py-3 text-xs text-gray-500">{new Date(p.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                                <td className="px-5 py-3"><a href={`/receipt/${p.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-bold rounded-lg hover:bg-emerald-100 cursor-pointer transition-colors"><Receipt className="w-3 h-3" />Print</a></td>
                                            </tr>
                                        ))}</tbody>
                                    </table></div></div>
                                )}
                            </>
                        )}

                        {reportView === 'defaulters' && (
                            <>
                                <div className="flex items-center justify-between">
                                    <p className="text-sm text-gray-500">{defaulters.length} overdue students</p>
                                    <button onClick={loadDefaulters} disabled={defaultersLoading} className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 font-semibold rounded-xl text-sm hover:bg-gray-50 cursor-pointer disabled:opacity-50">
                                        {defaultersLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '↻'} Refresh
                                    </button>
                                </div>
                                {defaultersLoading ? <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-red-400 animate-spin" /></div>
                                : defaulters.length === 0 ? (
                                    <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200"><CheckCircle className="w-12 h-12 text-emerald-300 mx-auto mb-3" /><p className="text-gray-600 font-bold text-lg">No Defaulters! 🎉</p><p className="text-gray-400 text-sm mt-1">All invoices are paid or within due dates.</p></div>
                                ) : (
                                    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm"><div className="overflow-x-auto"><table className="w-full text-sm text-left">
                                        <thead><tr className="bg-red-50 border-b border-red-100 text-red-600 font-bold text-xs uppercase"><th className="px-5 py-3">Student</th><th className="px-5 py-3">Class</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3 text-right">Due</th><th className="px-5 py-3">Overdue</th></tr></thead>
                                        <tbody className="divide-y divide-gray-50">{defaulters.map((d, i) => (
                                            <tr key={i} className="hover:bg-red-50/30">
                                                <td className="px-5 py-3"><p className="font-bold text-gray-900">{d.student_name}</p><p className="text-xs text-gray-400">{d.admission_number}</p></td>
                                                <td className="px-5 py-3 text-sm text-gray-600">{d.class_name}</td>
                                                <td className="px-5 py-3 font-mono text-sm text-gray-600">{d.guardian_phone || '—'}</td>
                                                <td className="px-5 py-3 text-right font-bold text-red-600">₹{parseFloat(d.total_due || '0').toLocaleString('en-IN')}</td>
                                                <td className="px-5 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${d.overdue_days > 30 ? 'bg-red-100 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>{d.overdue_days} days</span></td>
                                            </tr>
                                        ))}</tbody>
                                    </table></div></div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════ */}
                {/* SECTION 4: FEE SETUP (vertical wizard)                 */}
                {/* ═══════════════════════════════════════════════════════ */}
                {activeSection === 'fee-setup' && isAdmin && (
                    <div className="space-y-5">
                        {setupMsg && (
                            <div className={`p-3 rounded-xl flex items-center gap-2 text-sm ${setupMsg.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
                                {setupMsg.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />} {setupMsg.text}
                                <button onClick={() => setSetupMsg(null)} className="ml-auto cursor-pointer"><X className="w-4 h-4" /></button>
                            </div>
                        )}

                        {/* Steps */}
                        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl p-4">
                            {([1, 2, 3] as const).map(n => (
                                <button key={n} onClick={() => setSetupStep(n)}
                                    className={`flex-1 flex items-center gap-2 p-3 rounded-xl text-sm font-semibold cursor-pointer transition-all ${setupStep === n ? 'bg-emerald-600 text-white shadow-md' : setupStep > n ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-400'}`}>
                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${setupStep === n ? 'bg-white text-emerald-600' : setupStep > n ? 'bg-emerald-200 text-emerald-800' : 'bg-gray-200 text-gray-500'}`}>{n}</span>
                                    <span className="hidden sm:inline">{n === 1 ? 'Fee Heads' : n === 2 ? 'Fee Groups' : 'Assign Students'}</span>
                                </button>
                            ))}
                        </div>

                        {/* Step 1: Fee Heads */}
                        {setupStep === 1 && (
                            <div className="bg-white border border-gray-200 rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div><h3 className="font-bold text-gray-900">Fee Heads</h3><p className="text-xs text-gray-500">Individual fee items your school charges (Tuition, Transport, Lab Fee, etc.)</p></div>
                                    <button onClick={openCreateHead} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-sm cursor-pointer hover:bg-emerald-700"><Plus className="w-4 h-4" />Add Head</button>
                                </div>
                                {feeHeads.length === 0 ? (
                                    <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl"><IndianRupee className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-gray-500 font-bold">No fee heads yet</p><p className="text-gray-400 text-xs mt-1">Create your first fee item — e.g. "Tuition Fee"</p></div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {feeHeads.map(h => (
                                            <div key={h.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                <div className="flex items-center gap-3"><div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><IndianRupee className="w-3.5 h-3.5" /></div>
                                                    <div><p className="font-bold text-gray-900 text-sm">{h.name}</p><p className="text-xs text-gray-500">{HEAD_CATEGORIES.find(c => c.value === h.category)?.label} {h.is_taxable ? `· ${h.tax_rate}% GST` : ''}</p></div></div>
                                                <div className="flex gap-1"><button onClick={() => openEditHead(h)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button><button onClick={() => deleteHead(h.id, h.name)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {feeHeads.length > 0 && <div className="mt-4 pt-4 border-t border-gray-100 text-right"><button onClick={() => setSetupStep(2)} className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm cursor-pointer hover:bg-emerald-700">Next: Create Groups →</button></div>}
                            </div>
                        )}

                        {/* Step 2: Fee Groups */}
                        {setupStep === 2 && (
                            <div className="bg-white border border-gray-200 rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div><h3 className="font-bold text-gray-900">Fee Groups</h3><p className="text-xs text-gray-500">Bundle multiple fee heads together — e.g. "Class 10 Day Scholar Package"</p></div>
                                    <button onClick={openCreateGroup} disabled={feeHeads.length === 0} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-sm cursor-pointer hover:bg-emerald-700 disabled:opacity-50"><Plus className="w-4 h-4" />Create Group</button>
                                </div>
                                {feeHeads.length === 0 && <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 mb-4"><Info className="w-4 h-4 inline mr-1" />Create fee heads first (Step 1) before making groups.</div>}
                                {feeGroups.length === 0 ? (
                                    <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl"><FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-gray-500 font-bold">No fee groups yet</p></div>
                                ) : (
                                    <div className="space-y-3">
                                        {feeGroups.map(g => (
                                            <div key={g.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div><h4 className="font-bold text-gray-900">{g.name}</h4>
                                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${g.apply_to === 'all' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : g.apply_to === 'specific_classes' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-violet-50 border-violet-200 text-violet-700'}`}>{g.apply_to === 'all' ? 'All Students' : g.apply_to === 'specific_classes' ? `${g.target_class_ids?.length || 0} Classes` : 'Individual'}</span>
                                                            {g.is_default && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-bold">⚡ Auto</span>}
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-gray-600 font-bold">{g.assigned_students || 0} students</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-lg font-bold text-emerald-600">₹{g.heads.reduce((s, h) => s + parseFloat(h.amount || '0'), 0).toLocaleString('en-IN')}</span>
                                                        <button onClick={() => openEditGroup(g)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 cursor-pointer"><Pencil className="w-4 h-4" /></button>
                                                        <button onClick={() => deleteGroup(g.id, g.name)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                                <div className="border-t border-gray-100 pt-2 space-y-1">{g.heads.map((h, i) => (
                                                    <div key={i} className="flex items-center justify-between text-sm"><span className="text-gray-600">{h.head_name}</span>
                                                        <div className="flex items-center gap-2"><span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded font-bold">{FREQUENCIES.find(f => f.value === h.frequency)?.label}</span><span className="font-bold text-gray-900">₹{parseFloat(h.amount).toLocaleString('en-IN')}</span></div></div>
                                                ))}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {feeGroups.length > 0 && <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between"><button onClick={() => setSetupStep(1)} className="px-5 py-2 text-gray-500 font-semibold text-sm cursor-pointer">← Back</button><button onClick={() => setSetupStep(3)} className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm cursor-pointer hover:bg-emerald-700">Next: Assign →</button></div>}
                            </div>
                        )}

                        {/* Step 3: Assign Students */}
                        {setupStep === 3 && (
                            <div className="bg-white border border-gray-200 rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div><h3 className="font-bold text-gray-900">Assign Groups to Students</h3><p className="text-xs text-gray-500">Link fee groups to students by class or individually</p></div>
                                    <button onClick={handleAutoAssign} disabled={assigning} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white font-bold rounded-xl text-sm cursor-pointer hover:bg-amber-600 disabled:opacity-50"><Zap className="w-4 h-4" /> Auto-Assign</button>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Session</label>
                                        <select value={assignSession} onChange={e => { setAssignSession(e.target.value); loadAssignments(e.target.value, assignClass); }} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">{sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (Current)' : ''}</option>)}</select></div>
                                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Class</label>
                                        <select value={assignClass} onChange={e => { setAssignClass(e.target.value); loadAssignments(assignSession, e.target.value); }} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500"><option value="">All Classes</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                                </div>
                                {selectedStudents.length > 0 && (
                                    <div className="bg-emerald-900 text-white p-3 rounded-xl flex items-center justify-between gap-3 mb-4">
                                        <span className="font-semibold text-sm">{selectedStudents.length} selected</span>
                                        <div className="flex items-center gap-2">
                                            <select value={assignGroupId} onChange={e => setAssignGroupId(e.target.value)} className="px-3 py-1.5 bg-emerald-800 border border-emerald-700 text-white rounded-lg text-xs outline-none"><option value="">Select Group</option>{feeGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
                                            <button onClick={handleAssignGroup} disabled={assigning || !assignGroupId} className="px-4 py-1.5 bg-white text-emerald-900 font-bold rounded-lg text-xs disabled:opacity-50 cursor-pointer">{assigning ? 'Assigning...' : 'Assign'}</button>
                                        </div>
                                    </div>
                                )}
                                {assignLoading ? <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
                                : assignments.length === 0 ? <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">No enrollments found.</div>
                                : <div className="overflow-x-auto border border-gray-200 rounded-xl"><table className="w-full text-sm text-left">
                                    <thead><tr className="bg-gray-50 border-b text-gray-500 font-bold text-xs uppercase"><th className="px-4 py-2.5 w-10"><input type="checkbox" checked={selectedStudents.length === assignments.length && assignments.length > 0} onChange={() => setSelectedStudents(selectedStudents.length === assignments.length ? [] : assignments.map(a => a.student_id))} className="accent-emerald-600 cursor-pointer" /></th><th className="px-4 py-2.5">Student</th><th className="px-4 py-2.5">Class</th><th className="px-4 py-2.5">Groups</th><th className="px-4 py-2.5 text-right">Est. Yearly</th></tr></thead>
                                    <tbody className="divide-y divide-gray-50">{assignments.map(a => (
                                        <tr key={a.student_id} className="hover:bg-gray-50/50">
                                            <td className="px-4 py-2.5"><input type="checkbox" checked={selectedStudents.includes(a.student_id)} onChange={() => setSelectedStudents(prev => prev.includes(a.student_id) ? prev.filter(id => id !== a.student_id) : [...prev, a.student_id])} className="accent-emerald-600 cursor-pointer" /></td>
                                            <td className="px-4 py-2.5"><p className="font-bold text-gray-900">{a.first_name} {a.last_name}</p><p className="text-[10px] text-gray-400">Adm: {a.admission_number}</p></td>
                                            <td className="px-4 py-2.5 text-xs text-gray-600">{a.class_name}</td>
                                            <td className="px-4 py-2.5">{a.assigned_groups?.length > 0 ? <div className="flex flex-wrap gap-1">{a.assigned_groups.map(g => <span key={g.fee_group_id} className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-semibold">{g.fee_group_name}</span>)}</div> : <span className="text-xs text-gray-400 italic">None</span>}</td>
                                            <td className="px-4 py-2.5 text-right font-bold text-gray-900">₹{a.estimated_yearly.toLocaleString('en-IN')}</td>
                                        </tr>
                                    ))}</tbody>
                                </table></div>}
                                <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                                    <button onClick={() => setSetupStep(2)} className="px-5 py-2 text-gray-500 font-semibold text-sm cursor-pointer">← Back to Groups</button>
                                    <button onClick={() => setShowInvoiceForm(f => !f)} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl text-sm cursor-pointer hover:bg-blue-700 transition-colors">
                                        <FileCheck className="w-4 h-4" />{showInvoiceForm ? 'Hide' : 'Generate Invoices'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Generate Invoices Card */}
                        {showInvoiceForm && (
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-5">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2.5 bg-blue-600 text-white rounded-xl"><FileCheck className="w-5 h-5" /></div>
                                    <div><h3 className="font-bold text-gray-900">Generate Invoices</h3><p className="text-xs text-gray-500">Create billing invoices for students who have fee groups assigned</p></div>
                                </div>
                                {invoiceMsg && (
                                    <div className={`p-3 rounded-xl flex items-center gap-2 text-sm mb-4 ${invoiceMsg.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
                                        {invoiceMsg.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />} {invoiceMsg.text}
                                        <button onClick={() => setInvoiceMsg(null)} className="ml-auto cursor-pointer"><X className="w-4 h-4" /></button>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Session</label>
                                        <select value={assignSession} onChange={e => setAssignSession(e.target.value)} className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                                            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (Current)' : ''}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Class (optional)</label>
                                        <select value={invoiceClassFilter} onChange={e => setInvoiceClassFilter(e.target.value)} className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                                            <option value="">All Classes</option>
                                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Due Date *</label>
                                        <input type="date" value={invoiceDueDate} onChange={e => setInvoiceDueDate(e.target.value)}
                                            className="w-full px-3 py-2.5 border border-blue-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" />
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={handleGenerateInvoices} disabled={generatingInvoices || !assignSession || !invoiceDueDate}
                                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl text-sm cursor-pointer hover:bg-blue-700 disabled:opacity-50 transition-all">
                                        {generatingInvoices ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</> : <><FileCheck className="w-4 h-4" />Generate Invoices</>}
                                    </button>
                                    <p className="text-xs text-gray-500">This creates unpaid invoices based on assigned fee groups. Students can then pay online or you can collect manually.</p>
                                </div>
                            </div>
                        )}

                        {/* Head Form Modal */}
                        {showHeadForm && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
                                    <div className="flex items-center justify-between mb-5"><h2 className="text-lg font-bold">{editHeadId ? 'Edit' : 'Create'} Fee Head</h2><button onClick={() => setShowHeadForm(false)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X className="w-5 h-5 text-gray-400" /></button></div>
                                    <div className="space-y-4">
                                        <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Name *</label><input type="text" value={headForm.name} onChange={e => setHeadForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Tuition Fee" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" /></div>
                                        <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Category</label><select value={headForm.category} onChange={e => setHeadForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">{HEAD_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                                        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl"><input type="checkbox" id="taxable" checked={headForm.isTaxable} onChange={e => setHeadForm(f => ({ ...f, isTaxable: e.target.checked }))} className="accent-emerald-600 cursor-pointer" /><label htmlFor="taxable" className="text-sm font-semibold text-gray-700 cursor-pointer">Taxable (GST)</label>
                                            {headForm.isTaxable && <input type="number" value={headForm.taxRate} onChange={e => setHeadForm(f => ({ ...f, taxRate: e.target.value }))} placeholder="%" className="w-20 ml-auto px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none" />}</div>
                                    </div>
                                    <div className="flex gap-3 mt-6"><button onClick={() => setShowHeadForm(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl text-sm cursor-pointer">Cancel</button><button onClick={saveHead} disabled={savingHead} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl text-sm disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">{savingHead ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{savingHead ? 'Saving...' : 'Save'}</button></div>
                                </div>
                            </div>
                        )}

                        {/* Group Form Modal */}
                        {showGroupForm && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                                    <div className="flex items-center justify-between mb-5"><h2 className="text-lg font-bold">{editGroupId ? 'Edit' : 'Create'} Fee Group</h2><button onClick={() => setShowGroupForm(false)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X className="w-5 h-5 text-gray-400" /></button></div>
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Group Name *</label><input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Class 10 Package" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" /></div>
                                            <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label><input type="text" value={groupDesc} onChange={e => setGroupDesc(e.target.value)} placeholder="Optional" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" /></div>
                                        </div>
                                        {/* Applies To */}
                                        <div><label className="block text-sm font-bold text-gray-700 mb-2">Applies To</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {[{ v: 'all', l: 'All Students', i: '🌐' }, { v: 'specific_classes', l: 'By Class', i: '🏫' }, { v: 'individual', l: 'Individual', i: '👤' }].map(o => (
                                                    <button key={o.v} type="button" onClick={() => setGroupApplyTo(o.v as any)} className={`p-3 rounded-xl border-2 text-left cursor-pointer transition-all ${groupApplyTo === o.v ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                                                        <span className="text-lg">{o.i}</span><p className="text-xs font-bold text-gray-800 mt-1">{o.l}</p>
                                                    </button>
                                                ))}
                                            </div>
                                            {groupApplyTo === 'specific_classes' && <div className="mt-3 flex flex-wrap gap-2">{classes.map(c => (
                                                <button key={c.id} type="button" onClick={() => setGroupTargetClasses(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${groupTargetClasses.includes(c.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>{c.name}</button>
                                            ))}</div>}
                                        </div>
                                        {/* Auto-assign toggle */}
                                        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl"><input type="checkbox" id="isDefault" checked={groupIsDefault} onChange={e => setGroupIsDefault(e.target.checked)} className="accent-amber-600 cursor-pointer" /><label htmlFor="isDefault" className="text-xs font-bold text-gray-700 cursor-pointer">⚡ Auto-assign to new enrollments</label></div>
                                        {/* Fee items */}
                                        <div><div className="flex items-center justify-between mb-2"><label className="text-sm font-bold text-gray-700">Fee Items</label><button type="button" onClick={() => setGroupHeadRows(r => [...r, { feeHeadId: '', amount: '', frequency: 'monthly' }])} className="text-xs font-bold text-emerald-600 cursor-pointer"><Plus className="w-3 h-3 inline" /> Add Row</button></div>
                                            <div className="space-y-2">{groupHeadRows.map((row, idx) => (
                                                <div key={idx} className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                                                    <select value={row.feeHeadId} onChange={e => { const r = [...groupHeadRows]; r[idx].feeHeadId = e.target.value; setGroupHeadRows(r); }} className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white outline-none"><option value="">Select Head</option>{feeHeads.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
                                                    <input type="number" value={row.amount} onChange={e => { const r = [...groupHeadRows]; r[idx].amount = e.target.value; setGroupHeadRows(r); }} placeholder="₹" className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none" />
                                                    <select value={row.frequency} onChange={e => { const r = [...groupHeadRows]; r[idx].frequency = e.target.value; setGroupHeadRows(r); }} className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white outline-none">{FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
                                                    {groupHeadRows.length > 1 && <button type="button" onClick={() => setGroupHeadRows(r => r.filter((_, i) => i !== idx))} className="p-1 text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>}
                                                </div>
                                            ))}</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100"><button onClick={() => setShowGroupForm(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl text-sm cursor-pointer">Cancel</button><button onClick={saveGroup} disabled={savingGroup} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl text-sm disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">{savingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{savingGroup ? 'Saving...' : 'Save'}</button></div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════ */}
                {/* SECTION 5: SALARY & CHARGES                            */}
                {/* ═══════════════════════════════════════════════════════ */}
                {activeSection === 'salary' && (
                    <div className="space-y-6">
                        {/* Sub-tab Navigation */}
                        <div className="flex gap-2 border-b border-gray-200 pb-3">
                            <button
                                onClick={() => setSalarySubTab('payroll')}
                                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                    salarySubTab === 'payroll' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                📋 Staff Payroll
                            </button>
                            <button
                                onClick={() => setSalarySubTab('history')}
                                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                    salarySubTab === 'history' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                💰 Payment History
                            </button>
                            <button
                                onClick={() => setSalarySubTab('billing')}
                                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                    salarySubTab === 'billing' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                🏢 System Charges
                            </button>
                        </div>

                        {/* SUB-TAB 1: STAFF PAYROLL */}
                        {salarySubTab === 'payroll' && (
                            <div className="space-y-6">
                                {/* Stats */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs text-gray-500">Active Staff</p><p className="text-xl font-bold text-blue-600 mt-1">{salaryStructures.filter(s => s.is_active).length}</p></div>
                                    <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs text-gray-500">Monthly Payroll Bill</p><p className="text-xl font-bold text-violet-600 mt-1">₹{monthlyBill.toLocaleString('en-IN')}</p></div>
                                    <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs text-gray-500">Paid This Month</p><p className="text-xl font-bold text-emerald-600 mt-1">{salaryPayments.filter(p => p.month === payMonth && p.status === 'paid').length}</p></div>
                                    <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs text-gray-500">Total Paid (All Time)</p><p className="text-xl font-bold text-amber-600 mt-1">₹{salaryPayments.filter(p => p.status === 'paid').reduce((s, p) => s + parseFloat(p.net_amount || '0'), 0).toLocaleString('en-IN')}</p></div>
                                </div>

                                {/* Filter & Search */}
                                <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap gap-4 items-center justify-between">
                                    <div className="flex flex-wrap gap-1.5">
                                        {[
                                            { value: 'all', label: 'All Staff' },
                                            { value: 'teacher', label: 'Teachers' },
                                            { value: 'accountant', label: 'Accountants' },
                                            { value: 'super_admin', label: 'Administrators' }
                                        ].map(chip => (
                                            <button
                                                key={chip.value}
                                                onClick={() => setPayrollRoleFilter(chip.value as any)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                                    payrollRoleFilter === chip.value
                                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm'
                                                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                                }`}
                                            >
                                                {chip.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <input type="month" value={payMonth} onChange={e => setPayMonth(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                                        {isAdmin && (
                                            <button onClick={openCreateSalary} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-sm cursor-pointer hover:bg-emerald-700">
                                                <Plus className="w-4 h-4" /> Add Staff
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Staff Payroll List */}
                                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                    {salaryLoading ? (
                                        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
                                    ) : salaryStructures.length === 0 ? (
                                        <div className="text-center py-12 text-gray-400 text-sm">No salary structures yet. {isAdmin && 'Click "Add Staff" to create one.'}</div>
                                    ) : (
                                        <div className="divide-y divide-gray-50">
                                            {salaryStructures
                                                .filter(s => payrollRoleFilter === 'all' || s.role_target === payrollRoleFilter)
                                                .map(s => {
                                                    const alreadyPaid = salaryPayments.some(p => p.user_id === s.user_id && p.month === payMonth && p.status === 'paid');
                                                    return (
                                                        <div key={s.id} className="px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="font-bold text-gray-900">{s.staff_name}</p>
                                                                    {!s.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold">Inactive</span>}
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-550 border border-gray-150 capitalize font-medium">{s.role_target}</span>
                                                                </div>
                                                                <p className="text-xs text-gray-500">{s.designation || 'No Designation Set'}</p>
                                                                <div className="flex gap-1.5 mt-1 flex-wrap">
                                                                    <span className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded font-medium">Base: ₹{parseFloat(s.base_salary).toLocaleString('en-IN')}</span>
                                                                    {Object.entries(s.allowances || {}).map(([k, v]) => <span key={k} className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded font-medium">+{k}: ₹{Number(v).toLocaleString('en-IN')}</span>)}
                                                                    {Object.entries(s.deductions || {}).map(([k, v]) => <span key={k} className="text-[10px] px-2 py-0.5 bg-red-50 text-red-600 rounded font-medium">-{k}: ₹{Number(v).toLocaleString('en-IN')}</span>)}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-3 shrink-0">
                                                                <div className="text-right">
                                                                    <p className="font-bold text-emerald-600 text-lg">₹{parseFloat(s.net_salary).toLocaleString('en-IN')}</p>
                                                                    <p className="text-[10px] text-gray-400">net / month</p>
                                                                </div>
                                                                {alreadyPaid ? (
                                                                    <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl">✓ Paid</span>
                                                                ) : (
                                                                    s.is_active && (
                                                                        <button onClick={() => handlePaySalary(s)} disabled={payingId === s.id} className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 cursor-pointer flex items-center gap-1.5">
                                                                            {payingId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Banknote className="w-3.5 h-3.5" />} Pay
                                                                        </button>
                                                                    )
                                                                )}
                                                                {isAdmin && (
                                                                    <button onClick={() => openEditSalary(s)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 cursor-pointer">
                                                                        <Edit3 className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* SUB-TAB 2: PAYMENT HISTORY */}
                        {salarySubTab === 'history' && (
                            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                <div className="px-5 py-4 border-b flex items-center justify-between">
                                    <div>
                                        <h3 className="font-bold text-gray-900">Salary Payment History</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">Filter payments by month and search staff members</p>
                                    </div>
                                    <input type="month" value={payMonth} onChange={e => setPayMonth(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                                </div>
                                {salaryPayments.filter(p => p.month === payMonth).length === 0 ? (
                                    <div className="p-10 text-center text-gray-400 text-sm">
                                        No salary payments found for {payMonth}.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm text-gray-600">
                                            <thead className="bg-gray-50/70 text-gray-700 text-xs uppercase font-bold border-b">
                                                <tr>
                                                    <th className="px-6 py-3.5">Staff Name</th>
                                                    <th className="px-6 py-3.5">Month</th>
                                                    <th className="px-6 py-3.5">Net Paid</th>
                                                    <th className="px-6 py-3.5">Payment Mode</th>
                                                    <th className="px-6 py-3.5">Reference No</th>
                                                    <th className="px-6 py-3.5">Date Paid</th>
                                                    <th className="px-6 py-3.5">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {salaryPayments
                                                    .filter(p => p.month === payMonth)
                                                    .map(p => (
                                                        <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                                                            <td className="px-6 py-4 font-semibold text-gray-900">{p.staff_name}</td>
                                                            <td className="px-6 py-4">{p.month}</td>
                                                            <td className="px-6 py-4 font-bold text-emerald-600">₹{parseFloat(p.net_amount).toLocaleString('en-IN')}</td>
                                                            <td className="px-6 py-4 capitalize">{p.payment_mode?.replace('_', ' ')}</td>
                                                            <td className="px-6 py-4 font-mono text-xs">{p.reference_number || '—'}</td>
                                                            <td className="px-6 py-4">{new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                                                            <td className="px-6 py-4">
                                                                <button
                                                                    onClick={() => router.push(`/payslip/${p.id}`)}
                                                                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-bold"
                                                                >
                                                                    <FileText className="w-3.5 h-3.5" /> Payslip
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* SUB-TAB 3: SYSTEM CHARGES */}
                        {salarySubTab === 'billing' && (
                            <div className="space-y-6">
                                {/* Billing Overview */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Gateway Status</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <div className={`w-2.5 h-2.5 rounded-full ${gatewayStatus === 'configured' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                            <p className="text-base font-bold text-gray-900">{gatewayStatus === 'configured' ? 'Online Gateway Connected' : 'Gateway Not Connected'}</p>
                                        </div>
                                        <p className="text-xs text-gray-505 mt-2">Platform payments use secure payment interfaces.</p>
                                    </div>
                                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                                        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Unpaid Charges</p>
                                        <p className="text-2xl font-black text-amber-600 mt-1">₹{platformCharges.filter(c => c.status !== 'paid').reduce((sum, c) => sum + parseFloat(c.total_amount || '0'), 0).toLocaleString('en-IN')}</p>
                                        <p className="text-xs text-gray-505 mt-1">Please pay outstanding invoices on time.</p>
                                    </div>
                                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm bg-gradient-to-br from-slate-900 to-slate-800 text-white">
                                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Developer Support</p>
                                        <p className="text-lg font-bold mt-1 text-slate-100">Need customizations?</p>
                                        <p className="text-xs text-slate-300 mt-1.5">For manual configuration changes, contact platform developer support.</p>
                                    </div>
                                </div>

                                {/* Platform Charge Outstanding Alert */}
                                {pendingCharge && (
                                    <div className="p-5 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                                        <div className="flex items-start gap-3.5">
                                            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-sm font-black text-amber-900">System Subscription Fee Due</p>
                                                <p className="text-xs text-amber-700 mt-0.5">
                                                    {pendingCharge.description || `Platform Subscription Charges for ${pendingCharge.billing_month}`}
                                                </p>
                                                <p className="text-[11px] text-amber-600 mt-0.5">Due Date: {pendingCharge.due_date ? new Date(pendingCharge.due_date).toLocaleDateString('en-IN') : '—'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-2xl font-black text-amber-800">₹{parseFloat(pendingCharge.total_amount || '0').toLocaleString('en-IN')}</span>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handlePayPlatformOnline(pendingCharge)}
                                                    disabled={payingPlatformOnlineId === pendingCharge.id}
                                                    className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                                                >
                                                    {payingPlatformOnlineId === pendingCharge.id ? <Loader2 className="w-3 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} Pay Online
                                                </button>
                                                <button
                                                    onClick={() => { setSelectedPlatformCharge(pendingCharge); setPlatformOfflineModal(true); }}
                                                    className="px-4 py-2 bg-white text-slate-800 border border-gray-300 text-xs font-bold rounded-xl hover:bg-gray-50 shadow-sm transition-all cursor-pointer"
                                                >
                                                    Pay Offline
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Billing Records Table */}
                                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                    <div className="px-5 py-4 border-b">
                                        <h3 className="font-bold text-gray-900">Platform Billing History</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">Records of all platform billing and subscription charges</p>
                                    </div>
                                    {platformCharges.length === 0 ? (
                                        <div className="p-10 text-center text-gray-400 text-sm">
                                            No platform billing records found.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-sm text-gray-600">
                                                <thead className="bg-gray-50/70 text-gray-700 text-xs uppercase font-bold border-b">
                                                    <tr>
                                                        <th className="px-6 py-3.5">Billing Month</th>
                                                        <th className="px-6 py-3.5">Description</th>
                                                        <th className="px-6 py-3.5">Method/Model</th>
                                                        <th className="px-6 py-3.5">Total Amount</th>
                                                        <th className="px-6 py-3.5">Status</th>
                                                        <th className="px-6 py-3.5">Payment Date</th>
                                                        <th className="px-6 py-3.5">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {platformCharges.map(c => (
                                                        <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                                                            <td className="px-6 py-4 font-semibold text-gray-900">{c.billing_month}</td>
                                                            <td className="px-6 py-4 text-xs text-gray-500">{c.description || 'System Subscription Charges'}</td>
                                                            <td className="px-6 py-4 capitalize text-xs">
                                                                {c.payment_mode === 'online' ? 'Online Gateway' : c.payment_mode === 'offline' ? 'Offline Marked' : `${c.charge_model?.replace('_', ' ')}`}
                                                            </td>
                                                            <td className="px-6 py-4 font-bold text-gray-900">₹{parseFloat(c.total_amount).toLocaleString('en-IN')}</td>
                                                            <td className="px-6 py-4">
                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                                    c.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                                                                    c.status === 'overdue' ? 'bg-red-100 text-red-700' :
                                                                    'bg-amber-100 text-amber-700'
                                                                }`}>
                                                                    {c.status === 'paid' ? '✓ Paid' : c.status === 'overdue' ? '⚠ Overdue' : '⏳ Pending'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 text-xs text-gray-505">
                                                                {c.payment_date ? new Date(c.payment_date).toLocaleDateString('en-IN') : '—'}
                                                            </td>
                                                            <td className="px-6 py-4 text-xs">
                                                                {c.status === 'paid' ? (
                                                                    <button
                                                                        onClick={() => router.push(`/billing-receipt/${c.id}`)}
                                                                        className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-bold cursor-pointer"
                                                                    >
                                                                        <FileText className="w-3.5 h-3.5" /> Receipt
                                                                    </button>
                                                                ) : (
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            onClick={() => handlePayPlatformOnline(c)}
                                                                            disabled={payingPlatformOnlineId === c.id}
                                                                            className="px-2.5 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-lg hover:bg-slate-800 flex items-center gap-1 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                                                                        >
                                                                            {payingPlatformOnlineId === c.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5" />} Pay Online
                                                                        </button>
                                                                        <button
                                                                            onClick={() => { setSelectedPlatformCharge(c); setPlatformOfflineModal(true); }}
                                                                            className="px-2.5 py-1 bg-white text-slate-800 border border-gray-300 text-[10px] font-bold rounded-lg hover:bg-gray-50 shadow-sm transition-all cursor-pointer"
                                                                        >
                                                                            Pay Offline
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Salary Structure Modal */}
                        {showSalaryModal && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                                    <div className="flex items-center justify-between mb-5 border-b border-gray-100 pb-4">
                                        <h2 className="text-lg font-bold">{editingSalary ? 'Edit' : 'Create'} Salary Structure</h2>
                                        <button onClick={() => setShowSalaryModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
                                            <X className="w-5 h-5 text-gray-400" />
                                        </button>
                                    </div>
                                    <div className="space-y-4">
                                        {/* Staff search */}
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Staff Member *</label>
                                            {selectedSalaryStaff ? (
                                                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                                                    <div className="w-8 h-8 rounded-full bg-emerald-200 flex items-center justify-center text-xs font-bold text-emerald-800">
                                                        {selectedSalaryStaff.first_name?.[0]}{selectedSalaryStaff.last_name?.[0]}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-semibold">{selectedSalaryStaff.first_name} {selectedSalaryStaff.last_name}</p>
                                                        <p className="text-xs text-gray-500">{selectedSalaryStaff.email}</p>
                                                    </div>
                                                    <button onClick={() => { setSelectedSalaryStaff(null); setSalaryForm(f => ({ ...f, userId: '' })); }} className="p-1 cursor-pointer">
                                                        <X className="w-4 h-4 text-gray-400" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        placeholder="Search staff..."
                                                        value={salaryStaffSearch}
                                                        onChange={e => searchSalaryStaff(e.target.value)}
                                                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                                                    />
                                                    {salaryStaffResults.length > 0 && (
                                                        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                                            {salaryStaffResults.map(s => (
                                                                <button
                                                                    key={s.id}
                                                                    onClick={() => { setSelectedSalaryStaff(s); setSalaryForm(f => ({ ...f, userId: s.id })); setSalaryStaffResults([]); }}
                                                                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b last:border-b-0 cursor-pointer"
                                                                >
                                                                    <span className="font-semibold">{s.first_name} {s.last_name}</span>
                                                                    <span className="text-gray-400 ml-2 text-xs">{s.role}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Designation</label>
                                                <input
                                                    type="text"
                                                    value={salaryForm.designation}
                                                    onChange={e => setSalaryForm(f => ({ ...f, designation: e.target.value }))}
                                                    placeholder="e.g. Senior Teacher"
                                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Base Salary (₹) *</label>
                                                <input
                                                    type="number"
                                                    value={salaryForm.baseSalary}
                                                    onChange={e => setSalaryForm(f => ({ ...f, baseSalary: e.target.value }))}
                                                    placeholder="25000"
                                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                                                />
                                            </div>
                                        </div>
                                        {/* Allowances */}
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Allowances (+)</label>
                                            <div className="space-y-2">
                                                {Object.entries(salaryForm.allowances).map(([k, v]) => (
                                                    <div key={k} className="flex items-center gap-2">
                                                        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg min-w-[60px] text-center">{k}</span>
                                                        <input
                                                            type="number"
                                                            value={v}
                                                            onChange={e => setSalaryForm(f => ({ ...f, allowances: { ...f.allowances, [k]: e.target.value } }))}
                                                            className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none"
                                                        />
                                                        <button
                                                            onClick={() => { const { [k]: _, ...rest } = salaryForm.allowances; setSalaryForm(f => ({ ...f, allowances: rest })); }}
                                                            className="p-1 text-red-400 hover:text-red-650 cursor-pointer"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. HRA, DA"
                                                        value={newAllowanceKey}
                                                        onChange={e => setNewAllowanceKey(e.target.value)}
                                                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none"
                                                    />
                                                    <button
                                                        onClick={() => { if (newAllowanceKey.trim()) { setSalaryForm(f => ({ ...f, allowances: { ...f.allowances, [newAllowanceKey.trim()]: '0' } })); setNewAllowanceKey(''); } }}
                                                        className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg cursor-pointer"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Deductions */}
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Deductions (-)</label>
                                            <div className="space-y-2">
                                                {Object.entries(salaryForm.deductions).map(([k, v]) => (
                                                    <div key={k} className="flex items-center gap-2">
                                                        <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-lg min-w-[60px] text-center">{k}</span>
                                                        <input
                                                            type="number"
                                                            value={v}
                                                            onChange={e => setSalaryForm(f => ({ ...f, deductions: { ...f.deductions, [k]: e.target.value } }))}
                                                            className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm outline-none"
                                                        />
                                                        <button
                                                            onClick={() => { const { [k]: _, ...rest } = salaryForm.deductions; setSalaryForm(f => ({ ...f, deductions: rest })); }}
                                                            className="p-1 text-red-400 hover:text-red-650 cursor-pointer"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. PF, Tax"
                                                        value={newDeductionKey}
                                                        onChange={e => setNewDeductionKey(e.target.value)}
                                                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none"
                                                    />
                                                    <button
                                                        onClick={() => { if (newDeductionKey.trim()) { setSalaryForm(f => ({ ...f, deductions: { ...f.deductions, [newDeductionKey.trim()]: '0' } })); setNewDeductionKey(''); } }}
                                                        className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-semibold rounded-lg cursor-pointer"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Net */}
                                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                                            <p className="text-xs text-emerald-600 font-medium mb-1">Net Salary (Auto)</p>
                                            <p className="text-2xl font-bold text-emerald-700">₹{parseFloat(salaryForm.netSalary || '0').toLocaleString('en-IN')}</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Effective From</label>
                                            <input
                                                type="date"
                                                value={salaryForm.effectiveFrom}
                                                onChange={e => setSalaryForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                                        <button onClick={() => setShowSalaryModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl text-sm cursor-pointer">
                                            Cancel
                                        </button>
                                        <button
                                            onClick={saveSalaryStructure}
                                            disabled={savingSalary}
                                            className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl text-sm disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                                        >
                                            {savingSalary ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            {savingSalary ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Platform Billing Offline Payment Modal */}
                        {showPlatformOfflineModal && selectedPlatformCharge && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
                                    <h3 className="text-lg font-bold text-gray-900 mb-1">Mark System Charge Paid</h3>
                                    <p className="text-xs text-gray-500 mb-5 flex items-center gap-1">
                                        Billing Month: {selectedPlatformCharge.billing_month} · Amount: ₹{parseFloat(selectedPlatformCharge.total_amount).toLocaleString('en-IN')}
                                    </p>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Payment Mode</label>
                                            <select
                                                value={platformOfflinePaymentMode}
                                                onChange={e => setPlatformOfflinePaymentMode(e.target.value)}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 bg-white"
                                            >
                                                <option value="cash">Cash</option>
                                                <option value="bank_transfer">Bank Transfer</option>
                                                <option value="upi">UPI</option>
                                                <option value="cheque">Cheque</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Reference Number</label>
                                            <input
                                                type="text"
                                                value={platformOfflineReference}
                                                onChange={e => setPlatformOfflineReference(e.target.value)}
                                                placeholder="Transaction ID, reference, etc."
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Payment Date</label>
                                            <input
                                                type="date"
                                                value={platformOfflinePaymentDate}
                                                onChange={e => setPlatformOfflinePaymentDate(e.target.value)}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-2 mt-6">
                                        <button
                                            onClick={() => { setPlatformOfflineModal(false); setSelectedPlatformCharge(null); }}
                                            className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold transition-all border border-gray-150 cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handlePayPlatformOffline}
                                            disabled={payingPlatformOffline}
                                            className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
                                        >
                                            {payingPlatformOffline ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                            {payingPlatformOffline ? 'Confirming...' : 'Confirm Payment'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════ */}
                {/* SECTION 6: SETTINGS                                    */}
                {/* ═══════════════════════════════════════════════════════ */}
                {activeSection === 'settings' && isAdmin && (
                    <div className="max-w-2xl mx-auto space-y-5">
                        {settingsMsg && (
                            <div className={`p-3 rounded-xl flex items-center gap-2 text-sm ${settingsMsg.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
                                {settingsMsg.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />} {settingsMsg.text}
                                <button onClick={() => setSettingsMsg(null)} className="ml-auto cursor-pointer"><X className="w-4 h-4" /></button>
                            </div>
                        )}

                        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
                            <h2 className="font-bold text-gray-900 text-lg">Fee Configuration</h2>
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                                <div><p className="font-bold text-gray-800">Late Fee Penalty</p><p className="text-xs text-gray-500 mt-0.5">Auto-apply late fees after grace period</p></div>
                                <button onClick={() => setLateFeeEnabled(v => !v)} className="cursor-pointer">{lateFeeEnabled ? <ToggleRight className="w-9 h-9 text-emerald-500" /> : <ToggleLeft className="w-9 h-9 text-gray-300" />}</button>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                                <div><p className="font-bold text-gray-800">Fee Concessions</p><p className="text-xs text-gray-500 mt-0.5">Allow discounts for specific students</p></div>
                                <button onClick={() => setConcessionEnabled(v => !v)} className="cursor-pointer">{concessionEnabled ? <ToggleRight className="w-9 h-9 text-emerald-500" /> : <ToggleLeft className="w-9 h-9 text-gray-300" />}</button>
                            </div>
                            <button onClick={saveSettings} disabled={savingSettings} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl text-sm disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 hover:bg-emerald-700">
                                {savingSettings ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save Settings</>}
                            </button>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-2xl p-6">
                            <h2 className="font-bold text-gray-900 text-lg mb-4">Payment Gateway</h2>
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                                <div><p className="font-bold text-gray-800">Razorpay</p><p className="text-xs text-gray-500 mt-0.5">Status: <span className={`font-bold ${gatewayStatus === 'configured' ? 'text-emerald-600' : 'text-amber-600'}`}>{gatewayStatus || 'Checking...'}</span></p></div>
                                <button onClick={() => router.push('/settings/payment-gateway')} className="px-4 py-2 border border-gray-200 text-gray-600 font-semibold rounded-xl text-sm hover:bg-gray-50 cursor-pointer">Configure →</button>
                            </div>
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}
