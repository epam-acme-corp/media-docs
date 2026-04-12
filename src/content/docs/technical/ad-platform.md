---
title: "Acme Media — Ad Platform"
---

# Acme Media — Ad Platform

The Ad Platform powers all advertising monetization across Acme Media properties, using server-side ad insertion (SSAI) for streaming inventory and programmatic display for the publishing network. SSAI is the core differentiator — ads are stitched into the video stream server-side, making them indistinguishable from content and immune to client-side ad blockers.

For the Streaming Platform integration, see [`./streaming-platform.md`](./streaming-platform.md). For analytics data architecture, see [`../data/architecture.md`](../data/architecture.md).

---

## System Overview

| Attribute | Value |
|-----------|-------|
| Technology | Java 17, Spring Boot 3 |
| Databases | PostgreSQL 15 (campaigns, transactional), ClickHouse (impressions, analytics) |
| Team | Ad Platform team (8 engineers) |
| Scale | ~500 million ad events per day |

---

## SSAI Architecture (Server-Side Ad Insertion)

SSAI is the primary mechanism for delivering video ads within Acme Stream content:

```
Player requests manifest
        |
        v
Playback Service (Streaming)
        | Detects ad break marker in manifest
        | Forwards ad request to Ad Platform
        v
Ad Platform - Ad Decision Service
        | Constructs ad request with targeting params:
        |   - Content category, genre
        |   - User segment (if consented)
        |   - Device type, geography
        |   - Ad break position (pre/mid-roll)
        v
Google Ad Manager (SSP)
        | Returns VAST response with creative URL
        v
Ad Platform - Ad Stitching Service
        | Fetches ad creative segments
        | Transcodes to match content bitrate profiles (if needed)
        | Stitches ad segments into video manifest
        v
Modified manifest returned to player
        | Player plays content + ads seamlessly
        | No client-side ad request = ad blockers cannot intercept
        v
Impression/event beacons fire server-side
```

### Key Benefits of SSAI

- **Ad blocker resistant:** Ads are part of the video stream, indistinguishable from content at the network level
- **Seamless playback:** No buffering transitions between content and ads
- **Consistent quality:** Ad creatives are transcoded to match the content bitrate profile, preventing quality drops
- **Server-side measurement:** Impression tracking fires server-side, not dependent on client-side JavaScript execution

---

## Ad Types

| Ad Type | Placement | Format | Typical Duration |
|---------|-----------|--------|-----------------|
| Pre-roll | Before content starts | Video (VAST) | 15s or 30s |
| Mid-roll | During content at natural break points | Video (VAST) | 15s, 30s, or 60s |
| Companion Display | Alongside video player | Banner (HTML/image) | Duration of video ad |
| Overlay | Bottom 20% of video player | Semi-transparent banner | 10–15 seconds |

Mid-roll break points are defined in content metadata as cue points, set during the editorial and QA process. Ad podding groups multiple ads in a single break — typically 2–3 ads per mid-roll, with a maximum of 90 seconds per pod.

---

## Real-Time Bidding Integration

The Ad Platform integrates with multiple demand sources to maximize yield:

- **Google Ad Manager** as the primary Supply-Side Platform (SSP) for programmatic demand
- **Header bidding** for premium inventory: multiple demand sources compete before Ad Manager makes the final decision
- **Waterfall** for remaining inventory: Ad Manager → backfill networks → house ads (internal promotions)
- **Direct-sold campaigns:** Guaranteed impressions at fixed CPM take priority over programmatic demand
- **Ad request timeout:** 200ms — if no response is received from the demand source, the system proceeds with the next source or content

---

## Impression Tracking

ClickHouse ingests approximately 500 million ad events per day with near real-time availability:

### Event Types

`impression`, `start`, `firstQuartile`, `midpoint`, `thirdQuartile`, `complete`, `click`, `skip`, `error`

Events fire server-side during SSAI (for video ads) and client-side (for display and overlay ads).

### ClickHouse Configuration

- **Table engine:** `ReplicatedMergeTree` for fault tolerance (2 replicas per shard)
- **Partitioning:** By `event_date` for efficient date-range queries
- **Ordering:** By `(campaign_id, event_time)` for fast campaign-level reporting
- **Materialized views:** Hourly aggregation rolls up raw events for reporting dashboards (impressions, clicks, completions per campaign per hour)

### Real-Time Dashboards

Grafana dashboards pull directly from ClickHouse for live campaign monitoring. Dashboard refresh interval: 5 seconds for active campaign monitoring.

---

## Campaign Management

The self-serve campaign management UI enables advertisers to:

- **Setup campaigns:** Define targeting criteria, budget, flight dates, and creative assets
- **Targeting dimensions:** Content category, geography (country/state/DMA), device type (mobile/desktop/CTV), time of day, audience segment (requires user consent)
- **Budget management:** Daily pacing to spread impressions evenly, lifetime budget caps, automatic campaign pause on budget exhaustion
- **Creative management:** Upload video creatives, provide VAST tag URLs, attach companion banners
- **Approval workflow:** All creatives are reviewed for brand safety compliance before activation

---

## Yield Optimization

The platform optimizes ad revenue through several mechanisms:

- **Fill rate optimization:** Ensure maximum ad inventory is monetized (target: > 85% fill rate)
- **Floor price management:** Minimum CPM thresholds by content category and ad format prevent below-value impressions
- **Ad podding optimization:** Maximize revenue per break while respecting viewer experience (no back-to-back same-category ads, competitive separation)
- **Frequency capping:** Limit ad exposure per user per campaign (typically 3–5 impressions per user per day) to prevent ad fatigue

---

## Reporting

### Advertiser Reports

Available to advertisers via the self-serve portal and scheduled email delivery:

- Impressions, clicks, completion rate (25%, 50%, 75%, 100%)
- Viewability rate (MRC standard: 50% of pixels visible for 2 continuous seconds)
- Click-through rate (CTR)
- Breakdown by: date, content category, device type, geography

### Publisher Reports

Internal reports for Acme Media revenue management:

- Revenue (total, by content category, by ad format)
- CPM (effective CPM across all demand sources)
- Fill rate (filled impressions / available impressions)
- Ad request volume and error rate

---

## VAST/VPAID Compliance

The Ad Platform adheres to industry standards:

- **VAST 4.2** — Standard XML format for video ad serving and tracking
- **VPAID 2.0** — Support for interactive ad units (limited use, being phased out in favor of SIMID)
- **IAB Open Measurement SDK** — Viewability measurement across all ad formats
- **MRC accreditation** — Impression counting follows Media Rating Council guidelines for accurate measurement

---

## Technical Reference

| Attribute | Value |
|-----------|-------|
| Language | Java 17, Spring Boot 3 |
| Databases | PostgreSQL 15, ClickHouse |
| Ad Server | Google Ad Manager |
| Standards | VAST 4.2, VPAID 2.0, IAB OM SDK |
| Measurement | MRC accredited |
| Events/day | ~500 million |
