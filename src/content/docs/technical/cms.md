---
title: "Acme Media — Content Management System"
---

# Acme Media — Content Management System

The Content Management System (CMS) is the editorial backbone of Acme Media, providing content authoring, editorial workflows, and API-based content delivery for all 12 editorial properties, mobile applications, and smart TV apps. The system is designed as a headless, API-first CMS — see [ADR-001](../architecture/adr/ADR-001-headless-cms.md) for the architectural decision.

For the Publishing Platform that renders editorial websites, see [`./publishing-platform.md`](./publishing-platform.md). For the full API contract, see [`../api/content-api.md`](../api/content-api.md).

---

## System Overview

| Attribute | Value |
|-----------|-------|
| Technology | Node.js 20, Express framework |
| Architecture | Headless CMS (API-first, no built-in frontend rendering) |
| Database | MongoDB 7 (document model for flexible content schemas) |
| Search | Elasticsearch (full-text search, autocomplete) |
| Team | CMS / Publishing (12 engineers) |

The CMS serves as the central content authoring and management system for all Acme Media editorial properties. All content creation, editorial review, and publishing decisions flow through the CMS regardless of the output channel.

---

## Content Model

Content is stored in MongoDB collections, with each content type using a flexible schema enforced at the application layer via Mongoose:

| Collection | Description | Key Fields |
|-----------|-------------|------------|
| `articles` | News, features, opinion pieces, long-form | title, slug, body (rich text), author (ref), category (ref), tags[], publishedAt, siteId, seoMeta{} |
| `videos` | Video content with streaming platform references | title, slug, description, streamingRef (Streaming Platform catalog ID), thumbnail, duration, category |
| `galleries` | Photo galleries and image collections | title, slug, images[] (Cloudinary URLs), caption, credit, category |
| `podcasts` | Audio content | title, slug, description, audioUrl, duration, season, episode, transcript |
| `authors` | Editorial staff and contributors | name, slug, bio, avatar, socialLinks{}, role (writer/editor/editor-in-chief) |
| `categories` | Content taxonomy | name, slug, parentCategory (ref), siteId, description |
| `tags` | Free-form content tagging | name, slug, count (number of associated content items) |

MongoDB's document model allows fields to vary per item without schema migrations. Common fields (title, slug, status, createdAt, updatedAt, createdBy, siteId) are enforced at the application layer via Mongoose schemas with validation rules. This design accommodates the varied content shapes across articles, videos, galleries, and podcasts without complex migration processes.

---

## Editorial Workflow

Content follows a state machine through the publishing lifecycle:

```
draft → review → approved → scheduled → published → archived
```

### State Descriptions

- **draft** — Author creates or edits content. Auto-saved every 30 seconds to prevent data loss. Content is only visible to the author and editors.
- **review** — Author submits content for editorial review. The assigned editor is notified via email and in-app notification.
- **approved** — Editor approves the content. It can be published immediately or scheduled for a future date.
- **scheduled** — Content has a future `publishedAt` date. A cron job runs every minute, promoting scheduled content to `published` when the scheduled time arrives.
- **published** — Content is live and accessible via the Content API. The `content.published` webhook fires, triggering cache invalidation in the Publishing Platform and catalog sync in the Streaming Platform (for video content).
- **archived** — Content is removed from active listings but remains accessible via direct URL for link permanence. The `content.archived` webhook fires, triggering CDN cache purge.

### Role-Based Transitions

| Role | Allowed Transitions |
|------|-------------------|
| Writer | Create drafts, submit for review |
| Editor | Approve, request changes (returns to draft), schedule, publish |
| Editor-in-Chief | All transitions, including direct publish (bypassing review for breaking news) |

---

## Content Versioning

The CMS maintains a complete version history for every content item:

- Every save creates a new version record stored as a sub-document within the MongoDB content document
- Version history tracks who changed what and when, providing a complete audit trail
- A diff view in the editorial UI enables comparing any two versions side by side, powered by a diff library on the backend
- Rollback capability allows editors to restore any previous version with a single action
- Published versions are immutable — editing a published article creates a new version that must go through the editorial workflow before re-publishing

---

## API Design

The CMS exposes two API styles for different consumption patterns:

### REST API

Standard CRUD operations for all content types:

- `GET /api/v1/content/articles` — List articles (paginated, filterable by site, category, tag, status)
- `GET /api/v1/content/articles/:slug` — Get single article by slug
- `POST /api/v1/content/articles` — Create article (requires OAuth 2.0 authentication)
- `PUT /api/v1/content/articles/:id` — Update article (requires authentication)
- `DELETE /api/v1/content/articles/:id` — Soft delete / archive (requires authentication)

Equivalent endpoints exist for videos, galleries, podcasts, authors, categories, and tags. All list endpoints support cursor-based pagination, filtering, and sorting.

### GraphQL API

Flexible queries for frontend consumption:

- Single endpoint: `POST /api/v1/graphql`
- Enables frontends to request exactly the data they need (e.g., an article with nested author and related content in a single query)
- Used primarily by the Publishing Platform and mobile apps
- Schema is auto-generated from content model definitions

GraphQL is the preferred API for frontend consumption because it eliminates over-fetching and enables single-request data loading for complex pages. The REST API remains the standard for management operations and external integrations.

For complete API documentation with request/response examples, see [`../api/content-api.md`](../api/content-api.md).

---

## Media Asset Management

### Images

Image uploads are processed via Cloudinary:

- Automatic resizing to responsive breakpoints (320px, 640px, 960px, 1280px, 1920px)
- Format conversion to WebP and AVIF for modern browsers, with JPEG fallback
- Lazy loading attributes generated for frontend `<img>` tags
- Cloudinary transformation URLs enable on-the-fly cropping and resizing

### Video

Video content does not store media files directly in the CMS. Instead, videos reference the Streaming Platform's catalog ID via the `streamingRef` field. The CMS stores video metadata (title, description, thumbnail, duration) while playback is handled by the Streaming Platform.

### Audio

Podcast audio files are stored in Azure Blob Storage and served via Akamai CDN. The CMS stores metadata (title, description, duration, season, episode) and the audio file URL.

---

## Multi-Site Support

A single CMS instance serves all 12 editorial properties:

- Each site has its own configuration: branding, navigation structure, default category set, and editorial team assignments
- Content is either site-specific (filtered by `siteId`) or shared across sites (syndicated within the network)
- Syndication is managed via the `syndicatedTo[]` array on content items, enabling articles to appear on multiple sites with canonical URL management
- Editorial teams can be assigned per site, allowing editors to manage only the content relevant to their property

---

## Search

Elasticsearch powers both editorial and public-facing search:

- **Editorial search** — Full-text search across all content types within the CMS editorial UI. Supports filters by status, author, category, site, and date range.
- **Autocomplete** — Tag and category autocomplete in the editorial UI, powered by Elasticsearch completion suggester
- **Public search** — Public-facing search on editorial websites uses a separate Elasticsearch index optimized for read performance, updated in near real-time via MongoDB change streams

---

## Technical Reference

| Attribute | Value |
|-----------|-------|
| Runtime | Node.js 20, Express |
| Database | MongoDB 7 |
| ODM | Mongoose |
| Search | Elasticsearch |
| Image CDN | Cloudinary |
| Auth | OAuth 2.0 (editorial), API key (public) |
| Webhooks | content.published, content.updated, content.archived |
