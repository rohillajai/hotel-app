import type {
  INotificationAdapter,
  OtpDeliveryRequest,
  OtpDeliveryResult,
} from '../interfaces/notification-adapter.interface';
import { NotificationDeliveryError } from '../interfaces/notification-adapter.interface';

/**
 * SnsNotificationAdapter
 *
 * Phase 1 implementation of INotificationAdapter.
 * Delivers OTP SMS via AWS SNS in production.
 * In non-production environments (otpBypassEnabled=true), returns immediately
 * without calling SNS — the OTP '123456' is accepted by AuthService directly.
 *
 * The SNS client is injected so this class is testable without AWS credentials.
 * In production the NestJS module wires in the real @aws-sdk/client-sns client.
 */

/** Minimal SNS publish interface — matches @aws-sdk/client-sns PublishCommand */
export interface SnsPublisher {
  publish(params: {
    PhoneNumber: string;
    Message: string;
    MessageAttributes?: Record<string, { DataType: string; StringValue: string }>;
  }): Promise<{ MessageId?: string }>;
}

export interface SnsNotificationAdapterConfig {
  otpBypassEnabled: boolean;
  /** ISO 639-1 locale used for the SMS template — default 'en' */
  defaultLocale?: string;
}

const OTP_MESSAGES: Record<string, (otp: string) => string> = {
  en: (otp) => `Your Hotel App verification code is ${otp}. Valid for 10 minutes. Do not share.`,
  hi: (otp) => `आपका Hotel App सत्यापन कोड ${otp} है। 10 मिनट के लिए वैध। साझा न करें।`,
};

export class SnsNotificationAdapter implements INotificationAdapter {
  readonly adapterName = 'AWS SNS';

  constructor(
    private readonly sns: SnsPublisher,
    private readonly config: SnsNotificationAdapterConfig,
  ) {}

  async sendOtp(req: OtpDeliveryRequest): Promise<OtpDeliveryResult> {
    // Bypass mode — dev/test environments only
    if (this.config.otpBypassEnabled) {
      return { accepted: true, messageId: 'bypass-mode' };
    }

    const locale = req.locale ?? this.config.defaultLocale ?? 'en';
    const messageFn = OTP_MESSAGES[locale] ?? OTP_MESSAGES['en'];
    const message = messageFn!(req.otp);

    try {
      const result = await this.sns.publish({
        PhoneNumber: req.mobile,
        Message: message,
        // Transactional type: higher delivery priority, bypasses quiet-hour settings
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: 'Transactional',
          },
          // Sender ID — visible on the recipient's device (India: up to 6 chars)
          'AWS.SNS.SMS.SenderID': {
            DataType: 'String',
            StringValue: 'HTLAPP',
          },
        },
      });

      return {
        accepted: true,
        messageId: result.MessageId,
      };
    } catch (err) {
      throw new NotificationDeliveryError(
        `Failed to send OTP to ${req.mobile} via SNS`,
        this.adapterName,
        err,
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    if (this.config.otpBypassEnabled) return true;
    // SNS is a managed service — treat it as always available unless we get
    // an error on actual sends. A lightweight check here would cost money.
    return true;
  }
}
