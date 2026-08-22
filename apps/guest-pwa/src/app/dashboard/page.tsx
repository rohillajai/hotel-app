'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth-context';

interface GrantData {
  status: string;
  privileges: string[];
  callingRestricted: boolean;
  validUntil: string | null;
  wifiVouchers?: { ssid: string; credential: string; status: string }[];
}

export default function GuestDashboard() {
  const router = useRouter();
  const { identityId, isAuthenticated, logout } = useAuth();
  const [grant, setGrant] = useState<GrantData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/');
      return;
    }

    const fetchGrant = async () => {
      try {
        const data = await apiFetch<GrantData>(`/grants/subject/${identityId}`);
        if (!data || data.status !== 'ACTIVE') {
          // Grant revoked or expired
          logout();
          router.replace('/');
          return;
        }
        setGrant(data);
      } catch {
        // No grant — redirect to check-in
        router.replace('/checkin');
      } finally {
        setLoading(false);
      }
    };

    fetchGrant();
    // Poll every 60s to detect revocation
    const interval = setInterval(fetchGrant, 60000);
    return () => clearInterval(interval);
  }, [identityId, isAuthenticated, logout, router]);

  if (loading) {
    return (
      <main className="container py-8 flex justify-center">
        <div className="spinner" />
      </main>
    );
  }

  if (!grant) return null;

  const wifi = grant.wifiVouchers?.find((v) => v.status === 'ACTIVE');
  const callingDisabled = grant.callingRestricted || !grant.privileges.includes('CALLING');

  return (
    <main className="container py-8">
      <h1 className="text-2xl font-bold mb-6">Welcome</h1>

      {/* WiFi Card */}
      {wifi && (
        <div className="card mb-4 bg-blue-50">
          <h2 className="font-semibold text-lg mb-2">WiFi Access</h2>
          <p className="text-sm"><strong>SSID:</strong> {wifi.ssid}</p>
          <p className="text-sm"><strong>Password:</strong> {wifi.credential}</p>
          {grant.validUntil && (
            <p className="text-sm text-gray-500 mt-2">
              Valid until {new Date(grant.validUntil).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* Call Buttons */}
      <div className="card mb-4">
        <h2 className="font-semibold text-lg mb-4">Call Hotel Services</h2>
        {callingDisabled && (
          <p className="text-sm error-text mb-4">Calling is currently restricted on your account.</p>
        )}
        <div className="flex flex-col gap-3">
          {['RECEPTION', 'HOUSEKEEPING', 'ROOM_SERVICE'].map((dept) => (
            <button
              key={dept}
              className="btn btn-primary"
              disabled={callingDisabled}
              onClick={() => router.push(`/call/${dept}`)}
              style={{ opacity: callingDisabled ? 0.5 : 1 }}
            >
              {dept === 'ROOM_SERVICE' ? 'Room Service' : dept.charAt(0) + dept.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Service Requests */}
      <div className="card">
        <div className="flex items-center" style={{ justifyContent: 'space-between' }}>
          <h2 className="font-semibold text-lg">Service Requests</h2>
          <button
            className="btn btn-primary"
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            onClick={() => router.push('/requests/new')}
          >
            + New Request
          </button>
        </div>
      </div>
    </main>
  );
}
