import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WebPushCallWakeStrategy,
  type PushSubscriptionData,
  type WebPushStrategyDeps,
} from '../adapters/web-push-call-wake.strategy';
import type { IncomingCallPayload } from '../interfaces/call-wake-strategy.interface';

const PAYLOAD: IncomingCallPayload = {
  callId: 'call-uuid-001',
  calleeIdentityId: 'staff-uuid-001',
  fromRoom: '201',
  tenantId: 'tenant-001',
  initiatedAt: new Date().toISOString(),
};

const MOCK_SUB: PushSubscriptionData = {
  endpoint: 'https://fcm.googleapis.com/example',
  keys: { p256dh: 'key-p256dh', auth: 'key-auth' },
};

function makeDeps(overrides: Partial<WebPushStrategyDeps> = {}): WebPushStrategyDeps {
  return {
    getSubscriptions: vi.fn().mockResolvedValue([MOCK_SUB]),
    sender: { send: vi.fn().mockResolvedValue(undefined) },
    logger: { warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
}

describe('WebPushCallWakeStrategy', () => {
  it('strategyType is WEB_PUSH', () => {
    const strategy = new WebPushCallWakeStrategy(makeDeps());
    expect(strategy.strategyType).toBe('WEB_PUSH');
  });

  it('sends push to all subscriptions for the callee', async () => {
    const deps = makeDeps();
    const strategy = new WebPushCallWakeStrategy(deps);

    await strategy.sendIncomingCallNotification(PAYLOAD);

    expect(deps.getSubscriptions).toHaveBeenCalledWith(PAYLOAD.calleeIdentityId);
    expect(deps.sender.send).toHaveBeenCalledTimes(1);

    // Verify push payload contains the call details
    const sendCall = vi.mocked(deps.sender.send).mock.calls[0];
    const sentPayload = JSON.parse(sendCall![1] as string);
    expect(sentPayload.type).toBe('INCOMING_CALL');
    expect(sentPayload.callId).toBe(PAYLOAD.callId);
    expect(sentPayload.fromRoom).toBe(PAYLOAD.fromRoom);
  });

  it('sends to multiple subscriptions in parallel', async () => {
    const subs = [MOCK_SUB, { ...MOCK_SUB, endpoint: 'https://other.endpoint' }];
    const deps = makeDeps({
      getSubscriptions: vi.fn().mockResolvedValue(subs),
    });
    const strategy = new WebPushCallWakeStrategy(deps);

    await strategy.sendIncomingCallNotification(PAYLOAD);

    expect(deps.sender.send).toHaveBeenCalledTimes(2);
  });

  it('does not throw when no subscriptions exist — logs a warning', async () => {
    const deps = makeDeps({
      getSubscriptions: vi.fn().mockResolvedValue([]),
    });
    const strategy = new WebPushCallWakeStrategy(deps);

    await expect(strategy.sendIncomingCallNotification(PAYLOAD)).resolves.toBeUndefined();
    expect(deps.logger!.warn).toHaveBeenCalledWith(
      expect.stringContaining('No push subscriptions'),
    );
  });

  it('does not throw when getSubscriptions fails — logs an error', async () => {
    const deps = makeDeps({
      getSubscriptions: vi.fn().mockRejectedValue(new Error('DB timeout')),
    });
    const strategy = new WebPushCallWakeStrategy(deps);

    await expect(strategy.sendIncomingCallNotification(PAYLOAD)).resolves.toBeUndefined();
    expect(deps.logger!.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch subscriptions'),
      expect.any(Error),
    );
  });

  it('does not throw when a push send fails — logs error and continues', async () => {
    const subs = [MOCK_SUB, { ...MOCK_SUB, endpoint: 'https://other.endpoint' }];
    const sender = {
      send: vi
        .fn()
        .mockResolvedValueOnce(undefined)      // first succeeds
        .mockRejectedValueOnce(new Error('Gone')), // second fails
    };
    const deps = makeDeps({
      getSubscriptions: vi.fn().mockResolvedValue(subs),
      sender,
    });
    const strategy = new WebPushCallWakeStrategy(deps);

    await expect(strategy.sendIncomingCallNotification(PAYLOAD)).resolves.toBeUndefined();
    expect(deps.logger!.error).toHaveBeenCalledWith(
      expect.stringContaining('Push failed'),
      expect.any(Error),
    );
  });
});
