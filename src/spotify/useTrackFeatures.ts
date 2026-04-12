import { useEffect, useState } from 'react';

export interface TrackFeatures {
  energy: number;
  danceability: number;
  tempo: number;
}

export async function fetchTrackFeatures(
  token: string,
  trackId: string,
): Promise<TrackFeatures> {
  const res = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Audio features API error ${res.status}: ${text}`);
  }

  const data = await res.json() as {
    energy: number;
    danceability: number;
    tempo: number;
  };

  return {
    energy: data.energy,
    danceability: data.danceability,
    tempo: data.tempo,
  };
}

export interface UseTrackFeaturesResult {
  features: TrackFeatures | null;
  isLoading: boolean;
}

export function useTrackFeatures(
  token: string | null,
  trackId: string | null,
): UseTrackFeaturesResult {
  const [features, setFeatures] = useState<TrackFeatures | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!token || !trackId) {
      setFeatures(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetchTrackFeatures(token, trackId)
      .then((f) => {
        if (!cancelled) setFeatures(f);
      })
      .catch((err) => {
        console.error('[useTrackFeatures]', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, trackId]);

  return { features, isLoading };
}
