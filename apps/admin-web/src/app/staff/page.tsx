'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface DirEntry { id: string; displayName: string; designation: string | null; isActive: boolean; orgUnit?: { name: string }; }

export default function StaffPage() {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dept, setDept] = useState('RECEPTION');

  const load = async () => { const data = await apiFetch<DirEntry[]>('/directory/entries'); setEntries(data); };
  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    // 1. Create identity
    const identity = await apiFetch<{ id: string }>('/identities', { method: 'POST', body: JSON.stringify({ entity_type: 'STAFF', profile: { full_name: name, email, password_hash: password, department: dept } }) });
    // 2. Get department org unit
    const tree = await apiFetch<any[]>('/directory/units');
    const root = tree[0];
    const deptUnit = root?.children?.find((c: any) => c.metadata?.slug === dept || c.name.toUpperCase().replace(' ', '_') === dept);
    if (deptUnit) {
      await apiFetch('/directory/entries', { method: 'POST', body: JSON.stringify({ org_unit_id: deptUnit.id, identity_id: identity.id, display_name: name, designation: `${dept} Staff` }) });
    }
    setShowAdd(false); setName(''); setEmail(''); setPassword(''); load();
  };

  const deactivate = async (id: string) => {
    if (!confirm('Deactivate this staff member?')) return;
    await apiFetch(`/directory/entries/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <main style={{ maxWidth: '60rem', margin: '2rem auto', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Staff Directory</h1>
        <button onClick={() => setShowAdd(true)} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#1e40af', color: '#fff', border: 'none', cursor: 'pointer' }}>+ Add Staff</button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <thead><tr style={{ background: '#f9fafb', textAlign: 'left' }}><th style={{ padding: '0.75rem' }}>Name</th><th style={{ padding: '0.75rem' }}>Department</th><th style={{ padding: '0.75rem' }}>Designation</th><th style={{ padding: '0.75rem' }}>Actions</th></tr></thead>
        <tbody>
          {entries.filter(e => e.isActive).map((e) => (
            <tr key={e.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.75rem' }}>{e.displayName}</td>
              <td style={{ padding: '0.75rem' }}>{e.orgUnit?.name ?? '—'}</td>
              <td style={{ padding: '0.75rem' }}>{e.designation ?? '—'}</td>
              <td style={{ padding: '0.75rem' }}><button onClick={() => deactivate(e.id)} style={{ padding: '0.25rem 0.5rem', borderRadius: '0.25rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', fontSize: '0.8rem' }}>Deactivate</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <form onSubmit={handleAdd} style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', width: '90%', maxWidth: '24rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h2 style={{ fontWeight: 700 }}>Add Staff</h2>
            <input placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} required style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }} />
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }} />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }} />
            <select value={dept} onChange={(e) => setDept(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}>
              <option value="RECEPTION">Reception</option>
              <option value="HOUSEKEEPING">Housekeeping</option>
              <option value="ROOM_SERVICE">Room Service</option>
            </select>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="submit" style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', background: '#059669', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Create</button>
              <button type="button" onClick={() => setShowAdd(false)} style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#e5e7eb', border: 'none', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
