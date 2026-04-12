import { useEffect, useRef, useState } from 'react';
import { getRecommendations, AuthError, type RecommendedTrack } from '../spotify/useRecommendations';
import type { CurrentTrack } from '../spotify/usePlayer';

const FETCH_INTERVAL_MS  = 15_000;
const AUTO_PLAY_THRESHOLD = 0.9;   // 90% of track duration
const COOLDOWN_MS        = 45_000; // minimum gap between track switches

export interface DJBrainInput {
  token: string | null;
  player: Spotify.Player | null;
  deviceId: string | null;
  energyScore: number;
  currentTrack: CurrentTrack | null;
  onAuthError?: () => void;
}

export interface DJBrainState {
  recommendedNext: RecommendedTrack | null;
  djLog: string[];
  playNext: () => Promise<void>;
}

function now(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function useDJBrain({
  token,
  player,
  deviceId,
  energyScore,
  currentTrack,
  onAuthError,
}: DJBrainInput): DJBrainState {
  const [recommendedNext, setRecommendedNext] = useState<RecommendedTrack | null>(null);
  const [djLog, setDjLog]                     = useState<string[]>([]);

  const hasPlayedRef       = useRef(false);
  const energyRef          = useRef(energyScore);
  const recommendedNextRef = useRef<RecommendedTrack | null>(null);
  const lastPlayedAtRef    = useRef<number>(0);        // timestamp of last track switch
  const rateLimitedRef     = useRef<boolean>(false);   // true while in 429 backoff

  // Keep refs in sync with latest render values
  useEffect(() => { energyRef.current = energyScore; }, [energyScore]);
  useEffect(() => { recommendedNextRef.current = recommendedNext; }, [recommendedNext]);

  // Reset play-guard on track change
  useEffect(() => {
    if (!currentTrack) return;
    hasPlayedRef.current = false;
    console.log('[DJBrain] Track changed, reset play guard');
  }, [currentTrack?.id]);

  function addLog(msg: string) {
    setDjLog((prev) => [`${now()} → ${msg}`, ...prev].slice(0, 10));
  }

  // ── Recommendation fetch loop ──────────────────────────────────────────────
  useEffect(() => {
    if (!token || !currentTrack) return;

    console.log('[DJBrain] Starting recommendation loop for:', currentTrack.name);

    const interval = setInterval(async () => {
      if (rateLimitedRef.current) {
        console.log('[DJBrain] Skipping fetch — rate limited');
        return;
      }

      try {
        const results = await getRecommendations(
          token,
          currentTrack.id!,
          energyRef.current,
        );

        if (results.length > 0) {
          setRecommendedNext(results[0]);
          addLog(`Queued "${results[0].name}" (energy ${Math.round(energyRef.current * 100)}%)`);
        } else {
          addLog('No recommendations found');
        }
      } catch (err) {
        if (err instanceof AuthError) {
          console.error('[DJBrain] Auth error — logging out');
          addLog('Session expired — please log in again');
          onAuthError?.();
          return;
        }

        const msg = err instanceof Error ? err.message : String(err);

        if (msg.includes('Rate limited')) {
          rateLimitedRef.current = true;
          addLog('Rate limited — pausing 30s');
          setTimeout(() => {
            rateLimitedRef.current = false;
            console.log('[DJBrain] Rate limit backoff complete');
          }, 30_000);
          return;
        }

        console.error('[DJBrain] Recommendation fetch failed:', err);
      }
    }, FETCH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [token, currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-play at 90% of track ─────────────────────────────────────────────
  useEffect(() => {
    if (!player) return;

    const onStateChanged = (state: Spotify.PlaybackState | null) => {
      if (!state || !recommendedNextRef.current) return;
      const { position, duration } = state;
      if (duration > 0 && position / duration > AUTO_PLAY_THRESHOLD && !hasPlayedRef.current) {
        const sinceLastPlay = Date.now() - lastPlayedAtRef.current;
        if (sinceLastPlay < COOLDOWN_MS) {
          console.log(`[DJBrain] Cooldown active — ${Math.round((COOLDOWN_MS - sinceLastPlay) / 1000)}s remaining`);
          return;
        }
        console.log('[DJBrain] 90% reached, auto-playing next');
        playRecommended();
      }
    };

    player.addListener('player_state_changed', onStateChanged);
    return () => { player.removeListener('player_state_changed', onStateChanged); };
  }, [player]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Playback helpers ───────────────────────────────────────────────────────

  async function playUri(uri: string, trackName: string): Promise<void> {
    if (!token || !deviceId) return;

    try {
      const res = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ uris: [uri] }),
        },
      );

      if (res.status === 401) {
        addLog('Session expired — please log in again');
        onAuthError?.();
        return;
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After') ?? 30);
        rateLimitedRef.current = true;
        addLog(`Rate limited — pausing ${retryAfter}s`);
        setTimeout(() => { rateLimitedRef.current = false; }, retryAfter * 1000);
        return;
      }

      if (!res.ok) {
        const text = await res.text();
        console.error('[DJBrain] Play failed:', res.status, text);
        return;
      }

      lastPlayedAtRef.current = Date.now();
      addLog(`Now playing "${trackName}"`);
    } catch (err) {
      console.error('[DJBrain] Play request failed:', err);
    }
  }

  async function playRecommended(): Promise<void> {
    const rec = recommendedNextRef.current;
    if (!rec || hasPlayedRef.current) return;
    hasPlayedRef.current = true;
    await playUri(rec.uri, rec.name);
  }

  async function playNext(): Promise<void> {
    const rec = recommendedNextRef.current;
    if (!rec) return;

    const sinceLastPlay = Date.now() - lastPlayedAtRef.current;
    if (sinceLastPlay < COOLDOWN_MS) {
      const remaining = Math.round((COOLDOWN_MS - sinceLastPlay) / 1000);
      addLog(`Cooldown — wait ${remaining}s before skipping again`);
      return;
    }

    hasPlayedRef.current = true;
    await playUri(rec.uri, rec.name);
  }

  return { recommendedNext, djLog, playNext };
}
