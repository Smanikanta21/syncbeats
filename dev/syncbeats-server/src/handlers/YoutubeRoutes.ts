import { Router } from 'express';
import { google } from 'googleapis';

export function createYoutubeRoutes(): Router {
  const router = Router();

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    // We will pass the redirect_uri dynamically based on the platform (web vs mac)
    // but google requires it to match what's in the console exactly.
    // If the console has a specific redirect URI, we should use that, or a generic backend one.
    // Let's use a generic backend callback that then redirects to the client.
    process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/api/auth/callback/youtube` : 'http://localhost:4000/youtube/callback'
  );

  // Endpoint to generate auth URL
  router.get('/auth', (req, res) => {
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
      redirect_uri: 'http://localhost:4000/youtube/callback' 
    });

    res.redirect(url);
  });

  // OAuth Callback
  router.get('/callback', async (req, res) => {
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
        redirect_uri: 'http://localhost:4000/youtube/callback'
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
  router.get('/library', async (req, res) => {
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
    } catch (error) {
      console.error('[YouTube] API Error:', error);
      res.status(500).json({ error: 'Failed to fetch YouTube library' });
    }
  });
  
  // Fetch specific playlist items
  router.get('/playlistItems', async (req, res) => {
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

  // Fetch Curated "Home" data (Genres / Trending)
  router.get('/home', async (req, res) => {
    const accessToken = req.headers.authorization?.split(' ')[1];
    
    // We can allow unauthenticated access to generic playlists by using an API key
    // But since the user is likely authenticated on Mac app, we can use their token too.
    // However, if we just use the Google API Key from env for generic data:
    const youtube = google.youtube({ 
      version: 'v3', 
      auth: accessToken ? undefined : process.env.RAPID_API_KEY, 
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined
    });
    
    // If we have access token, we use OAuth2 client
    if (accessToken) {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      google.options({ auth: oauth2Client });
    } else {
      google.options({ auth: process.env.RAPID_API_KEY }); // fallback to API key if you have one
    }

    try {
      const curatedCategories = [
        {
          title: "Top Hits & Trending",
          playlistIds: ['PL4fGSI1pQAnOQbcJk2YI-K-8LqE8-mH9F', 'PLMC9KNkIncKvYin_USF1qoJQnIyMAfRxl']
        },
        {
          title: "Genres & Moods",
          playlistIds: ['PLFPg_IUxqnZNnARruZ-B3XQ4F4kG41T6A', 'RDCLAK5uy_l4jeC3h8F3Ue5FpX1I76s-J0wXn-xL7dY'] // Electronic, Hip Hop
        },
        {
          title: "Chill & Focus",
          playlistIds: ['RDCLAK5uy_nMhr-l-K60pS9ZlR7d5-dZt_tN6e91-Y4', 'RDCLAK5uy_m-r7F3o0L7H8-yXfC6rT7eR3Q8O-U_Bxo'] // Lo-Fi, Focus
        }
      ];

      const allIds = curatedCategories.flatMap(c => c.playlistIds);
      
      // Fetch playlist details
      const playlistsRes = await google.youtube('v3').playlists.list({
        part: ['snippet', 'contentDetails'],
        id: allIds,
        maxResults: 50
      });

      const playlistsMap = new Map();
      playlistsRes.data.items?.forEach(p => {
        playlistsMap.set(p.id, {
          id: p.id,
          title: p.snippet?.title,
          thumbnail: p.snippet?.thumbnails?.high?.url || p.snippet?.thumbnails?.medium?.url,
          itemCount: p.contentDetails?.itemCount
        });
      });

      const sections = curatedCategories.map(cat => ({
        title: cat.title,
        playlists: cat.playlistIds.map(id => playlistsMap.get(id)).filter(Boolean)
      }));

      res.json({ sections });
    } catch (error) {
      console.error('[YouTube] Home Data Error:', error);
      res.status(500).json({ error: 'Failed to fetch home data' });
    }
  });

  return router;
}
