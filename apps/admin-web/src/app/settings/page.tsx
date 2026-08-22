'use client';
import { useState } from 'react';

export default function SettingsPage() {
  const [checkinMode, setCheckinMode] = useState('STAFF_CONFIRM');
  const [ssid, setSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [rateLimit, setRateLimit] = useState('10');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // TODO: wire to PATCH /tenants/:id/config endpoint
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <main style={{ maxWidth: '40rem', margin: '2rem auto', padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Hotel Settings</h1>

      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1rem' }}>
        <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>Check-In Mode</h2>
        <select value={checkinMode} onChange={(e) => setCheckinMode(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', width: '100%' }}>
          <option value="STAFF_CONFIRM">Staff Confirm (front desk reviews each check-in)</option>
          <option value="AUTO_APPROVE">Auto Approve (guest checks in without staff review)</option>
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1rem' }}>
        <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>WiFi Configuration</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input placeholder="SSID" value={ssid} onChange={(e) => setSsid(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }} />
          <input type="password" placeholder="Password" value={wifiPass} onChange={(e) => setWifiPass(e.target.value)} style={{ padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }} />
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1rem' }}>
        <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>Call Rate Limiting</h2>
        <label style={{ fontSize: '0.875rem' }}>Max calls per guest per hour
          <input type="number" value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} min="1" max="100" style={{ display: 'block', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', marginTop: '0.25rem', width: '6rem' }} />
        </label>
      </div>

      <button onClick={handleSave} style={{ padding: '0.875rem 2rem', borderRadius: '0.5rem', background: '#1e40af', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
        Save Settings
      </button>
      {saved && <p style={{ color: '#059669', marginTop: '0.5rem', fontSize: '0.875rem' }}>Settings saved.</p>}
    </main>
  );
}
