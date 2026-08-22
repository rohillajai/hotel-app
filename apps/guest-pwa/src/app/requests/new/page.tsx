'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function NewRequestPage() {
  const router = useRouter();
  const [department, setDepartment] = useState('HOUSEKEEPING');
  const [category, setCategory] = useState('LAUNDRY');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const categories: Record<string, string[]> = {
    HOUSEKEEPING: ['LAUNDRY', 'CLEANING', 'TOWELS', 'AMENITIES'],
    ROOM_SERVICE: ['FOOD_ORDER'],
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await apiFetch('/service-requests', { method: 'POST', body: JSON.stringify({ department, category, details: { notes } }) });
      router.push('/dashboard');
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <main className="container py-8">
      <div className="card">
        <h1 className="text-xl font-bold mb-4">New Service Request</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="label">Department</label>
            <select className="input" value={department} onChange={(e) => { setDepartment(e.target.value); setCategory(categories[e.target.value]?.[0] ?? ''); }}>
              <option value="HOUSEKEEPING">Housekeeping</option>
              <option value="ROOM_SERVICE">Room Service</option>
            </select>
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {(categories[department] ?? []).map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions..." style={{ resize: 'vertical' }} />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>{loading ? 'Submitting...' : 'Submit Request'}</button>
        </form>
      </div>
    </main>
  );
}
