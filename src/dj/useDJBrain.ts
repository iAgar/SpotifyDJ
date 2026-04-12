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
  nextTrack: RecommendedTrack | null;
  isAnalysing: boolean;
  djLog: string[];
}

function logEntry(msg: string): string {
  const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `[${t}] ${msg}`;
}

export function useDJBrain({ token, player, deviceId, energyScore, currentTrack }: DJBrainInput): DJBrainState {
  const [nextTrack, setNextTrack] = useState<RecommendedTrack | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [djLog, setDjLog] = useState<string[]>([]);

  const tokenRef        = useRef(token);
  const deviceIdRef     = useRef(deviceId);
  const energyScoreRef  = useRef(energyScore);
  const currentTrackRef = useRef(currentTrack);

  useEffect(() => { tokenRef.current       = token;        }, [token]);
  useEffect(() => { deviceIdRef.current    = deviceId;     }, [deviceId]);
  useEffect(() => { energyScoreRef.current = energyScore;  }, [energyScore]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  // player is intentionally unused for now — queue goes through REST API
  void player;

  const pushLog = (msg: string) =>
    setDjLog((prev) => [logEntry(msg), ...prev].slice(0, 50));

  useEffect(() => {
    console.log('[useDJBrain] mounting interval');

    const tick = async () => {
      const token        = tokenRef.current;
      const deviceId     = deviceIdRef.current;
      const energyScore  = energyScoreRef.current;
      const currentTrack = currentTrackRef.current;

      console.log('[useDJBrain] tick — energy:', energyScore, 'track:', currentTrack?.name ?? null, 'token:', !!token, 'deviceId:', deviceId);

      if (!token || !deviceId || !currentTrack?.id) {
        console.log('[useDJBrain] skipping — missing token, deviceId, or currentTrack');
        return;
      }

      setIsAnalysing(true);
      try {
        console.log('[useDJBrain] calling getRecommendations...');
        const picks = await getRecommendations(token, currentTrack.id, energyScore);
        console.log('[useDJBrain] picks returned:', picks.length, picks.map(t => t.name));

        if (!picks.length) {
          console.log('[useDJBrain] no picks returned');
          pushLog('No recommendations returned');
          return;
        }

        const pick = picks[0];
        console.log('[useDJBrain] queuing:', pick.name, pick.uri);

        const params = new URLSearchParams({ uri: pick.uri, device_id: deviceId });
        const res = await fetch(`https://api.spotify.com/v1/me/player/queue?${params}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        console.log('[useDJBrain] queue response status:', res.status);

        if (!res.ok) {
          const body = await res.text();
          console.error('[useDJBrain] queue failed:', res.status, body);
          pushLog(`Queue failed ${res.status}: ${body}`);
          return;
        }

        const msg = `Queued "${pick.name}" by ${pick.artist} (energy ${energyScore.toFixed(2)})`;
        console.log('[useDJBrain]', msg);
        pushLog(msg);
        setNextTrack(pick);
      } catch (err) {
        console.error('[useDJBrain] error:', err);
        pushLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsAnalysing(false);
      }
    };

    const id = setInterval(() => {
      console.log('[useDJBrain] interval fired at', new Date().toLocaleTimeString());
      tick().catch(err => console.error('[useDJBrain] tick threw:', err));
    }, 15_000);

    console.log('[useDJBrain] interval registered, id:', id);

    return () => {
      console.log('[useDJBrain] clearing interval, id:', id);
      clearInterval(id);
    };
  }, []);

  return { nextTrack, isAnalysing, djLog };
}
