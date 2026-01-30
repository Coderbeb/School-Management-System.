'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, Loader2, GraduationCap, ArrowRight, CheckCircle2, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
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

            // Redirect to dashboard
            router.push('/dashboard');
        } catch (err) {
            setError('Unable to connect to the server. Please check your internet.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-gray-50">
            {/* Left Side - Brand/Hero Section (Hidden on mobile) */}
            <div className="hidden lg:flex lg:w-1/2 relative bg-gray-900 flex-col justify-between p-12 overflow-hidden">
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-20">
                    <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-500 blur-3xl mix-blend-screen"></div>
                    <div className="absolute top-1/2 left-1/2 w-96 h-96 rounded-full bg-purple-500 blur-3xl mix-blend-screen animate-pulse"></div>
                    <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-indigo-500 blur-3xl mix-blend-screen"></div>
                </div>

                {/* Content */}
                <div className="relative z-10">
                    <div className="flex items-center gap-3 text-white mb-12">
                        <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm">
                            <GraduationCap className="w-8 h-8" />
                        </div>
                        <span className="text-2xl font-bold tracking-tight">College Attend</span>
                    </div>
                </div>

                <div className="relative z-10 space-y-6 max-w-lg">
                    <h1 className="text-5xl font-extrabold text-white leading-tight tracking-tight">
                        Streamline Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Attendance</span> Management.
                    </h1>
                    <p className="text-lg text-gray-300 leading-relaxed">
                        A powerful, secure, and modern platform customized for HODs, Teachers, and Administrators to manage academic records efficiently.
                    </p>

                    <div className="space-y-4 pt-4">
                        <div className="flex items-center gap-3 text-white/80">
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                            <span>Real-time attendance tracking</span>
                        </div>
                        <div className="flex items-center gap-3 text-white/80">
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                            <span>Comprehensive analytics & reports</span>
                        </div>
                        <div className="flex items-center gap-3 text-white/80">
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                            <span>Role-based access control</span>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 text-xs text-gray-500">
                    © {new Date().getFullYear()} College Attendance System.
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 md:p-12 lg:p-24 bg-white/50 backdrop-blur-3xl">
                <div className="w-full max-w-[400px] space-y-8">

                    {/* Mobile Logo (Visible only on mobile) */}
                    <div className="lg:hidden flex justify-center mb-8">
                        <div className="flex items-center gap-2">
                            <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg">
                                <GraduationCap className="w-6 h-6" />
                            </div>
                            <span className="text-xl font-bold text-gray-900">College Attend</span>
                        </div>
                    </div>

                    <div className="text-center lg:text-left space-y-2">
                        <h2 className="text-3xl font-bold tracking-tight text-gray-900">Welcome back</h2>
                        <p className="text-gray-500 text-sm">Please sign in to access your dashboard.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email Address</Label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                </div>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="admin@college.edu"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-10 h-11 bg-gray-50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all rounded-xl"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                </div>
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10 pr-10 h-11 bg-gray-50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all rounded-xl"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-5 w-5" />
                                    ) : (
                                        <Eye className="h-5 w-5" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-sm text-red-600 animate-in fade-in slide-in-from-top-2">
                                <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                                {error}
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full h-11 text-base bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                            disabled={loading}
                        >
                            {loading ? (
                                <div className="flex items-center justify-center gap-2">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    <span>Verifying...</span>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center gap-2">
                                    <span>Sign in to Dashboard</span>
                                    <ArrowRight className="h-4 w-4" />
                                </div>
                            )}
                        </Button>
                    </form>

                    <div className="pt-4 text-center">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-gray-200" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white/50 px-2 text-gray-500 uppercase tracking-wider backdrop-blur-xl">
                                    Default Credentials
                                </span>
                            </div>
                        </div>

                        <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-800">
                            <strong>Admin:</strong> admin@college.edu / admin123
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
