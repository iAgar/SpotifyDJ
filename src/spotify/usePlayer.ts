import { useEffect, useRef, useState } from 'react';

export interface CurrentTrack {
  id: string | null;
  name: string;
  artist: string;
}

export interface UsePlayerResult {
  deviceId: string | null;
  currentTrack: CurrentTrack | null;
  isReady: boolean;
  player: Spotify.Player | null;
}

function loadSpotifySDK(): Promise<void> {
  return new Promise((resolve) => {
    if (window.Spotify) {
      resolve();
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = resolve;

    if (!document.querySelector('script[src*="spotify-player"]')) {
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export function usePlayer(token: string | null): UsePlayerResult {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [currentTrack, setCurrentTrack] = useState<CurrentTrack | null>(null);
  const [isReady, setIsReady] = useState(false);
  const playerRef = useRef<Spotify.Player | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    loadSpotifySDK().then(() => {
      if (cancelled) return;

      const player = new window.Spotify.Player({
        name: 'Party DJ',
        volume: 0.8,
        getOAuthToken: (cb) => cb(token),
      });

      player.addListener('ready', ({ device_id }) => {
        if (cancelled) return;
        setDeviceId(device_id);
        setIsReady(true);
      });

      player.addListener('not_ready', () => {
        if (cancelled) return;
        setIsReady(false);
        setDeviceId(null);
      });

      player.addListener('player_state_changed', (state) => {
        if (cancelled || !state) return;
        const track = state.track_window.current_track;
        setCurrentTrack({
          id: track.id,
          name: track.name,
          artist: track.artists.map((a) => a.name).join(', '),
        });
      });

      player.addListener('initialization_error', ({ message }) => {
        console.error('[Spotify] initialization_error:', message);
      });

      player.addListener('authentication_error', ({ message }) => {
        console.error('[Spotify] authentication_error:', message);
      });

      player.addListener('account_error', ({ message }) => {
        console.error('[Spotify] account_error:', message);
      });

      player.connect();
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
      setIsReady(false);
      setDeviceId(null);
      setCurrentTrack(null);
    };
  }, [token]);

  return { deviceId, currentTrack, isReady, player: playerRef.current };
}
