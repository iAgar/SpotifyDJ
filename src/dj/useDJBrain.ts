import { useCallback, useEffect, useRef, useState } from 'react';
import { getRecommendations, type RecommendedTrack } from '../spotify/useRecommendations';
import type { CurrentTrack } from '../spotify/usePlayer';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DJBrainInput {
  token: string | null;
  player: Spotify.Player | null;
  deviceId: string | null;
  energyScore: number;
  currentTrack: CurrentTrack | null;
}

export interface DJBrainState {
  nextTrack: RecommendedTrack | null;
  isAnalysing: boolean;
  djLog: string[];
  skipToNext: () => Promise<void>;
}

// ── Helper ───────────────────────────────────────────────────────────────────

function logEntry(msg: string): string {
  const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `[${t}] ${msg}`;
}

async function postQueue(token: string, deviceId: string, uri: string): Promise<void> {
  const params = new URLSearchParams({ uri, device_id: deviceId });
  const res = await fetch(`https://api.spotify.com/v1/me/player/queue?${params}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Queue ${res.status}: ${body}`);
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDJBrain({ token, player, deviceId, energyScore, currentTrack }: DJBrainInput): DJBrainState {
  const [nextTrack, setNextTrack]     = useState<RecommendedTrack | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [djLog, setDjLog]             = useState<string[]>([]);

  // Mirror volatile props into refs so closures always read current values.
  const tokenRef        = useRef(token);
  const deviceIdRef     = useRef(deviceId);
  const energyRef       = useRef(energyScore);
  const currentTrackRef = useRef(currentTrack);

  useEffect(() => { tokenRef.current       = token;        }, [token]);
  useEffect(() => { deviceIdRef.current    = deviceId;     }, [deviceId]);
  useEffect(() => { energyRef.current      = energyScore;  }, [energyScore]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  // nextTrack is also kept in a ref so the player_state_changed closure and
  // skipToNext can read it without stale-closure issues.
  const nextTrackRef      = useRef<RecommendedTrack | null>(null);
  const hasQueuedRef      = useRef(false);   // one queue write per track
  const isFetchingRef     = useRef(false);
  const trackIdRef        = useRef<string | null>(null);

  const pushLog = (msg: string) =>
    setDjLog((prev) => [logEntry(msg), ...prev].slice(0, 50));

  const setNextTrackBoth = (t: RecommendedTrack | null) => {
    nextTrackRef.current = t;
    setNextTrack(t);
  };

  // ── Reset per-track state when currentTrack.id changes ───────────────────
  useEffect(() => {
    const id = currentTrack?.id ?? null;
    if (id === trackIdRef.current) return;
    console.log('[useDJBrain] track changed →', currentTrack?.name ?? 'null');
    trackIdRef.current   = id;
    hasQueuedRef.current = false;
    setNextTrackBoth(null);
    pushLog('Track changed → resetting');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  // ── 15-second interval: refresh nextTrack recommendation ─────────────────
  useEffect(() => {
    const fetchNext = async () => {
      const token        = tokenRef.current;
      const currentTrack = currentTrackRef.current;
      const energy       = energyRef.current;

      console.log('[useDJBrain] fetch interval — energy:', energy, 'track:', currentTrack?.name ?? null);

      if (!token || !currentTrack?.id || isFetchingRef.current) return;

      isFetchingRef.current = true;
      setIsAnalysing(true);
      try {
        const picks = await getRecommendations(token, currentTrack.id, energy);
        console.log('[useDJBrain] picks:', picks.map(t => t.name));
        if (picks[0]) setNextTrackBoth(picks[0]);
      } catch (err) {
        console.error('[useDJBrain] fetch error:', err);
        pushLog(`Fetch error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        isFetchingRef.current = false;
        setIsAnalysing(false);
      }
    };

    // Fetch immediately on mount, then every 15 s.
    fetchNext().catch(console.error);
    const id = setInterval(() => {
      fetchNext().catch(console.error);
    }, 15_000);

    return () => clearInterval(id);
  }, []); // stable — reads all live values from refs

  // ── player_state_changed: queue at 70% ───────────────────────────────────
  useEffect(() => {
    if (!player) return;

    const onStateChanged = (state: Spotify.PlaybackState | null) => {
      if (!state || state.paused) return;
      if (hasQueuedRef.current) return;

      const token    = tokenRef.current;
      const deviceId = deviceIdRef.current;
      if (!token || !deviceId) return;

      const { position, duration } = state;
      const pct = duration > 0 ? position / duration : 0;

      console.log(`[useDJBrain] state_changed pct=${(pct * 100).toFixed(1)}% track=${state.track_window.current_track.name}`);

      if (pct < 0.70) return;

      const candidate = nextTrackRef.current;
      if (!candidate) {
        console.log('[useDJBrain] at 70% but nextTrack not ready yet');
        return;
      }

      hasQueuedRef.current = true; // prevent double-fire before async resolves

      console.log('[useDJBrain] queuing at 70%:', candidate.name);
      postQueue(token, deviceId, candidate.uri)
        .then(() => {
          console.log('[useDJBrain] queued successfully:', candidate.name);
          pushLog(`Queued "${candidate.name}" at 70%`);
        })
        .catch((err) => {
          console.error('[useDJBrain] queue error:', err);
          pushLog(`Queue error: ${err instanceof Error ? err.message : String(err)}`);
          hasQueuedRef.current = false; // allow retry on next event
        });
    };

    player.addListener('player_state_changed', onStateChanged);
    console.log('[useDJBrain] player_state_changed listener registered');
    return () => {
      player.removeListener('player_state_changed', onStateChanged);
    };
  }, [player]);

  // ── skipToNext: queue current nextTrack then skip ─────────────────────────
  const skipToNext = useCallback(async () => {
    const token     = tokenRef.current;
    const deviceId  = deviceIdRef.current;
    const candidate = nextTrackRef.current;

    if (!token || !deviceId || !player) {
      console.log('[useDJBrain] skipToNext — missing token/deviceId/player');
      return;
    }

    if (candidate && !hasQueuedRef.current) {
      hasQueuedRef.current = true;
      console.log('[useDJBrain] skipToNext queuing:', candidate.name);
      try {
        await postQueue(token, deviceId, candidate.uri);
        pushLog(`Skipped to "${candidate.name}"`);
      } catch (err) {
        console.error('[useDJBrain] skipToNext queue error:', err);
        pushLog(`Skip queue error: ${err instanceof Error ? err.message : String(err)}`);
        hasQueuedRef.current = false;
      }
    }

    await player.nextTrack();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  return { nextTrack, isAnalysing, djLog, skipToNext };
}
