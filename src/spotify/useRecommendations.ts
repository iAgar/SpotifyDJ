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

interface AudioFeatureItem {
  id: string;
  energy: number;
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

/** Fetch up to `limit` related artist IDs. */
async function getRelatedArtistIds(
  token: string,
  artistId: string,
  limit: number,
): Promise<string[]> {
  const data = await spotifyGet<{ artists: Array<{ id: string }> }>(
    token,
    `/artists/${artistId}/related-artists`,
  );
  return data.artists.slice(0, limit).map((a) => a.id);
}

/** Fetch audio features for up to 100 track IDs in one request. */
async function getBatchAudioFeatures(
  token: string,
  trackIds: string[],
): Promise<Map<string, number>> {
  if (trackIds.length === 0) return new Map();

  const data = await spotifyGet<{ audio_features: Array<AudioFeatureItem | null> }>(
    token,
    `/audio-features?ids=${trackIds.join(',')}`,
  );

  const map = new Map<string, number>();
  for (const f of data.audio_features) {
    if (f) map.set(f.id, f.energy);
  }
  return map;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a recommendation pool without the deprecated /recommendations endpoint:
 *
 * 1. Resolve the current track's primary artist.
 * 2. Fetch that artist's top tracks.
 * 3. Fetch 3 related artists and their top tracks.
 * 4. Combine, deduplicate, and filter out the current track.
 * 5. Score each candidate by |candidate.energy − energyScore|.
 * 6. Return the 5 closest matches.
 */
export async function getRecommendations(
  token: string,
  currentTrackId: string,
  energyScore: number,
): Promise<RecommendedTrack[]> {
  // Step 1 – artist for the current track
  const artistId = await getArtistId(token, currentTrackId);

  // Steps 2 & 3 – top tracks from seed artist + 3 related artists (parallel)
  const relatedIds = await getRelatedArtistIds(token, artistId, 3);

  const [seedTracks, ...relatedTrackArrays] = await Promise.all([
    getArtistTopTracks(token, artistId),
    ...relatedIds.map((id) => getArtistTopTracks(token, id)),
  ]);

  // Step 4 – combine, deduplicate by ID, filter out the current track
  const seen = new Set<string>([currentTrackId]);
  const pool: SpotifyTrack[] = [];

  for (const track of [...seedTracks, ...relatedTrackArrays.flat()]) {
    if (!seen.has(track.id)) {
      seen.add(track.id);
      pool.push(track);
    }
  }

  if (pool.length === 0) return [];

  // Step 5 – batch-fetch audio features and score by energy proximity
  const featureMap = await getBatchAudioFeatures(
    token,
    pool.map((t) => t.id),
  );

  const scored = pool
    .filter((t) => featureMap.has(t.id))
    .map((t) => ({ track: t, diff: Math.abs((featureMap.get(t.id) ?? 0) - energyScore) }))
    .sort((a, b) => a.diff - b.diff);

  // Step 6 – top 5
  return scored.slice(0, 5).map(({ track: t }) => ({
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
