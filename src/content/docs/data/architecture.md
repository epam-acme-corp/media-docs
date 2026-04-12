---
title: "Acme Media — Data Architecture"
---

# Acme Media — Data Architecture

Acme Media operates a polyglot persistence strategy with five database technologies and three data pipeline patterns. This document provides the authoritative reference for database choices, schema patterns, data volumes, analytics pipelines, and governance practices.

For system context, see [`../technical/system-landscape.md`](../technical/system-landscape.md). For individual system schemas, see the CMS ([`../technical/cms.md`](../technical/cms.md)), Streaming Platform ([`../technical/streaming-platform.md`](../technical/streaming-platform.md)), Ad Platform ([`../technical/ad-platform.md`](../technical/ad-platform.md)), and DRM ([`../technical/drm.md`](../technical/drm.md)) documentation.

---

## Database Landscape

| Database | Technology | Version | Domain | Primary Use |
|----------|-----------|---------|--------|-------------|
| Content Store | MongoDB | 7 | CMS, Content Workflow | Editorial content (articles, videos, galleries), workflow state |
| Streaming DB | PostgreSQL | 15 | Streaming Platform | Content catalog, playback sessions, availability windows |
| Ad Transactional | PostgreSQL | 15 | Ad Platform | Campaign management, advertiser accounts, targeting rules |
| Ad Analytics | ClickHouse | Latest stable | Ad Platform | Impression tracking, real-time aggregation, reporting |
| Cache / Feature Store | Redis | 7 | Streaming, Recommendations | Playback session cache, ML feature vectors |
| DRM Store | SQL Server | 2019 | DRM | Content encryption keys, licenses, entitlements |

### Technology Rationale

**MongoDB 7** — Selected for the CMS because the document model naturally accommodates varied content schemas (articles, videos, galleries each have different field structures) without schema migrations. Replica set with 3 nodes for high availability. Backed up via continuous oplog backup with 7-day point-in-time recovery.

**PostgreSQL 15** — Used for transactional workloads in both the Streaming Platform and Ad Platform. ACID compliance is critical for catalog management, session tracking, and campaign financial data. Two separate clusters (streaming and advertising) for isolation. Streaming replicas for read scaling. Daily automated backups with 30-day retention.

**ClickHouse** — Selected for ad analytics because columnar storage provides fast aggregation over billions of impression events. The Ad Platform ingests approximately 500 million events per day. ReplicatedMergeTree engine with 2 replicas per shard for fault tolerance. 90-day raw data retention with materialized views for long-term aggregates.

**Redis 7** — Provides sub-millisecond reads for playback session cache and ML feature vectors. 3 primary + 3 replica cluster with approximately 50 GB total. LRU eviction for least-recently-active user profiles.

**SQL Server 2019** — Inherited from the .NET Framework era for DRM. Stores encryption keys and license records. Always On availability group for high availability. 7-year license retention per compliance requirements.

---

## Data Volumes

| Data Category | Volume | Storage | Growth Rate |
|--------------|--------|---------|-------------|
| Ad impression events | ~500M events/day | ClickHouse | ~15% quarterly |
| Viewing sessions | ~5M sessions/day | PostgreSQL | ~10% quarterly |
| Content catalog | ~45,000 titles | PostgreSQL | ~200 titles/month |
| Editorial articles | ~200,000 articles | MongoDB | ~500 articles/day |
| Content versions | ~1.5M versions | MongoDB (sub-documents) | Proportional to edits |
| ML feature vectors | ~2.1M user profiles | Redis | Proportional to subscribers |
| DRM licenses issued | ~8M/month | SQL Server | Proportional to playback |
| Video segments (stored) | ~800 TB | Azure Blob Storage | ~5 TB/month |

---

## MongoDB Schema Design

### Articles Collection

```json
{
  "_id": "ObjectId",
  "title": "string",
  "slug": "string (unique per site)",
  "body": "rich text (HTML/Markdown)",
  "excerpt": "string",
  "author": { "_id": "ObjectId", "name": "string", "slug": "string" },
  "category": { "_id": "ObjectId", "name": "string", "slug": "string" },
  "tags": ["string"],
  "siteId": "string",
  "syndicatedTo": ["string (siteIds)"],
  "status": "draft | review | approved | scheduled | published | archived",
  "seoMeta": {
    "title": "string",
    "description": "string",
    "canonicalUrl": "string",
    "ogImage": "string (Cloudinary URL)"
  },
  "versions": [
    { "versionNumber": 1, "body": "...", "editedBy": "ObjectId", "editedAt": "ISODate" }
  ],
  "publishedAt": "ISODate",
  "scheduledAt": "ISODate",
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}
```

**Design decisions:**

- Author and category are embedded references (denormalized for read performance, with reference IDs for joins when needed)
- Versions stored as sub-documents within the article (keeps version history co-located, simplifies queries)
- Tags as string array (flexible tagging, supports autocomplete via Elasticsearch)
- `siteId` + `slug` compound index for fast lookups
- TTL index on `status: "archived"` items after 2 years (moved to cold storage)

### Content Workflow Collection

```json
{
  "_id": "ObjectId",
  "contentId": "string (reference to source media)",
  "contentType": "video | audio",
  "status": "ingested | transcoding | transcoded | qa | published | failed",
  "pipeline": [
    { "stage": "ingest", "completedAt": "ISODate", "result": {} },
    { "stage": "transcode", "jobId": "AWS MediaConvert job ID", "completedAt": "ISODate", "result": { "renditions": [] } },
    { "stage": "qa", "checks": [], "passed": true, "completedAt": "ISODate" }
  ],
  "metadata": { "title": "...", "duration": 3600, "resolution": "4K" },
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}
```

---

## ClickHouse Architecture

### Core Table — Ad Impressions

```sql
CREATE TABLE ad_impressions (
    event_time DateTime,
    event_date Date DEFAULT toDate(event_time),
    event_type Enum8('impression'=1, 'start'=2, 'firstQuartile'=3,
                     'midpoint'=4, 'thirdQuartile'=5, 'complete'=6,
                     'click'=7, 'skip'=8, 'error'=9),
    campaign_id UInt64,
    creative_id UInt64,
    content_id String,
    content_category LowCardinality(String),
    user_id String,
    device_type LowCardinality(String),
    country LowCardinality(String),
    region String,
    ad_format LowCardinality(String),
    ad_position Enum8('pre_roll'=1, 'mid_roll'=2, 'overlay'=3, 'companion'=4),
    revenue_micros Int64
) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/ad_impressions', '{replica}')
PARTITION BY event_date
ORDER BY (campaign_id, event_time)
TTL event_date + INTERVAL 90 DAY
```

### Materialized Views for Aggregation

```sql
CREATE MATERIALIZED VIEW ad_impressions_hourly
ENGINE = ReplicatedSummingMergeTree
PARTITION BY event_date
ORDER BY (campaign_id, event_date, event_hour, event_type)
AS SELECT
    campaign_id,
    event_date,
    toStartOfHour(event_time) AS event_hour,
    event_type,
    count() AS event_count,
    sum(revenue_micros) AS total_revenue_micros
FROM ad_impressions
GROUP BY campaign_id, event_date, event_hour, event_type
```

### Data Retention

- **Raw events:** 90 days (TTL on `event_date`)
- **Hourly aggregates:** 2 years
- **Daily aggregates:** Indefinite (small data volume)

### Query Performance

- Typical campaign report (1 campaign, 30 days): < 500ms
- Cross-campaign analytics (all campaigns, 7 days): < 2 seconds
- Real-time dashboard refresh: 5-second polling interval

---

## ML Feature Store (Redis)

The Recommendation Engine uses Redis as a feature store for real-time ML serving:

- **User viewing history:** Last 100 titles viewed per user, stored as sorted set (score = timestamp)
- **Content embeddings:** 256-dimensional float vectors per content item, stored as binary strings
- **Real-time features:** Session-level features (current watch time, device type, time of day) for real-time recommendation scoring
- **Feature refresh:** Batch pipeline (Spark) runs nightly to update user profiles; real-time pipeline updates session features via streaming events
- **Memory management:** Approximately 50 GB Redis cluster (3 primary + 3 replica nodes), LRU eviction for least-recently-active user profiles
- **Read latency:** p99 < 2ms for feature retrieval (critical path for recommendation API response time)

---

## Analytics Pipelines

### Streaming Pipeline (Ad Events)

```
Ad Platform -> Kafka -> Kafka Connect -> ClickHouse
```

- Near real-time ingestion (< 5 second end-to-end latency)
- Kafka serves as a buffer for back-pressure handling during traffic spikes
- Kafka Connect ClickHouse sink connector for reliable delivery

### Batch Pipeline (Content Analytics)

```
MongoDB -> Spark Extract -> Snowflake (data warehouse)
```

- Nightly batch: full content analytics (article views, engagement, author performance)
- Business intelligence team queries Snowflake for editorial analytics dashboards
- Data freshness: T+1 day

### ML Pipeline (Feature Store Refresh)

```
PostgreSQL (viewing_history) + MongoDB (content metadata) -> Spark -> Redis (feature store)
```

- Nightly batch: recalculates user profiles, content embeddings, collaborative filtering matrices
- Model retraining: weekly (PyTorch on GPU instances, deployed via Kubernetes Job)
- A/B test analysis: Spark jobs calculate experiment metrics for the ML team

---

## Data Governance

- **Content metadata standards:** All content items must have title, description, category, and at least one tag. Quality enforced at CMS API layer via Mongoose validation.
- **Ad measurement compliance:** Impression counting follows MRC (Media Rating Council) guidelines. IAB (Interactive Advertising Bureau) standards for viewability measurement.
- **Data classification:**
  - Public: Content metadata, published articles, catalog information
  - Confidential: User data (viewing history, preferences, account details)
  - Restricted: Encryption keys, DRM license data, financial records
- **Retention policies:**
  - Ad raw events: 90 days
  - Viewing history: 2 years
  - Editorial content: Indefinite (archived after 2 years)
  - DRM licenses: 7 years

---

## GDPR/CCPA Compliance

### User Consent Management

Consent is tracked per user for four categories: personalization, advertising targeting, analytics, and essential services. Consent preferences are stored in the user profile and propagated to all downstream systems.

### Data Deletion Workflow

When a streaming subscriber requests data deletion:

1. CRM marks the account for deletion
2. Automated pipeline removes user data from:
   - PostgreSQL: viewing history, playback sessions
   - Redis: feature store (user profile, viewing history)
   - ClickHouse: ad events are anonymized (user_id replaced with irreversible hash)
   - MongoDB: user-generated content removed (optional, per user request)
3. DRM service revokes all active licenses and removes device registrations
4. Deletion confirmed within 30 days per regulatory requirements

### Data Portability

Users can export their viewing history, profile data, and preference settings via the account settings API. Export format is JSON, delivered as a downloadable file.

### Cookie Consent

The Publishing Platform implements a cookie consent banner with granular category selection:
- Necessary (always enabled)
- Analytics
- Advertising
- Personalization

---

## Technical Reference

| Attribute | Value |
|-----------|-------|
| Databases | MongoDB 7, PostgreSQL 15, ClickHouse, Redis 7, SQL Server 2019 |
| Data Warehouse | Snowflake |
| Batch Processing | Apache Spark |
| Streaming | Kafka + Kafka Connect |
| ML Framework | PyTorch, Spark ML |
| Object Storage | Azure Blob Storage (~800 TB) |
