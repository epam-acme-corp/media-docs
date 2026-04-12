---
title: "Acme Media — CMS Content API"
---

# Acme Media — CMS Content API

The CMS Content API provides programmatic access to all editorial content across Acme Media's 12 properties. It exposes both REST and GraphQL interfaces, enabling flexible consumption by the Publishing Platform, mobile apps, smart TV apps, and third-party syndication partners.

For the CMS system documentation, see [`../technical/cms.md`](../technical/cms.md). For authentication and rate limits, see [`./overview.md`](./overview.md).

---

## REST API

Base URL: `https://cms-api.media.acmecorp.com/api/v1`

### List Articles

```
GET /api/v1/content/articles
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `site` | string | — | Filter by site ID (required for public access) |
| `category` | string | — | Filter by category slug |
| `tag` | string | — | Filter by tag |
| `status` | string | `published` | Filter by status (management API only) |
| `author` | string | — | Filter by author slug |
| `limit` | integer | 20 | Results per page (max 100) |
| `cursor` | string | — | Cursor for pagination (from `nextCursor` in response) |
| `sort` | string | `publishedAt:desc` | Sort field and direction |

**Example Response (200 OK):**

```json
{
  "data": [
    {
      "id": "art_5f8a2b3c",
      "title": "Streaming Industry Trends for 2024",
      "slug": "streaming-industry-trends-2024",
      "excerpt": "An analysis of the key trends shaping the streaming landscape...",
      "author": {
        "name": "Sarah Chen",
        "slug": "sarah-chen",
        "avatar": "https://images.media.acmecorp.com/authors/sarah-chen.webp"
      },
      "category": {
        "name": "Technology",
        "slug": "technology"
      },
      "tags": ["streaming", "industry-analysis", "trends"],
      "publishedAt": "2024-01-15T09:00:00Z",
      "updatedAt": "2024-01-15T14:30:00Z",
      "seoMeta": {
        "title": "Streaming Industry Trends 2024 | Acme Media",
        "description": "An in-depth analysis of streaming trends...",
        "ogImage": "https://images.media.acmecorp.com/articles/streaming-trends-og.webp"
      },
      "readingTime": 8,
      "wordCount": 2100
    }
  ],
  "pagination": {
    "nextCursor": "eyJwIjoiMjAyNC0wMS0xNFQxMDowMDowMFoifQ==",
    "hasMore": true,
    "totalCount": 1543
  }
}
```

### Get Single Article

```
GET /api/v1/content/articles/{slug}?site={siteId}
```

Returns the full article including body content (rich text HTML).

### Other Content Endpoints

- `GET /api/v1/content/videos` — List videos (similar query parameters)
- `GET /api/v1/content/videos/{slug}` — Get video (includes `streamingRef` for playback integration)
- `GET /api/v1/content/galleries` — List galleries
- `GET /api/v1/content/galleries/{slug}` — Get gallery with images array
- `GET /api/v1/content/podcasts` — List podcasts
- `GET /api/v1/content/podcasts/{slug}` — Get podcast with audio URL
- `GET /api/v1/content/search?q={query}&site={siteId}` — Full-text search across all content types

### Management Endpoints

These endpoints require OAuth 2.0 authentication:

- `POST /api/v1/content/articles` — Create article
- `PUT /api/v1/content/articles/{id}` — Update article
- `POST /api/v1/content/articles/{id}/transition` — Workflow transition (body: `{"action": "submit_review"}`)
- `DELETE /api/v1/content/articles/{id}` — Archive article (soft delete)

---

## GraphQL API

Single endpoint: `POST /api/v1/graphql`

GraphQL is the preferred API for frontend consumption because it eliminates over-fetching and enables single-request data loading for complex pages.

### Example Query

```graphql
query GetArticleWithRelated($slug: String!, $site: String!) {
  article(slug: $slug, site: $site) {
    id
    title
    slug
    body
    publishedAt
    author {
      name
      slug
      bio
      avatar
    }
    category {
      name
      slug
    }
    tags
    seoMeta {
      title
      description
      ogImage
    }
    relatedArticles(limit: 4) {
      title
      slug
      excerpt
      thumbnail
      publishedAt
    }
  }
}
```

This single query retrieves the article, its author details, category, SEO metadata, and four related articles — data that would require multiple REST API calls.

---

## Webhook Events

The CMS publishes webhook events for downstream consumers:

| Event | Trigger | Payload |
|-------|---------|---------|
| `content.published` | Content moves to "published" status | `{ contentType, contentId, slug, siteId, publishedAt }` |
| `content.updated` | Published content is updated | `{ contentType, contentId, slug, siteId, updatedAt, changedFields[] }` |
| `content.archived` | Content is archived | `{ contentType, contentId, slug, siteId, archivedAt }` |

### Webhook Delivery

- **Method:** HTTP POST to registered endpoint URLs
- **Retry policy:** 3 attempts with exponential backoff (1s, 10s, 60s)
- **Signature verification:** HMAC-SHA256 signature in `X-Webhook-Signature` header. Consumers should verify the signature to ensure the webhook originated from the CMS.
- **Primary consumers:**
  - Publishing Platform — cache invalidation (ISR revalidation)
  - CDN — purge triggers (fast purge for archival, soft purge for updates)
  - Streaming Platform — catalog sync for video content

---

## Pagination

The Content API uses **cursor-based pagination** rather than offset-based pagination:

- `nextCursor` is an opaque string — do not parse or construct cursors
- `limit` controls page size (default: 20, max: 100)
- `totalCount` is provided for UI display (may be approximate for large result sets)
- `hasMore` indicates whether additional pages exist

**Why cursors over offsets?** Cursor-based pagination provides stable results when content is being published or archived during pagination. Offset-based pagination can skip or duplicate items when the dataset changes between page requests.

---

## Technical Reference

| Attribute | Value |
|-----------|-------|
| Protocol | REST + GraphQL |
| Base URL | `https://cms-api.media.acmecorp.com/api/v1` |
| Auth (public) | API Key (`X-API-Key`) |
| Auth (management) | OAuth 2.0 |
| Pagination | Cursor-based |
| Format | JSON |
| Spec | OpenAPI 3.0 (auto-generated from code annotations) |
