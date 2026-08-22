'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { useEffect } from 'react';

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  return (
    <main className="container py-8 flex flex-col items-center justify-center min-h-screen">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold">Welcome to Hotel Guest</h1>
        <p className="text-gray-500 mt-2">Check in digitally and access hotel services</p>
      </div>

      <button
        className="btn btn-primary btn-lg"
        onClick={() => router.push('/checkin')}
      >
        Check In
      </button>
    </main>
  );
}
