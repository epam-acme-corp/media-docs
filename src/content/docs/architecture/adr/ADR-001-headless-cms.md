---
title: "ADR-001 — Adopt Headless CMS Architecture"
---

# ADR-001: Adopt Headless CMS Architecture

## Status

Accepted

## Date

2022-03-15

## Context

The editorial team at Acme Media needed to publish content across multiple output channels: 12 web properties (via Next.js), mobile applications (iOS, Android), smart TV apps, and third-party syndication feeds. The previous monolithic CMS tightly coupled content authoring with web presentation, creating several problems:

- Each new output channel required custom integration work against internal database queries rather than stable APIs
- Frontend developers were constrained by the CMS's templating engine and could not adopt modern frontend frameworks
- Content syndication to partner platforms required brittle export scripts that frequently broke when the CMS schema changed
- Editorial workflow and content rendering were deployed as a single unit, meaning presentation changes risked editorial stability

The business was expanding its multi-platform strategy, with planned launches for smart TV applications and a mobile app within the following 12 months. The existing architecture could not support this expansion without significant rework.

## Decision

Adopt a headless CMS architecture using Node.js 20 / Express as the content API layer with MongoDB 7 as the content store. The CMS exposes both REST and GraphQL APIs, enabling flexible consumption by any frontend or downstream system.

Key architectural choices:

- **REST API** for standard CRUD operations, content management, and integration with legacy systems
- **GraphQL API** for frontend consumption, enabling clients to request exactly the data they need in a single query, reducing over-fetching and round trips
- **MongoDB 7** as the content store, chosen for its document model which naturally accommodates the varied content schemas (articles, videos, galleries, podcasts) without schema migrations
- **Next.js 14** for the primary web publishing platform, using Incremental Static Regeneration (ISR) for article pages and server-side rendering for dynamic content
- **Webhook events** (`content.published`, `content.updated`, `content.archived`) for downstream notification, enabling cache invalidation, CDN purge, and catalog synchronization

## Consequences

### Positive

- Content is truly decoupled from presentation. New channels (smart TV app, mobile app) integrate via the same Content API without CMS changes.
- Editorial workflow is unified regardless of output channel. An editor publishes once; content is available everywhere.
- GraphQL enables frontends to request exactly the data they need, reducing over-fetching and improving page load performance.
- The REST API provides a stable integration surface for third-party syndication and partner systems.
- Content model changes (adding fields, new content types) are handled at the application layer via Mongoose schemas, avoiding complex migration processes.

### Negative

- Deployment complexity increased: CMS API and Publishing Platform are separately deployed services with independent release cycles.
- Editorial preview requires real-time API integration rather than in-CMS rendering, adding latency to the preview experience.
- Initial learning curve for the editorial team accustomed to WYSIWYG editing within a traditional CMS.
- Two API styles (REST and GraphQL) increase the API surface area to maintain and document.

### Mitigations

- Built a rich preview feature in the CMS editorial UI that calls the Publishing Platform's preview API, providing near-WYSIWYG preview of content as it will appear on the published site.
- Invested in editorial training during the rollout, including documentation and hands-on sessions for all content teams.
- Established clear guidelines for when to use REST (management, integrations) versus GraphQL (frontend consumption).
