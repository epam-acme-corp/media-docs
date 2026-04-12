---
title: "Acme Media — Architecture Overview"
---

# Acme Media — Architecture Overview

Acme Media's architecture follows a domain-driven microservices approach, organized around four bounded contexts: Content, Streaming, Advertising, and Recommendations. The content pipeline is orchestrated through an event-driven architecture using RabbitMQ, with each domain team owning its services end-to-end.

For the system inventory and team structure, see [`../technical/system-landscape.md`](../technical/system-landscape.md). For key technology decisions, see the ADRs in [`./adr/`](./adr/).

---

## Architecture Principles

The following principles guide architectural decisions across Acme Media:

- **Domain-driven design** — Services are organized around business capabilities (content, streaming, advertising, recommendations), not technical layers. Each domain has clear ownership and a shared language.
- **Event-driven pipeline** — Asynchronous content processing via RabbitMQ decouples systems and enables each service to evolve independently. Events represent business facts (content published, ad impression recorded).
- **Polyglot persistence** — Each domain selects the database best suited to its access patterns. MongoDB for flexible content schemas, ClickHouse for high-volume analytics, PostgreSQL for transactional integrity, Redis for low-latency caching.
- **API-first** — All inter-service communication flows through well-defined APIs (REST, GraphQL, VAST). Service boundaries are enforced through API contracts, not shared databases.
- **Infrastructure as code** — All deployment artifacts are defined in Helm charts and managed via GitOps. Environment configuration is versioned alongside application code.

---

## Bounded Contexts and Service Decomposition

Acme Media is decomposed into four bounded contexts, each with clear ownership, shared language, and well-defined interfaces:

### Content Context

**Systems:** CMS (content authoring, editorial workflow), Content Workflow (ingest-to-publish orchestration), Publishing Platform (web rendering)

**Shared language:** articles, galleries, videos, podcasts, editorial workflow states (draft, review, approved, scheduled, published, archived), content versions, sites, syndication

**Team ownership:** CMS / Publishing team (12 engineers) and Content Ops team (8 engineers)

The Content context manages the full editorial lifecycle from content creation through web delivery. The CMS provides the content API consumed by all frontends. The Content Workflow orchestrates media processing. The Publishing Platform renders the editorial websites.

### Streaming Context

**Systems:** Streaming Platform (playback, transcoding orchestration, packaging, live streaming), CDN management

**Shared language:** titles, renditions, manifests (HLS/DASH), playback sessions, availability windows, quality profiles, segments

**Team ownership:** Streaming team (10 engineers)

The Streaming context handles all video delivery from ingestion through playback. It manages the content catalog, playback session lifecycle, and CDN configuration. This is the most performance-sensitive context, serving approximately 150,000 concurrent streams during live events.

### Advertising Context

**Systems:** Ad Platform (ad decisioning, insertion, tracking, reporting)

**Shared language:** campaigns, impressions, ad pods, fill rate, yield, VAST, creatives, targeting segments, CPM

**Team ownership:** Ad Platform team (8 engineers)

The Advertising context manages all ad monetization. Its core capability is server-side ad insertion (SSAI), which stitches ads into video manifests. The ClickHouse analytics backend processes approximately 500 million ad events per day.

### Recommendations Context

**Systems:** Recommendation Engine (personalization, A/B testing, ML models)

**Shared language:** features, models, experiments, user profiles, content embeddings, recommendation rows, scores

**Team ownership:** ML / Recommendations team (6 engineers)

The Recommendations context provides personalized content suggestions for the streaming service and editorial properties. It maintains a Redis-based feature store and runs weekly model retraining cycles.

### Context Communication

Bounded contexts communicate through well-defined interfaces:

- **Content → Streaming** — RabbitMQ events (`content.transcoded`, `content.published`) notify the Streaming Platform of new or updated content. The Catalog API provides content metadata.
- **Content → Publishing** — Headless CMS Content API (REST + GraphQL) provides content for web rendering. Webhook events trigger ISR cache invalidation.
- **Streaming → Advertising** — SSAI integration: the Playback Service detects ad break markers and forwards ad requests to the Ad Platform during manifest generation.
- **Streaming → Recommendations** — Recommendation API provides personalized content lists for the streaming UI (home page rows, "watch next" suggestions).
- **All → Analytics** — Event streams feed ClickHouse (ad events) and Snowflake (content analytics) for business intelligence.

---

## Event-Driven Content Pipeline

RabbitMQ orchestrates the content processing pipeline with the following event flow:

```
content.ingested → content.transcoding.started → content.transcoded → content.qa.started →
content.qa.passed / content.qa.failed → content.metadata.enriched → content.published
```

### Exchange Topology

- **Exchange:** Topic exchange `content.events` with routing keys by lifecycle stage
- **Consumer groups:** Each service subscribes to the routing keys relevant to its domain. The Transcoding Service listens for `content.ingested`, QA listens for `content.transcoded`, and so on.
- **Dead letter handling:** Failed messages are routed to a dead-letter queue (DLQ) per consumer. DLQ depth is monitored and alerts fire when messages accumulate beyond a configurable threshold.
- **Idempotency:** All consumers are designed for at-least-once delivery. Each consumer maintains an idempotency key (content ID + event type) to prevent duplicate processing.
- **Message format:** JSON payloads with a schema version header (`X-Schema-Version`). Note: a formal schema registry has not yet been adopted — this is a recognized technical debt item (see [system landscape](../technical/system-landscape.md#technical-debt)).

---

## CDN Architecture

Akamai serves as the primary CDN for all video and static content delivery:

- **Origin:** Azure Blob Storage (hot tier for active content, cool tier for archive)
- **Origin Shield:** Akamai mid-tier cache (US East) consolidates edge requests to reduce origin load. Target origin offload: > 95% (measured: typically 97–98% for video segments).
- **Edge:** Global points of presence (300+ locations), 99.99% availability SLA
- **Multi-bitrate packaging:** HLS and DASH manifests for adaptive bitrate streaming across all device types
- **Cache invalidation:** Fast purge for content removal (< 5 seconds propagation), soft purge for metadata updates (stale-while-revalidate), TTL-based expiry for live segments

For detailed CDN configuration, see [`../technical/cdn-architecture.md`](../technical/cdn-architecture.md).

---

## Deployment Architecture

All services are deployed on Azure Kubernetes Service (AKS):

- **Namespaces:** Separate Kubernetes namespaces per domain: `content`, `streaming`, `advertising`, `recommendations`, `platform`
- **Deployment artifacts:** Helm charts for all deployments, stored in a central Helm repository
- **CI/CD:** GitHub Actions workflows per service repository. Pull request builds run tests and lint; merges to main trigger deployment to staging.
- **Environments:** `dev` → `staging` → `production`
  - Streaming services use **blue-green deployment** for zero-downtime releases during live events
  - All other services use **rolling updates** with readiness probes
- **Observability:**
  - **Metrics:** Prometheus + Grafana for system and application metrics
  - **Logs:** Elasticsearch + Kibana for centralized log aggregation
  - **Tracing:** Jaeger for distributed tracing across microservices

---

## Data Architecture Summary

| Database | Technology | Domain | Rationale |
|----------|-----------|--------|-----------|
| Content Store | MongoDB 7 | Content, Editorial | Document model fits flexible content schemas — articles, videos, and galleries each have different field shapes |
| Ad Analytics | ClickHouse | Advertising | Columnar storage for fast aggregation over billions of ad impression events |
| Transactional | PostgreSQL 15 | Streaming, Advertising | ACID compliance for catalog, sessions, campaign management |
| Cache / Feature Store | Redis 7 | Streaming, Recommendations | Sub-millisecond reads for playback sessions and ML feature vectors |
| DRM Store | SQL Server 2019 | DRM | Legacy from .NET Framework era, stores encryption keys and license records |

For detailed schema documentation and data governance, see [`../data/architecture.md`](../data/architecture.md).

---

## Technical Reference

| Attribute | Value |
|-----------|-------|
| Architecture Style | Domain-driven microservices |
| Event Bus | RabbitMQ (topic exchange) |
| Container Orchestration | Azure Kubernetes Service (AKS) |
| CI/CD | GitHub Actions |
| Deployment | Helm charts, blue-green (streaming), rolling (others) |
| Observability | Prometheus, Grafana, ELK, Jaeger |
