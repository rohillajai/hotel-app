export type { IWifiAdapter, WifiVoucherRequest, WifiVoucherResult } from './wifi-adapter.interface';
export type { IPmsAdapter, BookingLookupRequest, BookingRecord, BookingStatus } from './pms-adapter.interface';
export type { ICallWakeStrategy, IncomingCallPayload, WakeStrategyType } from './call-wake-strategy.interface';
export type { IIdentityMatchingRule, MatchingKeySet } from './identity-matching-rule.interface';
export type {
  INotificationAdapter,
  OtpDeliveryRequest,
  OtpDeliveryResult,
} from './notification-adapter.interface';
export { NotificationDeliveryError } from './notification-adapter.interface';
export type {
  ICallRoutingStrategy,
  CallRouteRequest,
  CallRouteResult,
} from './call-routing-strategy.interface';
