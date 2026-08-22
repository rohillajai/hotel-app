'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface CallLog { id: string; roomIdentifier: string; calleeDept: string; durationSecs: number | null; outcome: string | null; initiatedAt: string; turnRelayed: boolean; }

export default function CallsPage() {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [dept, setDept] = useState('');
  const [room, setRoom] = useState('');

  const load = async () => {
    const params = new URLSearchParams();
    if (dept) params.set('department', dept);
    if (room) params.set('room', room);
    const data = await apiFetch<CallLog[]>(`/calls?${params.toString()}`);
    setLogs(data);
  };

  useEffect(() => { load(); }, []);

  return (
    <main style={{ maxWidth: '70rem', margin: '2rem auto', padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>Call Logs</h1>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>Metadata only — audio is not recorded.</p>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <select value={dept} onChange={(e) => setDept(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}>
          <option value="">All Departments</option>
          <option value="RECEPTION">Reception</option>
          <option value="HOUSEKEEPING">Housekeeping</option>
          <option value="ROOM_SERVICE">Room Service</option>
        </select>
        <input placeholder="Room #" value={room} onChange={(e) => setRoom(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', width: '6rem' }} />
        <button onClick={load} style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', background: '#1e40af', color: '#fff', border: 'none', cursor: 'pointer' }}>Filter</button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontSize: '0.875rem' }}>
        <thead><tr style={{ background: '#f9fafb', textAlign: 'left' }}><th style={{ padding: '0.6rem' }}>Time</th><th style={{ padding: '0.6rem' }}>Room</th><th style={{ padding: '0.6rem' }}>Dept</th><th style={{ padding: '0.6rem' }}>Duration</th><th style={{ padding: '0.6rem' }}>Outcome</th><th style={{ padding: '0.6rem' }}>TURN</th></tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.6rem' }}>{new Date(l.initiatedAt).toLocaleString()}</td>
              <td style={{ padding: '0.6rem' }}>{l.roomIdentifier ?? '—'}</td>
              <td style={{ padding: '0.6rem' }}>{l.calleeDept ?? '—'}</td>
              <td style={{ padding: '0.6rem' }}>{l.durationSecs != null ? `${l.durationSecs}s` : '—'}</td>
              <td style={{ padding: '0.6rem' }}>{l.outcome ?? '—'}</td>
              <td style={{ padding: '0.6rem' }}>{l.turnRelayed ? 'Yes' : 'No'}</td>
            </tr>
          ))}
          {logs.length === 0 && <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>No call logs found</td></tr>}
        </tbody>
      </table>
    </main>
  );
}
