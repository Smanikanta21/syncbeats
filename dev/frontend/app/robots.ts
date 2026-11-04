import { MetadataRoute } from 'next';

const BASE_URL = 'https://www.syncbeats.in';

export default function robots(): MetadataRoute.Robots {
  const disallowedRoutes = [
    '/room/',
    '/api/',
    '/login',
    '/cookie-settings',
    '/verify-email',
    '/verify-email-sent',
    '/reset-password',
    '/forgot-password',
    '/profile',
    '/spotify-import',
  ];

  const allowedPublicRoutes = [
    '/',
    '/contact',
    '/privacy-policy',
    '/terms-of-service',
    '/sponsor',
    '/llms.txt',
    '/llms-full.txt',
    '/manifest.json',
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: allowedPublicRoutes,
        disallow: disallowedRoutes,
      },
      // Search engine specific rules
      {
        userAgent: ['Googlebot', 'Bingbot', 'Applebot', 'DuckDuckBot'],
        allow: allowedPublicRoutes,
        disallow: disallowedRoutes,
      },
      // LLM & AI Agents: Explicitly allow crawling public knowledge base, use cases & llms.txt
      {
        userAgent: [
          'GPTBot',
          'ChatGPT-User',
          'ClaudeBot',
          'anthropic-ai',
          'PerplexityBot',
          'Google-Extended',
          'Applebot-Extended',
          'CCBot',
          'cohere-ai',
          'Meta-ExternalAgent',
        ],
        allow: allowedPublicRoutes,
        disallow: disallowedRoutes,
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}