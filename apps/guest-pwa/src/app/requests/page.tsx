'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Req { id: string; category: string; department: string; status: string; createdAt: string; }

export default function RequestsListPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<Req[]>([]);

  useEffect(() => {
    apiFetch<Req[]>('/service-requests').then(setRequests).catch(() => {});
  }, []);

  const statusColor = (s: string) => {
    switch (s) {
      case 'SUBMITTED': return { bg: '#fef3c7', color: '#92400e' };
      case 'IN_PROGRESS': return { bg: '#dbeafe', color: '#1e40af' };
      case 'COMPLETED': return { bg: '#d1fae5', color: '#065f46' };
      default: return { bg: '#f3f4f6', color: '#374151' };
    }
  };

  return (
    <main className="container py-8">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 className="text-xl font-bold">My Requests</h1>
        <button className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={() => router.push('/requests/new')}>+ New</button>
      </div>
      {requests.length === 0 && <p style={{ color: '#6b7280' }}>No service requests yet.</p>}
      {requests.map((r) => (
        <div key={r.id} className="card mb-4" style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="font-semibold">{r.category.replace('_', ' ')}</span>
            <span style={{ ...statusColor(r.status), padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}>{r.status}</span>
          </div>
          <p className="text-sm" style={{ color: '#6b7280', marginTop: '0.25rem' }}>{r.department} • {new Date(r.createdAt).toLocaleString()}</p>
        </div>
      ))}
      <button className="btn btn-primary btn-lg mt-4" onClick={() => router.push('/dashboard')}>Back to Dashboard</button>
    </main>
  );
}
