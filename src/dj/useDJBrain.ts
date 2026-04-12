import { useCallback, useEffect, useRef, useState } from 'react';
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
  nextTrack: RecommendedTrack | null;
  isAnalysing: boolean;
  djLog: string[];
  skipToNext: () => Promise<void>;
}

function ts(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

async function postQueue(token: string, deviceId: string, uri: string): Promise<void> {
  const params = new URLSearchParams({ uri, device_id: deviceId });
  const res = await fetch(`https://api.spotify.com/v1/me/player/queue?${params}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
}

export function useDJBrain({ token, player, deviceId, energyScore, currentTrack }: DJBrainInput): DJBrainState {
  const [nextTrack, setNextTrack] = useState<RecommendedTrack | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [djLog, setDjLog] = useState<string[]>([]);

  const hasQueuedRef        = useRef(false);
  const currentTrackIdRef   = useRef<string | null>(null);

  // Refs so interval and event-listener closures always read current values.
  const tokenRef      = useRef(token);
  const deviceIdRef   = useRef(deviceId);
  const energyRef     = useRef(energyScore);
  const trackRef      = useRef(currentTrack);
  const nextTrackRef  = useRef<RecommendedTrack | null>(null);

  useEffect(() => { tokenRef.current    = token;        }, [token]);
  useEffect(() => { deviceIdRef.current = deviceId;     }, [deviceId]);
  useEffect(() => { energyRef.current   = energyScore;  }, [energyScore]);
  useEffect(() => { trackRef.current    = currentTrack; }, [currentTrack]);

  const log = (msg: string) =>
    setDjLog(prev => [`[${ts()}] ${msg}`, ...prev].slice(0, 50));

  // ── Every 15 seconds: fetch recommendation, update nextTrack. That is all. ─

  useEffect(() => {
    const fetch15 = async () => {
      const token = tokenRef.current;
      const track = trackRef.current;
      const energy = energyRef.current;
      if (!token || !track?.id) return;

      setIsAnalysing(true);
      try {
        const picks = await getRecommendations(token, track.id, energy);
        if (picks[0]) {
          nextTrackRef.current = picks[0];
          setNextTrack(picks[0]);
        }
      } catch (err) {
        log(`Fetch error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsAnalysing(false);
      }
    };

    fetch15();
    const id = setInterval(fetch15, 15_000);
    return () => clearInterval(id);
  }, []);

  // ── Watch player_state_changed ────────────────────────────────────────────

  useEffect(() => {
    if (!player) return;

    const onState = (state: Spotify.PlaybackState | null) => {
      if (!state) return;

      const trackId = state.track_window.current_track.id;

      // Track changed → reset and return. Do not evaluate the 99% check on
      // the same event that triggered the reset — the position/duration values
      // on this event may still reflect the previous track's end state.
      if (trackId !== currentTrackIdRef.current) {
        currentTrackIdRef.current = trackId;
        hasQueuedRef.current = false;
        return;
      }

      // Queue at 99%.
      if (
        state.duration > 0 &&
        state.position / state.duration > 0.99 &&
        hasQueuedRef.current === false
      ) {
        const token     = tokenRef.current;
        const deviceId  = deviceIdRef.current;
        const candidate = nextTrackRef.current;

        if (!token || !deviceId || !candidate) return;

        hasQueuedRef.current = true;

        postQueue(token, deviceId, candidate.uri)
          .then(() => log(`Queued "${candidate.name}" at 99%`))
          .catch(err => {
            log(`Queue error: ${err instanceof Error ? err.message : String(err)}`);
            hasQueuedRef.current = false;
          });
      }
    };

    player.addListener('player_state_changed', onState);
    return () => { player.removeListener('player_state_changed', onState); };
  }, [player]);

  // ── Next Song button ──────────────────────────────────────────────────────

  const skipToNext = useCallback(async () => {
    const token     = tokenRef.current;
    const deviceId  = deviceIdRef.current;
    const candidate = nextTrackRef.current;

    if (token && deviceId && candidate) {
      await postQueue(token, deviceId, candidate.uri);
      hasQueuedRef.current = true;
      log(`Skipped to "${candidate.name}"`);
    }

    await player?.nextTrack();
  }, [player]);

  return { nextTrack, isAnalysing, djLog, skipToNext };
}
