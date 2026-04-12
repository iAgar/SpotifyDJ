import { useEffect } from 'react';
import { useAuth } from './auth/useAuth';
import { usePlayer } from './spotify/usePlayer';
import { useMotionDetector } from './camera/useMotionDetector';
import { useRecommendations, getRecommendations } from './spotify/useRecommendations';
import { useTrackFeatures } from './spotify/useTrackFeatures';

function energyLabel(score: number): string {
  if (score < 0.3) return 'chill';
  if (score < 0.6) return 'warming up';
  return 'peak energy';
}

function energyColor(score: number): string {
  if (score < 0.3) return '#4ade80';
  if (score < 0.6) return '#facc15';
  return '#f87171';
}

// ---------------------------------------------------------------------------
// Hardcoded smoke-test: runs once when the app mounts with a valid token.
// Uses a well-known track (Daft Punk – Around The World) and energy 0.75
// so the result is deterministic enough to inspect in the console.
// ---------------------------------------------------------------------------
const TEST_TRACK_ID = '1pKYYY0dkg23sQQXi0Q5zN'; // Around The World – Daft Punk
const TEST_ENERGY   = 0.75;

function useSmokeTest(token: string | null) {
  useEffect(() => {
    if (!token) return;
    console.group('[SmokeTest] getRecommendations');
    console.log('trackId:', TEST_TRACK_ID, '| energyScore:', TEST_ENERGY);
    getRecommendations(token, TEST_TRACK_ID, TEST_ENERGY)
      .then((tracks) => {
        console.log('Recommended tracks:');
        tracks.forEach((t, i) =>
          console.log(`  ${i + 1}. ${t.name} — ${t.artist}  (${t.uri})`),
        );
        console.groupEnd();
      })
      .catch((err) => {
        console.error('[SmokeTest] failed:', err);
        console.groupEnd();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // intentionally fires only when token becomes available
}

function App() {
  const { token, login } = useAuth();
  const { deviceId, currentTrack, isReady } = usePlayer(token);
  const { energyScore, isActive, videoRef, startCamera, stopCamera } = useMotionDetector();
  const { recommendations, isFetching, fetchRecommendations } = useRecommendations(token);
  const { features } = useTrackFeatures(token, currentTrack?.id ?? null);

  useSmokeTest(token);

  if (!token) {
    return (
      <div style={{ padding: '2rem' }}>
        <button onClick={login}>Login with Spotify</button>
      </div>
    );
  }

  const pct   = Math.round(energyScore * 100);
  const color = energyColor(energyScore);
  const label = energyLabel(energyScore);

  return (
    <div style={{ padding: '1rem', fontFamily: 'sans-serif', maxWidth: 480 }}>
      <p>Authenticated</p>

      <p>Player status: {isReady ? 'Ready' : 'Not ready'}</p>

      {currentTrack ? (
        <p>Now playing: {currentTrack.name} — {currentTrack.artist}</p>
      ) : (
        <p>No track playing</p>
      )}

      {features && (
        <p style={{ fontSize: '0.8rem', color: '#555' }}>
          Track — energy: {features.energy.toFixed(2)} | danceability: {features.danceability.toFixed(2)} | tempo: {Math.round(features.tempo)} BPM
        </p>
      )}

      {deviceId && (
        <p style={{ fontSize: '0.75rem', color: '#888' }}>Device ID: {deviceId}</p>
      )}

      {/* Energy meter */}
      <div style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <strong>Crowd energy</strong>
          <span style={{ color, fontWeight: 600 }}>{label}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#555' }}>{pct}%</span>
        </div>

        <div style={{ height: 12, borderRadius: 6, background: '#e5e7eb', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: color,
              borderRadius: 6,
              transition: 'width 0.4s ease, background 0.4s ease',
            }}
          />
        </div>

        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
          {!isActive ? (
            <button onClick={startCamera}>Start camera</button>
          ) : (
            <button onClick={stopCamera}>Stop camera</button>
          )}
        </div>
      </div>

      {/* Recommendations */}
      <div style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <strong>Recommendations</strong>
          <button
            onClick={() => {
              const trackId = currentTrack?.id;
              if (trackId) fetchRecommendations(trackId, energyScore);
            }}
            disabled={isFetching || !currentTrack?.id}
          >
            {isFetching ? 'Fetching…' : 'Refresh'}
          </button>
        </div>

        {recommendations.length === 0 && !isFetching && (
          <p style={{ fontSize: '0.85rem', color: '#888' }}>
            {currentTrack?.id
              ? 'Hit Refresh to get track suggestions.'
              : 'Play a track first, then hit Refresh.'}
          </p>
        )}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {recommendations.map((t) => (
            <li
              key={t.uri}
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
            >
              {t.albumArt && (
                <img
                  src={t.albumArt}
                  alt={t.name}
                  width={40}
                  height={40}
                  style={{ borderRadius: 4, flexShrink: 0 }}
                />
              )}
              <span style={{ fontSize: '0.85rem' }}>
                <strong>{t.name}</strong> — {t.artist}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Webcam preview — bottom-right corner */}
      <div
        style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          width: 160,
          height: 120,
          borderRadius: 8,
          overflow: 'hidden',
          border: '2px solid #374151',
          background: '#111',
          display: isActive ? 'block' : 'none',
        }}
      >
        <video
          ref={videoRef}
          width={160}
          height={120}
          muted
          playsInline
          style={{ display: 'block', transform: 'scaleX(-1)' }}
        />
      </div>
    </div>
  );
}

export default App;
