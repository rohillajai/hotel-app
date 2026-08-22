export {
  StaticCredentialWifiAdapter,
  type StaticCredentialConfig,
} from './static-credential-wifi.adapter';

export { ManualEntryPmsAdapter } from './manual-entry-pms.adapter';

export {
  WebPushCallWakeStrategy,
  type PushSender,
  type PushSubscriptionData,
  type WebPushStrategyDeps,
} from './web-push-call-wake.strategy';

export { CallKitCallWakeStrategy } from './callkit-call-wake.strategy';

export {
  SnsNotificationAdapter,
  type SnsPublisher,
  type SnsNotificationAdapterConfig,
} from './sns-notification.adapter';

export { DefaultIdentityMatchingRule } from './default-identity-matching.rule';

export {
  DepartmentRoundRobinStrategy,
  type PresenceStore,
  type StaffPresenceEntry,
} from './department-round-robin.strategy';
