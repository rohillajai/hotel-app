/**
 * IWifiAdapter — pluggable WiFi credential provisioning
 *
 * Phase 1 implementation: StaticCredentialAdapter
 *   Returns SSID + password from hotel settings. revokeVoucher is a no-op.
 *
 * Future implementations (Phase 2+):
 *   UnifiAdapter    — Ubiquiti UniFi controller API
 *   MerakiAdapter   — Cisco Meraki API
 *   RuckusAdapter   — Ruckus/CommScope API
 *
 * Adding a new implementation never touches this interface or any consumer.
 */

export interface WifiVoucherRequest {
  /** Internal grant ID — used to link the voucher back to the access grant */
  grantId: string;
  subjectId: string;
  tenantId: string;
  validFrom: Date;
  /** null = indefinite (Phase 2 staff/govt — no WiFi expiry tied to a stay) */
  validUntil: Date | null;
  roomIdentifier: string;
}

export interface WifiVoucherResult {
  ssid: string;
  /** Plain-text credential delivered to the guest via the PWA.
   *  Application layer must encrypt this before storing in wifi_vouchers.credential */
  credential: string;
  /** Controller-assigned voucher ID. Stored in wifi_vouchers.external_id.
   *  Used by revokeVoucher() to call the controller's revoke API.
   *  Optional — static implementations leave this undefined. */
  externalId?: string;
}

export interface IWifiAdapter {
  /**
   * Provision a WiFi credential for the given grant.
   * Called by AccessService.issueGrant() after the grant row is created.
   * Must be idempotent — safe to call twice for the same grantId.
   */
  provisionVoucher(req: WifiVoucherRequest): Promise<WifiVoucherResult>;

  /**
   * Revoke a previously provisioned voucher.
   * Called by AccessService.revokeGrant() and the expiry job.
   * @param externalId  The value returned by provisionVoucher().externalId.
   *                    Undefined for static adapters — no-op expected.
   */
  revokeVoucher(externalId: string | undefined): Promise<void>;

  /**
   * Health-check. Returns false if the controller API is unreachable.
   * Used by the hotel settings page to show integration status.
   */
  isAvailable(): Promise<boolean>;

  /** Human-readable name shown in the admin settings UI */
  readonly adapterName: string;
}
