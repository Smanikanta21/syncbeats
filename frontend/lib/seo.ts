/**
 * SEO Helper Components and Utilities
 * Provides reusable structured data and meta tag components
 */

export function generateStructuredData(data: Record<string, any>) {
  return {
    __html: JSON.stringify(data),
  };
}

export const structuredDataSchemas = {
  /**
   * Generate WebApplication schema for SyncBeats
   */
  webApplication: (baseUrl: string) => ({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "SyncBeats",
    url: baseUrl,
    applicationCategory: "MultimediaApplication",
    description:
      "Synchronized multi-device music playback and streaming application",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "145",
      bestRating: "5",
      worstRating: "1",
    },
    screenshot: `${baseUrl}/og-image.png`,
  }),

  /**
   * Generate MusicPlaylist schema for rooms
   */
  musicPlaylist: (roomName: string, baseUrl: string, roomCode: string) => ({
    "@context": "https://schema.org",
    "@type": "MusicPlaylist",
    name: roomName,
    url: `${baseUrl}/room/${roomCode}`,
    numTracks: 0,
    creator: {
      "@type": "Person",
      name: "SyncBeats User",
    },
  }),

  /**
   * Generate Organization schema
   */
  organization: (baseUrl: string) => ({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "SyncBeats",
    url: baseUrl,
    logo: `${baseUrl}/icon.svg`,
    sameAs: [
      "https://twitter.com/syncbeats",
      "https://github.com/Smanikanta21/sync-beats",
    ],
    contact: {
      "@type": "ContactPoint",
      contactType: "Technical Support",
      email: "support@syncbeats.app",
    },
  }),

  /**
   * Generate BreadcrumbList schema
   */
  breadcrumbList: (items: Array<{ name: string; url: string }>) => ({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }),

  /**
   * Generate SoftwareApplication schema
   */
  softwareApplication: (baseUrl: string) => ({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "SyncBeats",
    applicationCategory: "MultimediaApplication",
    url: baseUrl,
    downloadUrl: baseUrl,
    operatingSystem: ["Web", "Android", "iOS"],
    browserRequirements: "Requires modern browser with Web Audio API support",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "145",
    },
  }),
};

/**
 * OpenGraph metadata defaults
 */
export const ogDefaults = {
  type: "website" as const,
  locale: "en_US",
  siteName: "SyncBeats",
};

/**
 * Twitter Card metadata defaults
 */
export const twitterDefaults = {
  card: "summary_large_image" as const,
  creator: "@syncbeats",
};

/**
 * SEO-friendly title generator
 */
export function generateTitle(pageTitle: string, includeApp = true) {
  return includeApp ? `${pageTitle} | SyncBeats` : pageTitle;
}

/**
 * Canonical URL generator
 */
export function generateCanonicalUrl(path: string, baseUrl: string) {
  const url = new URL(path, baseUrl);
  return url.toString();
}
