# Landing page and discovery

The public landing page explains synchronized browser playback, practical listening scenarios, setup, music availability, and the upcoming Mac app. `/how-it-works` provides a crawlable setup and troubleshooting guide. The native Mac app is described as coming soon, with no invented release date or download link.

## Content sources

- `dev/frontend/lib/site.ts`: canonical origin, title, description, and FAQs. The visible FAQ and FAQ structured data use the same entries.
- `dev/frontend/app/page.tsx`: homepage metadata and Organization, WebSite, WebApplication, and FAQPage structured data.
- `dev/frontend/app/opengraph-image.tsx`: generated social preview, also used for Twitter cards.
- `dev/frontend/public/llms.txt` and `llms-full.txt`: plain-text product references. Update these when product availability or behavior changes.
- `dev/frontend/app/sitemap.ts`: canonical public pages only. Account, room, redirect, and preference routes are excluded. Modification dates are omitted rather than fabricated on each request.
- `dev/frontend/app/robots.ts`: public content is crawlable by search and AI user agents. API, file, and socket endpoints are excluded. App and account pages expose `noindex`; authentication remains responsible for protecting private data.

## After deploying

1. Confirm the production homepage, `/how-it-works`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/llms-full.txt`, `/opengraph-image`, and `/twitter-image` return HTTP 200.
2. Keep `https://www.syncbeats.in` as the canonical origin. The bare domain should continue redirecting there. Confirm the CDN/WAF does not challenge or block legitimate search crawlers on public pages.
3. In the verified Google Search Console property, submit `https://www.syncbeats.in/sitemap.xml`. Inspect the homepage and listening guide, run the live URL test, and request indexing after the deployed content is visible.
4. Monitor Page Indexing and search performance. Expect account and room URLs to be excluded by `noindex`. Google controls recrawl timing and inclusion.
5. Check a shared homepage link for the new social preview; some social platforms cache previous images.

Structured data and readable public content help systems understand the product. FAQ markup does not imply eligibility for Google's restricted FAQ rich results. `llms.txt` is an optional discovery convention, not a guarantee that an AI system will read, index, cite, or recommend the site. No search-console submission or production deployment is performed by these code changes.
