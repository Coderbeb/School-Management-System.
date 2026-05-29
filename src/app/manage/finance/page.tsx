'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function FinanceRedirect() {
    const router = useRouter();
    useEffect(() => { router.replace('/manage/fee-management'); }, [router]);
    return null;
}
