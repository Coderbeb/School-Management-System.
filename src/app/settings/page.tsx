'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Navbar } from '@/components/ui/Navbar';
import { MobileSidebar } from '@/components/ui/MobileSidebar';
import { 
    Save, Mail, Eye, EyeOff, ToggleLeft, ToggleRight, CheckCircle, 
    Shield, AlertTriangle, Loader2, Settings, Building2, Key, Upload, Camera,
    CreditCard
} from 'lucide-react';
import { AccessDenied } from '@/components/ui/access-denied';

interface User {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
}

export function SettingsPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'automation' | 'payment-gateway'>('profile');

    useEffect(() => {
        const tab = searchParams?.get('tab');
        if (tab === 'payment-gateway' || tab === 'security' || tab === 'automation') {
            setActiveTab(tab);
        }
    }, [searchParams]);

    // ── Payment Gateway State ──
    const [savedKeyId, setSavedKeyId] = useState('');
    const [keyId, setKeyId] = useState('');
    const [keySecret, setKeySecret] = useState('');
    const [webhookSecret, setWebhookSecret] = useState('');
    const [gatewayActive, setGatewayActive] = useState(false);
    const [bankName, setBankName] = useState('');
    const [bankAccountNumber, setBankAccountNumber] = useState('');
    const [bankIfsc, setBankIfsc] = useState('');
    const [bankAccountName, setBankAccountName] = useState('');
    const [loadingGateway, setLoadingGateway] = useState(false);
    const [savingGateway, setSavingGateway] = useState(false);
    const [testingGateway, setTestingGateway] = useState(false);
    const [gatewayMessage, setGatewayMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

    // ── School Profile State ──
    const [schoolProfile, setSchoolProfile] = useState({
        name: '', short_name: '', address: '', city: '', state: '', 
        pincode: '', phone: '', email: '', website: '', principal_name: '', logo_url: ''
    });
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileMessage, setProfileMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Security State ──
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

    // ── Email Automation State ──
    const [emailAddress, setEmailAddress] = useState('');
    const [emailPassword, setEmailPassword] = useState('');
    const [emailEnabled, setEmailEnabled] = useState(false);
    const [showEmailPassword, setShowEmailPassword] = useState(false);
    const [emailPasswordHint, setEmailPasswordHint] = useState('');
    const [emailPasswordSet, setEmailPasswordSet] = useState(false);
    const [loadingEmail, setLoadingEmail] = useState(false);
    const [savingEmail, setSavingEmail] = useState(false);
    const [emailMessage, setEmailMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');

        if (!token || !userData) {
            router.replace('/login');
            return;
        }

        try {
            const parsedUser = JSON.parse(userData);
            setUser(parsedUser);
        } catch {
            router.replace('/login');
        }
        setLoading(false);

        // Check for active tab in URL query params
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        if (tab === 'payment-gateway') {
            setActiveTab('payment-gateway');
        }
    }, [router]);

    // ── Fetch Initial Data ──
    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            if (user.role !== 'super_admin') return;

            const token = localStorage.getItem('token');
            
            // Fetch School Profile & Branding
            try {
                const res = await fetch('/api/settings/school-branding', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const b = data.branding;
                    setSchoolProfile({
                        name: b.schoolName || '',
                        short_name: b.shortName || '',
                        address: b.address || '',
                        city: b.city || '',
                        state: b.state || '',
                        pincode: b.pincode || '',
                        phone: b.phone || '',
                        email: b.email || '',
                        website: b.website || '',
                        principal_name: b.principalName || '',
                        logo_url: b.logoUrl || ''
                    });
                }
            } catch (err) { console.error(err); }

            // Fetch Email Config
            setLoadingEmail(true);
            try {
                const response = await fetch('/api/settings/email-config', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setEmailAddress(data.email || '');
                    setEmailPasswordSet(data.passwordSet || false);
                    setEmailPasswordHint(data.passwordHint || '');
                    setEmailEnabled(data.enabled || false);
                }
            } catch (err) { console.error(err); }
            finally { setLoadingEmail(false); }

            // Fetch Payment Gateway Config
            setLoadingGateway(true);
            try {
                const response = await fetch('/api/settings/payment-gateway', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.config) {
                        setSavedKeyId(data.config.key_id || '');
                        setGatewayActive(data.config.is_active || false);
                        setBankName(data.config.bank_name || '');
                        setBankAccountNumber(data.config.bank_account_number || '');
                        setBankIfsc(data.config.bank_ifsc || '');
                        setBankAccountName(data.config.bank_account_name || '');
                    }
                }
            } catch (err) { console.error(err); }
            finally { setLoadingGateway(false); }
        };

        fetchData();
    }, [user]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/login');
    };

    // ── Handle Image Upload ──
    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) { // 2MB limit
            setProfileMessage({ type: 'error', text: 'Logo size must be less than 2MB' });
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            setSchoolProfile(prev => ({ ...prev, logo_url: base64String }));
        };
        reader.readAsDataURL(file);
    };

    // ── Save School Profile ──
    const handleSaveProfile = async () => {
        setSavingProfile(true);
        setProfileMessage(null);
        try {
            const res = await fetch('/api/settings/school-profile', {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}` 
                },
                body: JSON.stringify(schoolProfile)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save profile');
            
            // Also update the branding settings to ensure logo renders everywhere
            await fetch('/api/settings/school-branding', {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}` 
                },
                body: JSON.stringify({ logoUrl: schoolProfile.logo_url, navbarTitle: schoolProfile.short_name })
            });

            setProfileMessage({ type: 'success', text: 'School profile updated! Refresh the page to see changes globally.' });
        } catch (error: any) {
            setProfileMessage({ type: 'error', text: error.message });
        } finally {
            setSavingProfile(false);
        }
    };

    // ── Save Password ──
    const handleSavePassword = async () => {
        if (newPassword !== confirmPassword) {
            setPasswordMessage({ type: 'error', text: 'New passwords do not match' });
            return;
        }
        
        setSavingPassword(true);
        setPasswordMessage(null);
        try {
            const res = await fetch('/api/settings/password', {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}` 
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update password');
            
            setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            setPasswordMessage({ type: 'error', text: error.message });
        } finally {
            setSavingPassword(false);
        }
    };

    // ── Save Email Config ──
    const handleSaveEmailConfig = async () => {
        setSavingEmail(true);
        setEmailMessage(null);

        try {
            const response = await fetch('/api/settings/email-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    email: emailAddress,
                    password: emailPassword || '', // empty means keep existing
                    enabled: emailEnabled,
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save email config');

            setEmailMessage({ type: 'success', text: 'Email configuration saved successfully!' });
            setEmailPassword('');
            setEmailPasswordSet(true);
            setEmailPasswordHint(emailPassword ? `****${emailPassword.slice(-4)}` : emailPasswordHint);
        } catch (error: any) {
            setEmailMessage({ type: 'error', text: error.message });
        } finally {
            setSavingEmail(false);
        }
    };

    // ── Save Payment Gateway Config ──
    const handleSaveGateway = async () => {
        setSavingGateway(true);
        setGatewayMessage(null);
        try {
            const res = await fetch('/api/settings/payment-gateway', {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}` 
                },
                body: JSON.stringify({
                    keyId: keyId || '',
                    keySecret,
                    webhookSecret,
                    isActive: gatewayActive,
                    bankName,
                    bankAccountNumber,
                    bankIfsc,
                    bankAccountName
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save payment gateway settings');
            
            setGatewayMessage({ type: 'success', text: 'Payment gateway configuration saved successfully!' });
            // clear secrets and keys so they show masked or empty
            setKeyId('');
            setKeySecret('');
            setWebhookSecret('');
            // Optional: re-fetch to update the masked ID
            if (user) {
                const token = localStorage.getItem('token');
                fetch('/api/settings/payment-gateway', { headers: { 'Authorization': `Bearer ${token}` } })
                    .then(res => res.json())
                    .then(d => { if (d.config) setSavedKeyId(d.config.key_id || ''); })
                    .catch(() => {});
            }
        } catch (error: any) {
            setGatewayMessage({ type: 'error', text: error.message });
        } finally {
            setSavingGateway(false);
        }
    };

    // ── Test Razorpay Connection ──
    const handleTestGateway = async () => {
        if (!keyId || !keySecret) {
            setGatewayMessage({ type: 'error', text: 'Please enter both Key ID and Key Secret to test the connection.' });
            return;
        }
        setTestingGateway(true);
        setGatewayMessage(null);
        try {
            const res = await fetch('/api/settings/payment-gateway/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ keyId, keySecret })
            });
            const data = await res.json();
            if (data.success) {
                setGatewayMessage({
                    type: 'success',
                    text: `✅ ${data.message} (Mode: ${data.keyType === 'test' ? 'Test/Sandbox' : 'Live/Production'})`
                });
            } else {
                throw new Error(data.error || 'Connection test failed');
            }
        } catch (error: any) {
            setGatewayMessage({ type: 'error', text: error.message });
        } finally {
            setTestingGateway(false);
        }
    };


    if (loading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (user.role !== 'super_admin') {
        return <AccessDenied />;
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} onLogout={handleLogout} />
            <Navbar user={user} onMenuClick={() => setSidebarOpen(true)} onLogout={handleLogout} />

            <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 mt-16">
                
                {/* Hero / Welcome Section */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-gray-900 to-slate-800 text-white p-6 sm:p-8 mb-8 shadow-xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-indigo-500 rounded-full mix-blend-screen filter blur-3xl opacity-30"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-indigo-400 font-semibold tracking-wide uppercase text-sm">System</span>
                            </div>
                            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                                Platform Settings
                            </h1>
                            <p className="text-indigo-100 text-sm max-w-xl">
                                Configure your school's profile, security, and automation settings.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex space-x-2 bg-white p-1 rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-x-auto">
                    <button onClick={() => setActiveTab('profile')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'profile' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <Building2 className="w-4 h-4" /> School Profile
                    </button>
                    <button onClick={() => setActiveTab('security')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'security' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <Key className="w-4 h-4" /> Security
                    </button>
                    <button onClick={() => setActiveTab('automation')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'automation' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <Mail className="w-4 h-4" /> Automations
                    </button>
                    <button onClick={() => setActiveTab('payment-gateway')} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'payment-gateway' ? 'bg-amber-50 text-amber-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
                        <CreditCard className="w-4 h-4" /> Payment Gateway
                    </button>
                </div>

                {/* TAB: SCHOOL PROFILE */}
                {activeTab === 'profile' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                            <h2 className="text-lg font-bold text-gray-900">School Profile & Branding</h2>
                            <p className="text-sm text-gray-500">Update how your school appears across the platform to students and teachers.</p>
                        </div>
                        <div className="p-6">
                            {profileMessage && (
                                <div className={`p-4 rounded-xl mb-6 text-sm flex items-start gap-3 ${profileMessage.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                                    {profileMessage.type === 'error' ? <AlertTriangle className="w-5 h-5 flex-shrink-0" /> : <CheckCircle className="w-5 h-5 flex-shrink-0" />}
                                    <p className="font-medium mt-0.5">{profileMessage.text}</p>
                                </div>
                            )}

                            {/* Logo Upload */}
                            <div className="mb-8 flex items-center gap-6">
                                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                    <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 overflow-hidden flex items-center justify-center bg-gray-50 group-hover:border-blue-500 transition-colors">
                                        {schoolProfile.logo_url ? (
                                            <img src={schoolProfile.logo_url} alt="Logo" className="w-full h-full object-cover" />
                                        ) : (
                                            <Building2 className="w-8 h-8 text-gray-400" />
                                        )}
                                    </div>
                                    <div className="absolute inset-0 bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <Camera className="w-6 h-6 text-white" />
                                    </div>
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 mb-1">School Logo</h3>
                                    <p className="text-xs text-gray-500 mb-3">Square format recommended. Max 2MB (JPG, PNG).</p>
                                    <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-white border border-gray-200 text-sm font-bold rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
                                        Upload Image
                                    </button>
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleLogoUpload} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">School Name</label>
                                    <input type="text" value={schoolProfile.name} onChange={e => setSchoolProfile({...schoolProfile, name: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Short Name (For Top Nav)</label>
                                    <input type="text" value={schoolProfile.short_name} onChange={e => setSchoolProfile({...schoolProfile, short_name: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors text-sm" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                                    <input type="text" value={schoolProfile.address} onChange={e => setSchoolProfile({...schoolProfile, address: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">City</label>
                                    <input type="text" value={schoolProfile.city} onChange={e => setSchoolProfile({...schoolProfile, city: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">State</label>
                                    <input type="text" value={schoolProfile.state} onChange={e => setSchoolProfile({...schoolProfile, state: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Support Email</label>
                                    <input type="email" value={schoolProfile.email} onChange={e => setSchoolProfile({...schoolProfile, email: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Support Phone</label>
                                    <input type="text" value={schoolProfile.phone} onChange={e => setSchoolProfile({...schoolProfile, phone: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors text-sm" />
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                                <button onClick={handleSaveProfile} disabled={savingProfile} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2">
                                    {savingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Save Profile
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: SECURITY */}
                {activeTab === 'security' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl">
                        <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                            <h2 className="text-lg font-bold text-gray-900">Change Password</h2>
                            <p className="text-sm text-gray-500">Update your Super Admin login password.</p>
                        </div>
                        <div className="p-6 space-y-5">
                            {passwordMessage && (
                                <div className={`p-4 rounded-xl mb-4 text-sm flex items-start gap-3 ${passwordMessage.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                                    {passwordMessage.type === 'error' ? <AlertTriangle className="w-5 h-5 flex-shrink-0" /> : <CheckCircle className="w-5 h-5 flex-shrink-0" />}
                                    <p className="font-medium mt-0.5">{passwordMessage.text}</p>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Current Password</label>
                                <div className="relative">
                                    <input type={showCurrentPassword ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" />
                                    <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                                        {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">New Password</label>
                                <div className="relative">
                                    <input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" />
                                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm New Password</label>
                                <div className="relative">
                                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end">
                                <button onClick={handleSavePassword} disabled={savingPassword || !currentPassword || !newPassword} className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:bg-gray-300">
                                    {savingPassword ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Update Password
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: EMAIL AUTOMATION */}
                {activeTab === 'automation' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl">
                        <div className="p-4 sm:p-6 border-b border-gray-100 bg-gradient-to-r from-emerald-50/80 to-teal-50/50">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                                    <Mail className="w-5 h-5" />
                                </div>
                                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Email Automation</h2>
                                <div className="ml-auto flex items-center gap-2">
                                    <span className={`text-xs font-semibold ${emailEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                                        {emailEnabled ? 'ENABLED' : 'DISABLED'}
                                    </span>
                                    <button onClick={() => setEmailEnabled(!emailEnabled)} className="transition-transform active:scale-95">
                                        {emailEnabled ? <ToggleRight className="w-10 h-10 text-green-500" /> : <ToggleLeft className="w-10 h-10 text-gray-300" />}
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-500 mt-1">Automatically send monthly PDF Report Cards via email to students whose attendance falls below 60%.</p>
                        </div>

                        <div className="p-4 sm:p-6">
                            {emailMessage && (
                                <div className={`p-4 rounded-xl mb-6 text-sm flex items-start gap-3 ${emailMessage.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                                    {emailMessage.type === 'error' ? <AlertTriangle className="w-5 h-5 flex-shrink-0" /> : <CheckCircle className="w-5 h-5 flex-shrink-0" />}
                                    <p className="font-medium mt-0.5">{emailMessage.text}</p>
                                </div>
                            )}

                            {loadingEmail ? (
                                <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
                            ) : (
                                <>
                                    <div className="mb-5">
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Gmail Address</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input type="email" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="your-school-email@gmail.com" className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-colors" />
                                        </div>
                                    </div>

                                    <div className="mb-6">
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                                            App Password (16 characters)
                                            {emailPasswordSet && !emailPassword && <span className="ml-2 text-xs font-normal text-green-600">✓ Password is saved ({emailPasswordHint})</span>}
                                        </label>
                                        <div className="relative">
                                            <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input type={showEmailPassword ? 'text' : 'password'} value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} placeholder={emailPasswordSet ? 'Leave empty to keep current password' : 'xxxx xxxx xxxx xxxx'} className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:bg-white font-mono" />
                                            <button type="button" onClick={() => setShowEmailPassword(!showEmailPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                                {showEmailPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex justify-end">
                                        <button onClick={handleSaveEmailConfig} disabled={savingEmail || !emailAddress} className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:bg-gray-300">
                                            {savingEmail ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Save Email Settings
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB: PAYMENT GATEWAY */}
                {activeTab === 'payment-gateway' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="p-4 sm:p-6 border-b border-gray-100 bg-gradient-to-r from-amber-50/80 to-orange-50/50">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0">
                                    <CreditCard className="w-5 h-5" />
                                </div>
                                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Razorpay Payment Gateway</h2>
                                <div className="ml-auto flex items-center gap-2">
                                    <span className={`text-xs font-semibold ${gatewayActive ? 'text-green-600' : 'text-gray-400'}`}>
                                        {gatewayActive ? 'ENABLED' : 'DISABLED'}
                                    </span>
                                    <button onClick={() => setGatewayActive(!gatewayActive)} className="transition-transform active:scale-95">
                                        {gatewayActive ? <ToggleRight className="w-10 h-10 text-green-500" /> : <ToggleLeft className="w-10 h-10 text-gray-300" />}
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs sm:text-sm text-gray-500 mt-1">Configure your institution's custom Razorpay account to receive online fee payments directly from students.</p>
                        </div>

                        <div className="p-4 sm:p-6">
                            {gatewayMessage && (
                                <div className={`p-4 rounded-xl mb-6 text-sm flex items-start gap-3 ${gatewayMessage.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                                    {gatewayMessage.type === 'error' ? <AlertTriangle className="w-5 h-5 flex-shrink-0" /> : <CheckCircle className="w-5 h-5 flex-shrink-0" />}
                                    <p className="font-medium mt-0.5">{gatewayMessage.text}</p>
                                </div>
                            )}

                            {loadingGateway ? (
                                <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Razorpay Credentials Group */}
                                    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                                        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                                            <Shield className="w-4 h-4 text-amber-600" /> Razorpay API Credentials
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-600 mb-2">Key ID</label>
                                                <input type="text" value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder={savedKeyId || "rzp_live_xxxxxxxxxxxxxx"} className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 transition-colors font-mono" />
                                                {savedKeyId && <p className="text-xs text-gray-400 mt-1">Current: {savedKeyId}</p>}
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-600 mb-2">Key Secret</label>
                                                <input type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} placeholder="••••••••••••••••" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 transition-colors font-mono" />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-semibold text-gray-600 mb-2">Webhook Secret (Optional — for async verification)</label>
                                                <input type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="••••••••••••••••" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 transition-colors font-mono" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Settlement Bank Details Group */}
                                    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                                        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                                            <Building2 className="w-4 h-4 text-amber-600" /> Bank Settlement Details (For Receipts)
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-600 mb-2">Bank Name</label>
                                                <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="State Bank of India" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 transition-colors" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-600 mb-2">Account Name</label>
                                                <input type="text" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} placeholder="School Management A/C" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 transition-colors" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-600 mb-2">Account Number</label>
                                                <input type="text" value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} placeholder="309100293021" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 transition-colors font-mono" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-600 mb-2">IFSC Code</label>
                                                <input type="text" value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value)} placeholder="SBIN0001048" className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 transition-colors font-mono" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
                                        <button onClick={handleTestGateway} disabled={testingGateway || !keyId || !keySecret} className="px-5 py-3 bg-white border-2 border-amber-300 text-amber-700 font-bold rounded-xl hover:bg-amber-50 transition-colors flex items-center justify-center gap-2 disabled:bg-gray-100 disabled:border-gray-200 disabled:text-gray-400 cursor-pointer">
                                            {testingGateway ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />} Test Connection
                                        </button>
                                        <button onClick={handleSaveGateway} disabled={savingGateway || (!savedKeyId && !keyId)} className="px-6 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-colors flex items-center justify-center gap-2 disabled:bg-gray-300 shadow-md shadow-amber-600/10 cursor-pointer">
                                            {savingGateway ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Save Gateway Config
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}

export default function SettingsPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>}>
            <SettingsPageContent />
        </Suspense>
    );
}
