import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://syncbeats.app";

  const robots = `# SyncBeats Robots Configuration
# Generated for optimal SEO and crawling

User-agent: *
Allow: /
Allow: /hub
Allow: /profile
Allow: /login
Disallow: /api/
Disallow: /admin/
Crawl-delay: 1
Request-rate: 30/1m

User-agent: Googlebot
Allow: /
Crawl-delay: 0
Request-rate: unlimited

User-agent: Bingbot
Allow: /
Crawl-delay: 1
Request-rate: 30/1m

# Google-specific
User-agent: Googlebot-Image
Allow: /

# Allow common SEO crawlers
User-agent: baiduspider
Crawl-delay: 1
Allow: /

User-agent: Slurp
Crawl-delay: 1
Allow: /

User-agent: DuckDuckBot
Crawl-delay: 1
Allow: /

# Discourage bad actors
User-agent: AhrefsBot
User-agent: SemrushBot
User-agent: DotBot
Disallow: /

# Sitemap
Sitemap: ${baseUrl}/sitemap.xml
Host: ${baseUrl.replace("https://", "").replace("http://", "")}
`;

  return new NextResponse(robots, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate",
    },
  });
}
