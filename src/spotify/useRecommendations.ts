import { useCallback, useState } from 'react';

export interface RecommendedTrack {
  uri: string;
  name: string;
  artist: string;
  albumArt: string;
}

interface EnergyTargets {
  target_energy: number;
  target_danceability: number;
  target_valence: number;
}

function energyToTargets(score: number): EnergyTargets {
  if (score < 0.3) {
    return { target_energy: 0.3, target_danceability: 0.3, target_valence: 0.3 };
  }
  if (score < 0.6) {
    return { target_energy: 0.6, target_danceability: 0.6, target_valence: 0.5 };
  }
  return { target_energy: 0.9, target_danceability: 0.9, target_valence: 0.8 };
}

export async function getRecommendations(
  token: string,
  currentTrackId: string,
  energyScore: number,
): Promise<RecommendedTrack[]> {
  const targets = energyToTargets(energyScore);

  const params = new URLSearchParams({
    seed_tracks: currentTrackId,
    limit: '5',
    target_energy: String(targets.target_energy),
    target_danceability: String(targets.target_danceability),
    target_valence: String(targets.target_valence),
  });

  const res = await fetch(`https://api.spotify.com/v1/recommendations?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Recommendations API error ${res.status}: ${text}`);
  }

  const data = await res.json() as {
    tracks: Array<{
      uri: string;
      name: string;
      artists: Array<{ name: string }>;
      album: { images: Array<{ url: string }> };
    }>;
  };

  return data.tracks.map((t) => ({
    uri: t.uri,
    name: t.name,
    artist: t.artists.map((a) => a.name).join(', '),
    albumArt: t.album.images[0]?.url ?? '',
  }));
}

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
