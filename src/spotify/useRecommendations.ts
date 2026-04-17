export interface RecommendedTrack {
  uri: string;
  name: string;
  artist: string;
  albumArt: string;
}

// ── Spotify API shapes ──────────────────────────────────────────────────────

interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: { images: Array<{ url: string }> };
}

// ── Rate-limit state (module-level so all callers share it) ─────────────────

let rateLimitedUntil = 0; // Unix ms timestamp

// ── Helpers ─────────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor() { super('Spotify token expired (401)'); }
}

async function spotifyGet<T>(token: string, path: string): Promise<T> {
  if (Date.now() < rateLimitedUntil) {
    const waitSec = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
    throw new Error(`Rate limited — retry in ${waitSec}s`);
  }

  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? 30);
    rateLimitedUntil = Date.now() + retryAfter * 1000;
    throw new Error(`Rate limited — retry in ${retryAfter}s`);
  }

  if (res.status === 401) {
    throw new AuthError();
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

function energyToQuery(energyScore: number): string {
  if (energyScore < 0.3) return 'genre:chill acoustic';
  if (energyScore < 0.6) return 'genre:pop dance';
  if(energyScore < 0.99) return 'genre:party dance';
  return 'genre:party dance';
}

// ── Search-based recommendations ─────────────────────────────────────────────

async function searchTracks(
  token: string,
  currentTrackId: string,
  energyScore: number,
): Promise<RecommendedTrack[]> {
  const query = energyToQuery(energyScore);

  const params = new URLSearchParams({
    q: query,
    type: 'track',
    limit: '10',
    market: 'IN',
  });

  const data = await spotifyGet<{ tracks: { items: SpotifyTrack[] } }>(
    token,
    `/search?${params}`,
  );

  return data.tracks.items
    .filter((t) => t.id !== currentTrackId)
    .slice(0, 5)
    .map((t) => ({
      uri: t.uri,
      name: t.name,
      artist: t.artists.map((a) => a.name).join(', '),
      albumArt: t.album.images[0]?.url ?? '',
    }));
}

// ── Related-artist fallback ───────────────────────────────────────────────────
// Used when search returns nothing useful (empty results).

async function relatedArtistTracks(
  token: string,
  currentTrackId: string,
  artistId: string,
): Promise<RecommendedTrack[]> {
  // GET /v1/artists/{id}/top-tracks — available on all app types
  const data = await spotifyGet<{ tracks: SpotifyTrack[] }>(
    token,
    `/artists/${artistId}/top-tracks?market=IN`,
  );

  return data.tracks
    .filter((t) => t.id !== currentTrackId)
    .slice(0, 5)
    .map((t) => ({
      uri: t.uri,
      name: t.name,
      artist: t.artists.map((a) => a.name).join(', '),
      albumArt: t.album.images[0]?.url ?? '',
    }));
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches recommendations for the current track + energy level.
 * Primary: genre search.
 * Fallback: artist top-tracks (when search returns < 2 results).
 *
 * Throws AuthError on 401 so callers can trigger re-login.
 */
export async function getRecommendations(
  token: string,
  currentTrackId: string,
  energyScore: number,
  currentArtistId?: string,
): Promise<RecommendedTrack[]> {
  const results = await searchTracks(token, currentTrackId, energyScore);

  if (results.length >= 2) return results;

  // Fallback: top tracks from the current artist
  if (currentArtistId) {
    const fallback = await relatedArtistTracks(token, currentTrackId, currentArtistId);
    if (fallback.length > 0) return fallback;
  }

  return results; // return whatever we have (possibly empty)
}
