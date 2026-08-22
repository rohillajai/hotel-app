'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { apiFetch } from '@/lib/api';

export default function AdminDashboard() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) { router.replace('/login'); return; }
    apiFetch<any[]>('/identities').then((d) => setPendingCount(d.length)).catch(() => {});
  }, [isAuthenticated, router]);

  const nav = [
    { label: 'Check-Ins', href: '/checkin', badge: pendingCount },
    { label: 'Guests', href: '/guests' },
    { label: 'Staff', href: '/staff' },
    { label: 'Calls', href: '/calls' },
    { label: 'Settings', href: '/settings' },
  ];

  return (
    <main style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{ width: '14rem', background: '#1e293b', color: '#fff', padding: '1.5rem 0' }}>
        <h2 style={{ padding: '0 1rem', fontSize: '1.125rem', fontWeight: 700, marginBottom: '2rem' }}>Hotel Admin</h2>
        <nav>
          {nav.map((item) => (
            <a key={item.href} href={item.href} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', color: '#cbd5e1', textDecoration: 'none', fontSize: '0.9rem' }}>
              <span>{item.label}</span>
              {item.badge ? <span style={{ background: '#ef4444', color: '#fff', borderRadius: '9999px', padding: '0.1rem 0.5rem', fontSize: '0.75rem' }}>{item.badge}</span> : null}
            </a>
          ))}
        </nav>
        <div style={{ position: 'absolute', bottom: '1rem', left: '1rem' }}>
          <button onClick={logout} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem' }}>Logout</button>
        </div>
      </aside>

      {/* Content */}
      <section style={{ flex: 1, padding: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Dashboard</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <p style={{ fontSize: '2rem', fontWeight: 700 }}>{pendingCount}</p>
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Pending Check-Ins</p>
          </div>
        </div>
      </section>
    </main>
  );
}
