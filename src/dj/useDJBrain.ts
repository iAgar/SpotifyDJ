import { useEffect, useRef, useState } from 'react';
import { getRecommendations, type RecommendedTrack } from '../spotify/useRecommendations';
import type { CurrentTrack } from '../spotify/usePlayer';

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;
const QUEUE_AT_PCT     = 0.60;
const SKIP_AT_PCT      = 0.90;
const NO_INTERRUPT_SEC = 30;
const ENERGY_RETRIGGER = 0.30;

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

  // ── Keep all props in refs so the stable interval closure reads fresh values
  //    without needing to be recreated on every render.
  const tokenRef        = useRef(token);
  const playerRef       = useRef(player);
  const deviceIdRef     = useRef(deviceId);
  const energyScoreRef  = useRef(energyScore);
  const currentTrackRef = useRef(currentTrack);

  useEffect(() => { tokenRef.current       = token;        }, [token]);
  useEffect(() => { playerRef.current      = player;       }, [player]);
  useEffect(() => { deviceIdRef.current    = deviceId;     }, [deviceId]);
  useEffect(() => { energyScoreRef.current = energyScore;  }, [energyScore]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  // ── Per-track flags (reset when track ID changes) ─────────────────────────
  const lastQueuedUri       = useRef<string | null>(null);
  const hasQueuedThisTrack  = useRef(false);
  const hasSkippedThisTrack = useRef(false);
  const energyAtQueue       = useRef<number | null>(null);
  const trackIdRef          = useRef<string | null | undefined>(null);
  const nextTrackRef        = useRef<RecommendedTrack | null>(null);

  // Setter wrapper that also syncs the ref (read by the interval closure).
  const pushLog = (msg: string) =>
    setDjLog((prev) => [logEntry(msg), ...prev].slice(0, 50));

  // ── 10-second polling interval ────────────────────────────────────────────
  // Deps: intentionally empty after mount — the interval is stable for the
  // lifetime of the hook. All live values are read from refs inside the callback.

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

      // Reset per-track flags on track change.
      const incomingId = currentTrack.id;
      if (incomingId !== trackIdRef.current) {
        console.log('[useDJBrain] new track detected:', currentTrack.name);
        trackIdRef.current          = incomingId;
        hasQueuedThisTrack.current  = false;
        hasSkippedThisTrack.current = false;
        energyAtQueue.current       = null;
      }

      const state = await player.getCurrentState();
      console.log('[useDJBrain] playback state:', state ? `pos=${state.position} dur=${state.duration} paused=${state.paused}` : 'null');

      if (!state || state.paused) return;

      const { position, duration } = state;
      const positionSec = position / 1000;
      const pct = duration > 0 ? position / duration : 0;

      console.log(`[useDJBrain] position ${positionSec.toFixed(1)}s / ${(duration / 1000).toFixed(1)}s (${(pct * 100).toFixed(1)}%)`);

      if (positionSec < NO_INTERRUPT_SEC) {
        console.log('[useDJBrain] within no-interrupt window, skipping');
        return;
      }

      // Skip at 90%.
      if (pct >= SKIP_AT_PCT && !hasSkippedThisTrack.current) {
        hasSkippedThisTrack.current = true;
        const msg = nextTrackRef.current
          ? `Skipping to next — ${nextTrackRef.current.name}`
          : 'Skipping to next track';
        console.log('[useDJBrain]', msg);
        pushLog(msg);
        await player.nextTrack();
        return;
      }

      // Queue at 60%.
      const energyShifted =
        energyAtQueue.current !== null &&
        Math.abs(energyScore - energyAtQueue.current) > ENERGY_RETRIGGER;

      const shouldQueue = pct >= QUEUE_AT_PCT && (!hasQueuedThisTrack.current || energyShifted);

      console.log(`[useDJBrain] shouldQueue=${shouldQueue} (pct=${(pct * 100).toFixed(1)}% queued=${hasQueuedThisTrack.current} shifted=${energyShifted})`);

      if (!shouldQueue) return;

      console.log('[useDJBrain] fetching recommendations, energy:', energyScore);
      setIsAnalysing(true);
      try {
        const picks = await getRecommendations(token, currentTrack.id, energyScore);
        console.log('[useDJBrain] recommendations received:', picks.map((t) => t.name));

        if (!picks.length) {
          pushLog('No recommendations found');
          return;
        }

        const candidate = picks.find((t) => t.uri !== lastQueuedUri.current) ?? picks[0];
        console.log('[useDJBrain] queuing:', candidate.name);

        await addToQueue(token, deviceId, candidate.uri);

        lastQueuedUri.current      = candidate.uri;
        hasQueuedThisTrack.current = true;
        energyAtQueue.current      = energyScore;

        const reason = energyShifted ? 'Energy shifted' : `Energy ${energyLabel(energyScore)}`;
        const logMsg = `${reason} → queued "${candidate.name}" by ${candidate.artist}`;
        console.log('[useDJBrain]', logMsg);
        pushLog(logMsg);

        setNextTrack(candidate);
        nextTrackRef.current = candidate;
      } catch (err) {
        const msg = `Error: ${err instanceof Error ? err.message : String(err)}`;
        console.error('[useDJBrain]', err);
        pushLog(msg);
      } finally {
        setIsAnalysing(false);
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
  }, []); // stable — reads all live values from refs

  return { nextTrack, isAnalysing, djLog };
}
