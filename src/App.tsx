import { useAuth } from './auth/useAuth';
import { usePlayer } from './spotify/usePlayer';
import { useMotionDetector } from './camera/useMotionDetector';
import { useDJBrain } from './dj/useDJBrain';

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

function App() {
  const { token, login } = useAuth();
  const { deviceId, currentTrack, isReady, player } = usePlayer(token);
  const { energyScore, isActive, videoRef, startCamera, stopCamera } = useMotionDetector();
  const { recommendedNext, djLog, playNext } = useDJBrain({
    token,
    player,
    deviceId,
    energyScore,
    currentTrack,
  });

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

      {/* Next Up */}
      <div style={{ marginTop: '1.5rem' }}>
        <strong>Next Up</strong>

        {recommendedNext ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem' }}>
            {recommendedNext.albumArt && (
              <img
                src={recommendedNext.albumArt}
                alt={recommendedNext.name}
                width={40}
                height={40}
                style={{ borderRadius: 4, flexShrink: 0 }}
              />
            )}
            <span style={{ fontSize: '0.85rem', flex: 1 }}>
              <strong>{recommendedNext.name}</strong> — {recommendedNext.artist}
            </span>
            <button onClick={playNext} style={{ flexShrink: 0 }}>
              Next Song
            </button>
          </div>
        ) : (
          <p style={{ fontSize: '0.85rem', color: '#888', marginTop: '0.4rem' }}>
            {currentTrack ? 'Fetching recommendation…' : 'Play a track to get recommendations.'}
          </p>
        )}
      </div>

      {/* DJ Log */}
      {djLog.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <strong>DJ Log</strong>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0.4rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {djLog.map((entry, i) => (
              <li key={i} style={{ fontSize: '0.75rem', color: '#555', fontFamily: 'monospace' }}>
                {entry}
              </li>
            ))}
          </ul>
        </div>
      )}

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
