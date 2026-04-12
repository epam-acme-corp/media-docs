---
title: "Acme Media — API Landscape Overview"
---

# Acme Media — API Landscape Overview

This document provides an overview of all APIs exposed by Acme Media systems, including authentication methods, rate limits, versioning policy, and error handling conventions. For detailed API contracts, see the individual API documents.

For system context, see [`../technical/system-landscape.md`](../technical/system-landscape.md).

---

## API Inventory

| API | Protocol | Base URL | Purpose | Doc Status |
|-----|---------|----------|---------|------------|
| CMS Content API | REST + GraphQL | `https://cms-api.media.acmecorp.com/api/v1` | Content retrieval, editorial management | Current — OpenAPI spec auto-generated |
| Streaming Playback API | REST | `https://stream-api.media.acmecorp.com/api/v1` | Playback session management, DRM token issuance | Mostly current — some endpoints under-documented |
| Streaming Catalog API | REST | `https://stream-api.media.acmecorp.com/api/v1/catalog` | Content catalog browsing and search | Mostly current |
| Recommendation API | REST | `https://reco-api.media.acmecorp.com/api/v1` | Personalized content recommendations | Current |
| Ad API | VAST/VPAID + REST | `https://ads-api.media.acmecorp.com/api/v1` | Ad decisioning, campaign management | Internal only — not documented here |
| DRM API | REST | `https://drm-api.media.acmecorp.com/api/v1` | License acquisition, entitlement check | Internal only — service-to-service |
| Live Events API | REST | `https://stream-api.media.acmecorp.com/api/v1/live` | Live event scheduling and stream access | Recent addition — docs in progress |

> **Note:** Some API documentation may lag behind the latest deployment. The streaming team is actively working on improving docs-as-code practices. The Content API documentation is more current as the CMS team has adopted OpenAPI spec generation from code annotations.

---

## Authentication

| Use Case | Auth Method | Details |
|----------|-----------|---------|
| Public content retrieval | API Key | `X-API-Key` header; issued per application (web, mobile, smart TV) |
| Editorial management | OAuth 2.0 | Authorization Code flow; scopes: `content:read`, `content:write`, `content:publish` |
| Playback / DRM | Bearer Token | JWT issued during user authentication; contains subscription tier, region |
| Service-to-service | mTLS + API Key | Mutual TLS for inter-service calls within the cluster |

---

## Rate Limits

| API | Tier | Rate Limit | Burst |
|-----|------|-----------|-------|
| Content API (public) | Standard | 100 requests/minute | 20 requests/second |
| Content API (public) | Premium | 1,000 requests/minute | 50 requests/second |
| Content API (management) | Authenticated | 500 requests/minute | 30 requests/second |
| Playback API | Per-user | 60 requests/minute | 10 requests/second |
| Catalog API | Public | 200 requests/minute | 30 requests/second |
| Recommendation API | Per-user | 30 requests/minute | 5 requests/second |

Rate limit headers are returned on every response:
- `X-RateLimit-Limit` — Maximum requests allowed in the window
- `X-RateLimit-Remaining` — Requests remaining in the current window
- `X-RateLimit-Reset` — Unix timestamp when the window resets

When rate limited, the API returns `429 Too Many Requests` with a `Retry-After` header.

---

## API Versioning

- **URL path versioning:** `/api/v1/...`
- **Breaking changes** increment the version: v1 → v2
- **Non-breaking changes** (new fields, new endpoints) are added to the current version
- **Deprecation policy:** Minimum 6 months notice before version retirement
- **Current versions:** Content API v1 (stable), Streaming API v1 (stable), Recommendation API v1 (stable)

---

## Error Response Format

All APIs return consistent error responses:

```json
{
  "error": {
    "code": "CONTENT_NOT_FOUND",
    "message": "Article with slug 'example-article' not found",
    "status": 404,
    "requestId": "req_abc123def456"
  }
}
```

**Common error codes:**

| Code | HTTP Status | Description |
|------|------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Authenticated but insufficient permissions |
| `NOT_FOUND` | 404 | Resource does not exist |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `VALIDATION_ERROR` | 400 | Request body or parameters failed validation |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

The `requestId` field is included in every error response and should be referenced when contacting support or filing bug reports.

---

## Related Documentation

- [CMS Content API](./content-api.md) — Full REST and GraphQL contract
- [Streaming Platform APIs](./streaming-api.md) — Playback, Catalog, Recommendation, and Live Events APIs
