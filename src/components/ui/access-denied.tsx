'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldX } from 'lucide-react';

interface AccessDeniedProps {
    message?: string;
}

export function AccessDenied({ message = "You don't have permission to access this page." }: AccessDeniedProps) {
    const router = useRouter();

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <div className="mx-auto mb-4 w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                        <ShieldX className="w-8 h-8 text-red-600" />
                    </div>
                    <CardTitle className="text-2xl text-red-600">Access Denied</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-gray-600">{message}</p>
                    <Button onClick={() => router.push('/dashboard')} className="w-full">
                        Return to Dashboard
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
