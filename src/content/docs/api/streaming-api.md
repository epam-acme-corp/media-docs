---
title: "Acme Media — Streaming Platform APIs"
---

# Acme Media — Streaming Platform APIs

This document covers the Streaming Platform's public-facing APIs: Playback, Catalog, Recommendation, and Live Events. These APIs power the Acme Stream client applications across web, mobile, smart TV, and gaming console platforms.

> **Documentation note:** Some streaming API documentation may lag behind the latest deployment. The streaming team is actively working on improving docs-as-code practices, including OpenAPI spec generation. The endpoints documented here represent the stable, well-tested API surface.

For the Streaming Platform system documentation, see [`../technical/streaming-platform.md`](../technical/streaming-platform.md). For authentication and rate limits, see [`./overview.md`](./overview.md).

---

## Playback API

Base URL: `https://stream-api.media.acmecorp.com/api/v1`

### Create Playback Session

```
POST /api/v1/playback/sessions
Authorization: Bearer {userToken}
Content-Type: application/json
```

**Request Body:**

```json
{
  "contentId": "title_abc123",
  "deviceType": "smart_tv",
  "preferredQuality": "auto",
  "audioLanguage": "en",
  "subtitleLanguage": "none"
}
```

**Response (200 OK):**

```json
{
  "sessionId": "sess_7f8a9b0c1d2e",
  "manifestUrl": "https://stream.media.acmecorp.com/vod/title_abc123/master.m3u8?token=eyJ...",
  "drmLicenseUrl": "https://drm-api.media.acmecorp.com/api/v1/license",
  "drmScheme": "widevine",
  "sessionExpiry": "2024-01-15T22:00:00Z",
  "contentMetadata": {
    "title": "The Great Adventure",
    "duration": 5420,
    "rating": "PG-13",
    "resumePosition": 1230
  }
}
```

The server validates the user's entitlement (subscription tier, geographic availability, concurrent stream limit) before returning the session. If validation fails, an appropriate error is returned (e.g., `SUBSCRIPTION_REQUIRED`, `GEO_RESTRICTED`, `CONCURRENT_LIMIT_REACHED`).

### Session Heartbeat

```
GET /api/v1/playback/sessions/{sessionId}/heartbeat
Authorization: Bearer {userToken}
```

Returns `204 No Content` on success. Must be called every 30 seconds. The session expires after 5 minutes without a heartbeat, releasing the concurrent stream slot.

### End Playback Session

```
DELETE /api/v1/playback/sessions/{sessionId}
Authorization: Bearer {userToken}
Content-Type: application/json
```

**Request Body:**

```json
{
  "finalPosition": 2450,
  "completed": false
}
```

Saves viewing progress for resume functionality. The `resumePosition` field in subsequent session creation responses reflects this saved position.

---

## Catalog API

Base URL: `https://stream-api.media.acmecorp.com/api/v1/catalog`

### List Titles

```
GET /api/v1/catalog/titles?category={category}&sort=popularity&limit=20&cursor={cursor}
```

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "title_abc123",
      "title": "The Great Adventure",
      "slug": "the-great-adventure",
      "type": "movie",
      "genre": ["adventure", "drama"],
      "rating": "PG-13",
      "duration": 5420,
      "releaseYear": 2024,
      "thumbnail": "https://images.media.acmecorp.com/titles/great-adventure-poster.webp",
      "availability": {
        "subscriptionTier": "premium",
        "availableFrom": "2024-01-01T00:00:00Z",
        "availableUntil": "2025-01-01T00:00:00Z"
      }
    }
  ],
  "pagination": {
    "nextCursor": "eyJwIjoiMTAwIn0=",
    "hasMore": true
  }
}
```

### Get Title Details

```
GET /api/v1/catalog/titles/{id}
```

Returns full title metadata including cast, crew, related titles, and trailers.

### Search Catalog

```
GET /api/v1/catalog/search?q={query}&genre={genre}&year={year}&limit=20
```

Full-text search with filters. Returns ranked results by relevance.

### List Categories

```
GET /api/v1/catalog/categories
```

Returns the hierarchical category tree for navigation UI.

---

## Recommendation API

Base URL: `https://reco-api.media.acmecorp.com/api/v1`

### Get Personalized Recommendations

```
GET /api/v1/recommendations/{userId}?context=home&limit=20
Authorization: Bearer {userToken}
```

**Response (200 OK):**

```json
{
  "recommendations": [
    {
      "contentId": "title_def456",
      "title": "Mystery at Midnight",
      "thumbnail": "https://images.media.acmecorp.com/titles/mystery-midnight.webp",
      "reason": "Because you watched 'The Great Adventure'",
      "score": 0.92,
      "row": "continue_watching"
    },
    {
      "contentId": "title_ghi789",
      "title": "Documentary: Ocean Deep",
      "thumbnail": "https://images.media.acmecorp.com/titles/ocean-deep.webp",
      "reason": "Trending in Documentary",
      "score": 0.87,
      "row": "trending"
    }
  ],
  "rows": [
    { "id": "continue_watching", "title": "Continue Watching", "position": 1 },
    { "id": "trending", "title": "Trending Now", "position": 2 },
    { "id": "recommended", "title": "Recommended for You", "position": 3 },
    { "id": "new_releases", "title": "New Releases", "position": 4 }
  ]
}
```

**Context parameter values:**

| Context | Description |
|---------|-------------|
| `home` | Homepage layout with multiple recommendation rows |
| `detail` | Similar titles to the one currently being viewed |
| `search` | Search results re-ranking based on user preferences |
| `post_play` | "Watch next" suggestions after content finishes |

---

## Live Events API

Base URL: `https://stream-api.media.acmecorp.com/api/v1/live`

### List Live Events

```
GET /api/v1/live/events?status=live,upcoming&limit=10
```

**Response (200 OK):**

```json
{
  "events": [
    {
      "id": "live_evt_001",
      "title": "Championship Finals - Game 3",
      "description": "Live coverage of the championship finals",
      "status": "live",
      "startTime": "2024-01-15T20:00:00Z",
      "thumbnail": "https://images.media.acmecorp.com/live/championship-game3.webp",
      "category": "sports",
      "viewerCount": 45200
    },
    {
      "id": "live_evt_002",
      "title": "Tech Summit 2024 Keynote",
      "status": "upcoming",
      "startTime": "2024-01-16T10:00:00Z",
      "thumbnail": "https://images.media.acmecorp.com/live/tech-summit-keynote.webp",
      "category": "technology"
    }
  ]
}
```

### Get Live Stream

```
GET /api/v1/live/events/{eventId}/stream
Authorization: Bearer {userToken}
```

Returns the live manifest URL (low-latency HLS) and DRM license URL. Uses the same session model as VOD playback with additional live-specific parameters:

- DVR window (rewind up to 2 hours)
- Target latency (< 10 seconds)
- Live event status and estimated duration

---

## Technical Reference

| Attribute | Value |
|-----------|-------|
| Protocol | REST |
| Auth | Bearer JWT (user), API Key (app) |
| Pagination | Cursor-based |
| Format | JSON |
| Spec | In progress (OpenAPI generation being adopted) |
