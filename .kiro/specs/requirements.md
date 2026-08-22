# Requirements — Phase 1: Hotel Module
## In-App Check-In & WiFi-Based Voice Intercom Platform

**Version:** 1.0  
**Scope:** Phase 1 — Hotel Module only  
**Date:** 2026-08-22  
**Status:** Approved for implementation

---

## 1. Project Overview

A multi-tenant communication and access-control platform that replaces traditional EPABX/landline-PBX systems with an app-based, WiFi/WebRTC voice intercom, combined with digital check-in/onboarding and directory-based call routing.

Phase 1 delivers the **Hotel Module** built on a generic, reusable core. The architecture must be designed from day one to support government/ministry (Phase 2) and private office (Phase 3) tenant types without a core rebuild.

---

## 2. Stakeholders & User Roles

| Role | Description |
|---|---|
| **Guest** | Hotel guest accessing services via PWA (pilot) or native app (future) |
| **Staff** | Hotel department staff (reception, housekeeping, room service) using staff PWA/app |
| **Admin** | Hotel administrator managing configuration, staff directory, and reports |
| **Super Admin** | Platform operator managing hotel tenants (future — stub only in Phase 1) |

---

## 3. Functional Requirements

### 3.1 Identity & Onboarding

**REQ-ID-01:** The system must support two registration paths, configurable per hotel:
- **Path A (Staff-initiated):** Admin/staff creates and directly activates a guest record
- **Path B (Self-registration + approval):** Guest submits their own details; record stays `PENDING` until approved by front-desk staff

**REQ-ID-02:** Deduplication check must run before any record is created (not just before approval). Matching keys for hotel tenants: **booking ID OR guest name**. A match on either field must flag for review before proceeding.

**REQ-ID-03:** On duplicate match: block creation, surface existing record to the reviewer, allow merge or reject. Two simultaneously active records for the same identity are not permitted.

**REQ-ID-04:** Guest registration must collect: full name, mobile number, booking reference ID, and one government-issued ID document (image upload).

**REQ-ID-05:** The identity matching rule set must be configurable per tenant type (not hardcoded for hotels). The matching key set is stored in tenant configuration, not in application logic.

### 3.2 Guest Check-In Flow

**REQ-CI-01:** Guests must be able to initiate check-in via a PWA (Progressive Web App) accessible from any mobile browser — no app install required for the pilot.

**REQ-CI-02:** The check-in flow collects: booking reference ID, full name, mobile number, and ID document upload (JPEG/PNG/PDF, max 5 MB).

**REQ-CI-03:** The system must support both check-in modes, selectable per hotel via admin configuration:
- **Auto-approve:** Grant is issued automatically if the booking reference passes validation
- **Staff-confirm:** Grant is held in `PENDING` until a front-desk staff member explicitly approves

**REQ-CI-04:** The pilot hotel has no PMS integration. Booking reference is entered manually by the guest and optionally verified manually by staff. The system must not block check-in solely because a PMS lookup failed (manual override allowed).

**REQ-CI-05:** On check-in approval, the system issues a time-boxed access grant: `valid_from = check-in datetime`, `valid_until = check-out datetime`.

**REQ-CI-06:** A PMS adapter interface must be defined (not implemented) so a concrete PMS integration can be added later without touching core code.

### 3.3 Access Control & Grant Engine

**REQ-AC-01:** Every access grant must have the structure: `Grant(subject, resource/privilege, valid_from, valid_until, status)`. The `valid_until` field must be nullable to support indefinite grants in future tenant types.

**REQ-AC-02:** A single grant covers both calling privileges and WiFi voucher validity for a guest. One expiry event revokes both automatically.

**REQ-AC-03:** A background job must enforce grant expiry — it must not rely solely on on-demand permission checks at call time.

**REQ-AC-04:** On manual early checkout triggered by staff/admin: immediately revoke calling privilege, WiFi voucher, and app/PWA session without waiting for the scheduled expiry job.

**REQ-AC-05:** A guest's calling privilege must be restrictable independently (without revoking the full access grant) — to support abuse restriction without evicting the guest.

### 3.4 Directory Service

**REQ-DIR-01:** The directory must use a real hierarchical model: `Organization → Sub-unit → Person`. For Phase 1: `Hotel → Department → Staff member`.

**REQ-DIR-02:** Phase 1 supports exactly three departments: **Reception**, **Housekeeping**, **Room Service**. No additional departments in Phase 1.

**REQ-DIR-03:** The directory must store both name and role/designation per person, and maintain a search index on both fields (even if the designation-search UI is not exposed in Phase 1).

**REQ-DIR-04:** Admin must be able to add, edit, deactivate, and assign department to staff members via the web dashboard.

### 3.5 Calling Engine

**REQ-CALL-01:** All calls are app-to-app (WebRTC, audio only). No PSTN dialing in Phase 1 or any future phase without a separate licensed integration decision.

**REQ-CALL-02:** Guest can initiate a call to any of the three departments (Reception, Housekeeping, Room Service). The call is routed to any available staff member in that department.

**REQ-CALL-03:** Staff receiving a call must see the caller's **room number**, not their personal phone number.

**REQ-CALL-04:** WebRTC must prefer WiFi/LAN; silently fall back to mobile data via TURN relay if WiFi is unavailable or weak, including mid-call.

**REQ-CALL-05:** Call audio must not be recorded by default. Only call metadata is stored: caller, callee, room/unit, timestamp, duration, call outcome.

**REQ-CALL-06:** Rate limiting must be enforced per guest (configurable threshold, default: 10 calls per hour per guest).

**REQ-CALL-07:** Staff must be able to file an abuse report against a specific guest's call activity. Admin can then restrict that guest's calling privilege (REQ-AC-05) without full checkout.

**REQ-CALL-08:** For the PWA pilot, incoming calls must use Web Push notifications to surface the call UI. CallKit/PushKit integration must be stubbed (interface defined) for future native app builds.

**REQ-CALL-09:** Signaling server handles call routing only — it must never proxy audio unless TURN relay is required by network conditions.

### 3.6 WiFi Provisioning

**REQ-WIFI-01:** On access grant activation, the system must attempt to provision a WiFi credential for the guest.

**REQ-WIFI-02:** WiFi provisioning must use a pluggable adapter interface. Phase 1 defines the interface with no concrete vendor implementation (deferred — WiFi controller vendor unknown for pilot).

**REQ-WIFI-03:** If no WiFi controller API is available, the system must display the WiFi credential (SSID + password) to the guest in the PWA after check-in. The admin must be able to configure this credential in the hotel settings.

**REQ-WIFI-04:** Shared-password schemes where the password is derivable from a formula (e.g., room number + date) must be flagged as a security issue in hotel onboarding and must not be exposed as a voucher.

**REQ-WIFI-05:** WiFi credential validity must be linked to the access grant `valid_until`. On grant revocation (checkout), the WiFi credential must be invalidated.

### 3.7 Service Requests

**REQ-SVC-01:** Guests must be able to place service requests for: **Laundry** and **Room Service** from the PWA.

**REQ-SVC-02:** Service request status must be visible to the guest in real time (Submitted → In Progress → Completed).

**REQ-SVC-03:** Staff must be able to view, accept, and update the status of service requests assigned to their department.

### 3.8 Authentication

**REQ-AUTH-01:** Guest authentication: mobile number + OTP. OTP delivered via AWS SNS.

**REQ-AUTH-02:** In non-production environments (`NODE_ENV !== production`), OTP is bypassed with a hardcoded value of `123456`. This bypass must not be reachable in production.

**REQ-AUTH-03:** Staff/Admin authentication: email + password with bcrypt hashing (min cost factor 12). SSO support stubbed for Phase 2.

**REQ-AUTH-04:** All sessions use short-lived JWT access tokens (15 min) + rotating refresh tokens (7 days). On grant revocation (checkout), all active sessions for that guest must be invalidated immediately.

**REQ-AUTH-05:** OTP attempts are rate-limited: maximum 5 attempts per mobile number per 10-minute window.

### 3.9 Consent & Data Retention (DPDP-aware)

**REQ-RET-01:** Every personal data record must be tagged with a purpose category at creation time. Phase 1 categories: `KYC_DOCUMENT`, `BOOKING_PROFILE`, `CALL_METADATA`, `SERVICE_REQUEST`.

**REQ-RET-02:** Each purpose category has its own retention timer, configurable in a retention-rules table (not hardcoded). Default values:

| Category | Default Retention |
|---|---|
| KYC_DOCUMENT | 1 year (statutory — police guest register requirement) |
| BOOKING_PROFILE | 90 days post-checkout |
| CALL_METADATA | 90 days |
| SERVICE_REQUEST | 30 days post-checkout |

**REQ-RET-03:** Guest-consent-driven deletion is the default behavior. Statutory retention rules (police registration, GST) can override a guest deletion request — this override is governed by the retention-rules table, not hardcoded application logic.

**REQ-RET-04:** KYC/document storage must be physically separate from general booking-profile storage (different S3 prefix/bucket, different DB table set, different erasure triggers).

**REQ-RET-05:** A scheduled backend job must enforce retention expiry and data erasure automatically.

### 3.10 Admin Web Dashboard

**REQ-ADMIN-01:** Front-desk check-in confirmation flow (approve/reject pending guest check-ins with dedup review).

**REQ-ADMIN-02:** Manual early-checkout trigger per guest (immediately revokes grant per REQ-AC-04).

**REQ-ADMIN-03:** Staff directory management: add, edit, deactivate staff, assign department.

**REQ-ADMIN-04:** Call metadata log view: searchable by date range, room number, department. No audio playback.

**REQ-ADMIN-05:** Hotel settings: check-in mode (auto/staff-confirm), WiFi controller configuration, OTP provider configuration.

**REQ-ADMIN-06:** Abuse reports view: list flagged guests, ability to restrict calling privilege.

---

## 4. Non-Functional Requirements

**REQ-NFR-01 (Availability):** Backend services target 99.9% uptime. TURN server must be on a separate instance from the signaling server.

**REQ-NFR-02 (Latency):** Signaling round-trip (call setup) < 2 seconds on WiFi. Call audio latency target < 150 ms on LAN.

**REQ-NFR-03 (Security):** All API endpoints served over HTTPS/TLS 1.2+. S3 documents served via short-lived signed URLs only (max 15 min expiry). No direct S3 public access.

**REQ-NFR-04 (Scalability):** Architecture must support horizontal scaling of backend services. Pilot target: up to 5 hotels, 500 concurrent guests, 50 concurrent calls. Must not require re-architecture for Phase 2.

**REQ-NFR-05 (Compliance):** No audio recording by default (TRAI OTT-calling compliance). Purpose-tagged retention (DPDP compliance). No real phone number dialing (keeps service in unlicensed OTT category).

**REQ-NFR-06 (Cost):** Target AWS monthly cost ≤ ₹25,000 for pilot (≤ 5 hotels). Use cost-effective instance types; right-size for pilot load.

---

## 5. Out of Scope — Phase 1

- Government/ministry onboarding UI or nodal-officer approval workflows
- PSTN fallback or real phone number dialing
- AI features, upsell, analytics dashboards
- Multi-language UI beyond English (Hindi label stubs only — no full i18n)
- Native iOS/Android app distribution (PWA is the pilot delivery mechanism)
- CallKit/PushKit functional integration (interface stub only)
- Concrete WiFi controller vendor integration (interface only)
- Concrete PMS integration (interface only, manual booking ref for pilot)
- SSO for staff/admin

---

## 6. Open Decisions (resolved — logged for audit)

| # | Decision | Resolution |
|---|---|---|
| D1 | PMS for first integration | No PMS for pilot — manual booking reference |
| D2 | Default check-in mode | Configurable per hotel; both modes required in Phase 1 |
| D3 | WiFi controller vendor | Unknown — build adapter interface only, no concrete impl |
| D4 | OTP provider | AWS SNS; `123456` bypass in non-prod |
| D5 | TURN hosting | Self-hosted coturn on EC2 `t3.small` + Elastic IP (ap-south-1) |
| D6 | Pilot app delivery | PWA (no app install required); native app in future phase |
| D7 | Dedup matching keys | Booking ID OR guest name (OR logic, conservative) |

---

## 7. Manual TODOs (Legal/Ops — not Kiro build tasks)

- [ ] Draft legal-request response policy (how to respond to police/court requests for call metadata or KYC documents)
- [ ] Confirm statutory retention period for guest register under applicable state Police Acts (currently defaulted to 1 year)
- [ ] Obtain Apple Developer account credentials for future CallKit/PushKit integration
- [ ] Confirm GST retention requirements for booking data with legal counsel
