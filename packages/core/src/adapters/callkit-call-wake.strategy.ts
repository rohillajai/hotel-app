import type {
  ICallWakeStrategy,
  IncomingCallPayload,
  WakeStrategyType,
} from '../interfaces/call-wake-strategy.interface';

/**
 * CallKitCallWakeStrategy — STUB ONLY (Phase 1)
 *
 * Phase 2+ implementation of ICallWakeStrategy for native iOS app.
 * Uses PushKit VoIP push to wake the app from killed state, then
 * CallKit to display the native incoming-call UI.
 *
 * Prerequisites before implementing (manual TODOs):
 *   - Apple Developer account with VoIP Push Notifications entitlement
 *   - APNs p8 key or p12 certificate stored in AWS Secrets Manager
 *   - Native iOS app with CallKit + PushKit entitlements configured
 *
 * The interface is registered in the DI container so the signaling server
 * can select it for staff members with a native app token. In Phase 1
 * no staff will have a native app token so this is never invoked.
 */
export class CallKitCallWakeStrategy implements ICallWakeStrategy {
  readonly strategyType: WakeStrategyType = 'CALL_KIT';

  async sendIncomingCallNotification(_payload: IncomingCallPayload): Promise<void> {
    // STUB — Phase 2 implementation required.
    // Do NOT throw here — the signaling server still sends the socket event
    // as a fallback, so this no-op is safe for Phase 1.
    //
    // Phase 2 implementation steps:
    //   1. Look up callee's APNs device token from push_subscriptions
    //   2. Use @parse/node-apn to send a VoIP push with the call payload
    //   3. The native app handles CXProvider.reportNewIncomingCall()
  }
}
