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

  // Fetch YouTube Library
  router.get('/library', async (req: any, res: any) => {
    const accessToken = req.headers.authorization?.split(' ')[1];
    if (!accessToken) {
      res.status(401).json({ error: 'No access token provided' });
      return;
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const youtube = google.youtube({ version: 'v3', auth });

    try {
      // 1. Fetch "Liked Videos"
      // Wait, to get the Liked Videos playlist, we need to get the user's channel details
      const channelsRes = await youtube.channels.list({
        part: ['contentDetails'],
        mine: true
      });
      
      const likesPlaylistId = channelsRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
      
      // 2. Fetch User's Playlists
      const playlistsRes = await youtube.playlists.list({
        part: ['snippet', 'contentDetails'],
        mine: true,
        maxResults: 50
      });

      const playlists = playlistsRes.data.items?.map(p => ({
        id: p.id,
        title: p.snippet?.title,
        thumbnail: p.snippet?.thumbnails?.medium?.url,
        itemCount: p.contentDetails?.itemCount
      })) || [];

      // If they have a likes playlist, prepend it
      if (likesPlaylistId) {
        playlists.unshift({
          id: likesPlaylistId,
          title: 'Liked Songs',
          thumbnail: 'https://music.youtube.com/img/on_platform_logo_dark.svg', // generic thumbnail
          itemCount: 0 // We'd have to fetch items to know
        });
      }

      res.json({ playlists });
    } catch (error: any) {
      console.error('[YouTube] API Error:', error.message);
      if (error.code === 401 || error.code === '401' || error.response?.status === 401 || error.status === 401) {
        return res.status(401).json({ error: 'YouTube token expired or invalid' });
      }
      res.status(500).json({ error: 'Failed to fetch YouTube library' });
    }
  });
  
  // Fetch specific playlist items
  router.get('/playlistItems', async (req: any, res: any) => {
    const accessToken = req.headers.authorization?.split(' ')[1];
    const playlistId = req.query.playlistId as string;
    
    if (!accessToken) return res.status(401).json({ error: 'No access token provided' });
    if (!playlistId) return res.status(400).json({ error: 'Missing playlistId' });
    
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const youtube = google.youtube({ version: 'v3', auth });

    try {
      const itemsRes = await youtube.playlistItems.list({
        part: ['snippet'],
        playlistId: playlistId,
        maxResults: 50
      });

      const tracks = itemsRes.data.items?.map(item => ({
        id: item.snippet?.resourceId?.videoId,
        title: item.snippet?.title,
        artist: item.snippet?.videoOwnerChannelTitle || 'Unknown Artist',
        thumbnail: item.snippet?.thumbnails?.medium?.url
      })).filter(t => t.id) || []; // Filter out private/deleted videos

      res.json({ tracks });
    } catch (error) {
      console.error('[YouTube] Playlist Items Error:', error);
      res.status(500).json({ error: 'Failed to fetch playlist items' });
    }
  });

  // Fetch Curated "Home" data (Recommendations, History, Trending)
  router.get('/home', async (req: any, res: any) => {
    const accessToken = req.headers.authorization?.split(' ')[1];
    const userId = req.query.userId as string; // passed from client
    
    if (!accessToken) {
      return res.status(401).json({ error: 'No access token provided' });
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const youtube = google.youtube({ version: 'v3', auth });

    try {
      const sections: any[] = [];

      // 1. Fetch SyncBeats Listen History from DB
      let recentQuery: string | null = null;
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
            recentQuery = `${recentListens[0].artist || ''} ${recentListens[0].title}`.trim();
          }
        }
      } catch (err) {
        console.error('[YouTube] Failed to fetch History:', err);
      }

      // 2. Fetch Personalized Recommendations
      try {
        if (recentQuery) {
          const relatedRes = await youtube.search.list({
            part: ['snippet'],
            q: `${recentQuery} official music video`,
            type: ['video'],
            videoCategoryId: '10',
            maxResults: 20
          });

          if (relatedRes.data.items && relatedRes.data.items.length > 0) {
            sections.push({
              title: "Recommended for You",
              tracks: relatedRes.data.items.map((item: any) => ({
                id: item.id?.videoId,
                title: item.snippet?.title,
                artist: item.snippet?.channelTitle,
                thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url
              }))
            });
          }
        }
      } catch (err) {
        console.error('[YouTube] Failed to fetch Recommendations:', err);
      }

      // 3. Fetch Trending Music directly from YouTube
      try {
        const trendingRes = await youtube.videos.list({
          part: ['snippet', 'statistics'],
          chart: 'mostPopular',
          videoCategoryId: '10', // Music
          regionCode: 'US',
          maxResults: 20
        });

        if (trendingRes.data.items) {
          sections.push({
            title: "Trending Music",
            tracks: trendingRes.data.items.map((item: any) => ({
              id: item.id,
              title: item.snippet?.title,
              artist: item.snippet?.channelTitle,
              thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url
            }))
          });
        }
      } catch (err) {
        console.error('[YouTube] Failed to fetch Trending:', err);
      }

      // 4. Fetch Liked Videos (Favorites)
      try {
        const channelsRes = await youtube.channels.list({ part: ['contentDetails'], mine: true });
        const likesPlaylistId = channelsRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
        
        if (likesPlaylistId) {
          const likesRes = await youtube.playlistItems.list({
            part: ['snippet'],
            playlistId: likesPlaylistId,
            maxResults: 50
          });
          
          if (likesRes.data.items && likesRes.data.items.length > 0) {
            const videoIds = likesRes.data.items.map(item => item.snippet?.resourceId?.videoId).filter(Boolean) as string[];
            
            if (videoIds.length > 0) {
              const videosRes = await youtube.videos.list({
                part: ['snippet'],
                id: videoIds,
                maxResults: 50
              });

              const musicVideos = videosRes.data.items?.filter((v: any) => v.snippet?.categoryId === '10') || [];

              if (musicVideos.length > 0) {
                sections.push({
                  title: "Your YouTube Favorites",
                  tracks: musicVideos.map((v: any) => ({
                    id: v.id,
                    title: v.snippet?.title,
                    artist: v.snippet?.channelTitle,
                    thumbnail: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url
                  }))
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('[YouTube] Failed to fetch Favorites:', err);
      }

      res.json({ sections });
    } catch (error) {
      console.error('[YouTube] Home Data Error:', error);
      res.status(500).json({ error: 'Failed to fetch home data' });
    }
  });

  return router;
}
