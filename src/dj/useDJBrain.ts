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
  // recommendedNext IS our internal queue — exactly one song, always the
  // freshest energy-matched recommendation. Overwritten every 15 seconds.
  const [nextTrack, setNextTrack]     = useState<RecommendedTrack | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [djLog, setDjLog]             = useState<string[]>([]);

  // Refs for values that closures need to read without being recreated.
  const tokenRef        = useRef(token);
  const deviceIdRef     = useRef(deviceId);
  const energyRef       = useRef(energyScore);
  const currentTrackRef = useRef(currentTrack);
  const nextTrackRef    = useRef<RecommendedTrack | null>(null);

  useEffect(() => { tokenRef.current        = token;        }, [token]);
  useEffect(() => { deviceIdRef.current     = deviceId;     }, [deviceId]);
  useEffect(() => { energyRef.current       = energyScore;  }, [energyScore]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  // hasQueuedForThisTrack — reset on every track change.
  const hasQueuedRef  = useRef(false);
  const trackIdRef    = useRef<string | null>(null);
  const isFetchingRef = useRef(false);

  const pushLog = (msg: string) =>
    setDjLog((prev) => [logEntry(msg), ...prev].slice(0, 50));

  // Keeps state and ref in sync — always call this instead of setNextTrack.
  const updateNextTrack = (t: RecommendedTrack | null) => {
    nextTrackRef.current = t;
    setNextTrack(t);
  };

  // ── Track-change reset ────────────────────────────────────────────────────
  useEffect(() => {
    const id = currentTrack?.id ?? null;
    if (id === trackIdRef.current) return;
    console.log('[useDJBrain] track changed →', currentTrack?.name ?? 'null');
    trackIdRef.current   = id;
    hasQueuedRef.current = false;
    // Do NOT clear nextTrackRef — keep showing the last recommendation while
    // the new track's first fetch is in-flight.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  // ── 15-second interval: overwrite recommendedNext with freshest pick ──────
  useEffect(() => {
    const fetchNext = async () => {
      const token        = tokenRef.current;
      const currentTrack = currentTrackRef.current;
      const energy       = energyRef.current;

      if (!token || !currentTrack?.id || isFetchingRef.current) return;

      console.log('[useDJBrain] fetching recommendation — energy:', energy, 'track:', currentTrack.name);
      isFetchingRef.current = true;
      setIsAnalysing(true);
      try {
        const picks = await getRecommendations(token, currentTrack.id, energy);
        console.log('[useDJBrain] picks:', picks.map(t => t.name));
        if (picks[0]) {
          updateNextTrack(picks[0]);
          console.log('[useDJBrain] recommendedNext set to:', picks[0].name);
        }
      } catch (err) {
        console.error('[useDJBrain] fetch error:', err);
        pushLog(`Fetch error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        isFetchingRef.current = false;
        setIsAnalysing(false);
      }
    };

    fetchNext().catch(console.error); // immediate fetch on mount
    const id = setInterval(() => fetchNext().catch(console.error), 15_000);
    return () => clearInterval(id);
  }, []); // stable — reads all live values from refs

  // ── player_state_changed: queue at 99% for natural track end ─────────────
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

      console.log(`[useDJBrain] state_changed — pct=${(pct * 100).toFixed(1)}% track=${state.track_window.current_track.name}`);

      if (pct < 0.99) return;

      const candidate = nextTrackRef.current;
      if (!candidate) {
        console.log('[useDJBrain] at 99% but recommendedNext is null');
        return;
      }

      hasQueuedRef.current = true; // prevent double-fire before async completes

      console.log('[useDJBrain] at 99%, pre-loading into Spotify queue:', candidate.name);
      postQueue(token, deviceId, candidate.uri)
        .then(() => {
          console.log('[useDJBrain] pre-load queued:', candidate.name);
          pushLog(`Queued "${candidate.name}" for natural end`);
        })
        .catch((err) => {
          console.error('[useDJBrain] pre-load queue error:', err);
          pushLog(`Queue error: ${err instanceof Error ? err.message : String(err)}`);
          hasQueuedRef.current = false; // allow retry
        });
    };

    player.addListener('player_state_changed', onStateChanged);
    console.log('[useDJBrain] player_state_changed listener registered');
    return () => {
      player.removeListener('player_state_changed', onStateChanged);
    };
  }, [player]);

  // ── skipToNext: queue freshest recommendation then skip immediately ───────
  const skipToNext = useCallback(async () => {
    const token     = tokenRef.current;
    const deviceId  = deviceIdRef.current;
    const candidate = nextTrackRef.current;

    console.log('[useDJBrain] skipToNext — candidate:', candidate?.name ?? null);

    if (!player) return;

    if (token && deviceId && candidate) {
      // Queue before skipping so Spotify plays this track next.
      try {
        await postQueue(token, deviceId, candidate.uri);
        hasQueuedRef.current = true;
        pushLog(`Skipped to "${candidate.name}"`);
        console.log('[useDJBrain] skipToNext queued:', candidate.name);
      } catch (err) {
        console.error('[useDJBrain] skipToNext queue error:', err);
        pushLog(`Skip error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await player.nextTrack();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  return { nextTrack, isAnalysing, djLog, skipToNext };
}
