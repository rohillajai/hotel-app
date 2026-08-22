'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await apiFetch<{ access_token: string; refresh_token: string; identity_id: string }>('/auth/staff/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      // Extract department from token payload
      const payload = JSON.parse(atob(res.access_token.split('.')[1]!));
      login(res.access_token, res.refresh_token, res.identity_id, payload.grants?.[0] ?? 'STAFF');
      router.replace('/dashboard');
    } catch (err: any) { setError(err.message ?? 'Login failed'); }
    finally { setLoading(false); }
  };

  return (
    <main style={{ maxWidth: '24rem', margin: '4rem auto', padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Staff Login</h1>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '1rem' }} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '1rem' }} />
          {error && <p style={{ color: '#dc2626', fontSize: '0.875rem' }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ padding: '0.875rem', borderRadius: '0.5rem', background: '#059669', color: '#fff', fontWeight: 600, fontSize: '1rem', border: 'none', cursor: 'pointer' }}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </main>
  );
}
