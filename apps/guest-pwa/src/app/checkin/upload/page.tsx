'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth-context';

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

export default function CheckInUpload() {
  const router = useRouter();
  const { identityId } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!ALLOWED_TYPES.includes(selected.type)) {
      setError('Please select a JPEG, PNG, or PDF file.');
      return;
    }
    if (selected.size > MAX_SIZE) {
      setError('File must be under 5 MB.');
      return;
    }

    setError('');
    setFile(selected);

    // Show preview for images
    if (selected.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(selected);
    } else {
      setPreview(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !identityId) return;

    setLoading(true);
    setProgress(30);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      setProgress(60);

      await apiFetch(`/identities/${identityId}/documents`, {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set multipart Content-Type
      });

      setProgress(100);

      // Check hotel's checkin_mode — for now go to pending (STAFF_CONFIRM is default)
      router.push('/checkin/pending');
    } catch (err: any) {
      setError(err.message ?? 'Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container py-8">
      <div className="card">
        <h1 className="text-xl font-bold mb-4">Upload ID Document</h1>
        <p className="text-sm text-gray-500 mb-6">
          Upload a government-issued ID (Aadhaar, Passport, DL). JPEG, PNG, or PDF, max 5 MB.
        </p>

        <div
          className="border rounded-lg p-4 text-center mb-4"
          style={{ borderStyle: 'dashed', cursor: 'pointer' }}
          onClick={() => inputRef.current?.click()}
        >
          {preview ? (
            <img
              src={preview}
              alt="ID preview"
              style={{ maxWidth: '100%', maxHeight: '200px', margin: '0 auto', borderRadius: '0.5rem' }}
            />
          ) : file ? (
            <p className="text-sm">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>
          ) : (
            <p className="text-gray-500">Tap to select a file</p>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        {loading && (
          <div style={{ height: '4px', background: '#e5e7eb', borderRadius: '2px', marginBottom: '1rem' }}>
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: '#1e40af',
                borderRadius: '2px',
                transition: 'width 0.3s',
              }}
            />
          </div>
        )}

        {error && <p className="error-text mb-4">{error}</p>}

        <button
          className="btn btn-primary btn-lg"
          onClick={handleUpload}
          disabled={!file || loading}
        >
          {loading ? 'Uploading...' : 'Upload & Continue'}
        </button>
      </div>
    </main>
  );
}
