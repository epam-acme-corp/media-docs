---
title: "Acme Media — Digital Rights Management"
---

# Acme Media — Digital Rights Management

The Digital Rights Management (DRM) system manages content encryption, license acquisition, and access control for all protected streaming content on Acme Stream. It supports three DRM schemes via a unified API, enabling playback across all major platforms and devices.

For the Streaming Platform integration, see [`./streaming-platform.md`](./streaming-platform.md). For business context on subscription tiers, see [`../business/overview.md`](../business/overview.md).

---

## System Overview

| Attribute | Value |
|-----------|-------|
| Technology | .NET 6 (migrated from .NET Framework) |
| Database | SQL Server 2019 |
| Team | DRM / Platform team (5 engineers) |
| Encryption | CENC (Common Encryption Scheme), AES-128-CTR |

---

## Multi-DRM Architecture

Acme Media supports three DRM schemes through a unified API endpoint:

| DRM Scheme | Platforms | Use Case |
|-----------|----------|----------|
| Google Widevine | Android, Chrome, Chromecast | Most Android and Chrome-based playback |
| Apple FairPlay | iOS, Safari, Apple TV | All Apple ecosystem playback |
| Microsoft PlayReady | Windows, Xbox, some smart TVs | Windows and Xbox playback |

**CENC (Common Encryption):** Content is encrypted once using AES-128-CTR mode. The same encrypted asset is playable by all three DRM schemes — each scheme uses its own license server to deliver the decryption key. This avoids the need to store three separately encrypted copies of each content item.

---

## License Acquisition Flow

```
Player (Brightcove SDK)
    | 1. Requests playback session from Streaming Platform
    |    Receives: manifest URL + DRM license URL
    v
Player detects DRM signaling in manifest
    | 2. Sends license request to DRM Service
    |    Includes: content ID, device info, DRM challenge blob
    v
DRM Service
    | 3. Validates entitlement:
    |    - Is user's subscription active?
    |    - Does subscription tier include this content?
    |    - Is content available in user's region?
    |    - Has concurrent stream limit been reached?
    |
    | 4. If valid: generates DRM license
    |    - License includes content decryption key
    |    - License policy: expiry, output restrictions, HDCP requirements
    v
Player receives license
    | 5. Decrypts content segments during playback
    v
Content plays
```

---

## Content Encryption

- **Standard:** CENC (Common Encryption Scheme) with AES-128-CTR mode
- **Content keys:** Unique per content item, stored encrypted in the SQL Server `content_keys` table
- **Key rotation:** Content keys are rotated annually for the active catalog
- **Encryption stage:** Occurs during the packaging stage (after transcoding, before CDN delivery), integrated into the content pipeline

---

## Access Control

Subscription tier determines content access:

| Tier | Price | Resolution | Offline | Concurrent Streams |
|------|-------|-----------|---------|-------------------|
| Premium | $9.99/month | 4K | Yes (25 titles, 30-day license) | 3 |
| Ad-supported | $4.99/month | 1080p max | Limited | 1 |
| Free (limited) | Free | 720p max | No | 1 |

Additional access controls:

- **Geographic restrictions:** Per content item, based on license agreements (e.g., certain titles only available in US/Canada)
- **Device registration:** Maximum 5 registered devices per account
- **Output protection:** HDCP enforcement for HD and 4K content on supported devices

---

## Offline Download Support

Premium subscribers can download content for offline viewing:

- **Offline license:** Persistent license with 30-day validity; must reconnect to renew
- **Download limit:** 25 titles per device at any time
- **Auto-removal:** Content automatically removed from device when license expires or subscription lapses
- **DRM enforcement:** Offline content remains encrypted and requires a valid license for playback

---

## SQL Server Schema

Core tables in the DRM database:

```sql
-- Content encryption keys
content_keys (content_id, key_id, key_value_encrypted, algorithm, created_at, rotated_at)

-- Issued licenses
licenses_issued (id, user_id, content_id, device_id, drm_scheme, issued_at,
                 expires_at, license_type, is_offline)

-- User entitlements
entitlements (user_id, subscription_tier, active_from, active_until, status)

-- Geographic restrictions
geographic_restrictions (content_id, allowed_regions, blocked_regions,
                         effective_from, effective_until)
```

---

## Technical Debt

The DRM system was originally built on .NET Framework and was recently migrated to .NET 6. Known issues acknowledged by the team:

- **Hardcoded configuration** — Some configuration values in the integration layer between DRM and Streaming Platform are hardcoded rather than externalized. This complicates environment-specific deployment.
- **Incomplete error handling** — Edge cases in license acquisition (e.g., network timeouts during entitlement checks, race conditions in concurrent stream counting) have incomplete error handling. Users may receive generic errors instead of actionable messages.
- **Inconsistent logging** — Some services use structured logging (Serilog), others use unstructured text logging. This makes cross-service debugging in Kibana more difficult than it should be.
- **Technical debt backlog** — The team maintains a prioritized backlog of these items. The .NET migration consumed significant bandwidth, and documentation and error handling improvements are the next priorities.

---

## Technical Reference

| Attribute | Value |
|-----------|-------|
| Runtime | .NET 6 |
| Database | SQL Server 2019 |
| DRM Schemes | Widevine, FairPlay, PlayReady |
| Encryption | CENC, AES-128-CTR |
| License Validity | Streaming: session-scoped, Offline: 30 days |
