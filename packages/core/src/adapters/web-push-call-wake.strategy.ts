import type {
  ICallWakeStrategy,
  IncomingCallPayload,
  WakeStrategyType,
} from '../interfaces/call-wake-strategy.interface';

/**
 * WebPushCallWakeStrategy
 *
 * Phase 1 implementation of ICallWakeStrategy.
 * Delivers incoming-call notifications to staff via Web Push (VAPID).
 *
 * The signaling server calls sendIncomingCallNotification() after routing
 * the call to a staff member. This strategy:
 *   1. Calls back to the API server's internal endpoint to fetch the
 *      callee's active push subscriptions from push_subscriptions table.
 *   2. Sends a Web Push to each subscription using the web-push library.
 *
 * The actual web-push send is injected via a sender function so this class
 * is fully testable without a live push endpoint.
 *
 * The socket event (call:incoming) is sent in parallel by the signaling
 * server — this push is a wake-up fallback for backgrounded tabs.
 */

export interface PushSender {
  send(
    subscription: PushSubscriptionData,
    payload: string,
  ): Promise<void>;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface WebPushStrategyDeps {
  /** Injected function that fetches active push subscriptions for an identity */
  getSubscriptions: (identityId: string) => Promise<PushSubscriptionData[]>;
  /** Injected push sender — real: web-push library; test: mock */
  sender: PushSender;
  /** For structured logging */
  logger?: { warn: (msg: string) => void; error: (msg: string, err?: unknown) => void };
}

export class WebPushCallWakeStrategy implements ICallWakeStrategy {
  readonly strategyType: WakeStrategyType = 'WEB_PUSH';

  constructor(private readonly deps: WebPushStrategyDeps) {}

  async sendIncomingCallNotification(payload: IncomingCallPayload): Promise<void> {
    let subscriptions: PushSubscriptionData[];

    try {
      subscriptions = await this.deps.getSubscriptions(payload.calleeIdentityId);
    } catch (err) {
      this.deps.logger?.error(
        `[WebPushStrategy] Failed to fetch subscriptions for identity ${payload.calleeIdentityId}`,
        err,
      );
      return; // non-fatal — socket event is the fallback
    }

    if (subscriptions.length === 0) {
      this.deps.logger?.warn(
        `[WebPushStrategy] No push subscriptions for identity ${payload.calleeIdentityId}. ` +
          `Staff may need to re-register the PWA.`,
      );
      return;
    }

    const pushPayload = JSON.stringify({
      type: 'INCOMING_CALL',
      callId: payload.callId,
      fromRoom: payload.fromRoom,
      initiatedAt: payload.initiatedAt,
    });

    // Send to all active subscriptions in parallel; log failures individually
    const results = await Promise.allSettled(
      subscriptions.map((sub) => this.deps.sender.send(sub, pushPayload)),
    );

    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        this.deps.logger?.error(
          `[WebPushStrategy] Push failed for subscription ${i} ` +
            `(identity=${payload.calleeIdentityId})`,
          result.reason,
        );
      }
    });
  }
}
