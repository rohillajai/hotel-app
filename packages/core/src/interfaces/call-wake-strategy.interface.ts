/**
 * ICallWakeStrategy — pluggable incoming-call notification delivery
 *
 * Problem: when a guest initiates a call, the staff device may be asleep
 * or the browser tab may be in the background. Different delivery mechanisms
 * are needed depending on the client type:
 *
 * Phase 1 — WebPushStrategy:
 *   Staff uses the PWA. Incoming call is delivered via Web Push (VAPID).
 *   The service worker receives the push and surfaces a notification.
 *   Clicking the notification opens the call screen.
 *
 * Phase 2+ — CallKitStrategy (stub only in Phase 1):
 *   Native iOS app. PushKit VoIP push wakes the app from killed state.
 *   CallKit displays the native incoming-call UI.
 *
 * The signaling server picks the strategy by looking up the callee's
 * registered device type from the push_subscriptions table.
 */

export type WakeStrategyType = 'WEB_PUSH' | 'CALL_KIT' | 'FCM';

export interface IncomingCallPayload {
  callId: string;
  calleeIdentityId: string;
  /** Room number shown to staff — NOT the caller's phone number */
  fromRoom: string;
  tenantId: string;
  /** ISO 8601 timestamp — used by the client to detect stale pushes */
  initiatedAt: string;
}

export interface ICallWakeStrategy {
  /**
   * Deliver an incoming-call notification to the callee's device(s).
   * The signaling server calls this after routing the call to a staff member.
   *
   * For WebPush: looks up push_subscriptions for calleeIdentityId,
   *              sends a VAPID push to each active subscription.
   * For CallKit: sends a PushKit VoIP push to the registered APNs token.
   *
   * Does not throw on delivery failure — logs and returns gracefully.
   * The signaling server also sends a socket event as a fallback for open tabs.
   */
  sendIncomingCallNotification(payload: IncomingCallPayload): Promise<void>;

  /** Identifies which strategy this instance implements */
  readonly strategyType: WakeStrategyType;
}
