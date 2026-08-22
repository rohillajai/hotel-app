'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function CheckInStep1() {
  const router = useRouter();
  const [bookingRef, setBookingRef] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!bookingRef.trim() || !fullName.trim() || !mobile.trim()) {
      setError('All fields are required.');
      return;
    }

    // Validate mobile format
    if (!/^\+[1-9]\d{6,14}$/.test(mobile)) {
      setError('Enter mobile in E.164 format (e.g. +919876543210)');
      return;
    }

    setLoading(true);
    try {
      await apiFetch('/auth/guest/otp/send', {
        method: 'POST',
        body: JSON.stringify({ mobile }),
      });

      // Store booking details for later steps
      sessionStorage.setItem('checkin_booking_ref', bookingRef.trim());
      sessionStorage.setItem('checkin_full_name', fullName.trim());
      sessionStorage.setItem('checkin_mobile', mobile.trim());

      router.push('/checkin/verify');
    } catch (err: any) {
      setError(err.message ?? 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container py-8">
      <div className="card">
        <h1 className="text-xl font-bold mb-4">Check In — Step 1</h1>
        <p className="text-sm text-gray-500 mb-6">Enter your booking details to begin</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="bookingRef">Booking Reference</label>
            <input
              id="bookingRef"
              className="input"
              type="text"
              placeholder="e.g. BK-20260822-001"
              value={bookingRef}
              onChange={(e) => setBookingRef(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div>
            <label className="label" htmlFor="fullName">Full Name</label>
            <input
              id="fullName"
              className="input"
              type="text"
              placeholder="As on your ID"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div>
            <label className="label" htmlFor="mobile">Mobile Number</label>
            <input
              id="mobile"
              className="input"
              type="tel"
              placeholder="+919876543210"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              autoComplete="tel"
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary btn-lg mt-2"
            disabled={loading}
          >
            {loading ? 'Sending OTP...' : 'Continue'}
          </button>
        </form>
      </div>
    </main>
  );
}
