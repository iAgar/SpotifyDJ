import { useAuth } from './auth/useAuth';
import { usePlayer } from './spotify/usePlayer';
import { useMotionDetector } from './camera/useMotionDetector';
import { useDJBrain } from './dj/useDJBrain';
import { NowPlaying } from './components/NowPlaying';
import { EnergyMeter } from './components/EnergyMeter';
import { DJLog } from './components/DJLog';
import { NextUp } from './components/NextUp';
import { CameraPreview } from './components/CameraPreview';

// ── Login screen ──────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '2rem',
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, fontWeight: 800, color: '#fff', letterSpacing: '-1px' }}>
          PARTY<span style={{ color: '#1db954' }}>DJ</span>
        </div>
        <div style={{ fontSize: 14, color: '#555', marginTop: '0.5rem', letterSpacing: '0.1em' }}>
          AI-POWERED CROWD ENERGY
        </div>
      </div>

      <button
        onClick={onLogin}
        style={{
          background: '#1db954',
          color: '#000',
          border: 'none',
          borderRadius: 50,
          padding: '1rem 3rem',
          fontSize: 16,
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: '0.08em',
        }}
      >
        LOGIN WITH SPOTIFY
      </button>
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────

function App() {
  const { token, login }   = useAuth();
  const { deviceId, currentTrack, isReady, player } = usePlayer(token);
  const { energyScore, isActive, videoRef, startCamera, stopCamera } = useMotionDetector();
  const { recommendedNext, djLog, playNext } = useDJBrain({
    token,
    player,
    deviceId,
    energyScore,
    currentTrack,
  });

  if (!token) return <LoginScreen onLogin={login} />;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#fff',
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
      display: 'grid',
      gridTemplateRows: '1fr auto',
      overflow: 'hidden',
    }}>
      {/* ── Main content area ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '60px 1fr 200px',
        gap: '1.5rem',
        padding: '2rem',
        alignItems: 'center',
        minHeight: 0,
      }}>

        {/* Left: Energy meter */}
        <div style={{ height: 400, display: 'flex', alignItems: 'stretch' }}>
          <EnergyMeter energyScore={energyScore} />
        </div>

        {/* Centre: Now playing */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <NowPlaying track={currentTrack} isReady={isReady} />
        </div>

        {/* Right: DJ Log */}
        <DJLog entries={djLog} />
      </div>

      {/* ── Bottom bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem 2rem 1.5rem',
        borderTop: '1px solid #111',
        gap: '1.5rem',
      }}>

        {/* Bottom-left: Next Up */}
        <div style={{ flex: 1, maxWidth: 320 }}>
          <NextUp track={recommendedNext} onPlayNext={playNext} />
        </div>

        {/* Centre: START / STOP button */}
        <button
          onClick={isActive ? stopCamera : startCamera}
          style={{
            background: isActive ? '#1a1a1a' : '#1db954',
            color: isActive ? '#f87171' : '#000',
            border: isActive ? '1px solid #f87171' : 'none',
            borderRadius: 50,
            padding: '0.85rem 2.5rem',
            fontSize: 15,
            fontWeight: 800,
            cursor: 'pointer',
            letterSpacing: '0.1em',
            transition: 'all 0.2s ease',
            flexShrink: 0,
          }}
        >
          {isActive ? 'STOP PARTY' : 'START PARTY'}
        </button>

        {/* Bottom-right: Camera preview */}
        <div style={{ flex: 1, maxWidth: 320, display: 'flex', justifyContent: 'flex-end' }}>
          <CameraPreview
            videoRef={videoRef}
            isActive={isActive}
            energyScore={energyScore}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
