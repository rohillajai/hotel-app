import { describe, it, expect, vi } from 'vitest';
import {
  SnsNotificationAdapter,
  type SnsPublisher,
} from '../adapters/sns-notification.adapter';
import { NotificationDeliveryError } from '../interfaces/notification-adapter.interface';

const OTP_REQUEST = {
  mobile: '+919876543210',
  otp: '847291',
};

function makeSns(messageId = 'msg-001'): SnsPublisher {
  return {
    publish: vi.fn().mockResolvedValue({ MessageId: messageId }),
  };
}

describe('SnsNotificationAdapter', () => {
  describe('bypass mode (dev/test)', () => {
    it('returns accepted without calling SNS', async () => {
      const sns = makeSns();
      const adapter = new SnsNotificationAdapter(sns, { otpBypassEnabled: true });

      const result = await adapter.sendOtp(OTP_REQUEST);

      expect(result.accepted).toBe(true);
      expect(result.messageId).toBe('bypass-mode');
      expect(sns.publish).not.toHaveBeenCalled();
    });

    it('isAvailable returns true in bypass mode', async () => {
      const adapter = new SnsNotificationAdapter(makeSns(), { otpBypassEnabled: true });
      expect(await adapter.isAvailable()).toBe(true);
    });
  });

  describe('production mode', () => {
    it('calls SNS publish with correct phone number and message', async () => {
      const sns = makeSns();
      const adapter = new SnsNotificationAdapter(sns, { otpBypassEnabled: false });

      const result = await adapter.sendOtp(OTP_REQUEST);

      expect(sns.publish).toHaveBeenCalledOnce();
      const call = vi.mocked(sns.publish).mock.calls[0]![0];
      expect(call.PhoneNumber).toBe('+919876543210');
      expect(call.Message).toContain('847291');
      expect(result.accepted).toBe(true);
      expect(result.messageId).toBe('msg-001');
    });

    it('sets Transactional SMS type attribute', async () => {
      const sns = makeSns();
      const adapter = new SnsNotificationAdapter(sns, { otpBypassEnabled: false });
      await adapter.sendOtp(OTP_REQUEST);

      const call = vi.mocked(sns.publish).mock.calls[0]![0];
      expect(call.MessageAttributes?.['AWS.SNS.SMS.SMSType']?.StringValue).toBe(
        'Transactional',
      );
    });

    it('uses Hindi message template when locale is hi', async () => {
      const sns = makeSns();
      const adapter = new SnsNotificationAdapter(sns, { otpBypassEnabled: false });
      await adapter.sendOtp({ ...OTP_REQUEST, locale: 'hi' });

      const call = vi.mocked(sns.publish).mock.calls[0]![0];
      expect(call.Message).toContain('847291');
      expect(call.Message).toMatch(/[\u0900-\u097F]/); // contains Devanagari characters
    });

    it('falls back to English for unknown locale', async () => {
      const sns = makeSns();
      const adapter = new SnsNotificationAdapter(sns, { otpBypassEnabled: false });
      await adapter.sendOtp({ ...OTP_REQUEST, locale: 'fr' });

      const call = vi.mocked(sns.publish).mock.calls[0]![0];
      expect(call.Message).toContain('Hotel App verification code');
    });

    it('throws NotificationDeliveryError when SNS publish fails', async () => {
      const sns: SnsPublisher = {
        publish: vi.fn().mockRejectedValue(new Error('Network error')),
      };
      const adapter = new SnsNotificationAdapter(sns, { otpBypassEnabled: false });

      await expect(adapter.sendOtp(OTP_REQUEST)).rejects.toBeInstanceOf(
        NotificationDeliveryError,
      );
    });

    it('NotificationDeliveryError contains provider name', async () => {
      const sns: SnsPublisher = {
        publish: vi.fn().mockRejectedValue(new Error('fail')),
      };
      const adapter = new SnsNotificationAdapter(sns, { otpBypassEnabled: false });

      try {
        await adapter.sendOtp(OTP_REQUEST);
      } catch (err) {
        expect(err).toBeInstanceOf(NotificationDeliveryError);
        expect((err as NotificationDeliveryError).provider).toBe('AWS SNS');
      }
    });
  });

  it('adapterName is AWS SNS', () => {
    const adapter = new SnsNotificationAdapter(makeSns(), { otpBypassEnabled: false });
    expect(adapter.adapterName).toBe('AWS SNS');
  });
});
