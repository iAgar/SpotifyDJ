import { useEffect, useRef, useState } from 'react';
import { getRecommendations, type RecommendedTrack } from '../spotify/useRecommendations';
import type { CurrentTrack } from '../spotify/usePlayer';

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS    = 10_000; // check playback state every 10 s
const QUEUE_AT_PCT        = 0.60;   // fetch + queue when 60% through track
const SKIP_AT_PCT         = 0.90;   // call nextTrack() at 90%
const NO_INTERRUPT_SEC    = 30;     // never act in the first 30 s of a track
const ENERGY_RETRIGGER    = 0.30;   // re-queue if energy shifts by this much

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

// ── Queue helper ─────────────────────────────────────────────────────────────

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
  const [nextTrack, setNextTrack]     = useState<RecommendedTrack | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [djLog, setDjLog]             = useState<string[]>([]);

  // Refs hold mutable loop state without triggering re-renders.
  const nextTrackRef        = useRef<RecommendedTrack | null>(null);
  const lastQueuedUri       = useRef<string | null>(null);   // prevent double-queue
  const hasQueuedThisTrack  = useRef(false);                 // reset on track change
  const hasSkippedThisTrack = useRef(false);                 // prevent double-skip
  const energyAtQueue       = useRef<number | null>(null);   // energy when we last queued
  const trackIdRef          = useRef<string | null | undefined>(null);

  // Sync nextTrackRef so the poll closure always sees the latest value.
  useEffect(() => {
    nextTrackRef.current = nextTrack;
  }, [nextTrack]);

  // Reset per-track flags whenever the playing track changes.
  useEffect(() => {
    const incomingId = currentTrack?.id ?? null;
    if (incomingId !== trackIdRef.current) {
      trackIdRef.current       = incomingId;
      hasQueuedThisTrack.current  = false;
      hasSkippedThisTrack.current = false;
      energyAtQueue.current       = null;
    }
  }, [currentTrack]);

  const pushLog = (msg: string) =>
    setDjLog((prev) => [logEntry(msg), ...prev].slice(0, 50));

  // ── Core queue-and-skip logic ─────────────────────────────────────────────

  const maybeQueueAndSkip = async () => {
    if (!token || !player || !deviceId || !currentTrack?.id) return;

    // Grab live playback state for accurate position/duration.
    const state = await player.getCurrentState();
    if (!state || state.paused) return;

    const { position, duration } = state;
    const positionSec = position / 1000;
    const pct = duration > 0 ? position / duration : 0;

    // Rule: never act in the first 30 seconds of a track.
    if (positionSec < NO_INTERRUPT_SEC) return;

    // ── Skip at 90% ──────────────────────────────────────────────────────────
    if (pct >= SKIP_AT_PCT && !hasSkippedThisTrack.current) {
      hasSkippedThisTrack.current = true;
      if (nextTrackRef.current) {
        pushLog(`Skipping to next — ${nextTrackRef.current.name}`);
      } else {
        pushLog('Skipping to next track');
      }
      await player.nextTrack();
      return; // track will change; next poll starts fresh
    }

    // ── Queue at 60% ─────────────────────────────────────────────────────────

    // Determine if we should (re-)queue:
    // 1. Haven't queued anything for this track yet.
    // 2. OR energy shifted by > 0.3 since we last queued.
    const energyShifted =
      energyAtQueue.current !== null &&
      Math.abs(energyScore - energyAtQueue.current) > ENERGY_RETRIGGER;

    const shouldQueue = pct >= QUEUE_AT_PCT && (!hasQueuedThisTrack.current || energyShifted);

    if (!shouldQueue) return;

    setIsAnalysing(true);
    try {
      const picks = await getRecommendations(token, currentTrack.id, energyScore);
      if (!picks.length) {
        pushLog('No recommendations found');
        return;
      }

      // Never queue the same track twice in a row.
      const candidate = picks.find((t) => t.uri !== lastQueuedUri.current) ?? picks[0];

      await addToQueue(token, deviceId, candidate.uri);

      lastQueuedUri.current      = candidate.uri;
      hasQueuedThisTrack.current = true;
      energyAtQueue.current      = energyScore;

      const reason = energyShifted ? 'Energy shifted' : `Energy ${energyLabel(energyScore)}`;
      pushLog(`${reason} → queued "${candidate.name}" by ${candidate.artist}`);

      setNextTrack(candidate);
      nextTrackRef.current = candidate;
    } catch (err) {
      pushLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
      console.error('[useDJBrain]', err);
    } finally {
      setIsAnalysing(false);
    }
  };

  // ── 10-second poll ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token || !player || !deviceId) return;

    const id = setInterval(() => {
      maybeQueueAndSkip().catch((err) =>
        console.error('[useDJBrain] poll error', err),
      );
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, player, deviceId, energyScore, currentTrack]);
  // energyScore and currentTrack are included so the interval re-binds
  // whenever they change, keeping the closure values fresh.

  return { nextTrack, isAnalysing, djLog };
}
