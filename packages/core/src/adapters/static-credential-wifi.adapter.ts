import type {
  IWifiAdapter,
  WifiVoucherRequest,
  WifiVoucherResult,
} from '../interfaces/wifi-adapter.interface';

/**
 * StaticCredentialWifiAdapter
 *
 * Phase 1 implementation of IWifiAdapter.
 * Returns SSID + password from hotel config — no WiFi controller API involved.
 *
 * provisionVoucher: returns the static credential; externalId is undefined.
 * revokeVoucher:    no-op (static credentials cannot be revoked per-guest).
 *
 * Security note: the admin MUST set a strong random password in hotel settings.
 * The onboarding checklist flags shared/formula-based passwords as a security
 * issue (REQ-WIFI-04).
 *
 * Future: replace with UnifiAdapter, MerakiAdapter, or RuckusAdapter by
 * swapping the DI binding — this class and its tests become irrelevant.
 */
export interface StaticCredentialConfig {
  ssid: string;
  credential: string;
}

export class StaticCredentialWifiAdapter implements IWifiAdapter {
  readonly adapterName = 'StaticCredential';

  constructor(private readonly config: StaticCredentialConfig) {}

  async provisionVoucher(req: WifiVoucherRequest): Promise<WifiVoucherResult> {
    // Validate config is not the default placeholder
    if (
      !this.config.ssid ||
      !this.config.credential ||
      this.config.credential === 'changeme-before-demo'
    ) {
      throw new Error(
        `[StaticCredentialWifiAdapter] WiFi credential not configured for tenant. ` +
          `Go to Hotel Settings and set a real SSID and password before check-in. ` +
          `(grantId=${req.grantId})`,
      );
    }

    return {
      ssid: this.config.ssid,
      credential: this.config.credential,
      // No externalId — static adapters have no controller to call on revocation
      externalId: undefined,
    };
  }

  async revokeVoucher(_externalId: string | undefined): Promise<void> {
    // Static credentials cannot be revoked per-guest.
    // The access grant is marked REVOKED in the DB; the credential itself remains
    // valid until the admin rotates it. This is a known limitation of the static
    // approach — flagged in hotel onboarding checklist.
  }

  async isAvailable(): Promise<boolean> {
    return (
      Boolean(this.config.ssid) &&
      Boolean(this.config.credential) &&
      this.config.credential !== 'changeme-before-demo'
    );
  }
}
