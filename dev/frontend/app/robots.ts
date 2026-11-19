import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // Public pages, assets, and llms.txt are available to search and AI crawlers.
    // Account and session pages use noindex so crawlers can see that directive.
    // Authentication, rather than robots.txt, protects private room data.
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/files/", "/admin/", "/socket.io/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
