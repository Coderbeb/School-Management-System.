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
    // Quick Pay (no-invoice payment)
    const [showQuickPay, setShowQuickPay] = useState(false);
    const [quickPayForm, setQuickPayForm] = useState({ studentId: '', description: '', amount: '', feeHeadId: '', paymentMode: 'cash', remarks: '' });
    const [quickPaySearch, setQuickPaySearch] = useState('');
    const [quickPayResults, setQuickPayResults] = useState<any[]>([]);
    const [quickPayStudent, setQuickPayStudent] = useState<any>(null);
    const [quickPayProcessing, setQuickPayProcessing] = useState(false);
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
    const [setupStep, setSetupStep] = useState<1 | 2 | 3 | 4>(1);
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
    const [assignSummary, setAssignSummary] = useState<any>({ total: 0, assigned: 0, unassigned: 0, estimatedMonthly: 0, estimatedYearly: 0 });
    const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);
    const [assignViewMode, setAssignViewMode] = useState<'matrix' | 'individual'>('matrix');
    const [matrixAssigning, setMatrixAssigning] = useState(false);
    const [copyingSession, setCopyingSession] = useState(false);

    // ── Invoice Generation ──
    const [showInvoiceForm, setShowInvoiceForm] = useState(false);
    const [invoiceDueDate, setInvoiceDueDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 15); return d.toISOString().split('T')[0]; });
    const [invoiceClassFilter, setInvoiceClassFilter] = useState('');
    const [invoiceGroupFilter, setInvoiceGroupFilter] = useState('');
    const [billingMonth, setBillingMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [generatingInvoices, setGeneratingInvoices] = useState(false);
    const [invoiceMsg, setInvoiceMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [invoicePreview, setInvoicePreview] = useState<any>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [billingCalendar, setBillingCalendar] = useState<any[]>([]);
    const [invoiceSummary, setInvoiceSummary] = useState<any>({});
    const [selectedCalendarMonth, setSelectedCalendarMonth] = useState<string | null>(null);

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
    const [editStudent, setEditStudent] = useState<any>(null);
    const [editStudentGroups, setEditStudentGroups] = useState<string[]>([]);
    const [platformOfflinePaymentMode, setPlatformOfflinePaymentMode] = useState('cash');
    const [platformOfflineReference, setPlatformOfflineReference] = useState('');
    const [platformOfflinePaymentDate, setPlatformOfflinePaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [payingPlatformOffline, setPayingPlatformOffline] = useState(false);
    const [payingPlatformOnlineId, setPayingPlatformOnlineId] = useState<string | null>(null);

    // ── Settings ──
    const [lateFeeEnabled, setLateFeeEnabled] = useState(false);
    const [concessionEnabled, setConcessionEnabled] = useState(false);
    const [autoInvoiceEnabled, setAutoInvoiceEnabled] = useState(false);
    const [autoInvoiceDay, setAutoInvoiceDay] = useState(1);
    const [gatewayStatus, setGatewayStatus] = useState('');
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // ── Step 4: Invoices ──
    const [unpaidInvoices, setUnpaidInvoices] = useState<any[]>([]);
    const [unpaidInvoicesLoading, setUnpaidInvoicesLoading] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [bulkDeleteTarget, setBulkDeleteTarget] = useState<'all' | 'class' | 'student'>('all');
    const [bulkDeleteClassId, setBulkDeleteClassId] = useState('');
    const [bulkDeleteStudentId, setBulkDeleteStudentId] = useState('');
    const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
    const [invoiceTypeFilter, setInvoiceTypeFilter] = useState('');
    const [selectedStudentForInvoices, setSelectedStudentForInvoices] = useState<any | null>(null);
    const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);

    // ── Concessions ──
    const [concessions, setConcessions] = useState<any[]>([]);
    const [concessionsLoading, setConcessionsLoading] = useState(false);
    const [showConcessionForm, setShowConcessionForm] = useState(false);
    const [concessionForm, setConcessionForm] = useState({ studentId: '', concessionType: 'percentage', value: '', reason: '', category: 'other', feeHeadId: '' });
    const [concessionSearch, setConcessionSearch] = useState('');
    const [concessionResults, setConcessionResults] = useState<any[]>([]);
    const [concessionStudent, setConcessionStudent] = useState<any>(null);
    const [savingConcession, setSavingConcession] = useState(false);
    const [setupSubTab, setSetupSubTab] = useState<'wizard' | 'concessions'>('wizard');

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
        setAssignLoading(true);
        try {
            const url = `/api/fees/student-groups?sessionId=${sessId}${classId ? `&classId=${classId}` : ''}${showUnassignedOnly ? '&unassignedOnly=true' : ''}`;
            const r = await fetch(url, { headers: hdrs() });
            if (r.ok) {
                const d = await r.json();
                setAssignments(d.assignments || []);
                if (d.summary) setAssignSummary(d.summary);
                setSelectedStudents([]);
            }
        } catch { }
        setAssignLoading(false);
    }, [hdrs, showUnassignedOnly]);

    const loadUnpaidInvoices = useCallback(async () => {
        setUnpaidInvoicesLoading(true);
        try {
            const r = await fetch(`/api/fees/invoices?status=unpaid&sessionId=${assignSession}&include=calendar`, { headers: hdrs() });
            if (r.ok) {
                const d = await r.json();
                setUnpaidInvoices(d.invoices || []);
                if (d.summary) setInvoiceSummary(d.summary);
                if (d.billingCalendar) setBillingCalendar(d.billingCalendar);
            }
        } catch {}
        setUnpaidInvoicesLoading(false);
    }, [hdrs, assignSession]);

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
            if (cfgRes.ok) { const d = await cfgRes.json(); setLateFeeEnabled(d.config?.late_fee_enabled || false); setConcessionEnabled(d.config?.concession_enabled || false); setAutoInvoiceEnabled(d.config?.auto_invoice_enabled || false); setAutoInvoiceDay(d.config?.auto_invoice_day || 1); }
            if (gwRes.ok) { const d = await gwRes.json(); setGatewayStatus(d.status || 'not_configured'); }
        } catch { }
    }, [hdrs]);

    useEffect(() => { if (user) loadCore(); }, [user, loadCore]);
    useEffect(() => { if (user && activeSection === 'reports' && reportView === 'defaulters') loadDefaulters(); }, [user, activeSection, reportView, loadDefaulters]);
    useEffect(() => { if (user && activeSection === 'fee-setup' && (setupStep === 3 || setupStep === 4)) loadAssignments(assignSession, assignClass); }, [user, activeSection, setupStep, assignSession, assignClass, loadAssignments]);
    useEffect(() => { if (user && activeSection === 'fee-setup' && setupStep === 4) loadUnpaidInvoices(); }, [user, activeSection, setupStep, loadUnpaidInvoices]);
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

    const openEditStudent = (student: any) => {
        setEditStudent(student);
        setEditStudentGroups(student.assigned_groups?.map((g: any) => g.fee_group_id) || []);
    };
    const toggleEditStudentGroup = (groupId: string) => {
        setEditStudentGroups(prev => prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]);
    };
    const handleSaveStudentEdit = async () => {
        if (!editStudent) return;
        setAssigning(true);
        try {
            const r = await fetch('/api/fees/student-groups', {
                method: 'PUT', headers: hdrs(),
                body: JSON.stringify({ studentId: editStudent.student_id, feeGroupIds: editStudentGroups, sessionId: assignSession })
            });
            if (r.ok) { setSetupMsg({ type: 'success', text: `Updated groups for ${editStudent.first_name}` }); setEditStudent(null); loadAssignments(assignSession, assignClass); }
            else { const e = await r.json(); setSetupMsg({ type: 'error', text: e.error || 'Failed' }); }
        } catch { setSetupMsg({ type: 'error', text: 'Network error' }); }
        setAssigning(false);
    };
    const handleAutoAssign = async () => {
        if (!confirm('Auto-assign default fee groups to all unassigned students?')) return;
        setAssigning(true);
        try { const r = await fetch('/api/fees/auto-assign', { method: 'POST', headers: hdrs(), body: JSON.stringify({ sessionId: assignSession }) }); if (r.ok) { const d = await r.json(); setSetupMsg({ type: 'success', text: d.message || 'Done!' }); loadAssignments(assignSession, assignClass); } } catch { }
        setAssigning(false);
    };

    // ─── Matrix Assign (class × group) ─────────────────────────
    const handleMatrixAssign = async (classId: string, groupId: string, assign: boolean) => {
        setMatrixAssigning(true);
        try {
            const r = await fetch('/api/fees/student-groups', {
                method: 'POST', headers: hdrs(),
                body: JSON.stringify({ classIds: [classId], feeGroupId: groupId, sessionId: assignSession, action: assign ? 'assign' : 'remove' })
            });
            if (r.ok) {
                const d = await r.json();
                setSetupMsg({ type: 'success', text: assign ? `Assigned ${d.assigned || 0} students` : `Removed from ${d.removed || 0} students` });
                loadAssignments(assignSession, '');
            }
        } catch { setSetupMsg({ type: 'error', text: 'Network error' }); }
        setMatrixAssigning(false);
    };

    // ─── Copy from Previous Session ──────────────────────────────
    const handleCopyFromSession = async () => {
        const currentIdx = sessions.findIndex(s => s.id === assignSession);
        if (currentIdx < 0 || currentIdx >= sessions.length - 1) { setSetupMsg({ type: 'error', text: 'No previous session found' }); return; }
        const prevSession = sessions[currentIdx + 1]; // sessions ordered newest first
        if (!confirm(`Copy all fee group assignments from "${prevSession.name}" to current session?\n\nOnly students enrolled in BOTH sessions will be copied. Existing assignments won't be duplicated.`)) return;
        setCopyingSession(true);
        try {
            const r = await fetch('/api/fees/student-groups', {
                method: 'PUT', headers: hdrs(),
                body: JSON.stringify({ copyFromSessionId: prevSession.id, targetSessionId: assignSession })
            });
            if (r.ok) { setSetupMsg({ type: 'success', text: `Assignments copied from ${prevSession.name}!` }); loadAssignments(assignSession, assignClass); }
            else { const e = await r.json(); setSetupMsg({ type: 'error', text: e.error || 'Failed' }); }
        } catch { setSetupMsg({ type: 'error', text: 'Network error' }); }
        setCopyingSession(false);
    };

    // ─── Remove group from single student inline ─────────────────
    const handleRemoveGroupFromStudent = async (studentId: string, groupId: string) => {
        try {
            const r = await fetch(`/api/fees/student-groups?studentId=${studentId}&feeGroupId=${groupId}&sessionId=${assignSession}`, { method: 'DELETE', headers: hdrs() });
            if (r.ok) loadAssignments(assignSession, assignClass);
        } catch { }
    };

    // ─── Preview Invoices ────────────────────────────────────────
    const handlePreviewInvoices = async () => {
        if (!assignSession || !billingMonth) { setInvoiceMsg({ type: 'error', text: 'Session and billing month are required' }); return; }
        setPreviewLoading(true); setInvoicePreview(null);
        try {
            const body: any = { sessionId: assignSession, billingMonth };
            if (invoiceClassFilter) body.classId = invoiceClassFilter;
            if (invoiceGroupFilter) body.feeGroupId = invoiceGroupFilter;
            const r = await fetch('/api/fees/invoice-preview', { method: 'POST', headers: hdrs(), body: JSON.stringify(body) });
            if (r.ok) { const d = await r.json(); setInvoicePreview(d.preview); }
            else { const e = await r.json(); setInvoiceMsg({ type: 'error', text: e.error || 'Preview failed' }); }
        } catch { setInvoiceMsg({ type: 'error', text: 'Network error' }); }
        setPreviewLoading(false);
    };

    // ─── Generate Invoices ───────────────────────────────────────
    const handleGenerateInvoices = async () => {
        if (!assignSession || !invoiceDueDate || !billingMonth) { setInvoiceMsg({ type: 'error', text: 'Session, billing month, and due date are required' }); return; }
        setGeneratingInvoices(true); setInvoiceMsg(null);
        try {
            const body: any = { sessionId: assignSession, dueDate: invoiceDueDate, billingMonth };
            if (invoiceClassFilter) body.classId = invoiceClassFilter;
            const r = await fetch('/api/fees/invoices', { method: 'POST', headers: hdrs(), body: JSON.stringify(body) });
            if (r.ok) {
                const d = await r.json();
                setInvoiceMsg({ type: 'success', text: d.message || `Generated ${d.count || 0} invoices!` });
                setInvoicePreview(null);
                loadCore();
                loadUnpaidInvoices();
            } else {
                const e = await r.json();
                setInvoiceMsg({ type: 'error', text: e.error || 'Failed to generate invoices' });
            }
        } catch { setInvoiceMsg({ type: 'error', text: 'Network error' }); }
        setGeneratingInvoices(false);
    };

    const handleBulkDelete = async () => {
        if (!assignSession) return;
        let confirmMsg = 'Are you sure you want to delete all unpaid invoices in this session?';
        if (bulkDeleteTarget === 'class') {
            if (!bulkDeleteClassId) {
                alert('Please select a class first');
                return;
            }
            const className = classes.find(c => c.id === bulkDeleteClassId)?.name || 'selected class';
            confirmMsg = `Are you sure you want to delete all unpaid invoices for ${className}?`;
        } else if (bulkDeleteTarget === 'student') {
            if (!bulkDeleteStudentId) {
                alert('Please select a student first');
                return;
            }
            const student = assignments.find(a => a.student_id === bulkDeleteStudentId);
            const studentName = student ? `${student.first_name} ${student.last_name}` : 'selected student';
            confirmMsg = `Are you sure you want to delete all unpaid invoices for ${studentName}?`;
        }

        if (!confirm(confirmMsg)) return;

        setBulkDeleting(true);
        try {
            let url = `/api/fees/invoices/bulk?sessionId=${assignSession}&target=${bulkDeleteTarget}`;
            if (bulkDeleteTarget === 'class') url += `&classId=${bulkDeleteClassId}`;
            if (bulkDeleteTarget === 'student') url += `&studentId=${bulkDeleteStudentId}`;

            const r = await fetch(url, { method: 'DELETE', headers: hdrs() });
            const data = await r.json();
            if (r.ok) {
                setSetupMsg({ type: 'success', text: data.message || 'Successfully deleted unpaid invoices.' });
                loadUnpaidInvoices();
            } else {
                setSetupMsg({ type: 'error', text: data.error || 'Failed to delete invoices' });
            }
        } catch {
            setSetupMsg({ type: 'error', text: 'Network error occurred' });
        }
        setBulkDeleting(false);
    };

    const handleDeleteSingleInvoice = async (invoiceId: string) => {
        if (!confirm('Are you sure you want to delete this invoice? This action is permanent.')) return;
        setDeletingInvoiceId(invoiceId);
        try {
            const r = await fetch(`/api/fees/invoices?id=${invoiceId}`, { method: 'DELETE', headers: hdrs() });
            const data = await r.json();
            if (r.ok) {
                setSetupMsg({ type: 'success', text: 'Invoice deleted successfully.' });
                
                // Update selectedStudentForInvoices state
                if (selectedStudentForInvoices) {
                    const updatedInvoices = selectedStudentForInvoices.invoices.filter((inv: any) => inv.id !== invoiceId);
                    if (updatedInvoices.length === 0) {
                        setSelectedStudentForInvoices(null);
                    } else {
                        const newTotal = updatedInvoices.reduce((s: number, inv: any) => s + parseFloat(inv.total_amount || '0'), 0);
                        setSelectedStudentForInvoices({
                            ...selectedStudentForInvoices,
                            invoices: updatedInvoices,
                            total_due: newTotal
                        });
                    }
                }
                loadUnpaidInvoices();
            } else {
                setSetupMsg({ type: 'error', text: data.error || 'Failed to delete invoice' });
            }
        } catch {
            setSetupMsg({ type: 'error', text: 'Network error occurred' });
        }
        setDeletingInvoiceId(null);
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
                prefill: {
                    contact: '+919999999999'
                },
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

    // ─── Quick Pay ────────────────────────────────────────────────
    const searchQuickPayStudents = async (q: string) => {
        setQuickPaySearch(q);
        if (q.length < 2) { setQuickPayResults([]); return; }
        try {
            const r = await fetch(`/api/students/search?q=${encodeURIComponent(q)}`, { headers: hdrs() });
            if (r.ok) { const d = await r.json(); setQuickPayResults(d.students || []); }
        } catch { /* silent */ }
    };

    const handleQuickPay = async () => {
        if (!quickPayStudent || !quickPayForm.amount || !quickPayForm.description) return;
        setQuickPayProcessing(true);
        try {
            const r = await fetch('/api/fees/quick-pay', {
                method: 'POST', headers: hdrs(),
                body: JSON.stringify({
                    studentId: quickPayStudent.id,
                    amount: quickPayForm.amount,
                    description: quickPayForm.description,
                    feeHeadId: quickPayForm.feeHeadId || null,
                    paymentMode: quickPayForm.paymentMode,
                    remarks: quickPayForm.remarks
                })
            });
            if (r.ok) {
                const data = await r.json();
                setCollectMsg({ type: 'success', text: data.message });
                setLastPaymentId(data.payment?.id || null);
                setShowQuickPay(false);
                setQuickPayStudent(null);
                setQuickPayForm({ studentId: '', description: '', amount: '', feeHeadId: '', paymentMode: 'cash', remarks: '' });
                setQuickPaySearch('');
                // Refresh payments
                const pr = await fetch('/api/fees/payments', { headers: hdrs() });
                if (pr.ok) setPayments((await pr.json()).payments || []);
            } else {
                const err = await r.json();
                setCollectMsg({ type: 'error', text: err.error || 'Quick pay failed' });
            }
        } catch { setCollectMsg({ type: 'error', text: 'Network error' }); }
        setQuickPayProcessing(false);
    };

    // ─── Concessions ──────────────────────────────────────────────
    const loadConcessions = async () => {
        setConcessionsLoading(true);
        try {
            const r = await fetch('/api/fees/concessions', { headers: hdrs() });
            if (r.ok) setConcessions((await r.json()).concessions || []);
        } catch { /* silent */ }
        setConcessionsLoading(false);
    };

    const searchConcessionStudents = async (q: string) => {
        setConcessionSearch(q);
        if (q.length < 2) { setConcessionResults([]); return; }
        try {
            const r = await fetch(`/api/students/search?q=${encodeURIComponent(q)}`, { headers: hdrs() });
            if (r.ok) { const d = await r.json(); setConcessionResults(d.students || []); }
        } catch { /* silent */ }
    };

    const handleCreateConcession = async () => {
        if (!concessionStudent || !concessionForm.value) return;
        setSavingConcession(true);
        try {
            const r = await fetch('/api/fees/concessions', {
                method: 'POST', headers: hdrs(),
                body: JSON.stringify({
                    studentId: concessionStudent.id,
                    concessionType: concessionForm.concessionType,
                    value: parseFloat(concessionForm.value),
                    reason: concessionForm.reason,
                    category: concessionForm.category,
                    feeHeadId: concessionForm.feeHeadId || null
                })
            });
            if (r.ok) {
                setSetupMsg({ type: 'success', text: 'Concession created!' });
                setShowConcessionForm(false);
                setConcessionStudent(null);
                setConcessionForm({ studentId: '', concessionType: 'percentage', value: '', reason: '', category: 'other', feeHeadId: '' });
                setConcessionSearch('');
                loadConcessions();
            } else {
                const err = await r.json();
                setSetupMsg({ type: 'error', text: err.error || 'Failed' });
            }
        } catch { setSetupMsg({ type: 'error', text: 'Network error' }); }
        setSavingConcession(false);
    };

    const deactivateConcession = async (id: string) => {
        try {
            const r = await fetch('/api/fees/concessions', {
                method: 'PUT', headers: hdrs(),
                body: JSON.stringify({ id, isActive: false })
            });
            if (r.ok) loadConcessions();
        } catch { /* silent */ }
    };

    // ─── Settings ────────────────────────────────────────────────
    const saveSettings = async () => {
        setSavingSettings(true); setSettingsMsg(null);
        try { const r = await fetch('/api/schools/fee-config', { method: 'PUT', headers: hdrs(), body: JSON.stringify({ lateFeeEnabled, concessionEnabled, autoInvoiceEnabled, autoInvoiceDay: parseInt(autoInvoiceDay.toString()) }) }); if (r.ok) setSettingsMsg({ type: 'success', text: 'Saved!' }); else setSettingsMsg({ type: 'error', text: 'Failed' }); } catch { setSettingsMsg({ type: 'error', text: 'Network error' }); }
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
        { id: 'fee-setup' as Section, label: 'Fee Setup', icon: <ClipboardList className="w-4 h-4" /> },
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
                                    { label: 'Quick Pay', icon: <Zap className="w-5 h-5" />, section: 'collect' as Section, color: 'amber', onClick: () => { setActiveSection('collect'); setShowQuickPay(true); } },
                                    { label: 'Reports', icon: <BarChart3 className="w-5 h-5" />, section: 'reports' as Section, color: 'blue' },
                                    { label: 'Fee Setup', icon: <ClipboardList className="w-5 h-5" />, section: 'fee-setup' as Section, color: 'violet' },
                                    { label: 'Generate Invoices', icon: <FileCheck className="w-5 h-5" />, section: 'fee-setup' as Section, color: 'blue', onClick: () => { setActiveSection('fee-setup'); setSetupStep(4 as any); } },
                                    ...(isAdmin ? [
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
                                <div className="flex items-center gap-3">
                                    <div className="relative flex-1">
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
                                    <button onClick={() => setShowQuickPay(true)}
                                        className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl text-sm cursor-pointer hover:shadow-lg transition-all whitespace-nowrap">
                                        <Zap className="w-4 h-4" /> Quick Pay
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ─── Quick Pay Modal ─── */}
                        {showQuickPay && (
                            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowQuickPay(false)}>
                                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-between mb-5">
                                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Zap className="w-5 h-5 text-amber-500" /> Quick Pay (No Invoice)</h2>
                                        <button onClick={() => setShowQuickPay(false)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X className="w-4 h-4" /></button>
                                    </div>
                                    <p className="text-xs text-gray-500 mb-4">Record an ad-hoc payment without needing an existing invoice. An invoice is auto-created for audit trail.</p>

                                    {/* Student search */}
                                    {!quickPayStudent ? (
                                        <div className="mb-4">
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Search Student *</label>
                                            <input type="text" value={quickPaySearch} onChange={e => searchQuickPayStudents(e.target.value)}
                                                placeholder="Type student name or admission no..."
                                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                                            {quickPayResults.length > 0 && (
                                                <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                                    {quickPayResults.map(s => (
                                                        <button key={s.id} onClick={() => { setQuickPayStudent(s); setQuickPayResults([]); setQuickPaySearch(''); }}
                                                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b last:border-b-0 cursor-pointer">
                                                            <p className="font-semibold text-sm text-gray-900">{s.first_name} {s.last_name}</p>
                                                            <p className="text-xs text-gray-400">Adm: {s.admission_number} · {s.class_name}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                                            <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-xs font-bold text-amber-800">{quickPayStudent.first_name?.[0]}{quickPayStudent.last_name?.[0]}</div>
                                            <div className="flex-1"><p className="font-bold text-sm text-gray-900">{quickPayStudent.first_name} {quickPayStudent.last_name}</p><p className="text-xs text-gray-500">Adm: {quickPayStudent.admission_number}</p></div>
                                            <button onClick={() => setQuickPayStudent(null)} className="p-1 rounded hover:bg-amber-100 cursor-pointer"><X className="w-3.5 h-3.5 text-gray-400" /></button>
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Description *</label>
                                            <input type="text" value={quickPayForm.description} onChange={e => setQuickPayForm(f => ({ ...f, description: e.target.value }))}
                                                placeholder="e.g. Exam Re-evaluation Fee, Damage Charge..."
                                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Amount (₹) *</label>
                                                <input type="number" value={quickPayForm.amount} onChange={e => setQuickPayForm(f => ({ ...f, amount: e.target.value }))}
                                                    placeholder="0" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Payment Mode</label>
                                                <select value={quickPayForm.paymentMode} onChange={e => setQuickPayForm(f => ({ ...f, paymentMode: e.target.value }))}
                                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none">
                                                    <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank Transfer</option><option value="cheque">Cheque</option><option value="card">Card</option>
                                                </select>
                                            </div>
                                        </div>
                                        {feeHeads.length > 0 && (
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Fee Head (Optional)</label>
                                                <select value={quickPayForm.feeHeadId} onChange={e => setQuickPayForm(f => ({ ...f, feeHeadId: e.target.value }))}
                                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-amber-500 outline-none">
                                                    <option value="">— No specific head —</option>
                                                    {feeHeads.map(h => <option key={h.id} value={h.id}>{h.name} ({h.category})</option>)}
                                                </select>
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Remarks</label>
                                            <input type="text" value={quickPayForm.remarks} onChange={e => setQuickPayForm(f => ({ ...f, remarks: e.target.value }))}
                                                placeholder="Optional notes..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                                        </div>
                                    </div>

                                    <button onClick={handleQuickPay} disabled={quickPayProcessing || !quickPayStudent || !quickPayForm.amount || !quickPayForm.description}
                                        className="w-full mt-5 py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer text-sm transition-all hover:shadow-xl">
                                        {quickPayProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : <><Zap className="w-4 h-4" /> Record Quick Payment</>}
                                    </button>
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
                {activeSection === 'fee-setup' && (
                    <div className="space-y-5">
                        {setupMsg && (
                            <div className={`p-3 rounded-xl flex items-center gap-2 text-sm ${setupMsg.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
                                {setupMsg.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />} {setupMsg.text}
                                <button onClick={() => setSetupMsg(null)} className="ml-auto cursor-pointer"><X className="w-4 h-4" /></button>
                            </div>
                        )}

                        {/* Sub-tabs: Wizard | Concessions */}
                        <div className="flex gap-2 bg-white border border-gray-200 rounded-2xl p-2">
                            <button onClick={() => setSetupSubTab('wizard')}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold cursor-pointer transition-all ${setupSubTab === 'wizard' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
                                <ClipboardList className="w-4 h-4" /> Fee Structure
                            </button>
                            <button onClick={() => { setSetupSubTab('concessions'); loadConcessions(); }}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold cursor-pointer transition-all ${setupSubTab === 'concessions' ? 'bg-violet-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}>
                                <IndianRupee className="w-4 h-4" /> Concessions
                            </button>
                        </div>

                        {setupSubTab === 'wizard' && (<>
                        {/* Steps */}
                        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl p-4">
                            {([1, 2, 3, 4] as const).map(n => (
                                <button key={n} onClick={() => { setSetupStep(n); if(n===4) loadUnpaidInvoices(); }}
                                    className={`flex-1 flex items-center gap-2 p-3 rounded-xl text-sm font-semibold cursor-pointer transition-all ${setupStep === n ? 'bg-emerald-600 text-white shadow-md' : setupStep > n ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-400'}`}>
                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${setupStep === n ? 'bg-white text-emerald-600' : setupStep > n ? 'bg-emerald-200 text-emerald-800' : 'bg-gray-200 text-gray-500'}`}>{n}</span>
                                    <span className="hidden sm:inline">{n === 1 ? 'Fee Heads' : n === 2 ? 'Fee Groups' : n === 3 ? 'Assign Students' : 'Invoices'}</span>
                                </button>
                            ))}
                        </div>


                        {/* Step 1: Fee Heads */}
                        {setupStep === 1 && (
                            <div className="bg-white border border-gray-200 rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div><h3 className="font-bold text-gray-900">Fee Heads</h3><p className="text-xs text-gray-500">Individual fee items your school charges (Tuition, Transport, Lab Fee, etc.)</p></div>
                                    {isAdmin && <button onClick={openCreateHead} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-sm cursor-pointer hover:bg-emerald-700"><Plus className="w-4 h-4" />Add Head</button>}
                                </div>
                                {feeHeads.length === 0 ? (
                                    <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl"><IndianRupee className="w-10 h-10 text-gray-300 mx-auto mb-2" /><p className="text-gray-500 font-bold">No fee heads yet</p><p className="text-gray-400 text-xs mt-1">Create your first fee item — e.g. "Tuition Fee"</p></div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {feeHeads.map(h => (
                                            <div key={h.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                <div className="flex items-center gap-3"><div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><IndianRupee className="w-3.5 h-3.5" /></div>
                                                    <div><p className="font-bold text-gray-900 text-sm">{h.name}</p><p className="text-xs text-gray-500">{HEAD_CATEGORIES.find(c => c.value === h.category)?.label} {h.is_taxable ? `· ${h.tax_rate}% GST` : ''}</p></div></div>
                                                {isAdmin && <div className="flex gap-1"><button onClick={() => openEditHead(h)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button><button onClick={() => deleteHead(h.id, h.name)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></div>}
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
                                    {isAdmin && <button onClick={openCreateGroup} disabled={feeHeads.length === 0} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-sm cursor-pointer hover:bg-emerald-700 disabled:opacity-50"><Plus className="w-4 h-4" />Create Group</button>}
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

                        {/* Step 3: Assign Students — V3 */}
                        {setupStep === 3 && (
                            <div className="space-y-5">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-white border border-gray-200 rounded-2xl p-4">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Students</p>
                                        <p className="text-2xl font-extrabold text-gray-900 mt-1">{assignSummary.total}</p>
                                    </div>
                                    <div className="bg-white border border-emerald-200 rounded-2xl p-4">
                                        <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Assigned</p>
                                        <p className="text-2xl font-extrabold text-emerald-600 mt-1">{assignSummary.assigned}
                                            <span className="text-xs font-bold text-gray-400 ml-1">({assignSummary.total > 0 ? Math.round(assignSummary.assigned / assignSummary.total * 100) : 0}%)</span>
                                        </p>
                                    </div>
                                    <div className={`bg-white border rounded-2xl p-4 ${assignSummary.unassigned > 0 ? 'border-amber-200' : 'border-gray-200'}`}>
                                        <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Unassigned</p>
                                        <p className={`text-2xl font-extrabold mt-1 ${assignSummary.unassigned > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{assignSummary.unassigned}</p>
                                    </div>
                                    <div className="bg-white border border-blue-200 rounded-2xl p-4">
                                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Est. Monthly</p>
                                        <p className="text-xl font-extrabold text-blue-600 mt-1">₹{assignSummary.estimatedMonthly?.toLocaleString('en-IN')}</p>
                                        <p className="text-[10px] text-gray-400 font-semibold">₹{assignSummary.estimatedYearly?.toLocaleString('en-IN')}/yr</p>
                                    </div>
                                </div>

                                {/* Controls Bar */}
                                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex-1 min-w-[200px]">
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Session</label>
                                            <select value={assignSession} onChange={e => { setAssignSession(e.target.value); loadAssignments(e.target.value, assignClass); }} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">{sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (Current)' : ''}</option>)}</select>
                                        </div>
                                        {assignViewMode === 'individual' && (
                                            <div className="flex-1 min-w-[200px]">
                                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Class Filter</label>
                                                <select value={assignClass} onChange={e => { setAssignClass(e.target.value); loadAssignments(assignSession, e.target.value); }} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500"><option value="">All Classes</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                                            </div>
                                        )}
                                        <div className="flex items-end gap-2 ml-auto">
                                            {/* View mode toggle */}
                                            <div className="flex bg-gray-100 rounded-xl p-0.5">
                                                <button onClick={() => setAssignViewMode('matrix')} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${assignViewMode === 'matrix' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Matrix</button>
                                                <button onClick={() => setAssignViewMode('individual')} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${assignViewMode === 'individual' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Individual</button>
                                            </div>
                                            {sessions.length > 1 && (
                                                <button onClick={handleCopyFromSession} disabled={copyingSession} className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 text-violet-700 font-bold rounded-xl text-xs cursor-pointer hover:bg-violet-100 disabled:opacity-50 border border-violet-200">
                                                    {copyingSession ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Copy from Prev Session
                                                </button>
                                            )}
                                            <button onClick={handleAutoAssign} disabled={assigning} className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 font-bold rounded-xl text-xs cursor-pointer hover:bg-amber-100 disabled:opacity-50 border border-amber-200">
                                                <Zap className="w-3.5 h-3.5" /> Auto-Assign
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {assignLoading ? <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div> : (
                                    <>
                                    {/* ─── MATRIX VIEW ─── */}
                                    {assignViewMode === 'matrix' && feeGroups.length > 0 && (
                                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                                            <div className="p-4 border-b border-gray-100">
                                                <h3 className="font-bold text-gray-900 text-sm">Class × Fee Group Matrix</h3>
                                                <p className="text-xs text-gray-500 mt-0.5">Click a cell to assign/unassign a fee group for an entire class</p>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="bg-gray-50 border-b border-gray-100">
                                                            <th className="px-4 py-3 text-left text-[10px] font-extrabold text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 min-w-[160px]">Class</th>
                                                            <th className="px-3 py-3 text-center text-[10px] font-extrabold text-gray-400 uppercase tracking-wider min-w-[60px]">Students</th>
                                                            {feeGroups.map(g => (
                                                                <th key={g.id} className="px-3 py-3 text-center text-[10px] font-extrabold text-gray-500 uppercase tracking-wider min-w-[120px]">
                                                                    <span className="block">{g.name}</span>
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                        {(() => {
                                                            // Group students by class
                                                            const classMap = new Map<string, { classId: string; className: string; students: any[] }>();
                                                            assignments.forEach(a => {
                                                                if (!classMap.has(a.class_id)) classMap.set(a.class_id, { classId: a.class_id, className: a.class_name, students: [] });
                                                                classMap.get(a.class_id)!.students.push(a);
                                                            });
                                                            // Also add classes that have no students in assignments
                                                            classes.forEach(c => {
                                                                if (!classMap.has(c.id)) classMap.set(c.id, { classId: c.id, className: c.name, students: [] });
                                                            });
                                                            return Array.from(classMap.values()).map(cls => {
                                                                const total = cls.students.length;
                                                                return (
                                                                    <tr key={cls.classId} className="hover:bg-gray-50/50">
                                                                        <td className="px-4 py-3 font-bold text-gray-900 text-sm sticky left-0 bg-white z-10">{cls.className}
                                                                            <span className="text-[10px] text-gray-400 font-normal ml-1">({total} students)</span>
                                                                        </td>
                                                                        <td className="px-3 py-3 text-center font-bold text-gray-600 text-sm">{total}</td>
                                                                        {feeGroups.map(g => {
                                                                            const assignedCount = cls.students.filter(s => s.assigned_groups?.some((ag: any) => ag.fee_group_id === g.id)).length;
                                                                            const isFullyAssigned = total > 0 && assignedCount === total;
                                                                            const isPartial = assignedCount > 0 && assignedCount < total;
                                                                            return (
                                                                                <td key={g.id} className="px-3 py-3 text-center">
                                                                                    <button
                                                                                        onClick={() => { if (total === 0) return; handleMatrixAssign(cls.classId, g.id, !isFullyAssigned); }}
                                                                                        disabled={matrixAssigning || total === 0}
                                                                                        className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center mx-auto cursor-pointer transition-all disabled:opacity-40 ${
                                                                                            isFullyAssigned ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' :
                                                                                            isPartial ? 'bg-amber-100 border-amber-300 text-amber-700' :
                                                                                            'bg-white border-gray-200 text-gray-300 hover:border-emerald-300 hover:text-emerald-400'
                                                                                        }`}
                                                                                    >
                                                                                        {isFullyAssigned ? <CheckCircle className="w-5 h-5" /> :
                                                                                         isPartial ? <span className="text-[10px] font-bold">{assignedCount}</span> :
                                                                                         <Plus className="w-4 h-4" />}
                                                                                    </button>
                                                                                </td>
                                                                            );
                                                                        })}
                                                                    </tr>
                                                                );
                                                            });
                                                        })()}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <div className="p-3 border-t border-gray-100 bg-gray-50 flex items-center gap-4 text-[10px] text-gray-500">
                                                <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-emerald-500 inline-block" /> All assigned</span>
                                                <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-amber-100 border border-amber-300 inline-block" /> Partial</span>
                                                <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-white border border-gray-200 inline-block" /> None</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* ─── INDIVIDUAL VIEW ─── */}
                                    {assignViewMode === 'individual' && (
                                        <div className="bg-white border border-gray-200 rounded-2xl">
                                            {/* Toolbar */}
                                            <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="checkbox" checked={showUnassignedOnly} onChange={e => { setShowUnassignedOnly(e.target.checked); loadAssignments(assignSession, assignClass); }} className="accent-amber-600 cursor-pointer" />
                                                    <span className="text-xs font-bold text-gray-600">Show unassigned only</span>
                                                    {assignSummary.unassigned > 0 && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">{assignSummary.unassigned}</span>}
                                                </label>
                                                {selectedStudents.length > 0 && (
                                                    <div className="ml-auto flex items-center gap-2 bg-emerald-900 text-white px-4 py-2 rounded-xl">
                                                        <span className="font-semibold text-xs">{selectedStudents.length} selected</span>
                                                        <select value={assignGroupId} onChange={e => setAssignGroupId(e.target.value)} className="px-2 py-1 bg-emerald-800 border border-emerald-700 text-white rounded-lg text-xs outline-none"><option value="">Select Group</option>{feeGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
                                                        <button onClick={handleAssignGroup} disabled={assigning || !assignGroupId} className="px-3 py-1 bg-white text-emerald-900 font-bold rounded-lg text-xs disabled:opacity-50 cursor-pointer">{assigning ? 'Assigning...' : 'Assign'}</button>
                                                    </div>
                                                )}
                                            </div>
                                            {assignments.length === 0 ? (
                                                <div className="text-center py-12 text-gray-400 text-sm">No students found</div>
                                            ) : (
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm text-left">
                                                        <thead><tr className="bg-gray-50 border-b text-gray-500 font-bold text-[10px] uppercase tracking-wider">
                                                            <th className="px-4 py-2.5 w-10"><input type="checkbox" checked={selectedStudents.length === assignments.length && assignments.length > 0} onChange={() => setSelectedStudents(selectedStudents.length === assignments.length ? [] : assignments.map(a => a.student_id))} className="accent-emerald-600 cursor-pointer" /></th>
                                                            <th className="px-4 py-2.5">Student</th>
                                                            <th className="px-4 py-2.5">Class</th>
                                                            <th className="px-4 py-2.5">Assigned Groups</th>
                                                            <th className="px-4 py-2.5 text-right">Est. Monthly</th>
                                                            <th className="px-4 py-2.5 text-right">Est. Yearly</th>
                                                            <th className="px-4 py-2.5 text-center w-16">Edit</th>
                                                        </tr></thead>
                                                        <tbody className="divide-y divide-gray-50">{assignments.map(a => (
                                                            <tr key={a.student_id} className="hover:bg-gray-50/50">
                                                                <td className="px-4 py-2.5"><input type="checkbox" checked={selectedStudents.includes(a.student_id)} onChange={() => setSelectedStudents(prev => prev.includes(a.student_id) ? prev.filter(id => id !== a.student_id) : [...prev, a.student_id])} className="accent-emerald-600 cursor-pointer" /></td>
                                                                <td className="px-4 py-2.5"><p className="font-bold text-gray-900">{a.first_name} {a.last_name}</p><p className="text-[10px] text-gray-400">Adm: {a.admission_number}</p></td>
                                                                <td className="px-4 py-2.5 text-xs text-gray-600">{a.class_name}</td>
                                                                <td className="px-4 py-2.5">
                                                                    {a.assigned_groups?.length > 0 ? (
                                                                        <div className="flex flex-wrap gap-1">{a.assigned_groups.map((g: any) => (
                                                                            <span key={g.fee_group_id} className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-[10px] font-semibold">
                                                                                {g.fee_group_name}
                                                                                <button onClick={() => handleRemoveGroupFromStudent(a.student_id, g.fee_group_id)} className="hidden group-hover:inline text-red-400 hover:text-red-600 cursor-pointer ml-0.5"><X className="w-3 h-3" /></button>
                                                                            </span>
                                                                        ))}</div>
                                                                    ) : <span className="text-xs text-amber-500 font-semibold">⚠ No groups</span>}
                                                                </td>
                                                                <td className="px-4 py-2.5 text-right font-bold text-gray-700 text-sm" title={a.assigned_groups?.map((g: any) => `${g.fee_group_name}: ₹${g.monthly?.toLocaleString('en-IN')}/mo`).join('\n')}>₹{(a.estimated_monthly || 0).toLocaleString('en-IN')}</td>
                                                                <td className="px-4 py-2.5 text-right font-bold text-gray-900 text-sm">₹{(a.estimated_yearly || 0).toLocaleString('en-IN')}</td>
                                                                <td className="px-4 py-2.5 text-center">
                                                                    <button onClick={() => openEditStudent(a)} className="p-1.5 bg-gray-100 hover:bg-emerald-100 text-gray-500 hover:text-emerald-700 rounded-lg cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                                                                </td>
                                                            </tr>
                                                        ))}</tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    </>
                                )}

                                {/* Nav */}
                                <div className="flex items-center justify-between pt-2">
                                    <button onClick={() => setSetupStep(2)} className="px-5 py-2 text-gray-500 font-semibold text-sm cursor-pointer">← Back to Groups</button>
                                    <button onClick={() => { setSetupStep(4); loadUnpaidInvoices(); }} className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm cursor-pointer hover:bg-emerald-700">Next: Invoices →</button>
                                </div>
                            </div>
                        )}

                        {/* Edit Student Modal */}
                        {editStudent && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl">
                                    <div className="flex items-center justify-between mb-5">
                                        <div>
                                            <h2 className="text-lg font-bold text-gray-900">Edit Student Groups</h2>
                                            <p className="text-xs text-gray-500 mt-0.5">{editStudent.first_name} {editStudent.last_name} ({editStudent.admission_number})</p>
                                        </div>
                                        <button onClick={() => setEditStudent(null)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X className="w-5 h-5 text-gray-400" /></button>
                                    </div>
                                    <div className="space-y-3 mb-6 max-h-[50vh] overflow-y-auto pr-2">
                                        {feeGroups.map(g => {
                                            const isSelected = editStudentGroups.includes(g.id);
                                            return (
                                                <div key={g.id} onClick={() => toggleEditStudentGroup(g.id)} className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${isSelected ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                                                    <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 pointer-events-none" />
                                                    <div><p className={`font-bold text-sm ${isSelected ? 'text-emerald-900' : 'text-gray-900'}`}>{g.name}</p></div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex gap-2 pt-4 border-t border-gray-100">
                                        <button onClick={() => setEditStudent(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl text-sm cursor-pointer">Cancel</button>
                                        <button onClick={handleSaveStudentEdit} disabled={assigning} className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl text-sm shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">
                                            {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            {assigning ? 'Saving...' : 'Save Changes'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Invoice Management & Automation */}
                        {setupStep === 4 && (() => {
                            // Helper to group invoices by student
                            const groupedInvoicesMap: Record<string, {
                                student_id: string;
                                student_name: string;
                                admission_number: string;
                                class_name: string;
                                section_name: string;
                                invoices: any[];
                                total_due: number;
                            }> = {};

                            unpaidInvoices.forEach(inv => {
                                const sid = inv.student_id;
                                if (!groupedInvoicesMap[sid]) {
                                    groupedInvoicesMap[sid] = {
                                        student_id: sid,
                                        student_name: inv.student_name || 'Unknown Student',
                                        admission_number: inv.admission_number || '—',
                                        class_name: inv.class_name || '—',
                                        section_name: inv.section_name || '—',
                                        invoices: [],
                                        total_due: 0
                                    };
                                }
                                groupedInvoicesMap[sid].invoices.push(inv);
                                groupedInvoicesMap[sid].total_due += parseFloat(inv.total_amount || '0');
                            });

                            let groupedList = Object.values(groupedInvoicesMap);

                            // Dynamically collect unique fee head items present in the unpaid invoices for filters
                            const feeHeadFilterOptionsMap: Record<string, string> = {};
                            unpaidInvoices.forEach(inv => {
                                inv.items?.forEach((item: any) => {
                                    if (item.fee_head_id) {
                                        feeHeadFilterOptionsMap[item.fee_head_id] = item.head_name || item.name || 'Unnamed Item';
                                    }
                                });
                            });
                            const feeHeadFilterOptions = Object.entries(feeHeadFilterOptionsMap).map(([id, name]) => ({ id, name }));

                            // Apply search filter
                            if (invoiceSearchQuery) {
                                const q = invoiceSearchQuery.toLowerCase();
                                groupedList = groupedList.filter(s =>
                                    s.student_name.toLowerCase().includes(q) ||
                                    s.admission_number.toLowerCase().includes(q)
                                );
                            }

                            // Apply fee head filter
                            if (invoiceTypeFilter) {
                                groupedList = groupedList.filter(s =>
                                    s.invoices.some(inv =>
                                        inv.items?.some((item: any) => item.fee_head_id === invoiceTypeFilter)
                                    )
                                );
                            }

                            // Apply calendar month filter (V3 visual timeline)
                            if (selectedCalendarMonth) {
                                groupedList = groupedList.filter(s =>
                                    s.invoices.some(inv => inv.billing_month === selectedCalendarMonth)
                                );
                            }

                            return (
                                <div className="space-y-6 animate-fadeIn">
                                    {/* ─── SUMMARY CARDS ─── */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {/* Generated */}
                                        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                                            <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
                                                <Receipt className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Billed</p>
                                                <p className="text-xl font-extrabold text-slate-800 mt-0.5">
                                                    ₹{parseFloat(invoiceSummary.total_generated || '0').toLocaleString('en-IN')}
                                                </p>
                                                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                                    {invoiceSummary.total_invoices || 0} Invoices
                                                </p>
                                            </div>
                                        </div>

                                        {/* Collected */}
                                        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-2">
                                            <div className="flex items-center gap-4">
                                                <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
                                                    <CheckCircle className="w-6 h-6" />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Collected</p>
                                                    <p className="text-xl font-extrabold text-emerald-600 mt-0.5">
                                                        ₹{parseFloat(invoiceSummary.total_collected || '0').toLocaleString('en-IN')}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                                        {invoiceSummary.paid_count || 0} Paid Bills
                                                    </p>
                                                </div>
                                            </div>
                                            {/* Progress Bar */}
                                            {(() => {
                                                const total = parseFloat(invoiceSummary.total_generated || '0');
                                                const col = parseFloat(invoiceSummary.total_collected || '0');
                                                const pct = total > 0 ? Math.round((col / total) * 100) : 0;
                                                return (
                                                    <div className="mt-1">
                                                        <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
                                                            <span>COLLECTION RATE</span>
                                                            <span>{pct}%</span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Outstanding */}
                                        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
                                            <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl">
                                                <Clock className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Pending</p>
                                                <p className="text-xl font-extrabold text-amber-600 mt-0.5">
                                                    ₹{parseFloat(invoiceSummary.total_pending || '0').toLocaleString('en-IN')}
                                                </p>
                                                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                                    {invoiceSummary.unpaid_count || 0} Unpaid / Partial
                                                </p>
                                            </div>
                                        </div>

                                        {/* Overdue */}
                                        <div className={`bg-white border rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4 ${parseFloat(invoiceSummary.total_overdue || '0') > 0 ? 'border-rose-200 bg-rose-50/10' : 'border-slate-200'}`}>
                                            <div className={`p-4 rounded-2xl ${parseFloat(invoiceSummary.total_overdue || '0') > 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                                                <AlertTriangle className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Overdue</p>
                                                <p className={`text-xl font-extrabold mt-0.5 ${parseFloat(invoiceSummary.total_overdue || '0') > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                                                    ₹{parseFloat(invoiceSummary.total_overdue || '0').toLocaleString('en-IN')}
                                                </p>
                                                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                                    {invoiceSummary.overdue_count || 0} Defaulter Bills
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ─── VISUAL BILLING CALENDAR TIMELINE ─── */}
                                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                                                    <CalendarDays className="w-4 h-4 text-blue-500" /> Academic Billing Timeline
                                                </h3>
                                                <p className="text-[10px] text-slate-500 mt-0.5">Click a month card to filter unpaid student invoices below by that billing period.</p>
                                            </div>
                                            {selectedCalendarMonth && (
                                                <button onClick={() => setSelectedCalendarMonth(null)} className="px-2.5 py-1 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg cursor-pointer transition-all">
                                                    Clear Filter
                                                </button>
                                            )}
                                        </div>

                                        {billingCalendar.length === 0 ? (
                                            <div className="border-2 border-dashed border-slate-100 rounded-2xl p-8 text-center text-xs text-slate-400 font-medium bg-slate-50/35">
                                                No monthly invoices generated yet in this session. Generate below to populate the timeline.
                                            </div>
                                        ) : (
                                            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                                                {billingCalendar.map(cal => {
                                                    const date = new Date(cal.billing_month + '-02');
                                                    const monthStr = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                                                    const isSelected = selectedCalendarMonth === cal.billing_month;
                                                    
                                                    const totalAmt = parseFloat(cal.total_amount || '0');
                                                    const paidAmt = parseFloat(cal.paid_amount || '0');
                                                    const paidPct = totalAmt > 0 ? Math.round((paidAmt / totalAmt) * 100) : 0;

                                                    return (
                                                        <div key={cal.billing_month} 
                                                            onClick={() => setSelectedCalendarMonth(isSelected ? null : cal.billing_month)}
                                                            className={`min-w-[190px] p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                                                                isSelected 
                                                                ? 'bg-blue-50/70 border-blue-500 shadow-sm ring-1 ring-blue-500/20' 
                                                                : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
                                                            }`}
                                                        >
                                                            <div>
                                                                <div className="flex justify-between items-start">
                                                                    <p className="font-extrabold text-slate-800 text-xs tracking-tight">{monthStr}</p>
                                                                    {isSelected && <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[8px] font-bold">Filter</span>}
                                                                </div>
                                                                <p className="text-sm font-extrabold text-slate-900 mt-1.5">₹{totalAmt.toLocaleString('en-IN')}</p>
                                                                <p className="text-[9px] text-slate-400 font-semibold mt-0.5">{cal.invoice_count} bills ({cal.unpaid_count} unpaid)</p>
                                                            </div>

                                                            <div>
                                                                <div className="flex justify-between text-[8px] font-bold text-slate-400 mb-1">
                                                                    <span>PAID</span>
                                                                    <span>{paidPct}%</span>
                                                                </div>
                                                                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-emerald-500" style={{ width: `${paidPct}%` }} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Top Control Grid: Automation & Manual Gen */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        {/* Generate Invoices Card */}
                                        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
                                            <div>
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><FileCheck className="w-5 h-5" /></div>
                                                    <div>
                                                        <h3 className="font-extrabold text-slate-800 text-base">Generate Invoices</h3>
                                                        <p className="text-xs text-slate-500 mt-0.5">Create billing invoices for students based on assigned fee groups</p>
                                                    </div>
                                                </div>
                                                {invoiceMsg && (
                                                    <div className={`p-3.5 rounded-2xl flex items-center gap-2.5 text-xs mb-4 ${invoiceMsg.type === 'error' ? 'bg-rose-50 border border-rose-200 text-rose-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
                                                        {invoiceMsg.type === 'error' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
                                                        <span className="flex-1 font-semibold">{invoiceMsg.text}</span>
                                                        <button onClick={() => setInvoiceMsg(null)} className="cursor-pointer text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
                                                    <div>
                                                        <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Session</label>
                                                        <select value={assignSession} onChange={e => { setAssignSession(e.target.value); loadUnpaidInvoices(); }} className="w-full px-2 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 font-semibold outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all">
                                                            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_current ? ' (Current)' : ''}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Billing Month *</label>
                                                        <input type="month" value={billingMonth} onChange={e => setBillingMonth(e.target.value)}
                                                            className="w-full px-2 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 font-semibold outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Fee Group (Opt)</label>
                                                        <select value={invoiceGroupFilter} onChange={e => setInvoiceGroupFilter(e.target.value)} className="w-full px-2 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 font-semibold outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all">
                                                            <option value="">All Groups</option>
                                                            {feeGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Class (Opt)</label>
                                                        <select value={invoiceClassFilter} onChange={e => setInvoiceClassFilter(e.target.value)} className="w-full px-2 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 font-semibold outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all">
                                                            <option value="">All Classes</option>
                                                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Due Date *</label>
                                                        <input type="date" value={invoiceDueDate} onChange={e => setInvoiceDueDate(e.target.value)}
                                                            className="w-full px-2 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 font-semibold outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-slate-100 mt-2">
                                                <button onClick={handlePreviewInvoices} disabled={previewLoading || !assignSession || !billingMonth}
                                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs disabled:opacity-50 cursor-pointer transition-all shadow-md shadow-blue-500/10">
                                                    {previewLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Preparing Preview...</> : <><FileCheck className="w-3.5 h-3.5" />Preview & Generate</>}
                                                </button>
                                                <p className="text-[10px] text-slate-400">Generates monthly invoices based on assigned fee packages.</p>
                                            </div>
                                        </div>

                                        {/* Invoice Automation Card */}
                                        {isAdmin && (
                                            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between border-l-4 border-l-emerald-500">
                                                <div>
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><Clock className="w-5 h-5" /></div>
                                                            <div>
                                                                <h3 className="font-extrabold text-slate-800 text-base">Invoice Automation</h3>
                                                                <p className="text-xs text-slate-500 mt-0.5">Automatically generate invoices every month on a set day</p>
                                                            </div>
                                                        </div>
                                                        <button onClick={() => setAutoInvoiceEnabled(v => !v)} className="cursor-pointer transition-transform hover:scale-105 active:scale-95">{autoInvoiceEnabled ? <ToggleRight className="w-9 h-9 text-emerald-500" /> : <ToggleLeft className="w-9 h-9 text-slate-300" />}</button>
                                                    </div>

                                                    <div className="space-y-3 mt-4">
                                                        {autoInvoiceEnabled ? (
                                                            <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                                                                <span className="text-xs font-semibold text-slate-700">Billing Day of the Month</span>
                                                                <select value={autoInvoiceDay} onChange={e => setAutoInvoiceDay(parseInt(e.target.value))} className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white font-bold outline-none focus:ring-2 focus:ring-emerald-500 font-semibold">
                                                                    {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                                                                        <option key={day} value={day}>{day}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        ) : (
                                                            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-center text-xs text-slate-400 font-medium">
                                                                Auto-generation is disabled. Enable it to run monthly billing automatically.
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="pt-3 border-t border-slate-100 mt-4">
                                                    <button onClick={saveSettings} disabled={savingSettings} className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shadow-sm transition-all">
                                                        {savingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                                        {savingSettings ? 'Saving...' : 'Save Automation Config'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Preview Modal (V3 before generating) */}
                                    {invoicePreview && (
                                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl animate-scaleIn max-h-[85vh] flex flex-col">
                                                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                                                    <div>
                                                        <h2 className="text-lg font-bold text-slate-800">Invoice Generation Preview</h2>
                                                        <p className="text-xs text-slate-500 mt-0.5">Billing month: <span className="font-bold text-slate-700">{billingMonth}</span> · Review targets below before committing</p>
                                                    </div>
                                                    <button onClick={() => setInvoicePreview(null)} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
                                                </div>

                                                <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
                                                    {/* Summary grids */}
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                        <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-2xl">
                                                            <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">In Scope</p>
                                                            <p className="text-lg font-extrabold text-blue-800 mt-1">{invoicePreview.totalStudentsInScope || 0}</p>
                                                        </div>
                                                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl">
                                                            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Will Generate</p>
                                                            <p className="text-lg font-extrabold text-emerald-700 mt-1">{invoicePreview.willCreate || 0}</p>
                                                        </div>
                                                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-2xl">
                                                            <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Already Billed</p>
                                                            <p className="text-lg font-extrabold text-amber-700 mt-1">{invoicePreview.willSkip || 0}</p>
                                                        </div>
                                                        <div className="p-3 bg-rose-50 border border-rose-100 rounded-2xl">
                                                            <p className="text-[9px] font-bold text-rose-600 uppercase tracking-wider">Estimated Total</p>
                                                            <p className="text-base font-extrabold text-rose-700 mt-1">₹{invoicePreview.totalAmount?.toLocaleString('en-IN')}</p>
                                                        </div>
                                                    </div>

                                                    {invoicePreview.unassigned > 0 && (
                                                        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs font-semibold flex items-center gap-2">
                                                            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                                                            <span>Warning: {invoicePreview.unassigned} students in this session have no fee groups assigned and will be skipped.</span>
                                                        </div>
                                                    )}

                                                    {/* Fee breakdown table */}
                                                    <div className="border border-slate-100 rounded-2xl overflow-hidden">
                                                        <div className="p-3 bg-slate-50 border-b border-slate-100">
                                                            <h4 className="text-xs font-bold text-slate-700">Fee Head Breakdown</h4>
                                                        </div>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-xs text-left">
                                                                <thead>
                                                                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-500 font-extrabold uppercase">
                                                                        <th className="px-4 py-2">Fee Head</th>
                                                                        <th className="px-4 py-2">Frequency</th>
                                                                        <th className="px-4 py-2 text-center">Students</th>
                                                                        <th className="px-4 py-2 text-right">Per Student</th>
                                                                        <th className="px-4 py-2 text-right">Subtotal</th>
                                                                        <th className="px-4 py-2 text-center">Status</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-50">
                                                                    {invoicePreview.feeBreakdown?.length === 0 ? (
                                                                        <tr>
                                                                            <td colSpan={6} className="px-4 py-6 text-center text-slate-400 font-semibold">No items eligible for billing in this month.</td>
                                                                        </tr>
                                                                    ) : (
                                                                        invoicePreview.feeBreakdown?.map((item: any, i: number) => (
                                                                            <tr key={i} className={item.included ? 'hover:bg-slate-50/50' : 'bg-slate-50/30 text-slate-400'}>
                                                                                <td className="px-4 py-2.5 font-bold text-slate-700">{item.name}</td>
                                                                                <td className="px-4 py-2.5 font-medium capitalize text-slate-500">{item.frequency?.replace('_', ' ')}</td>
                                                                                <td className="px-4 py-2.5 text-center font-bold">{item.studentCount}</td>
                                                                                <td className="px-4 py-2.5 text-right font-bold">₹{item.perStudent?.toLocaleString('en-IN')}</td>
                                                                                <td className="px-4 py-2.5 text-right font-extrabold text-slate-700">₹{item.total?.toLocaleString('en-IN')}</td>
                                                                                <td className="px-4 py-2.5 text-center">
                                                                                    {item.included ? (
                                                                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[9px] font-bold">Active</span>
                                                                                    ) : (
                                                                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded-md text-[9px] font-bold" title={item.reason}>Skipped</span>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        ))
                                                                    )}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="pt-4 border-t border-slate-100 flex gap-3">
                                                    <button onClick={() => setInvoicePreview(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer font-semibold">
                                                        Cancel
                                                    </button>
                                                    <button onClick={() => { handleGenerateInvoices().then(() => loadUnpaidInvoices()); }} disabled={generatingInvoices || invoicePreview.willCreate === 0}
                                                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-500/10">
                                                        {generatingInvoices ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
                                                        Confirm & Generate ({invoicePreview.willCreate || 0})
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Grouped Balances Dashboard Table */}
                                    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-100">
                                            <div>
                                                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                                                    <Users className="w-5 h-5 text-slate-400" /> Grouped Unpaid Balances ({groupedList.length} Students)
                                                </h3>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    Summary of outstanding fees grouped by student 
                                                    {selectedCalendarMonth && ` for billing month ${selectedCalendarMonth}`}
                                                </p>
                                            </div>
                                            {/* Filters and search */}
                                            <div className="flex flex-wrap items-center gap-3">
                                                <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                    <input type="text" placeholder="Search student name..." value={invoiceSearchQuery} onChange={e => setInvoiceSearchQuery(e.target.value)}
                                                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50 hover:bg-slate-50 focus:bg-white font-semibold transition-all" />
                                                </div>
                                                
                                                <select value={invoiceTypeFilter} onChange={e => setInvoiceTypeFilter(e.target.value)}
                                                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 hover:bg-slate-50 focus:bg-white font-semibold outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px] transition-all">
                                                    <option value="">All Invoice Types</option>
                                                    {feeHeadFilterOptions.map(h => (
                                                        <option key={h.id} value={h.id}>{h.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                                            {unpaidInvoicesLoading ? (
                                                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
                                            ) : groupedList.length === 0 ? (
                                                <div className="text-center py-12 text-slate-400 font-medium text-xs">No unpaid balances found matching filters.</div>
                                            ) : (
                                                <table className="w-full text-sm text-left">
                                                    <thead>
                                                        <tr className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">
                                                            <th className="px-5 py-3">Student Details</th>
                                                            <th className="px-5 py-3">Class</th>
                                                            <th className="px-5 py-3">Pending Invoices</th>
                                                            <th className="px-5 py-3 text-right">Total Outstanding</th>
                                                            <th className="px-5 py-3 text-center w-24">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50">
                                                        {groupedList.map(s => {
                                                            const initials = s.student_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                                                            // Generate a stable aesthetic color for the initials avatar based on student id
                                                            const hue = s.student_id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
                                                            const avatarBg = `hsl(${hue}, 65%, 90%)`;
                                                            const avatarText = `hsl(${hue}, 70%, 35%)`;

                                                            return (
                                                                <tr key={s.student_id} className="hover:bg-slate-50/40 transition-colors">
                                                                    <td className="px-5 py-3.5">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-xs shrink-0 shadow-sm font-semibold" style={{ backgroundColor: avatarBg, color: avatarText }}>
                                                                                {initials}
                                                                            </div>
                                                                            <div>
                                                                                <p className="font-bold text-slate-800 text-sm">{s.student_name}</p>
                                                                                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Adm: {s.admission_number}</p>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-5 py-3.5">
                                                                        <span className="px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-600 rounded-lg text-xs font-bold">
                                                                            {s.class_name} {s.section_name && `· ${s.section_name}`}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-5 py-3.5">
                                                                        <div className="flex flex-wrap gap-1.5 max-w-[300px]">
                                                                            {s.invoices.map(inv => {
                                                                                const date = inv.billing_month ? new Date(inv.billing_month + '-02') : null;
                                                                                const monthStr = date ? date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : 'regular';
                                                                                return (
                                                                                    <span key={inv.id} className="px-2 py-0.5 bg-rose-50 border border-rose-100 text-rose-700 text-[10px] font-bold rounded-md shrink-0 flex items-center gap-1">
                                                                                        <span>{inv.invoice_number}</span>
                                                                                        <span className="text-[8px] bg-rose-100 px-1 py-0.2 rounded text-rose-800 font-extrabold uppercase">{monthStr}</span>
                                                                                        <span>(₹{parseFloat(inv.total_amount).toLocaleString('en-IN')})</span>
                                                                                    </span>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-5 py-3.5 text-right font-extrabold text-rose-600 text-sm">
                                                                        ₹{s.total_due.toLocaleString('en-IN')}
                                                                    </td>
                                                                    <td className="px-5 py-3.5 text-center">
                                                                        <button onClick={() => setSelectedStudentForInvoices(s)}
                                                                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold rounded-lg text-xs cursor-pointer transition-all flex items-center gap-1 mx-auto hover:shadow-sm">
                                                                            <Pencil className="w-3 h-3" /> Manage
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </div>

                                    {/* Danger Zone: Bulk Delete Section */}
                                    <div className="bg-rose-50/50 border border-rose-200 rounded-3xl p-6 border-l-4 border-l-rose-500">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="p-2.5 bg-rose-100 text-rose-600 rounded-2xl"><AlertTriangle className="w-5 h-5" /></div>
                                            <div>
                                                <h3 className="font-extrabold text-slate-800 text-base">Danger Zone: Bulk Delete Invoices</h3>
                                                <p className="text-xs text-slate-500 mt-0.5">Mass delete mistakenly generated invoices. Only unpaid invoices without completed payments will be deleted.</p>
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                                            <div>
                                                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Delete Target</label>
                                                <select value={bulkDeleteTarget} onChange={e => setBulkDeleteTarget(e.target.value as any)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs bg-white font-semibold outline-none focus:ring-2 focus:ring-rose-500 transition-all">
                                                    <option value="all">All Unpaid Invoices in Session</option>
                                                    <option value="class">Specific Class</option>
                                                    <option value="student">Specific Student</option>
                                                </select>
                                            </div>
                                            
                                            {bulkDeleteTarget === 'class' && (
                                                <div>
                                                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Select Class</label>
                                                    <select value={bulkDeleteClassId} onChange={e => setBulkDeleteClassId(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs bg-white font-semibold outline-none focus:ring-2 focus:ring-rose-500 transition-all">
                                                        <option value="">-- Choose Class --</option>
                                                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                    </select>
                                                </div>
                                            )}
                                            
                                            {bulkDeleteTarget === 'student' && (
                                                <div>
                                                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Select Student</label>
                                                    <select value={bulkDeleteStudentId} onChange={e => setBulkDeleteStudentId(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs bg-white font-semibold outline-none focus:ring-2 focus:ring-rose-500 transition-all">
                                                        <option value="">-- Choose Student --</option>
                                                        {assignments.map(a => <option key={a.student_id} value={a.student_id}>{a.first_name} {a.last_name} ({a.admission_number})</option>)}
                                                    </select>
                                                </div>
                                            )}

                                            <div>
                                                <button onClick={handleBulkDelete} disabled={bulkDeleting || unpaidInvoices.length === 0}
                                                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-xs cursor-pointer shadow-md shadow-rose-500/10 disabled:opacity-50 flex items-center justify-center gap-2 transition-all">
                                                    {bulkDeleting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Deleting...</> : <><Trash2 className="w-3.5 h-3.5" />Delete Selected</>}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Return back button */}
                                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-start">
                                        <button onClick={() => setSetupStep(3)} className="px-5 py-2 text-slate-500 hover:text-slate-800 font-semibold text-xs cursor-pointer transition-colors">← Back to Assign</button>
                                    </div>

                                    {/* Student Invoices Manage Detail Modal */}
                                    {selectedStudentForInvoices && (
                                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                            <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl animate-scaleIn max-h-[90vh] flex flex-col">
                                                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                                                    <div>
                                                        <h2 className="text-lg font-bold text-slate-800">Manage Unpaid Invoices</h2>
                                                        <p className="text-xs text-slate-500 mt-0.5">
                                                            {selectedStudentForInvoices.student_name} (Adm: {selectedStudentForInvoices.admission_number}) · {selectedStudentForInvoices.class_name}
                                                        </p>
                                                    </div>
                                                    <button onClick={() => setSelectedStudentForInvoices(null)} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
                                                </div>

                                                <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
                                                    <div className="p-3.5 bg-rose-50/50 border border-rose-100 rounded-2xl flex items-center justify-between">
                                                        <span className="text-xs font-bold text-rose-700">Total Outstanding Balance</span>
                                                        <span className="text-base font-extrabold text-rose-600">₹{selectedStudentForInvoices.total_due.toLocaleString('en-IN')}</span>
                                                    </div>

                                                    <div className="space-y-3">
                                                        <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Unpaid Invoice List</h4>
                                                        {selectedStudentForInvoices.invoices.map((inv: any) => {
                                                            const date = inv.billing_month ? new Date(inv.billing_month + '-02') : null;
                                                            const monthStr = date ? date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'regular';
                                                            return (
                                                                <div key={inv.id} className="border border-slate-200 hover:border-slate-300 bg-white rounded-2xl p-4 transition-all">
                                                                    <div className="flex items-start justify-between mb-3">
                                                                        <div>
                                                                            <div className="flex items-center gap-2">
                                                                                <p className="font-extrabold text-slate-800 text-sm">{inv.invoice_number}</p>
                                                                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[9px] font-extrabold">{monthStr}</span>
                                                                            </div>
                                                                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Due: {new Date(inv.due_date).toLocaleDateString('en-IN')}</p>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-sm font-extrabold text-rose-600">₹{parseFloat(inv.total_amount).toLocaleString('en-IN')}</span>
                                                                            <button onClick={() => handleDeleteSingleInvoice(inv.id)} disabled={deletingInvoiceId === inv.id}
                                                                                className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 rounded-xl cursor-pointer transition-all disabled:opacity-50" title="Delete this invoice">
                                                                                {deletingInvoiceId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    {/* Invoice Items details */}
                                                                    {inv.items && inv.items.length > 0 && (
                                                                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 space-y-1.5">
                                                                            {inv.items.map((item: any, idx: number) => (
                                                                                <div key={idx} className="flex justify-between text-xs text-slate-600 font-medium">
                                                                                    <span>{item.head_name || item.name}</span>
                                                                                    <span className="font-bold text-slate-700">₹{parseFloat(item.total_amount).toLocaleString('en-IN')}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <div className="pt-4 border-t border-slate-100 flex gap-3">
                                                    <button onClick={() => setSelectedStudentForInvoices(null)} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer font-semibold">
                                                        Close
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

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
                        </>)}


                        {/* ─── Concessions Sub-tab ─── */}
                        {setupSubTab === 'concessions' && (
                            <div className="bg-white border border-gray-200 rounded-2xl p-5">
                                <div className="flex items-center justify-between mb-5">
                                    <div>
                                        <h3 className="font-bold text-gray-900">Concessions & Discounts</h3>
                                        <p className="text-xs text-gray-500">Manage scholarships, sibling discounts, RTE, and other fee concessions</p>
                                    </div>
                                    <button onClick={() => setShowConcessionForm(true)}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white font-bold rounded-xl text-sm cursor-pointer hover:bg-violet-700">
                                        <Plus className="w-4 h-4" /> Add Concession
                                    </button>
                                </div>

                                {concessionsLoading ? (
                                    <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-violet-500 animate-spin" /></div>
                                ) : concessions.length === 0 ? (
                                    <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
                                        <IndianRupee className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                        <p className="text-gray-500 font-bold">No concessions yet</p>
                                        <p className="text-gray-400 text-xs mt-1">Add scholarships, sibling discounts, or RTE concessions</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {concessions.map((c: any) => (
                                            <div key={c.id} className={`flex items-center justify-between p-3.5 rounded-xl border ${c.is_active ? 'bg-violet-50/30 border-violet-100' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700">
                                                        {c.student_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-900 text-sm">{c.student_name}</p>
                                                        <p className="text-xs text-gray-500">
                                                            {c.concession_type === 'percentage' ? `${c.value}% off` : `₹${parseFloat(c.value).toLocaleString('en-IN')} off`}
                                                            {c.fee_head_name ? ` on ${c.fee_head_name}` : ' (all fees)'}
                                                            {c.category && c.category !== 'other' ? ` · ${c.category.replace('_', ' ')}` : ''}
                                                        </p>
                                                        {c.reason && <p className="text-[10px] text-gray-400 mt-0.5">Reason: {c.reason}</p>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.is_active ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                                                        {c.is_active ? 'ACTIVE' : 'INACTIVE'}
                                                    </span>
                                                    {c.is_active && (
                                                        <button onClick={() => { if (confirm('Deactivate this concession?')) deactivateConcession(c.id); }}
                                                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 cursor-pointer" title="Deactivate">
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── Create Concession Modal ─── */}
                        {showConcessionForm && (
                            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowConcessionForm(false)}>
                                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-between mb-5">
                                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><IndianRupee className="w-5 h-5 text-violet-600" /> New Concession</h2>
                                        <button onClick={() => setShowConcessionForm(false)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer"><X className="w-4 h-4" /></button>
                                    </div>

                                    {/* Student search */}
                                    {!concessionStudent ? (
                                        <div className="mb-4">
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Search Student *</label>
                                            <input type="text" value={concessionSearch} onChange={e => searchConcessionStudents(e.target.value)}
                                                placeholder="Type student name or admission no..."
                                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
                                            {concessionResults.length > 0 && (
                                                <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
                                                    {concessionResults.map(s => (
                                                        <button key={s.id} onClick={() => { setConcessionStudent(s); setConcessionResults([]); setConcessionSearch(''); }}
                                                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b last:border-b-0 cursor-pointer">
                                                            <p className="font-semibold text-sm text-gray-900">{s.first_name} {s.last_name}</p>
                                                            <p className="text-xs text-gray-400">Adm: {s.admission_number} · {s.class_name}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl p-3 mb-4">
                                            <div className="w-8 h-8 rounded-full bg-violet-200 flex items-center justify-center text-xs font-bold text-violet-800">{concessionStudent.first_name?.[0]}{concessionStudent.last_name?.[0]}</div>
                                            <div className="flex-1"><p className="font-bold text-sm text-gray-900">{concessionStudent.first_name} {concessionStudent.last_name}</p><p className="text-xs text-gray-500">Adm: {concessionStudent.admission_number}</p></div>
                                            <button onClick={() => setConcessionStudent(null)} className="p-1 rounded hover:bg-violet-100 cursor-pointer"><X className="w-3.5 h-3.5 text-gray-400" /></button>
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Category</label>
                                                <select value={concessionForm.category} onChange={e => setConcessionForm(f => ({ ...f, category: e.target.value }))}
                                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 outline-none">
                                                    <option value="scholarship">Scholarship</option>
                                                    <option value="sibling">Sibling Discount</option>
                                                    <option value="rte">RTE</option>
                                                    <option value="staff_child">Staff Child</option>
                                                    <option value="merit">Merit</option>
                                                    <option value="financial_need">Financial Need</option>
                                                    <option value="other">Other</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Type</label>
                                                <select value={concessionForm.concessionType} onChange={e => setConcessionForm(f => ({ ...f, concessionType: e.target.value }))}
                                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 outline-none">
                                                    <option value="percentage">Percentage (%)</option>
                                                    <option value="fixed_amount">Fixed Amount (₹)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1.5">
                                                    {concessionForm.concessionType === 'percentage' ? 'Percentage (0-100) *' : 'Amount (₹) *'}
                                                </label>
                                                <input type="number" value={concessionForm.value} onChange={e => setConcessionForm(f => ({ ...f, value: e.target.value }))}
                                                    placeholder={concessionForm.concessionType === 'percentage' ? 'e.g. 25' : 'e.g. 5000'}
                                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1.5">Apply to Fee Head</label>
                                                <select value={concessionForm.feeHeadId} onChange={e => setConcessionForm(f => ({ ...f, feeHeadId: e.target.value }))}
                                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-violet-500 outline-none">
                                                    <option value="">All Fees</option>
                                                    {feeHeads.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1.5">Reason</label>
                                            <input type="text" value={concessionForm.reason} onChange={e => setConcessionForm(f => ({ ...f, reason: e.target.value }))}
                                                placeholder="e.g. Scholarship awarded for academic excellence"
                                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
                                        </div>
                                    </div>

                                    <button onClick={handleCreateConcession} disabled={savingConcession || !concessionStudent || !concessionForm.value}
                                        className="w-full mt-5 py-3.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer text-sm transition-all hover:shadow-xl">
                                        {savingConcession ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> Create Concession</>}
                                    </button>
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
                            
                            <button onClick={saveSettings} disabled={savingSettings} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl text-sm disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 hover:bg-emerald-700 mt-4">
                                {savingSettings ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save Settings</>}
                            </button>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-2xl p-6">
                            <h2 className="font-bold text-gray-900 text-lg mb-4">Payment Gateway</h2>
                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                                <div><p className="font-bold text-gray-800">Razorpay</p><p className="text-xs text-gray-500 mt-0.5">Status: <span className={`font-bold ${gatewayStatus === 'configured' ? 'text-emerald-600' : 'text-amber-600'}`}>{gatewayStatus || 'Checking...'}</span></p></div>
                                <button onClick={() => router.push('/settings?tab=payment-gateway')} className="px-4 py-2 border border-gray-200 text-gray-600 font-semibold rounded-xl text-sm hover:bg-gray-50 cursor-pointer">Configure →</button>
                            </div>
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}
