import { MetadataRoute } from 'next';

const BASE_URL = 'https://www.syncbeats.in';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/room/', '/api/', '/login', '/cookie-settings', '/verify-email', '/verify-email-sent', '/reset-password', '/forgot-password', '/profile', '/spotify-import'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}