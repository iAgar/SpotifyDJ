import { useAuth } from './auth/useAuth';
import { usePlayer } from './spotify/usePlayer';
import { useMotionDetector } from './camera/useMotionDetector';

function energyLabel(score: number): string {
  if (score < 0.3) return 'chill';
  if (score < 0.6) return 'warming up';
  return 'peak energy';
}

function energyColor(score: number): string {
  if (score < 0.3) return '#4ade80'; // green
  if (score < 0.6) return '#facc15'; // yellow
  return '#f87171';                   // red
}

function App() {
  const { token, login } = useAuth();
  const { deviceId, currentTrack, isReady } = usePlayer(token);
  const { energyScore, isActive, videoRef, startCamera, stopCamera } = useMotionDetector();

  if (!token) {
    return (
      <div style={{ padding: '2rem' }}>
        <button onClick={login}>Login with Spotify</button>
      </div>
    );
  }

  const pct = Math.round(energyScore * 100);
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

        {/* Track */}
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
