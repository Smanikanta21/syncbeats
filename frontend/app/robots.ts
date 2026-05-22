// app/robots.ts
import { MetadataRoute } from "next";

const BASE_URL = "https://syncbeats.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/_next/static/",
          "/_next/image/"
        ],
        disallow: [
          "/room/",
          "/api/",
          "/login",
          "/cookie-settings",
          "/forgot-password",
          "/verify-email",
          "/verify-email-sent"
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}