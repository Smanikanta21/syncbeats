// app/robots.ts
// Next.js generates /robots.txt automatically from this file.

import { MetadataRoute } from "next";

const BASE_URL = "https://syncbeats.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/privacy-policy", "/terms-of-service", "/cookie-settings"],
        // Block room pages and API routes from being indexed
        disallow: ["/room/", "/api/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
