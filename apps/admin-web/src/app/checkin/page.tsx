'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface PendingRecord { id: string; profile: { full_name?: string; booking_ref?: string; mobile?: string }; createdAt: string; }

export default function CheckInApproval() {
  const [records, setRecords] = useState<PendingRecord[]>([]);
  const [selected, setSelected] = useState<PendingRecord | null>(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [room, setRoom] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => { const data = await apiFetch<PendingRecord[]>('/identities'); setRecords(data); };
  useEffect(() => { load(); }, []);

  const handleApprove = async () => {
    if (!selected || !checkIn || !checkOut) return;
    setLoading(true);
    try {
      await apiFetch(`/identities/${selected.id}/approve`, { method: 'PATCH', body: JSON.stringify({ check_in_dt: new Date(checkIn).toISOString(), check_out_dt: new Date(checkOut).toISOString(), room_number: room || undefined }) });
      setSelected(null); load();
    } catch (err: any) { alert(err.message); }
    finally { setLoading(false); }
  };

  const handleReject = async () => {
    if (!selected) return;
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    await apiFetch(`/identities/${selected.id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason }) });
    setSelected(null); load();
  };

  return (
    <main style={{ maxWidth: '60rem', margin: '2rem auto', padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Pending Check-Ins</h1>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '0.5rem', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <thead><tr style={{ background: '#f9fafb', textAlign: 'left' }}>
          <th style={{ padding: '0.75rem' }}>Name</th>
          <th style={{ padding: '0.75rem' }}>Booking Ref</th>
          <th style={{ padding: '0.75rem' }}>Submitted</th>
          <th style={{ padding: '0.75rem' }}>Action</th>
        </tr></thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.75rem' }}>{r.profile?.full_name ?? '—'}</td>
              <td style={{ padding: '0.75rem' }}>{r.profile?.booking_ref ?? '—'}</td>
              <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>{new Date(r.createdAt).toLocaleString()}</td>
              <td style={{ padding: '0.75rem' }}><button onClick={() => setSelected(r)} style={{ padding: '0.375rem 0.75rem', borderRadius: '0.25rem', background: '#1e40af', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>Review</button></td>
            </tr>
          ))}
          {records.length === 0 && <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>No pending check-ins</td></tr>}
        </tbody>
      </table>

      {/* Review Modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', width: '90%', maxWidth: '28rem' }}>
            <h2 style={{ fontWeight: 700, marginBottom: '1rem' }}>Review Check-In</h2>
            <p><strong>Name:</strong> {selected.profile?.full_name}</p>
            <p><strong>Booking:</strong> {selected.profile?.booking_ref}</p>
            <p><strong>Mobile:</strong> {selected.profile?.mobile}</p>
            <hr style={{ margin: '1rem 0' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Check-in Date/Time
                <input type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', marginTop: '0.25rem' }} />
              </label>
              <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Check-out Date/Time
                <input type="datetime-local" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', marginTop: '0.25rem' }} />
              </label>
              <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Room Number
                <input type="text" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. 201" style={{ display: 'block', width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', marginTop: '0.25rem' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={handleApprove} disabled={loading || !checkIn || !checkOut} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', background: '#059669', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Approve</button>
              <button onClick={handleReject} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', background: '#dc2626', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Reject</button>
              <button onClick={() => setSelected(null)} style={{ padding: '0.75rem', borderRadius: '0.5rem', background: '#e5e7eb', border: 'none', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
