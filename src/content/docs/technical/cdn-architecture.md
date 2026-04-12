---
title: "Acme Media — CDN Architecture"
---

# Acme Media — CDN Architecture

Akamai serves as the primary CDN for all Acme Media video and static content delivery. This document covers the CDN configuration, origin shield pattern, caching strategy, security controls, and performance monitoring.

For the Streaming Platform that generates content served by the CDN, see [`./streaming-platform.md`](./streaming-platform.md). For the architecture overview, see [`../architecture/overview.md`](../architecture/overview.md).

---

## Akamai Configuration

| Attribute | Value |
|-----------|-------|
| Contract | Enterprise tier |
| Availability SLA | 99.99% |
| PoPs | 300+ global locations |
| Configuration | Akamai Property Manager |

Separate Property Manager configurations are maintained for three content categories:

- **Video segments** — HLS/DASH media segments with content-specific caching rules
- **Manifests** — HLS playlists and DASH MPDs with short TTLs for live content
- **Static assets** — Images, thumbnails, JavaScript, CSS with long-lived cache

---

## Origin Shield Architecture

```
Azure Blob Storage (origin)
         |
         v
Akamai Origin Shield (mid-tier cache, US East)
         |
         v
Akamai Edge PoPs (global, 300+ locations)
         |
         v
End User
```

The origin shield pattern consolidates edge requests through a mid-tier cache layer, significantly reducing load on the origin storage:

- Origin shield location: US East (closest to Azure Blob Storage region)
- Origin offload target: > 95%
- Measured offload: typically 97–98% for video segments
- This means only 2–3% of requests reach origin storage, reducing costs and latency

---

## Cache Strategy

| Content Type | TTL | Cache Key | Purge Strategy |
|-------------|-----|-----------|---------------|
| Video segments (VOD) | 24 hours | URL path | Fast Purge on content removal |
| Video segments (live) | 2 seconds | URL path + query params | Expires naturally |
| HLS/DASH manifests (VOD) | 1 hour | URL path | Soft Purge on metadata change |
| HLS/DASH manifests (live) | 2 seconds | URL path | Expires naturally |
| Images / thumbnails | 7 days | URL path | Soft Purge on update |
| Static assets (JS/CSS) | 30 days | URL path (versioned filenames) | Deploy new version |

Cache keys are based on URL path to maximize cache hit ratio. For live content, query parameters are included in the cache key to differentiate segment sequences.

---

## Purge Strategy

### Fast Purge

Used for content removal scenarios such as rights expiry or legal takedown:

- Propagation time: < 5 seconds globally
- Triggered via Akamai Fast Purge API
- Use case: Content rights expire, DMCA takedown, incorrect content published

### Soft Purge

Used for metadata changes where serving stale content briefly is acceptable:

- Marks cached object as stale; edge serves stale while revalidating with origin
- Lower origin impact compared to hard purge (avoids thundering herd)
- Use case: Updated thumbnail, description change, SEO metadata update

### Automated Purge Triggers

- CMS `content.archived` webhook triggers Fast Purge (content removal)
- CMS `content.updated` webhook triggers Soft Purge (metadata change)
- Deployment pipeline: static asset cache keys change via versioned filenames (no purge needed)

---

## Security

### SSL/TLS

- Wildcard certificate for `*.stream.acmecorp.com`
- TLS 1.3 enforced (TLS 1.2 minimum for legacy devices)
- HSTS enabled with 1-year max-age and includeSubDomains

### Token Authentication

- Signed URLs for all video content with time-limited tokens
- VOD: 24-hour token validity
- Live: Session-scoped token (valid for the duration of the live event)
- Tokens include content ID, user ID, and expiry timestamp, signed with HMAC-SHA256

### Geographic Restrictions

- Akamai EdgeScape for geo-blocking content per license agreements
- Geographic restrictions configured per content item in the Catalog Service
- EdgeScape provides country and region-level accuracy

### DDoS Protection

- Akamai Prolexic for volumetric attack mitigation (network layer)
- Rate limiting at the edge for application-layer protection
- Bot management rules to block automated scraping and credential stuffing

---

## Performance Monitoring

### Real User Monitoring

Akamai mPulse provides field metrics for video playback:

- Video startup time (target: < 3 seconds)
- Rebuffering ratio (target: < 1%)
- Average bitrate quality
- Player error rate

### Origin Performance

- Prometheus metrics on Azure Blob Storage response times
- Alert threshold: origin p99 latency > 500ms

### Edge Performance

- Akamai reporting API for cache hit ratio, offload percentage, and error rates
- Dashboard updates every 5 minutes

### Alerting

- PagerDuty integration for critical alerts:
  - Origin offload drops below 90%
  - Edge error rate exceeds 1%
  - Video startup time exceeds 5 seconds (p95)
  - Rebuffering ratio exceeds 3%

---

## Technical Reference

| Attribute | Value |
|-----------|-------|
| CDN Provider | Akamai (Enterprise tier) |
| SLA | 99.99% availability |
| Origin | Azure Blob Storage |
| SSL | TLS 1.3, wildcard cert |
| DDoS | Akamai Prolexic |
| Monitoring | mPulse (RUM), Prometheus (origin), PagerDuty (alerts) |
