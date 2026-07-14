import { Router } from 'express';
import { google } from 'googleapis';
import prisma from '../db/prisma';

export function createYoutubeRoutes(): Router {
  const router = Router();

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    // We will pass the redirect_uri dynamically based on the platform (web vs mac)
    // but google requires it to match what's in the console exactly.
    // If the console has a specific redirect URI, we should use that, or a generic backend one.
    // Let's use a generic backend callback that then redirects to the client.
    process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/api/auth/callback/youtube` : `${process.env.BACKEND_URL || 'http://localhost:4000'}/youtube/callback`
  );

  // Endpoint to generate auth URL
  router.get('/auth', (req: any, res: any) => {
    const redirectUrl = req.query.redirect as string || 'http://localhost:3000';
    // We encode the final destination in the state parameter
    const state = Buffer.from(JSON.stringify({ redirectUrl })).toString('base64');
    
    // We need to temporarily override the redirect URI for the OAuth2 client if necessary, 
    // but it's safer to use the one registered in the console. 
    // Assuming http://localhost:4000/youtube/callback is registered.
    const scopes = [
      'https://www.googleapis.com/auth/youtube.readonly'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: state,
      redirect_uri: `${process.env.BACKEND_URL || 'http://localhost:4000'}/youtube/callback` 
    });

    console.log(`[YouTube Auth] Using redirect_uri: ${process.env.BACKEND_URL || 'http://localhost:4000'}/youtube/callback`);

    res.redirect(url);
  });

  // OAuth Callback
  router.get('/callback', async (req: any, res: any) => {
    const code = req.query.code as string;
    const stateB64 = req.query.state as string;
    
    let redirectUrl = 'syncbeats://auth'; // Default to Mac app deep link
    if (stateB64) {
      try {
        const stateStr = Buffer.from(stateB64, 'base64').toString('ascii');
        const state = JSON.parse(stateStr);
        if (state.redirectUrl) redirectUrl = state.redirectUrl;
      } catch (e) {
        console.error('Failed to parse state', e);
      }
    }

    try {
      // Must match the redirect_uri used in generateAuthUrl
      const { tokens } = await oauth2Client.getToken({
        code: code,
        redirect_uri: `${process.env.BACKEND_URL || 'http://localhost:4000'}/youtube/callback`
      });
      
      // Redirect back to the client app (Mac or Web) with the tokens securely passed
      // In a production app, we would encrypt this or save it in a DB and pass a session ID.
      // For this implementation, we pass the access token back via URL hash fragment
      const redirectUri = new URL(redirectUrl);
      redirectUri.hash = `access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token || ''}`;
      
      res.redirect(redirectUri.toString());
    } catch (error) {
      console.error('[YouTube] Auth error:', error);
      res.status(500).send('Authentication failed');
    }
  });

  // Fetch user's imported playlists from DB
  router.get('/library', async (req: any, res: any) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.json({ playlists: [] });
      }

      const dbPlaylists = await prisma.playlist.findMany({
        where: { userId },
        include: { _count: { select: { tracks: true } } },
        orderBy: { createdAt: 'desc' }
      });

      const playlists = dbPlaylists.map((p: any) => ({
        id: p.id,
        title: p.name,
        thumbnail: p.coverUrl || 'https://music.youtube.com/img/on_platform_logo_dark.svg',
        itemCount: p._count.tracks
      }));

      res.json({ playlists });
    } catch (err) {
      console.error('[Library] DB fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch library' });
    }
  });
  
  // Fetch specific playlist items using yt-search instead of googleapis
  router.get('/playlistItems', async (req: any, res: any) => {
    const playlistId = req.query.playlistId as string;
    
    if (!playlistId) return res.status(400).json({ error: 'Missing playlistId' });
    
    try {
      // @ts-ignore - importing inline to avoid top-level require if not needed, but we can just use require
      const ytSearch = require('yt-search');
      const list = await ytSearch({ listId: playlistId });
      
      const tracks = list.videos.map((v: any) => ({
        id: v.videoId,
        title: v.title,
        artist: v.author?.name || 'Unknown Artist',
        thumbnail: v.thumbnail
      })).filter((t: any) => t.id) || [];

      res.json({ tracks });
    } catch (error) {
      console.error('[YouTube] Playlist Items Error:', error);
      res.status(500).json({ error: 'Failed to fetch playlist items via yt-search' });
    }
  });

  // Fetch Curated "Home" data (Recommendations, History, Trending)
  router.get('/home', async (req: any, res: any) => {
    const userId = req.query.userId as string; // passed from client
    
    try {
      const sections: any[] = [];
      
      // 1. Fetch SyncBeats Listen History from DB
      try {
        if (userId) {
          const recentListens = await prisma.listenHistory.findMany({
            where: { userId },
            orderBy: { playedAt: 'desc' },
            take: 20
          });
          
          if (recentListens.length > 0) {
            sections.push({
              title: "Your Most Listened",
              tracks: recentListens.map((h: any) => ({
                id: h.youtubeId,
                title: h.title,
                artist: h.artist || 'Unknown',
                thumbnail: h.thumbnail
              }))
            });
          }
        }
      } catch (err) {
        console.error('[YouTube] Failed to fetch Listen History:', err);
      }

      // No more googleapis calls here since YouTube OAuth is removed.
      res.json({ sections });
    } catch (error) {
      console.error('[YouTube] Home API Error:', error);
      res.status(500).json({ error: 'Failed to fetch home data' });
    }
  });

  return router;
}
