---
title: "Acme Media — Streaming Platform"
---

# Acme Media — Streaming Platform

The Streaming Platform is the core infrastructure powering Acme Stream, the subscription and ad-supported video service with approximately 2.1 million subscribers. Built in Go 1.21 for performance-critical video packaging and session management, the platform handles live and video-on-demand streaming with adaptive bitrate delivery via Akamai CDN.

For the architecture decision behind Go, see [ADR-002](../architecture/adr/ADR-002-go-streaming.md). For CDN configuration, see [`./cdn-architecture.md`](./cdn-architecture.md). For DRM integration, see [`./drm.md`](./drm.md).

---

## System Overview

| Attribute | Value |
|-----------|-------|
| Technology | Go 1.21 microservices |
| Databases | Redis 7 (session cache, feature store), PostgreSQL 15 (catalog, sessions, availability) |
| Team | Streaming team (10 engineers) |
| Scale | ~45,000 titles, ~150,000 peak concurrent streams |

---

## Service Architecture

The Streaming Platform is composed of six microservices:

| Service | Responsibility | Key Technologies |
|---------|---------------|-----------------|
| Ingest Service | Receive source media files, validate format, register in catalog | Go, Azure Blob Storage, RabbitMQ |
| Transcoding Service | Orchestrate AWS MediaConvert jobs, monitor progress, collect outputs | Go, AWS SDK, S3, SNS |
| Packaging Service | Generate HLS and DASH manifests, manage segment storage | Go, custom manifest builder |
| Playback Service | Session management, DRM token issuance, manifest URL generation | Go, Redis, PostgreSQL |
| Live Service | Low-latency live stream ingestion and packaging | Go, RTMP ingest, low-latency HLS |
| Catalog Service | Content library management, metadata, availability windows | Go, PostgreSQL |

### Ingest Service

Receives source media files (ProRes, H.264, H.265) via upload API or partner delivery (S3 drop, Aspera). Validates format compliance, generates a content fingerprint for deduplication, stores the source file in Azure Blob Storage (hot tier), and creates a content record in the workflow database. Publishes the `content.ingested` RabbitMQ event. I/O-bound — scales horizontally based on upload volume.

### Transcoding Service

Orchestrates AWS MediaConvert jobs for each ingested file. Submits jobs with predefined templates for six quality profiles, monitors job progress via SNS notifications, and collects output segments from S3 upon completion. Publishes `content.transcoded` event. I/O-bound (API calls to AWS) — runs with a small pod count since MediaConvert handles the compute-intensive work.

### Packaging Service

Generates HLS master and variant playlists and DASH MPD manifests from transcoded segments. Uses a custom manifest builder that supports CMAF (Common Media Application Format) for unified segment format across both protocols. Manages segment storage organization in Azure Blob Storage. CPU-bound during manifest generation — scales based on content publishing volume.

### Playback Service

The most performance-critical service. Manages playback session lifecycle: creates sessions with entitlement validation, generates signed manifest URLs, issues DRM license request tokens, and processes session heartbeats. Uses Redis for sub-millisecond session cache reads and PostgreSQL for persistent session records. CPU and I/O-bound — scales to handle concurrent stream count.

### Live Service

Handles low-latency live stream ingestion via RTMP from encoding hardware/software. Performs real-time segmentation (2-second segments) and low-latency HLS (LL-HLS) packaging with `#EXT-X-PART` tags for partial segments. Maintains a sliding window manifest (last 30 seconds) and a DVR window (last 2 hours). CPU-bound during real-time transcoding — dedicated pod pool for live events.

### Catalog Service

Manages the content library of approximately 45,000 titles. Handles metadata enrichment (title, description, genre, cast, crew, ratings, thumbnails, trailers), availability windows (per region and per platform), and content licensing (start/end dates, geographic restrictions). Uses PostgreSQL full-text search for catalog queries. I/O-bound — stable scaling profile.

---

## Video Pipeline

The complete video processing pipeline from source to player:

```
Source File (ProRes/H.264/H.265)
    |
    v
Ingest Service
    | Validates format, generates fingerprint
    | Stores source in Azure Blob (hot tier)
    | Publishes: content.ingested
    v
Transcoding Service
    | Submits job to AWS MediaConvert
    | Profiles: 240p (400kbps) -> 360p -> 480p -> 720p -> 1080p -> 4K (16Mbps)
    | Audio: AAC stereo + 5.1 surround (where available)
    | Output: fMP4 segments to S3
    | Publishes: content.transcoded
    v
Packaging Service
    | Generates HLS master + variant playlists
    | Generates DASH MPD manifests
    | Segment duration: 6s (VOD), 2s (live)
    | Publishes: content.packaged
    v
Azure Blob Storage (origin)
    |
    v
Akamai CDN (origin shield -> edge PoPs)
    |
    v
Brightcove Player (client-side ABR)
```

---

## HLS/DASH Packaging

Adaptive bitrate streaming uses six quality levels:

| Profile | Resolution | Bitrate (video) | Codec |
|---------|-----------|-----------------|-------|
| 1 | 426x240 | 400 kbps | H.264 Baseline |
| 2 | 640x360 | 800 kbps | H.264 Main |
| 3 | 854x480 | 1.5 Mbps | H.264 Main |
| 4 | 1280x720 | 3 Mbps | H.264 High |
| 5 | 1920x1080 | 6 Mbps | H.264 High |
| 6 | 3840x2160 | 16 Mbps | H.265 Main |

**Packaging details:**

- **HLS:** Master playlist with `#EXT-X-STREAM-INF` for each variant, segment playlists with `#EXTINF` tags. FairPlay DRM signaling via `#EXT-X-KEY`.
- **DASH:** MPD with multiple AdaptationSets (video, audio), Representation per quality level. Widevine and PlayReady DRM signaling via `ContentProtection` elements.
- **CMAF:** Common Media Application Format for unified fMP4 segment format, playable by both HLS and DASH clients.

---

## Player Integration

Brightcove Player SDK provides cross-platform JavaScript playback with adaptive bitrate selection.

### Analytics Events

The player sends events to Brightcove analytics and the custom event pipeline:

- `play_start`, `play_pause`, `play_resume`, `play_complete`
- `quality_change`, `buffer_start`, `buffer_end`
- `ad_start`, `ad_complete`, `ad_skip`
- `error` (with error code and context)

### Playback Session Lifecycle

1. Client calls `POST /playback/sessions` with content ID and user token
2. Server validates entitlement (subscription tier, geographic availability, concurrent stream limit)
3. Server returns signed manifest URL (time-limited) and DRM license URL
4. Player fetches manifest, acquires DRM license from the DRM service, begins playback
5. Client sends heartbeat every 30 seconds (`GET /playback/sessions/{id}/heartbeat`)
6. Client calls `DELETE /playback/sessions/{id}` on exit (or session times out after 5 minutes of no heartbeat)

For the complete playback API contract, see [`../api/streaming-api.md`](../api/streaming-api.md).

---

## Live Streaming

Live streaming supports sports, concerts, conferences, and other live events:

- **Ingest:** RTMP from encoding hardware/software into the Live Service
- **Segmentation:** Real-time 2-second segments for low-latency delivery
- **Packaging:** Low-latency HLS (LL-HLS) with `#EXT-X-PART` tags for partial segment delivery
- **Manifest updates:** Sliding window of the last 30 seconds of segments
- **DVR window:** Last 2 hours available for rewind during live events
- **Target latency:** < 10 seconds end-to-end (encoder to viewer)
- **Scheduling:** Live events are scheduled in advance with pre-configured streaming keys and automatic start/stop
- **Failover:** Redundant RTMP ingest points with automatic stream switching on failure detection

---

## Content Library

The Catalog Service manages approximately 45,000 titles:

- **Metadata enrichment:** Title, description, genre, cast, crew, ratings, thumbnails, trailers
- **Availability windows:** Per region and per platform (web, iOS, Android, smart TV)
- **Content licensing:** Tracks license start and end dates, geographic restrictions
- **Search:** PostgreSQL full-text search for catalog queries, with plans to add Elasticsearch for improved relevance ranking

---

## PostgreSQL Schema

Core tables in the Streaming Platform database:

```sql
-- Content catalog
content_catalog (id, title, slug, description, genre, rating, duration_seconds,
                 thumbnail_url, trailer_ref, created_at, updated_at)

-- Playback sessions
playback_sessions (id, user_id, content_id, device_type, started_at,
                   last_heartbeat, ended_at, quality_profile, session_token)

-- Content availability
content_availability (content_id, region, platform, available_from, available_until,
                      subscription_tier_required)

-- Viewing history
viewing_history (user_id, content_id, progress_seconds, completed, last_watched_at)
```

This represents the core tables. Additional tables exist for content metadata, cast/crew relationships, and content collections. The Streaming team maintains the full schema documentation in the service repository.

---

## Technical Reference

| Attribute | Value |
|-----------|-------|
| Language | Go 1.21 |
| Databases | PostgreSQL 15, Redis 7 |
| Transcoding | AWS MediaConvert |
| Player | Brightcove SDK |
| CDN | Akamai (Enterprise, 99.99% SLA) |
| Origin Storage | Azure Blob Storage |
| Protocols | HLS, DASH, CMAF, RTMP (live ingest) |
| DRM | Widevine, FairPlay, PlayReady (via DRM service) |
