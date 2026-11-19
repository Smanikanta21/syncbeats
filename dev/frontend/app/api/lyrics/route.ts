import { NextRequest, NextResponse } from 'next/server';

// Keep the provider request off mobile browsers and their CORS/network path.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();
  if (!query || query.length > 300) {
    return NextResponse.json({ error: 'A song query is required' }, { status: 400 });
  }
  try {
    const response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      return NextResponse.json({ error: 'Lyrics provider unavailable' }, { status: 502 });
    }
    const results: unknown = await response.json();
    if (!Array.isArray(results)) {
      return NextResponse.json({ error: 'Invalid lyrics response' }, { status: 502 });
    }
    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: 'Lyrics provider unavailable' }, { status: 503 });
  }
}
