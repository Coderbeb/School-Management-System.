'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, Loader2, ArrowRight, Eye, EyeOff, School, BookOpen, Users, Shield } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, rememberMe }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Invalid credentials. Please try again.');
                setLoading(false);
                return;
            }

            // Store token and user in localStorage
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            // Redirect to role-specific dashboard
            router.replace(data.dashboardPath || '/dashboard');
        } catch {
            setError('Unable to connect to the server. Please check your internet.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-gray-50">
            {/* Left Side - Brand/Hero Section (Hidden on mobile) */}
            <div className="hidden lg:flex lg:w-1/2 relative bg-gray-900 flex-col justify-between p-12 overflow-hidden">
                {/* Background gradient decoration */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900"></div>
                    <div className="absolute top-20 -left-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
                    <div className="absolute bottom-20 -right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-3xl"></div>
                </div>

                {/* Content */}
                <div className="relative z-10 animate-slide-in-top duration-700">
                    <div className="flex items-center gap-4 text-white mb-12">
                        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-3 rounded-2xl h-16 w-16 flex items-center justify-center shadow-2xl">
                            <School className="w-9 h-9 text-blue-300" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-200 to-white">
                                School Management
                            </span>
                            <span className="text-sm font-semibold text-blue-300 tracking-[0.2em] uppercase">
                                System
                            </span>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 space-y-8 max-w-lg mb-8 animate-fade-in-up duration-1000 delay-200">
                    <h1 className="text-5xl font-extrabold text-white leading-tight tracking-tight">
                        <span className="text-blue-300">Complete</span> School
                        <br />
                        <span className="text-purple-300">Management</span> Platform.
                    </h1>
                    <p className="text-lg text-gray-300 leading-relaxed font-light">
                        One unified platform for attendance, fees, exams, and parent communication.
                        <br />
                        <span className="text-white/80 font-medium">Smart • Automated • Connected</span>
                    </p>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-sm hover:bg-white/10 transition-colors cursor-default">
                            <div className="p-2 rounded-lg bg-blue-500/20">
                                <BookOpen className="w-4 h-4 text-blue-300" />
                            </div>
                            <span className="text-sm text-gray-200 font-medium">Academics & Grades</span>
                        </div>
                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-sm hover:bg-white/10 transition-colors cursor-default">
                            <div className="p-2 rounded-lg bg-emerald-500/20">
                                <Users className="w-4 h-4 text-emerald-300" />
                            </div>
                            <span className="text-sm text-gray-200 font-medium">Student & Parents</span>
                        </div>
                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-sm hover:bg-white/10 transition-colors cursor-default">
                            <div className="p-2 rounded-lg bg-amber-500/20">
                                <Shield className="w-4 h-4 text-amber-300" />
                            </div>
                            <span className="text-sm text-gray-200 font-medium">Fee Management</span>
                        </div>
                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-sm hover:bg-white/10 transition-colors cursor-default">
                            <div className="p-2 rounded-lg bg-purple-500/20">
                                <Mail className="w-4 h-4 text-purple-300" />
                            </div>
                            <span className="text-sm text-gray-200 font-medium">WhatsApp Alerts</span>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 text-xs text-gray-500 border-t border-white/10 pt-6 flex justify-between items-center animate-fade-in duration-1000 delay-500">
                    <span>© {new Date().getFullYear()} School Management System</span>
                    <span className="text-gray-600">Powered by SMS Platform</span>
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 md:p-12 lg:p-24 bg-gray-50 lg:bg-white transition-colors duration-500">
                {/* Mobile Background Decoration */}
                <div className="absolute inset-0 lg:hidden overflow-hidden pointer-events-none z-0">
                    <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-blue-600 to-indigo-800 rounded-b-[3rem]"></div>
                    <div className="absolute top-10 left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                    <div className="absolute top-20 right-10 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl"></div>
                </div>

                <div className="w-full max-w-[420px] space-y-8 relative z-10">

                    {/* Card Container */}
                    <div className="bg-white lg:bg-transparent p-6 sm:p-8 rounded-3xl shadow-xl lg:shadow-none border border-gray-100 lg:border-none animate-scale-in duration-500">

                        {/* Mobile Header Logo */}
                        <div className="lg:hidden flex flex-col items-center gap-4 mb-8">
                            <div className="bg-white p-3 rounded-2xl shadow-lg border border-gray-100 h-20 w-20 flex items-center justify-center relative -mt-16 sm:mt-0">
                                <School className="w-10 h-10 text-blue-600" />
                            </div>
                            <div className="text-center space-y-1">
                                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">SMS Portal</h1>
                                <p className="text-xs text-blue-600 font-semibold tracking-[0.15em] uppercase">School Management System</p>
                            </div>
                        </div>

                        {/* Desktop Header Text */}
                        <div className="hidden lg:block text-left space-y-2 mb-8 animate-fade-in-up delay-100">
                            <h2 className="text-4xl font-bold tracking-tight text-gray-900">Welcome back</h2>
                            <p className="text-gray-500 text-base">Sign in to access your dashboard.</p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in-up delay-200">
                            <div className="space-y-2 group">
                                <Label htmlFor="email" className="text-sm font-semibold text-gray-700 ml-1 group-focus-within:text-blue-600 transition-colors">Email Address</Label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    </div>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="your@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="pl-11 h-12 bg-gray-50/50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all rounded-xl text-base shadow-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 group">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password" className="text-sm font-semibold text-gray-700 ml-1 group-focus-within:text-blue-600 transition-colors">Password</Label>
                                </div>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    </div>
                                    <Input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="pl-11 pr-11 h-12 bg-gray-50/50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all rounded-xl text-base shadow-sm"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-5 w-5" />
                                        ) : (
                                            <Eye className="h-5 w-5" />
                                        )}
                                    </button>
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={rememberMe}
                                            onChange={(e) => setRememberMe(e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        />
                                        <span className="text-xs text-gray-600 font-medium">Remember me for 30 days</span>
                                    </label>
                                </div>
                            </div>

                            {error && (
                                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-sm text-red-600 animate-shake">
                                    <div className="w-2 h-2 bg-red-500 rounded-full mt-1.5 shrink-0" />
                                    <p className="leading-snug font-medium">{error}</p>
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 rounded-xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.98] mt-2 relative overflow-hidden group"
                                disabled={loading}
                            >
                                <span className={`absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out rounded-xl`}></span>
                                {loading ? (
                                    <div className="flex items-center justify-center gap-2 relative z-10">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        <span>Verifying Credentials...</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-2 relative z-10">
                                        <span>Sign In</span>
                                        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                )}
                            </Button>
                        </form>
                    </div>

                    {/* Mobile Footer */}
                    <div className="lg:hidden text-center mt-6 text-xs text-gray-400 font-medium pb-4">
                        © {new Date().getFullYear()} School Management System
                    </div>
                </div>
            </div>
        </div>
    );
}
