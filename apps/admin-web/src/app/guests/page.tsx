'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Guest { id: string; profile: { full_name?: string; room_number?: string; booking_ref?: string }; status: string; }
interface Grant { id: string; status: string; validUntil: string | null; callingRestricted: boolean; }

export default function GuestsPage() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [selectedGrant, setSelectedGrant] = useState<Grant | null>(null);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);

  useEffect(() => {
    // For now load all active identities of type GUEST
    apiFetch<Guest[]>('/identities').then(setGuests).catch(() => {});
  }, []);

  const handleCheckout = async (grantId: string) => {
    if (!confirm('This will immediately revoke WiFi, calling, and log the guest out. Continue?')) return;
    await apiFetch(`/grants/${grantId}/revoke`, { method: 'PATCH', body: JSON.stringify({ reason: 'EARLY_CHECKOUT' }) });
    alert('Guest checked out successfully.');
    setSelectedGrant(null);
  };

  const viewGrant = async (guest: Guest) => {
    setSelectedGuest(guest);
    try {
      const grant = await apiFetch<Grant>(`/grants/subject/${guest.id}`);
      setSelectedGrant(grant);
    } catch { setSelectedGrant(null); }
  };

  return (
    <main style={{ maxWidth: '60rem', margin: '2rem auto', padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Guests</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <thead><tr style={{ background: '#f9fafb', textAlign: 'left' }}>
          <th style={{ padding: '0.75rem' }}>Name</th>
          <th style={{ padding: '0.75rem' }}>Room</th>
          <th style={{ padding: '0.75rem' }}>Status</th>
          <th style={{ padding: '0.75rem' }}>Actions</th>
        </tr></thead>
        <tbody>
          {guests.filter(g => g.status === 'ACTIVE').map((g) => (
            <tr key={g.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={{ padding: '0.75rem' }}>{g.profile?.full_name ?? '—'}</td>
              <td style={{ padding: '0.75rem' }}>{g.profile?.room_number ?? '—'}</td>
              <td style={{ padding: '0.75rem' }}><span style={{ padding: '0.2rem 0.5rem', borderRadius: '0.25rem', background: '#d1fae5', color: '#065f46', fontSize: '0.75rem' }}>{g.status}</span></td>
              <td style={{ padding: '0.75rem' }}><button onClick={() => viewGrant(g)} style={{ padding: '0.375rem 0.75rem', borderRadius: '0.25rem', background: '#1e40af', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>Manage</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedGuest && selectedGrant && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', width: '90%', maxWidth: '24rem' }}>
            <h2 style={{ fontWeight: 700 }}>{selectedGuest.profile?.full_name}</h2>
            <p>Room: {selectedGuest.profile?.room_number ?? '—'}</p>
            <p>Grant Status: {selectedGrant.status}</p>
            {selectedGrant.validUntil && <p>Checkout: {new Date(selectedGrant.validUntil).toLocaleString()}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
              {selectedGrant.status === 'ACTIVE' && <button onClick={() => handleCheckout(selectedGrant.id)} style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', background: '#dc2626', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Early Checkout</button>}
              <button onClick={() => { setSelectedGuest(null); setSelectedGrant(null); }} style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', background: '#e5e7eb', border: 'none', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
