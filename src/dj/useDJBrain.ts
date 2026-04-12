import { useEffect, useRef, useState } from 'react';
import { getRecommendations, type RecommendedTrack } from '../spotify/useRecommendations';
import type { CurrentTrack } from '../spotify/usePlayer';

export interface DJBrainInput {
  token: string | null;
  player: Spotify.Player | null;
  deviceId: string | null;
  energyScore: number;
  currentTrack: CurrentTrack | null;
}

export interface DJBrainState {
  recommendedNext: RecommendedTrack | null;
  djLog: string[];
  playNext: () => Promise<void>;
}

export function useDJBrain({ token, player, deviceId, energyScore, currentTrack }: DJBrainInput): DJBrainState {
  const [recommendedNext, setRecommendedNext] = useState<RecommendedTrack | null>(null);
  const [djLog, setDjLog] = useState<string[]>([]);

  const hasPlayedRef         = useRef(false);
  const energyRef            = useRef(energyScore);
  const recommendedNextRef   = useRef<RecommendedTrack | null>(null);

  // Keep refs in sync.
  useEffect(() => { energyRef.current = energyScore; }, [energyScore]);
  useEffect(() => { recommendedNextRef.current = recommendedNext; }, [recommendedNext]);

  // Reset on track change.
  useEffect(() => {
    if (!currentTrack) return;
    hasPlayedRef.current = false;
    console.log('Track changed, reset hasPlayed');
  }, [currentTrack?.id]);

  // Fetch recommendation every 15 seconds.
  useEffect(() => {
    if (!token || !currentTrack) return;
    console.log('Starting recommendation interval');

    const interval = setInterval(async () => {
      console.log('Fetching recommendation, energy:', energyRef.current);
      const results = await getRecommendations(token, currentTrack.id!, energyRef.current);
      if (results && results.length > 0) {
        setRecommendedNext(results[0]);
        setDjLog(prev =>
          [`${new Date().toLocaleTimeString()} → Queued ${results[0].name} (energy: ${Math.round(energyRef.current * 100)}%)`, ...prev].slice(0, 10)
        );
        console.log('Recommendation updated:', results[0].name);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [token, currentTrack?.id]);

  // Watch for 90% track completion.
  useEffect(() => {
    if (!player) return;

    const onStateChanged = (state: Spotify.PlaybackState | null) => {
      if (!state || !recommendedNextRef.current) return;
      const { position, duration } = state;
      if (duration > 0 && position / duration > 0.9 && !hasPlayedRef.current) {
        console.log('90% reached, playing recommendation');
        playRecommended();
      }
    };

    player.addListener('player_state_changed', onStateChanged);
    return () => { player.removeListener('player_state_changed', onStateChanged); };
  }, [player]);

  async function playRecommended() {
    if (!recommendedNextRef.current || hasPlayedRef.current) return;
    hasPlayedRef.current = true;
    console.log('Playing recommended track:', recommendedNextRef.current.name);
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [recommendedNextRef.current.uri] }),
    });
  }

  async function playNext() {
    if (!recommendedNextRef.current) return;
    hasPlayedRef.current = true;
    console.log('User clicked next, playing:', recommendedNextRef.current.name);
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [recommendedNextRef.current.uri] }),
    });
  }

  return { recommendedNext, djLog, playNext };
}
