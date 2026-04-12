---
title: "Acme Media — System Landscape and Content Pipeline"
---

# Acme Media — System Landscape and Content Pipeline

This document is the primary technical reference for Acme Media's technology stack. It covers all core systems, their interconnections, third-party integrations, and the content pipeline that ties them together. Consult this document first when onboarding or planning cross-system initiatives.

For the business context behind these systems, see [`../business/overview.md`](../business/overview.md). For architecture decisions, see [`../architecture/overview.md`](../architecture/overview.md).

---

## System Inventory

Acme Media operates seven core systems, each selected for domain-specific strengths:

| System | Technology | Database | Purpose |
|--------|-----------|----------|---------|
| Content Management System | Node.js 20 / Express (headless CMS) | MongoDB 7 | Editorial content authoring, publishing workflows |
| Streaming Platform | Go 1.21 microservices | Redis 7 + PostgreSQL 15 | Live and VOD streaming, HLS/DASH packaging |
| Ad Platform | Java 17 / Spring Boot 3 | PostgreSQL 15 + ClickHouse | Real-time ad insertion (SSAI), impression tracking, reporting |
| Recommendation Engine | Python 3.11 / FastAPI, PyTorch | Redis 7 (feature store) + PostgreSQL | Content recommendations, personalization, A/B testing |
| Content Workflow | Node.js 20, RabbitMQ | MongoDB 7 | Ingest → transcode → QA → publish orchestration |
| Publishing Platform | Next.js 14 | — (headless CMS API) | Editorial websites, SEO, newsletters |
| Digital Rights Management | .NET 6 | SQL Server 2019 | License management, content encryption, access control |

### Content Management System (CMS)

The CMS is the editorial backbone of Acme Media, providing content authoring and publishing workflows for all 12 editorial properties. Built as a headless, API-first system on Node.js 20 / Express with MongoDB 7, it exposes both REST and GraphQL APIs for flexible content consumption by any frontend. The CMS team selected MongoDB for its document model, which naturally accommodates the varied content schemas (articles, videos, galleries, podcasts) without schema migrations. Maintained by the CMS / Publishing team.

### Streaming Platform

The Streaming Platform powers Acme Stream, handling the complete video delivery chain from source media ingestion to client-side playback. Built in Go 1.21 for its concurrency model and low memory footprint, it processes thousands of concurrent HLS/DASH segment requests with minimal garbage collection pause. Redis serves as the session cache for sub-millisecond reads, while PostgreSQL stores the catalog and session data. Maintained by the Streaming team.

### Ad Platform

The Ad Platform drives all advertising monetization across Acme Media properties. Java 17 / Spring Boot 3 was chosen for enterprise reliability in real-time ad decisioning and the mature ecosystem for financial calculations such as impression counting and revenue attribution. PostgreSQL handles campaign management transactions, while ClickHouse provides columnar analytics for the approximately 500 million ad impression events ingested daily. Maintained by the Ad Platform team.

### Recommendation Engine

The Recommendation Engine delivers personalized content suggestions across streaming and publishing. Python 3.11 / FastAPI serves the recommendation API with low latency, while PyTorch handles ML model training and inference. Redis stores the feature vectors used for real-time scoring. The team uses A/B testing extensively to validate recommendation algorithm improvements. Maintained by the ML / Recommendations team.

### Content Workflow

The Content Workflow system orchestrates the media processing pipeline from ingest through publish. Built on Node.js 20 with RabbitMQ for event-driven orchestration, it coordinates the sequence of ingestion, transcoding (via AWS MediaConvert), QA checks, and publishing. MongoDB stores workflow state and processing history. Maintained by the Content Ops team.

### Publishing Platform

The Publishing Platform renders editorial websites for all 12 properties using Next.js 14. It consumes the CMS Content API (REST and GraphQL) and provides server-rendered HTML for SEO, Incremental Static Regeneration (ISR) for performance, and client-side interactivity for dynamic features. The platform does not have its own database — all content is served via the CMS API. Maintained by the CMS / Publishing team.

### Digital Rights Management (DRM)

The DRM system manages content encryption and license acquisition for protected streaming content, supporting Widevine, FairPlay, and PlayReady. Built on .NET 6 (recently migrated from .NET Framework), it uses SQL Server 2019 for encryption key storage and license records. The system interfaces with the Streaming Platform during playback session initialization. Maintained by the DRM / Platform team.

---

## Content Pipeline Overview

The content pipeline orchestrates media from source to viewer across multiple systems:

```
Source Media
    |
    v
+----------+    +--------------+    +---------+    +---------+    +---------+    +------------+
|  Ingest  |--->|  Transcode   |--->|   QA    |--->|   CMS   |--->|   CDN   |--->|   Player   |
| Service  |    |(MediaConvert)|    | Checks  |    | Publish |    |(Akamai) |    |(Brightcove)|
+----------+    +--------------+    +---------+    +---------+    +---------+    +------------+
    |                                                                                  |
    +------------------------ RabbitMQ Event Bus --------------------------------------+
```

### Pipeline Stages

**Ingest Service** — Receives source media files via upload API or partner delivery (S3 drop, Aspera). Validates format (accepted: ProRes, H.264, H.265), generates a content fingerprint for deduplication, and creates a content record in the workflow database. Publishes `content.ingested` event.

**Transcode (AWS MediaConvert)** — Creates multi-bitrate renditions across six quality levels (240p at 400 kbps through 4K at 16 Mbps). Produces both HLS and DASH manifests. Output segments stored in S3. The platform processes approximately 2,000 transcode jobs per day. Publishes `content.transcoded` event via SNS notification.

**QA Checks** — Automated checks verify bitrate targets, audio synchronization, color space accuracy, and subtitle format compliance. Items that fail automated checks are flagged for manual review by the Content Ops team. Current automated pass rate is approximately 94%. Publishes `content.qa.passed` or `content.qa.failed` event.

**CMS Publish** — Metadata enrichment by the editorial team: titles, descriptions, tags, categories, SEO metadata, content ratings, and geographic availability. Editorial content enters the CMS workflow state machine (draft → review → approved → scheduled → published). Publishes `content.published` event.

**CDN (Akamai)** — Content is pushed to origin storage (Azure Blob Storage) and served via Akamai's global edge network with an origin shield pattern. The CDN provides 99.99% availability SLA with 300+ global points of presence.

**Player (Brightcove)** — Client-side playback with adaptive bitrate streaming, analytics event collection, and DRM license acquisition. The Brightcove Player SDK is deployed across web, mobile, smart TV, and gaming console platforms.

---

## Third-Party Integrations

| Service | Vendor | Purpose | Integration Pattern |
|---------|--------|---------|-------------------|
| Transcoding & Packaging | AWS MediaConvert | Video transcoding, multi-bitrate renditions | AWS SDK, S3 input/output, SNS notifications |
| Player SDK & Analytics | Brightcove | Client-side video player, playback analytics | JavaScript SDK, REST API for catalog sync |
| Ad Decisioning & Yield | Google Ad Manager | Ad decisioning, yield optimization, reporting | VAST/VPAID tags, REST API for campaign management |
| Audience Measurement | Nielsen | Audience measurement, ratings | JavaScript SDK, server-side beacons |
| CDN | Akamai | Content delivery, global PoPs, 99.99% SLA | Origin pull, Property Manager API, purge API |

### Integration Details

**AWS MediaConvert** — Source media is uploaded to an S3 input bucket. The Transcoding Service submits jobs via the AWS SDK with predefined job templates for each quality profile. Completed jobs publish SNS notifications that trigger the next pipeline stage. Data flows from S3 (input) to MediaConvert to S3 (output). The Content Ops team owns the MediaConvert configuration and job templates.

**Brightcove** — The Brightcove Player SDK is embedded in all client applications. The SDK handles adaptive bitrate selection, DRM license acquisition, and playback analytics. A catalog sync process runs hourly via Brightcove's REST API to keep the Brightcove catalog aligned with the Acme Media content library. The Streaming team owns the Brightcove integration.

**Google Ad Manager** — Ad requests are sent via VAST tags during SSAI processing. Campaign management and yield optimization are configured via Ad Manager's REST API. Reporting data is pulled for reconciliation with internal ClickHouse analytics. The Ad Platform team owns this relationship.

**Nielsen** — Audience measurement tags are deployed on all publishing properties (JavaScript SDK) and within the streaming player (server-side beacons). Nielsen provides ratings data used for advertiser reporting and content performance analysis.

**Akamai** — Content is served via origin pull from Azure Blob Storage. Configuration is managed via Akamai Property Manager API. Fast purge and soft purge APIs are used for cache invalidation. The CDN team monitors origin offload (target: > 95%) and edge performance.

---

## Polyglot Architecture Rationale

Acme Media uses multiple programming languages, each selected for domain-specific strengths:

**Go (Streaming Platform)** — High-throughput, low-latency video packaging requires Go's concurrency model and small memory footprint. The Streaming Platform processes thousands of concurrent HLS/DASH segment requests with minimal GC pause. Go's goroutines and standard library `net/http` provide efficient connection handling without framework overhead.

**Node.js (CMS and Content Workflow)** — Flexible JSON document handling aligns with MongoDB's document model. The rich npm ecosystem provides libraries for content processing (markdown rendering, image manipulation, RSS feed generation). JavaScript's ubiquity simplifies integration with the editorial team's tooling and frontend components.

**Java (Ad Platform)** — Enterprise reliability for real-time ad decisioning. Strong typing and the mature Spring ecosystem support financial calculations for impression counting and revenue attribution. Spring Boot 3 provides robust observability, configuration management, and health checking.

**Python (Recommendation Engine)** — PyTorch for ML model training and inference. FastAPI for high-performance API serving with automatic OpenAPI documentation. The Python data science ecosystem (pandas, scikit-learn, numpy) supports feature engineering, A/B testing analysis, and model evaluation.

**.NET (DRM)** — Originally built on .NET Framework with Microsoft PlayReady SDK integration. Recently migrated to .NET 6 for cross-platform deployment on Linux containers. The DRM license server benefits from .NET's performance and the mature security library ecosystem.

---

## Technical Debt

The following technical debt items are acknowledged and tracked:

**DRM System (.NET 6)** — The recent migration from .NET Framework left some hardcoded configuration in the integration layer between DRM and Streaming Platform. Incomplete error handling in license acquisition edge cases (e.g., network timeouts during entitlement checks) is a known gap. The team has a backlog to address this but it is not yet prioritized.

**Content Workflow** — RabbitMQ message schemas lack formal versioning. Some queue consumers handle schema evolution inconsistently, leading to occasional deserialization errors that require manual intervention. A move to a schema registry has been discussed but not yet implemented.

**API Documentation** — Some API specs lag behind the implementation, particularly in the Streaming Platform. The team is adopting docs-as-code practices but coverage is uneven. The CMS Content API is well-documented (OpenAPI generated from code annotations), but the Streaming API has gaps.

---

## Team Structure

| Team | Headcount | Responsibilities |
|------|-----------|-----------------|
| CMS / Publishing | 12 | Content Management System, Publishing Platform, editorial tooling |
| Streaming | 10 | Streaming Platform, video pipeline, live events, Brightcove integration |
| Ad Platform | 8 | Ad insertion, Google Ad Manager integration, impression tracking, reporting |
| ML / Recommendations | 6 | Recommendation Engine, personalization, A/B testing, ML model lifecycle |
| Content Ops | 8 | Content Workflow, ingest pipeline, QA automation, MediaConvert integration |
| DRM / Platform | 5 | Digital Rights Management, license management, content encryption |

Teams are organized around domain boundaries (content, streaming, advertising, recommendations) aligned with the bounded context architecture described in the [architecture overview](../architecture/overview.md). Each team owns its services end-to-end, from development through production operations.

---

## Technical Reference

| Attribute | Value |
|-----------|-------|
| Division | Acme Media |
| Maturity Level | Level 2 — Secured |
| GHAS | Enabled |
| Copilot | Early exploration |
| Cloud | Azure (AKS) + AWS (MediaConvert) |
| Orchestration | Kubernetes (AKS), Helm charts |
| Event Bus | RabbitMQ |
| CDN | Akamai |
