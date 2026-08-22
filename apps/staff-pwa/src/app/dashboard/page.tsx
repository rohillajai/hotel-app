'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth-context';

interface ServiceReq { id: string; category: string; roomIdentifier: string; status: string; createdAt: string; }

export default function StaffDashboard() {
  const router = useRouter();
  const { isAuthenticated, department, logout } = useAuth();
  const [requests, setRequests] = useState<ServiceReq[]>([]);

  useEffect(() => {
    if (!isAuthenticated) { router.replace('/login'); return; }
    const load = async () => {
      try {
        const data = await apiFetch<ServiceReq[]>(`/service-requests?department=${department ?? ''}`);
        setRequests(data);
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated, department, router]);

  const updateStatus = async (id: string, status: string) => {
    await apiFetch(`/service-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
  };

  return (
    <main style={{ maxWidth: '28rem', margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Staff Dashboard</h1>
        <button onClick={logout} style={{ fontSize: '0.875rem', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>Logout</button>
      </div>

      {/* Incoming calls indicator */}
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <p style={{ fontWeight: 600 }}>Incoming Calls</p>
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Call notifications appear here when a guest calls your department.</p>
        <button onClick={() => router.push('/call')} style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#059669', color: '#fff', border: 'none', cursor: 'pointer' }}>
          Open Call Screen
        </button>
      </div>

      {/* Service Requests */}
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>Service Requests ({requests.filter(r => r.status !== 'COMPLETED').length})</h2>
        {requests.length === 0 && <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No pending requests.</p>}
        {requests.filter(r => r.status !== 'COMPLETED').map((req) => (
          <div key={req.id} style={{ borderBottom: '1px solid #e5e7eb', padding: '0.75rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 500 }}>Room {req.roomIdentifier}</span>
              <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', background: req.status === 'SUBMITTED' ? '#fef3c7' : '#d1fae5', color: req.status === 'SUBMITTED' ? '#92400e' : '#065f46' }}>{req.status}</span>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{req.category}</p>
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
              {req.status === 'SUBMITTED' && <button onClick={() => updateStatus(req.id, 'IN_PROGRESS')} style={{ padding: '0.25rem 0.75rem', borderRadius: '0.25rem', background: '#2563eb', color: '#fff', border: 'none', fontSize: '0.8rem', cursor: 'pointer' }}>Accept</button>}
              {req.status === 'IN_PROGRESS' && <button onClick={() => updateStatus(req.id, 'COMPLETED')} style={{ padding: '0.25rem 0.75rem', borderRadius: '0.25rem', background: '#059669', color: '#fff', border: 'none', fontSize: '0.8rem', cursor: 'pointer' }}>Complete</button>}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
