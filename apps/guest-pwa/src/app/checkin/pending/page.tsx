'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth-context';

export default function CheckInPending() {
  const router = useRouter();
  const { identityId } = useAuth();
  const [, setStatus] = useState<'PENDING' | 'ACTIVE' | 'REJECTED'>('PENDING');

  useEffect(() => {
    if (!identityId) return;

    const checkStatus = async () => {
      try {
        const grant = await apiFetch<{ status?: string } | null>(
          `/grants/subject/${identityId}`,
        );
        if (grant && grant.status === 'ACTIVE') {
          setStatus('ACTIVE');
          router.replace('/dashboard');
        }
      } catch {
        // Still pending — keep polling
      }
    };

    // Poll every 5 seconds
    const interval = setInterval(checkStatus, 5000);
    checkStatus();

    return () => clearInterval(interval);
  }, [identityId, router]);

  return (
    <main className="container py-8">
      <div className="card text-center">
        <div className="flex justify-center mb-4">
          <div className="spinner" />
        </div>
        <h1 className="text-xl font-bold mb-4">Check-In Pending</h1>
        <p className="text-gray-500">
          Your check-in request is being reviewed by the front desk.
          This page will update automatically once approved.
        </p>
        <p className="text-sm text-gray-500 mt-4">
          You can also visit the front desk for immediate check-in.
        </p>
      </div>
    </main>
  );
}
