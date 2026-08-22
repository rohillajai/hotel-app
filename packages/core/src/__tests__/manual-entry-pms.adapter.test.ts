import { describe, it, expect } from 'vitest';
import { ManualEntryPmsAdapter } from '../adapters/manual-entry-pms.adapter';

describe('ManualEntryPmsAdapter', () => {
  const adapter = new ManualEntryPmsAdapter();

  it('lookupBooking always returns null', async () => {
    const result = await adapter.lookupBooking({
      bookingRef: 'BK-001',
      guestName: 'Raj Kumar',
      tenantId: 'tenant-123',
    });
    expect(result).toBeNull();
  });

  it('lookupBooking returns null for any input', async () => {
    expect(await adapter.lookupBooking({ bookingRef: '', tenantId: 'x' })).toBeNull();
    expect(await adapter.lookupBooking({ bookingRef: 'ANY', tenantId: 'y' })).toBeNull();
  });

  it('isAvailable returns false (no PMS configured)', async () => {
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('adapterName describes the adapter', () => {
    expect(adapter.adapterName).toContain('No PMS');
  });
});
