import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { generateTurnCredentials, buildIceServers } from '../webrtc/webrtc-client';

const TURN_CONFIG = {
  host: 'turn.example.com',
  port: 3478,
  secret: 'test-coturn-secret',
  realm: 'turn.example.com',
  ttlSeconds: 3600,
};

describe('generateTurnCredentials()', () => {
  it('generates username with timestamp:userId format', () => {
    const creds = generateTurnCredentials('user-001', TURN_CONFIG);
    const parts = creds.username.split(':');
    expect(parts).toHaveLength(2);
    expect(parts[1]).toBe('user-001');
    // Timestamp should be in the future (now + ttl)
    const timestamp = parseInt(parts[0]!, 10);
    expect(timestamp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('generates HMAC-SHA1 credential matching coturn expected format', () => {
    const creds = generateTurnCredentials('user-001', TURN_CONFIG);
    // Verify the credential matches what coturn would compute
    const expected = createHmac('sha1', TURN_CONFIG.secret)
      .update(creds.username)
      .digest('base64');
    expect(creds.credential).toBe(expected);
  });

  it('returns the configured TTL', () => {
    const creds = generateTurnCredentials('user-001', TURN_CONFIG);
    expect(creds.ttl).toBe(3600);
  });

  it('generates different credentials for different users', () => {
    const c1 = generateTurnCredentials('user-001', TURN_CONFIG);
    const c2 = generateTurnCredentials('user-002', TURN_CONFIG);
    expect(c1.credential).not.toBe(c2.credential);
    expect(c1.username).not.toBe(c2.username);
  });

  it('generates different credentials with different secrets', () => {
    const c1 = generateTurnCredentials('user-001', TURN_CONFIG);
    const c2 = generateTurnCredentials('user-001', { ...TURN_CONFIG, secret: 'other-secret' });
    expect(c1.credential).not.toBe(c2.credential);
  });
});

describe('buildIceServers()', () => {
  it('returns STUN and TURN server entries', () => {
    const creds = generateTurnCredentials('user-001', TURN_CONFIG);
    const servers = buildIceServers(TURN_CONFIG, creds);

    expect(servers).toHaveLength(2);

    // STUN entry
    expect(servers[0]!.urls).toBe('stun:turn.example.com:3478');
    expect(servers[0]!.username).toBeUndefined();

    // TURN entry
    expect(servers[1]!.urls).toContain('turn:turn.example.com:3478');
    expect(servers[1]!.username).toBe(creds.username);
    expect(servers[1]!.credential).toBe(creds.credential);
  });

  it('includes UDP transport variant in TURN URLs', () => {
    const creds = generateTurnCredentials('user-001', TURN_CONFIG);
    const servers = buildIceServers(TURN_CONFIG, creds);
    const turnUrls = servers[1]!.urls as string[];
    expect(turnUrls.some((u) => u.includes('transport=udp'))).toBe(true);
  });
});
