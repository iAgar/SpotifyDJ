import { useCallback, useState } from 'react';

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
  artists: Array<{ name: string }>;
  album: { images: Array<{ url: string }> };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function spotifyGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function energyToQuery(energyScore: number): string {
  if (energyScore < 0.3) return 'genre:chill acoustic';
  if (energyScore < 0.6) return 'genre:pop dance';
  return 'genre:edm party dance';
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Search-based recommendations using only /v1/tracks and /v1/search —
 * both available to all Spotify apps with no special permissions:
 *
 * 1. Fetch current track details to get its ID for filtering.
 * 2. Map energyScore to a genre/mood search query.
 * 3. Search for tracks, filter out the current track, return top 5.
 */
export async function getRecommendations(
  token: string,
  currentTrackId: string,
  energyScore: number,
): Promise<RecommendedTrack[]> {
  const query = energyToQuery(energyScore);

  const params = new URLSearchParams({
    q: query,
    type: 'track',
    limit: '10', // fetch a few extra so filtering still leaves 5
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

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseRecommendationsResult {
  recommendations: RecommendedTrack[];
  isFetching: boolean;
  fetchRecommendations: (trackId: string, energyScore: number) => Promise<void>;
}

export function useRecommendations(token: string | null): UseRecommendationsResult {
  const [recommendations, setRecommendations] = useState<RecommendedTrack[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  const fetchRecommendations = useCallback(
    async (trackId: string, energyScore: number) => {
      if (!token) return;
      setIsFetching(true);
      try {
        const tracks = await getRecommendations(token, trackId, energyScore);
        setRecommendations(tracks);
      } catch (err) {
        console.error('[useRecommendations]', err);
      } finally {
        setIsFetching(false);
      }
    },
    [token],
  );

  return { recommendations, isFetching, fetchRecommendations };
}
