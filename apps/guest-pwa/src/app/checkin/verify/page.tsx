'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/context/auth-context';

export default function CheckInVerifyOtp() {
  const router = useRouter();
  const { login } = useAuth();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendDisabled, setResendDisabled] = useState(true);
  const [countdown, setCountdown] = useState(60);
  const inputRef = useRef<HTMLInputElement>(null);

  const mobile = typeof window !== 'undefined'
    ? sessionStorage.getItem('checkin_mobile') ?? ''
    : '';

  useEffect(() => {
    inputRef.current?.focus();
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          setResendDisabled(false);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (otp.length !== 6) {
      setError('Enter the 6-digit OTP.');
      return;
    }

    setLoading(true);
    try {
      const result = await apiFetch<{
        access_token: string;
        refresh_token: string;
        identity_id: string;
        is_new: boolean;
      }>('/auth/guest/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ mobile, otp }),
      });

      login(result.access_token, result.refresh_token, result.identity_id);

      // Now self-register with booking details
      const bookingRef = sessionStorage.getItem('checkin_booking_ref') ?? '';
      const fullName = sessionStorage.getItem('checkin_full_name') ?? '';

      try {
        await apiFetch('/identities/self-register', {
          method: 'POST',
          body: JSON.stringify({ booking_ref: bookingRef, full_name: fullName }),
        });
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 409) {
          setError('A record with this booking already exists. Please check in at the front desk.');
          setLoading(false);
          return;
        }
        throw err;
      }

      router.push('/checkin/upload');
    } catch (err: any) {
      setError(err.message ?? 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendDisabled(true);
    setCountdown(60);
    try {
      await apiFetch('/auth/guest/otp/send', {
        method: 'POST',
        body: JSON.stringify({ mobile }),
      });
    } catch {
      setError('Failed to resend OTP.');
    }
  };

  return (
    <main className="container py-8">
      <div className="card">
        <h1 className="text-xl font-bold mb-4">Verify OTP</h1>
        <p className="text-sm text-gray-500 mb-6">
          Enter the 6-digit code sent to {mobile}
        </p>

        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <input
            ref={inputRef}
            className="input text-center text-2xl"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoComplete="one-time-code"
          />

          {error && <p className="error-text">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading || otp.length !== 6}
          >
            {loading ? 'Verifying...' : 'Verify & Continue'}
          </button>
        </form>

        <div className="text-center mt-4">
          <button
            className="text-sm text-blue-700"
            disabled={resendDisabled}
            onClick={handleResend}
            style={{ background: 'none', border: 'none', cursor: resendDisabled ? 'default' : 'pointer' }}
          >
            {resendDisabled ? `Resend OTP in ${countdown}s` : 'Resend OTP'}
          </button>
        </div>
      </div>
    </main>
  );
}
