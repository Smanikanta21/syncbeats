import { MetadataRoute } from 'next';

const BASE_URL = 'https://syncbeats.in';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/room/', '/api/'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}