import { useEffect, useRef, useState } from 'react';
import { getRecommendations, type RecommendedTrack } from '../spotify/useRecommendations';
import type { CurrentTrack } from '../spotify/usePlayer';

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS   = 10_000; // check playback state every 10 s
const QUEUE_AT_PCT       = 0.85;   // queue the pending track at 85% of duration
const NO_INTERRUPT_SEC   = 30;     // never act in the first 30 s of a track
const ENERGY_RETRIGGER   = 0.30;   // re-fetch recommendation if energy shifts this much
const QUEUE_COOLDOWN_MS  = 30_000; // never queue again within 30 s of the last queue

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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function addToQueue(token: string, deviceId: string, uri: string): Promise<void> {
  const params = new URLSearchParams({ uri, device_id: deviceId });
  const res = await fetch(`https://api.spotify.com/v1/me/player/queue?${params}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Queue API ${res.status}: ${text}`);
  }
}

function energyLabel(score: number): string {
  if (score < 0.3) return 'low';
  if (score < 0.6) return 'medium';
  return 'high';
}

function logEntry(msg: string): string {
  const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `[${t}] ${msg}`;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDJBrain({
  token,
  player,
  deviceId,
  energyScore,
  currentTrack,
}: DJBrainInput): DJBrainState {
  console.log('[useDJBrain] hook called — token:', !!token, 'player:', !!player, 'deviceId:', deviceId, 'energy:', energyScore, 'track:', currentTrack?.name ?? null);

  const [nextTrack, setNextTrack]     = useState<RecommendedTrack | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [djLog, setDjLog]             = useState<string[]>([]);

  // Mirror all props into refs so the stable interval closure always reads
  // current values without being recreated on every render.
  const tokenRef        = useRef(token);
  const playerRef       = useRef(player);
  const deviceIdRef     = useRef(deviceId);
  const energyScoreRef  = useRef(energyScore);
  const currentTrackRef = useRef(currentTrack);

  useEffect(() => { tokenRef.current        = token;        }, [token]);
  useEffect(() => { playerRef.current       = player;       }, [player]);
  useEffect(() => { deviceIdRef.current     = deviceId;     }, [deviceId]);
  useEffect(() => { energyScoreRef.current  = energyScore;  }, [energyScore]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  // ── Persistent loop state ─────────────────────────────────────────────────

  // The recommendation we intend to queue — updated eagerly on energy shifts,
  // but only written to the Spotify queue at the 85% gate.
  const pendingTrackRef   = useRef<RecommendedTrack | null>(null);

  // Energy level at the time pendingTrackRef was last fetched.
  const energyAtFetch     = useRef<number | null>(null);

  // Whether we've already written pendingTrackRef to the queue this track.
  const hasQueuedThisTrack = useRef(false);

  // Wall-clock time of the last successful addToQueue call (ms).
  const lastQueuedAt      = useRef<number>(0);

  // Last queued URI — skip if candidate matches this (prevents same-track repeat).
  const lastQueuedUri     = useRef<string | null>(null);

  // Track ID we last processed — used to detect track changes.
  const trackIdRef        = useRef<string | null | undefined>(null);

  const isFetchingRef     = useRef(false);

  const pushLog = (msg: string) =>
    setDjLog((prev) => [logEntry(msg), ...prev].slice(0, 50));

  // ── 10-second polling interval ────────────────────────────────────────────

  useEffect(() => {
    console.log('[useDJBrain] interval effect mounting');

    const tick = async () => {
      const token        = tokenRef.current;
      const player       = playerRef.current;
      const deviceId     = deviceIdRef.current;
      const energyScore  = energyScoreRef.current;
      const currentTrack = currentTrackRef.current;

      console.log('[useDJBrain] tick — token:', !!token, 'player:', !!player, 'deviceId:', deviceId, 'track:', currentTrack?.name ?? null);

      if (!token || !player || !deviceId || !currentTrack?.id) {
        console.log('[useDJBrain] tick skipped — missing required values');
        return;
      }

      // ── Detect track change and reset per-track state ────────────────────
      if (currentTrack.id !== trackIdRef.current) {
        console.log('[useDJBrain] new track detected:', currentTrack.name);
        trackIdRef.current       = currentTrack.id;
        hasQueuedThisTrack.current = false;
        pendingTrackRef.current  = null;
        energyAtFetch.current    = null;
        setNextTrack(null);
      }

      // ── Get live playback position ────────────────────────────────────────
      const state = await player.getCurrentState();
      console.log('[useDJBrain] playback state:', state
        ? `pos=${state.position} dur=${state.duration} paused=${state.paused}`
        : 'null');

      if (!state || state.paused) return;

      const { position, duration } = state;
      const positionSec = position / 1000;
      const pct = duration > 0 ? position / duration : 0;

      // Fallback: if duration is 0 or unavailable, treat 45s of play as the queue trigger.
      const durationUnavailable = duration === 0;
      const fallbackQueueSec    = 45;

      console.log(`[useDJBrain] pos=${positionSec.toFixed(1)}s dur=${(duration / 1000).toFixed(1)}s pct=${(pct * 100).toFixed(1)}% durUnavailable=${durationUnavailable} cooldownRemaining=${Math.max(0, QUEUE_COOLDOWN_MS - (Date.now() - lastQueuedAt.current))}ms`);

      if (positionSec < NO_INTERRUPT_SEC) {
        console.log('[useDJBrain] within no-interrupt window, skipping');
        return;
      }

      // ── Eagerly refresh the pending recommendation when energy shifts ─────
      // We update pendingTrackRef without touching the queue yet.
      const energyShifted =
        energyAtFetch.current !== null &&
        Math.abs(energyScore - energyAtFetch.current) > ENERGY_RETRIGGER;

      const needsFetch = pendingTrackRef.current === null || energyShifted;

      if (needsFetch && !isFetchingRef.current) {
        isFetchingRef.current = true;
        setIsAnalysing(true);
        console.log('[useDJBrain] fetching recommendation, energy:', energyScore);
        try {
          const picks = await getRecommendations(token, currentTrack.id, energyScore);
          console.log('[useDJBrain] recommendations received:', picks.map((t) => t.name));

          const candidate = picks.find((t) => t.uri !== lastQueuedUri.current) ?? picks[0];
          if (candidate) {
            pendingTrackRef.current = candidate;
            energyAtFetch.current   = energyScore;
            setNextTrack(candidate);

            if (energyShifted) {
              const msg = `Energy shifted ${energyLabel(energyScore)} → will queue "${candidate.name}"`;
              console.log('[useDJBrain]', msg);
              pushLog(msg);
            }
          }
        } catch (err) {
          console.error('[useDJBrain] fetch error', err);
          pushLog(`Fetch error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          isFetchingRef.current = false;
          setIsAnalysing(false);
        }
      }

      // ── Queue the pending track at 85% (or 45s fallback) if cooldown elapsed
      const cooldownElapsed = Date.now() - lastQueuedAt.current >= QUEUE_COOLDOWN_MS;
      const atQueueThreshold = durationUnavailable
        ? positionSec >= fallbackQueueSec
        : pct >= QUEUE_AT_PCT;

      if (
        atQueueThreshold &&
        !hasQueuedThisTrack.current &&
        cooldownElapsed &&
        pendingTrackRef.current
      ) {
        const candidate = pendingTrackRef.current;
        console.log('[useDJBrain] queuing at 85%:', candidate.name);

        try {
          await addToQueue(token, deviceId, candidate.uri);

          lastQueuedUri.current      = candidate.uri;
          lastQueuedAt.current       = Date.now();
          hasQueuedThisTrack.current = true;

          const msg = `Energy ${energyLabel(energyScore)} → queued "${candidate.name}" by ${candidate.artist}`;
          console.log('[useDJBrain]', msg);
          pushLog(msg);
        } catch (err) {
          console.error('[useDJBrain] queue error', err);
          pushLog(`Queue error: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (atQueueThreshold) {
        console.log(`[useDJBrain] at threshold but not queuing — queued=${hasQueuedThisTrack.current} cooldownOk=${cooldownElapsed} pending=${!!pendingTrackRef.current}`);
      }
    };

    const id = setInterval(() => {
      console.log('[useDJBrain] interval fired');
      tick().catch((err) => console.error('[useDJBrain] tick error', err));
    }, POLL_INTERVAL_MS);

    console.log('[useDJBrain] interval registered, id:', id);

    return () => {
      console.log('[useDJBrain] interval cleared, id:', id);
      clearInterval(id);
    };
  }, []); // stable — all live values read from refs

  return { nextTrack, isAnalysing, djLog };
}
