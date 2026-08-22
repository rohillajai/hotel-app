/**
 * INotificationAdapter — pluggable OTP and transactional notification delivery
 *
 * Phase 1 implementation: SnsNotificationAdapter
 *   In production: delivers OTP via AWS SNS SMS to Indian mobile numbers.
 *   In development (OTP_BYPASS_ENABLED=true): no-op — always accepts '123456'.
 *
 * Future implementations:
 *   Msg91Adapter   — MSG91 (popular in India, higher delivery rate for SMS)
 *   TwilioAdapter  — Twilio SMS
 *
 * The OTP generation and rate-limiting logic lives in AuthService,
 * not in this adapter — the adapter only handles the delivery channel.
 */

export interface OtpDeliveryRequest {
  /** E.164 format — e.g. '+919876543210' */
  mobile: string;
  otp: string;
  /** ISO language code for message localisation — 'en' default, 'hi' stub */
  locale?: string;
}

export interface OtpDeliveryResult {
  /** Provider-assigned message ID for delivery tracking */
  messageId?: string;
  /** true if the message was accepted by the provider for delivery */
  accepted: boolean;
}

export interface INotificationAdapter {
  /**
   * Send an OTP to the given mobile number.
   *
   * Must NOT throw when OTP_BYPASS_ENABLED is true — in that case the
   * implementation returns immediately without calling any external API.
   *
   * Should throw a typed error (NotificationDeliveryError) on provider failure
   * so the caller can distinguish network errors from invalid numbers.
   */
  sendOtp(req: OtpDeliveryRequest): Promise<OtpDeliveryResult>;

  /**
   * Health-check — returns false if the SMS provider API is unreachable.
   * Always returns true when OTP_BYPASS_ENABLED is active.
   */
  isAvailable(): Promise<boolean>;

  readonly adapterName: string;
}

/** Thrown by adapter implementations on delivery failure (not bypass mode) */
export class NotificationDeliveryError extends Error {
  public readonly provider: string;
  public override readonly cause?: unknown;

  constructor(message: string, provider: string, cause?: unknown) {
    super(message);
    this.name = 'NotificationDeliveryError';
    this.provider = provider;
    this.cause = cause;
  }
}
