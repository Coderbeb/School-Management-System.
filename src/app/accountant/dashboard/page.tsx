'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Accountant dashboard — now redirects to the unified Finance Dashboard.
 * The Finance Dashboard at /manage/finance handles both super_admin and accountant roles
 * with role-based tab visibility.
 */
export default function AccountantDashboardRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/manage/finance');
    }, [router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
            <div className="flex flex-col items-center gap-4 text-white">
                <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-emerald-400 font-medium">Redirecting to Finance Dashboard...</p>
            </div>
        </div>
    );
}
