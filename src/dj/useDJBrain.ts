import { useEffect, useRef, useState } from 'react';
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
}

// ── Helper ───────────────────────────────────────────────────────────────────

function logEntry(msg: string): string {
  const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `[${t}] ${msg}`;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDJBrain({ token, player, deviceId, energyScore }: DJBrainInput): DJBrainState {
  const [nextTrack, setNextTrack]     = useState<RecommendedTrack | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [djLog, setDjLog]             = useState<string[]>([]);

  // Mirror volatile props into refs so event-listener closures always see
  // current values without the listener needing to be re-registered.
  const tokenRef       = useRef(token);
  const deviceIdRef    = useRef(deviceId);
  const energyRef      = useRef(energyScore);

  useEffect(() => { tokenRef.current    = token;       }, [token]);
  useEffect(() => { deviceIdRef.current = deviceId;    }, [deviceId]);
  useEffect(() => { energyRef.current   = energyScore; }, [energyScore]);

  // Per-track state in refs — mutated inside the event listener.
  const trackIdRef      = useRef<string | null>(null);
  const pendingRef      = useRef<RecommendedTrack | null>(null);
  const hasQueuedRef    = useRef(false);
  const isFetchingRef   = useRef(false);

  // Keep React state for nextTrack in sync with the ref.
  const setNextTrackBoth = (t: RecommendedTrack | null) => {
    pendingRef.current = t;
    setNextTrack(t);
  };

  const pushLog = (msg: string) =>
    setDjLog((prev) => [logEntry(msg), ...prev].slice(0, 50));

  // ── player_state_changed listener ────────────────────────────────────────
  // Re-registers only when the player instance changes (i.e. once after auth).

  useEffect(() => {
    if (!player) return;

    const onStateChanged = (state: Spotify.PlaybackState | null) => {
      if (!state || state.paused) return;

      const token    = tokenRef.current;
      const deviceId = deviceIdRef.current;
      const energy   = energyRef.current;

      if (!token || !deviceId) return;

      const { position, duration } = state;
      const trackId = state.track_window.current_track.id;
      const pct     = duration > 0 ? position / duration : 0;

      console.log(`[useDJBrain] state_changed — track: ${state.track_window.current_track.name} pos=${(position / 1000).toFixed(1)}s dur=${(duration / 1000).toFixed(1)}s pct=${(pct * 100).toFixed(1)}%`);

      // ── Track change → reset ────────────────────────────────────────────
      if (trackId !== trackIdRef.current) {
        console.log('[useDJBrain] track changed →', state.track_window.current_track.name);
        trackIdRef.current   = trackId;
        hasQueuedRef.current = false;
        isFetchingRef.current = false;
        setNextTrackBoth(null);
        pushLog(`Track changed → resetting`);
      }

      // ── Already queued this track — nothing left to do ──────────────────
      if (hasQueuedRef.current) return;

      // ── 0–70%: fetch and store recommendation (no queue write) ──────────
      if (pct < 0.70) {
        if (!pendingRef.current && !isFetchingRef.current) {
          isFetchingRef.current = true;
          setIsAnalysing(true);
          pushLog('Monitoring energy...');
          console.log('[useDJBrain] fetching recommendation for energy:', energy);

          getRecommendations(token, trackId ?? '', energy)
            .then((picks) => {
              console.log('[useDJBrain] picks:', picks.map(t => t.name));
              const pick = picks[0];
              if (pick) {
                setNextTrackBoth(pick);
                console.log('[useDJBrain] pending set to:', pick.name);
              }
            })
            .catch((err) => {
              console.error('[useDJBrain] fetch error:', err);
              pushLog(`Fetch error: ${err instanceof Error ? err.message : String(err)}`);
            })
            .finally(() => {
              isFetchingRef.current = false;
              setIsAnalysing(false);
            });
        }
        return;
      }

      // ── At 70%: queue the pending track exactly once ─────────────────────
      const candidate = pendingRef.current;
      if (!candidate) {
        console.log('[useDJBrain] at 70% but no pending track yet — skipping');
        return;
      }

      hasQueuedRef.current = true; // set immediately to prevent double-fire

      console.log('[useDJBrain] at 70%, queuing:', candidate.name, candidate.uri);

      const params = new URLSearchParams({ uri: candidate.uri, device_id: deviceId });
      fetch(`https://api.spotify.com/v1/me/player/queue?${params}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (res) => {
          console.log('[useDJBrain] queue response:', res.status);
          if (!res.ok) {
            const body = await res.text();
            console.error('[useDJBrain] queue failed:', res.status, body);
            pushLog(`Queue failed ${res.status}: ${body}`);
            hasQueuedRef.current = false; // allow retry
          } else {
            pushLog(`Queued "${candidate.name}" at 70%`);
          }
        })
        .catch((err) => {
          console.error('[useDJBrain] queue error:', err);
          pushLog(`Queue error: ${err instanceof Error ? err.message : String(err)}`);
          hasQueuedRef.current = false; // allow retry
        });
    };

    player.addListener('player_state_changed', onStateChanged);
    console.log('[useDJBrain] player_state_changed listener registered');

    return () => {
      player.removeListener('player_state_changed', onStateChanged);
      console.log('[useDJBrain] player_state_changed listener removed');
    };
  }, [player]); // re-register only if player instance changes

  return { nextTrack, isAnalysing, djLog };
}
