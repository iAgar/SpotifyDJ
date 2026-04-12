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
  artists: Array<{ id: string; name: string }>;
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

/** Resolve the primary artist ID for a given track. */
async function getArtistId(token: string, trackId: string): Promise<string> {
  const data = await spotifyGet<{ artists: Array<{ id: string }> }>(
    token,
    `/tracks/${trackId}`,
  );
  const artistId = data.artists[0]?.id;
  if (!artistId) throw new Error(`No artist found for track ${trackId}`);
  return artistId;
}

/** Fetch an artist's top tracks (market=IN). */
async function getArtistTopTracks(token: string, artistId: string): Promise<SpotifyTrack[]> {
  const data = await spotifyGet<{ tracks: SpotifyTrack[] }>(
    token,
    `/artists/${artistId}/top-tracks?market=IN`,
  );
  return data.tracks;
}

/**
 * Slice the related-artists list based on crowd energy score.
 *
 * - Low  (0.0–0.3): indices 3–8  — less mainstream artists, typically slower
 * - Med  (0.3–0.6): indices 0–5  — top related artists
 * - High (0.6–1.0): indices 0–3  — only the most popular related artists
 */
function sliceByEnergy(
  artists: Array<{ id: string }>,
  energyScore: number,
): Array<{ id: string }> {
  if (energyScore < 0.3) return artists.slice(3, 8);
  if (energyScore < 0.6) return artists.slice(0, 5);
  return artists.slice(0, 3);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build recommendations without any audio-features API calls:
 *
 * 1. Resolve the current track's primary artist.
 * 2. Fetch related artists and slice the list by energyScore.
 * 3. Fetch top tracks for each selected artist in parallel.
 * 4. Combine, deduplicate, filter out the current track, return top 5.
 */
export async function getRecommendations(
  token: string,
  currentTrackId: string,
  energyScore: number,
): Promise<RecommendedTrack[]> {
  // Step 1
  const artistId = await getArtistId(token, currentTrackId);

  // Step 2
  const { artists: relatedArtists } = await spotifyGet<{ artists: Array<{ id: string }> }>(
    token,
    `/artists/${artistId}/related-artists`,
  );
  const selected = sliceByEnergy(relatedArtists, energyScore);

  // Step 3 – parallel top-track fetches
  const trackArrays = await Promise.all(
    selected.map((a) => getArtistTopTracks(token, a.id)),
  );

  // Step 4 – combine, deduplicate, filter, return top 5
  const seen = new Set<string>([currentTrackId]);
  const pool: SpotifyTrack[] = [];

  for (const track of trackArrays.flat()) {
    if (!seen.has(track.id)) {
      seen.add(track.id);
      pool.push(track);
    }
  }

  return pool.slice(0, 5).map((t) => ({
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
