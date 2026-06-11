export let wtClient: any = null;

export async function getWebTorrentClient() {
  if (typeof window === 'undefined') return null;
  if (wtClient) return wtClient;
  
  try {
    const WT = await import('webtorrent');
    // @ts-ignore
    wtClient = new WT.default();
    return wtClient;
  } catch (err) {
    console.error("Failed to load WebTorrent:", err);
    return null;
  }
}
