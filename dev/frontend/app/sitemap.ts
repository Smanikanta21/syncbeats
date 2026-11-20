import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // Include canonical, indexable public pages only. Do not generate a new
  // lastModified date on every request: it would misrepresent content updates.
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    {
      url: `${SITE_URL}/how-it-works`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/mac-beta`, changeFrequency: "monthly", priority: 0.6 },
    {
      url: `${SITE_URL}/privacy-policy`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/terms-of-service`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
