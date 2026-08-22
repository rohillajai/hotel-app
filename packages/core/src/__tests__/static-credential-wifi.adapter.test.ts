import { describe, it, expect } from 'vitest';
import { StaticCredentialWifiAdapter } from '../adapters/static-credential-wifi.adapter';

const BASE_REQUEST = {
  grantId: 'grant-123',
  subjectId: 'subject-456',
  tenantId: 'tenant-789',
  validFrom: new Date(),
  validUntil: new Date(Date.now() + 86400_000),
  roomIdentifier: '201',
};

describe('StaticCredentialWifiAdapter', () => {
  it('returns configured SSID and credential', async () => {
    const adapter = new StaticCredentialWifiAdapter({
      ssid: 'Hotel-Guest',
      credential: 'SecurePass99!',
    });

    const result = await adapter.provisionVoucher(BASE_REQUEST);

    expect(result.ssid).toBe('Hotel-Guest');
    expect(result.credential).toBe('SecurePass99!');
    expect(result.externalId).toBeUndefined();
  });

  it('throws when credential is the default placeholder', async () => {
    const adapter = new StaticCredentialWifiAdapter({
      ssid: 'Hotel-Guest',
      credential: 'changeme-before-demo',
    });

    await expect(adapter.provisionVoucher(BASE_REQUEST)).rejects.toThrow(
      /not configured/,
    );
  });

  it('throws when ssid is empty', async () => {
    const adapter = new StaticCredentialWifiAdapter({
      ssid: '',
      credential: 'ValidPass!',
    });

    await expect(adapter.provisionVoucher(BASE_REQUEST)).rejects.toThrow();
  });

  it('revokeVoucher is a no-op and does not throw', async () => {
    const adapter = new StaticCredentialWifiAdapter({
      ssid: 'Hotel-Guest',
      credential: 'SecurePass99!',
    });

    await expect(adapter.revokeVoucher(undefined)).resolves.toBeUndefined();
    await expect(adapter.revokeVoucher('some-external-id')).resolves.toBeUndefined();
  });

  it('isAvailable returns true when config is valid', async () => {
    const adapter = new StaticCredentialWifiAdapter({
      ssid: 'Hotel-Guest',
      credential: 'SecurePass99!',
    });
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when credential is placeholder', async () => {
    const adapter = new StaticCredentialWifiAdapter({
      ssid: 'Hotel-Guest',
      credential: 'changeme-before-demo',
    });
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('adapterName is StaticCredential', () => {
    const adapter = new StaticCredentialWifiAdapter({ ssid: 'x', credential: 'y' });
    expect(adapter.adapterName).toBe('StaticCredential');
  });
});
