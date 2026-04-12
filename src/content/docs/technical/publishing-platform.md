---
title: "Acme Media — Publishing Platform"
---

# Acme Media — Publishing Platform

The Publishing Platform renders editorial websites for all 12 Acme Media properties. Built on Next.js 14, it consumes the CMS Content API (REST + GraphQL) and delivers server-rendered, SEO-optimized web pages to millions of monthly visitors.

For the CMS that provides content, see [`./cms.md`](./cms.md). For the architecture decision behind this separation, see [ADR-001](../architecture/adr/ADR-001-headless-cms.md).

---

## System Overview

| Attribute | Value |
|-----------|-------|
| Technology | Next.js 14 (React framework with SSR) |
| Database | None — consumes CMS Content API (REST + GraphQL) |
| Team | CMS / Publishing (shared with CMS, 12 engineers total) |
| Properties | 12 editorial websites |

The Publishing Platform does not manage content directly. All content is authored and managed in the CMS; the Publishing Platform's role is rendering, delivery, and performance optimization.

---

## Rendering Strategy

The platform uses three rendering strategies based on content characteristics:

### ISR (Incremental Static Regeneration)

Article pages are statically generated at build time and incrementally re-validated. Revalidation is triggered by CMS webhook events (`content.published`, `content.updated`):

- **News sites:** 60-second revalidation interval (timeliness is critical)
- **Lifestyle and evergreen sites:** 300-second revalidation interval (content changes less frequently)

ISR provides the performance benefits of static generation while allowing content updates without a full site rebuild.

### SSR (Server-Side Rendering)

Used for dynamic content that cannot be statically generated:

- Personalized recommendation widgets (content varies per user)
- Trending content sections (change frequently based on real-time signals)
- User-specific features (saved articles, reading history, preferences)

SSR responses are cached in Redis for 30 seconds to reduce backend load while maintaining acceptable freshness.

### CSR (Client-Side Rendering)

Interactive components rendered client-side after the initial page load:

- Comment sections
- Live update widgets (e.g., live sports scores)
- Ad slot rendering and viewability tracking
- Social sharing interactions

---

## SEO Optimization

The Publishing Platform implements comprehensive SEO practices:

- **Server-rendered HTML** for all article pages, ensuring search engine crawlers receive complete content
- **Automatic sitemap generation** — XML sitemaps per site, submitted to Google Search Console
- **Structured data** — Schema.org markup (Article, VideoObject, BreadcrumbList) injected as JSON-LD in page headers
- **Open Graph and Twitter Card meta tags** for social sharing previews
- **Canonical URLs** to prevent duplicate content issues across syndicated articles appearing on multiple sites
- **`robots.txt` management** per site for crawler guidance

---

## Newsletter Integration

- **SendGrid** for email delivery
- Automated article digest generation: daily and weekly digests per site, assembled from published content
- Editorial team can curate newsletter content via the CMS editorial interface
- Subscriber management is integrated with CMS user profiles

---

## Analytics Integration

Multiple analytics systems track user engagement:

- **Google Analytics 4 (GA4):** Page views, user engagement metrics, content performance
- **Nielsen Digital Ad Ratings:** Audience measurement tags on all pages for advertiser reporting
- **Custom event tracking:** Scroll depth, article completion rate, video play initiation, ad viewability
- Analytics data feeds back into the Recommendation Engine for content personalization

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| LCP (Largest Contentful Paint) | < 2.5 seconds | Lab + field (CrUX) |
| FID (First Input Delay) | < 100 milliseconds | Field (CrUX) |
| CLS (Cumulative Layout Shift) | < 0.1 | Lab + field (CrUX) |
| TTFB (Time to First Byte) | < 800 milliseconds | Lab |
| Lighthouse Performance Score | > 90 | Lab |

Performance is monitored via:

- **Akamai mPulse** — Real User Monitoring (RUM) for field metrics across all properties
- **Lighthouse CI** — Synthetic monitoring integrated into the deployment pipeline; builds fail if performance budgets are exceeded

---

## Technical Reference

| Attribute | Value |
|-----------|-------|
| Framework | Next.js 14 (React) |
| Rendering | ISR + SSR + CSR |
| Image Processing | Cloudinary (via CMS) |
| Email | SendGrid |
| Analytics | GA4, Nielsen, custom events |
| CDN | Akamai (shared with streaming) |
| Monitoring | Akamai mPulse (RUM), Lighthouse CI |
