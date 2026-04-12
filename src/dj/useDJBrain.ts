import { useEffect, useRef, useState } from 'react';
import { getRecommendations, type RecommendedTrack } from '../spotify/useRecommendations';
import type { CurrentTrack } from '../spotify/usePlayer';

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000; // how often the tick runs
const FIRST_REC_SEC    = 20;     // fetch + queue first recommendation at 20 s
const REEVAL_SEC       = 15;     // re-evaluate energy every 15 s after first queue
const ENERGY_RETRIGGER = 0.20;   // re-queue if energy shifts more than this
const SKIP_AT_PCT      = 0.85;   // call player.nextTrack() at 85% of duration
const SKIP_FALLBACK_SEC = 180;   // fallback skip after 3 min if duration unavailable

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

  // Mirror all props into refs so the stable interval closure reads fresh values.
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

  const trackIdRef          = useRef<string | null | undefined>(null);
  const hasQueuedThisTrack  = useRef(false);   // true after first queue this track
  const hasSkippedThisTrack = useRef(false);   // true after nextTrack() called
  const lastQueuedUri       = useRef<string | null>(null);
  const energyAtLastQueue   = useRef<number | null>(null);
  const lastEvalAt          = useRef<number>(0); // wall-clock ms of last queue/re-eval
  const isFetchingRef       = useRef(false);

  const pushLog = (msg: string) =>
    setDjLog((prev) => [logEntry(msg), ...prev].slice(0, 50));

  // ── Stable interval ───────────────────────────────────────────────────────

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

      // ── Reset state on track change ───────────────────────────────────────
      if (currentTrack.id !== trackIdRef.current) {
        console.log('[useDJBrain] new track:', currentTrack.name);
        trackIdRef.current          = currentTrack.id;
        hasQueuedThisTrack.current  = false;
        hasSkippedThisTrack.current = false;
        energyAtLastQueue.current   = null;
        lastEvalAt.current          = 0;
        setNextTrack(null);
      }

      // ── Live playback position ────────────────────────────────────────────
      const state = await player.getCurrentState();
      console.log('[useDJBrain] state:', state
        ? `pos=${state.position} dur=${state.duration} paused=${state.paused}`
        : 'null');

      if (!state || state.paused) return;

      const { position, duration } = state;
      const positionSec  = position / 1000;
      const durationSec  = duration / 1000;
      const pct          = duration > 0 ? position / duration : 0;
      const durationKnown = duration > 0;

      console.log(`[useDJBrain] pos=${positionSec.toFixed(1)}s dur=${durationSec.toFixed(1)}s pct=${(pct * 100).toFixed(1)}% nextEvalIn=${Math.max(0, (lastEvalAt.current + REEVAL_SEC * 1000) - Date.now()).toFixed(0)}ms`);

      // ── PHASE 1: first recommendation at 20 s ────────────────────────────
      // PHASE 2: re-evaluate every 15 s if energy shifted > 0.2
      const reevalDue = Date.now() - lastEvalAt.current >= REEVAL_SEC * 1000;
      const energyShifted =
        energyAtLastQueue.current !== null &&
        Math.abs(energyScore - energyAtLastQueue.current) > ENERGY_RETRIGGER;

      const shouldFetchAndQueue =
        !isFetchingRef.current && (
          // First recommendation: 20 s has elapsed, never queued yet
          (!hasQueuedThisTrack.current && positionSec >= FIRST_REC_SEC) ||
          // Re-evaluation: 15 s since last eval AND energy changed
          (hasQueuedThisTrack.current && reevalDue && energyShifted)
        );

      console.log(`[useDJBrain] shouldFetchAndQueue=${shouldFetchAndQueue} (pos=${positionSec.toFixed(0)}s queued=${hasQueuedThisTrack.current} reevalDue=${reevalDue} shifted=${energyShifted})`);

      if (shouldFetchAndQueue) {
        isFetchingRef.current = true;
        setIsAnalysing(true);
        console.log('[useDJBrain] fetching recommendations, energy:', energyScore);
        try {
          const picks = await getRecommendations(token, currentTrack.id, energyScore);
          console.log('[useDJBrain] picks:', picks.map((t) => t.name));

          const candidate = picks.find((t) => t.uri !== lastQueuedUri.current) ?? picks[0];
          if (!candidate) {
            pushLog('No recommendations found');
            return;
          }

          await addToQueue(token, deviceId, candidate.uri);

          const isFirst = !hasQueuedThisTrack.current;

          lastQueuedUri.current      = candidate.uri;
          energyAtLastQueue.current  = energyScore;
          lastEvalAt.current         = Date.now();
          hasQueuedThisTrack.current = true;

          setNextTrack(candidate);

          const reason = isFirst ? 'First rec' : `Energy ${energyLabel(energyScore)}`;
          const msg = `${reason} → queued "${candidate.name}" by ${candidate.artist}`;
          console.log('[useDJBrain]', msg);
          pushLog(msg);
        } catch (err) {
          console.error('[useDJBrain] fetch/queue error:', err);
          pushLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          isFetchingRef.current = false;
          setIsAnalysing(false);
        }
      }

      // ── PHASE 3: skip at 85% (or fallback after SKIP_FALLBACK_SEC) ───────
      const atSkipThreshold = durationKnown
        ? pct >= SKIP_AT_PCT
        : positionSec >= SKIP_FALLBACK_SEC;

      if (atSkipThreshold && !hasSkippedThisTrack.current) {
        hasSkippedThisTrack.current = true;
        const nextName = (await player.getCurrentState())?.track_window.next_tracks[0]?.name;
        const msg = nextName
          ? `85% reached → skipping to "${nextName}"`
          : '85% reached → skipping to next track';
        console.log('[useDJBrain]', msg);
        pushLog(msg);
        await player.nextTrack();
      }
    };

    const id = setInterval(() => {
      console.log('[useDJBrain] interval fired');
      tick().catch((err) => console.error('[useDJBrain] tick error:', err));
    }, POLL_INTERVAL_MS);

    console.log('[useDJBrain] interval registered, id:', id);

    return () => {
      console.log('[useDJBrain] interval cleared, id:', id);
      clearInterval(id);
    };
  }, []); // stable — all live values read from refs

  return { nextTrack, isAnalysing, djLog };
}
