import { useState } from 'react';
import { useAuth } from './auth/useAuth';
import { usePlayer } from './spotify/usePlayer';
import { useMotionDetector } from './camera/useMotionDetector';
import { useDJBrain } from './dj/useDJBrain';
import { NowPlaying } from './components/NowPlaying';
import { EnergyMeter } from './components/EnergyMeter';
import { DJLog } from './components/DJLog';
import { NextUp } from './components/NextUp';

// ── Helpers ───────────────────────────────────────────────────────────────────

function energyColor(score: number): string {
  if (score < 0.3) return '#1db954';
  if (score < 0.6) return '#facc15';
  return '#f87171';
}

// ── Login screen ──────────────────────────────────────────────────────────────

function LoginScreen({ onLogin, error }: { onLogin: () => void; error?: string }) {
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

      {error && (
        <div style={{
          background: '#1a0a0a',
          border: '1px solid #f87171',
          borderRadius: 8,
          padding: '0.75rem 1.25rem',
          fontSize: 13,
          color: '#f87171',
          maxWidth: 320,
          textAlign: 'center',
        }}>
          {error}
        </div>
      )}

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

// ── Loading screen ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1.5rem',
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
    }}>
      <div style={{ fontSize: 48, fontWeight: 800, color: '#fff', letterSpacing: '-1px' }}>
        PARTY<span style={{ color: '#1db954' }}>DJ</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#1db954',
              animation: `dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 13, color: '#444', letterSpacing: '0.1em' }}>
        CONNECTING TO SPOTIFY
      </div>
      <style>{`
        @keyframes dot-pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40%            { opacity: 1;   transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

// ── Banner ────────────────────────────────────────────────────────────────────

function Banner({ message, variant }: { message: string; variant: 'error' | 'warning' | 'info' }) {
  const colors = {
    error:   { bg: '#1a0a0a', border: '#f87171', text: '#f87171' },
    warning: { bg: '#1a1500', border: '#facc15', text: '#facc15' },
    info:    { bg: '#0a1a0a', border: '#1db954', text: '#1db954' },
  }[variant];

  return (
    <div style={{
      padding: '0.6rem 1.25rem',
      background: colors.bg,
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      fontSize: 13,
      color: colors.text,
      textAlign: 'center',
    }}>
      {message}
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────

function App() {
  const { token, login, logout } = useAuth();
  const { deviceId, currentTrack, isReady, isReconnecting, isPremiumError, player } =
    usePlayer(token, logout);
  const { energyScore: cameraEnergy, isActive, cameraError, videoRef, startCamera, stopCamera } =
    useMotionDetector();

  // Test Mode: bypass camera with a manual slider
  const [testMode, setTestMode]         = useState(false);
  const [testEnergy, setTestEnergy]     = useState(0.5);
  const [isPartyStarted, setIsPartyStarted] = useState(false);
  const [loginError, setLoginError]     = useState<string | undefined>();

  // Active energy: test slider overrides camera when test mode is on
  const energyScore = testMode ? testEnergy : cameraEnergy;

  const { recommendedNext, djLog, playNext } = useDJBrain({
    token,
    player,
    deviceId,
    energyScore,
    currentTrack,
    onAuthError: () => {
      setLoginError('Your session expired. Please log in again.');
      logout();
    },
  });


  // ── Render guards ─────────────────────────────────────────────────────────

  if (!token) return <LoginScreen onLogin={login} error={loginError} />;

  // Show loading until SDK is ready and we have a device
  if (!isReady && !isPremiumError) return <LoadingScreen />;

  const c = energyColor(energyScore);
  const pct = Math.round(energyScore * 100);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#fff',
      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto',
      overflow: 'hidden',
    }}>

      {/* ── Status banners ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: isPremiumError || isReconnecting || cameraError ? '1rem 2rem 0' : 0 }}>
        {isPremiumError && (
          <Banner
            variant="error"
            message="Spotify Premium is required for in-browser playback. Please upgrade your account."
          />
        )}
        {isReconnecting && (
          <Banner
            variant="warning"
            message="Player disconnected — reconnecting to Spotify…"
          />
        )}
        {cameraError && !testMode && (
          <Banner variant="warning" message={cameraError} />
        )}
      </div>

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
          <NowPlaying
            trackName={currentTrack?.name ?? null}
            artistName={currentTrack?.artist ?? null}
            albumArt={currentTrack?.albumArt ?? null}
            isReady={isReady}
          />
        </div>

        {/* Right: DJ Log */}
        <DJLog entries={djLog} />
      </div>

      {/* ── Bottom bar ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '0.75rem 2rem 1.5rem',
        borderTop: '1px solid #111',
      }}>

        {/* Test Mode / Manual energy slider row */}
        {(testMode || cameraError) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.6rem 1rem',
            background: '#111',
            border: '1px solid #222',
            borderRadius: 10,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#1db954', flexShrink: 0 }}>
              {testMode ? 'TEST MODE' : 'MANUAL ENERGY'}
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(testEnergy * 100)}
              onChange={(e) => setTestEnergy(Number(e.target.value) / 100)}
              style={{ flex: 1, accentColor: c, cursor: 'pointer' }}
            />
            <div style={{ fontSize: 13, fontWeight: 700, color: c, minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {pct}%
            </div>
          </div>
        )}

        {/* Main controls row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1.5rem',
        }}>

          {/* Bottom-left: Next Up */}
          <div style={{ flex: 1, maxWidth: 320 }}>
            <NextUp track={recommendedNext} onPlayNext={playNext} />
          </div>

          {/* Centre: buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexShrink: 0 }}>

            {/* Test Mode toggle */}
            <button
              onClick={() => {
                setTestMode((v) => !v);
                if (!testMode && isPartyStarted) {
                  stopCamera();
                  setIsPartyStarted(false);
                }
              }}
              style={{
                background: testMode ? '#1db95422' : 'transparent',
                color: testMode ? '#1db954' : '#555',
                border: `1px solid ${testMode ? '#1db954' : '#333'}`,
                borderRadius: 50,
                padding: '0.65rem 1.25rem',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.08em',
                transition: 'all 0.2s ease',
              }}
            >
              {testMode ? 'TEST ON' : 'TEST MODE'}
            </button>

            {/* Next Song */}
            <button
              onClick={playNext}
              disabled={!recommendedNext}
              style={{
                background: recommendedNext ? '#111' : '#0a0a0a',
                color: recommendedNext ? '#1db954' : '#333',
                border: `1px solid ${recommendedNext ? '#1db954' : '#222'}`,
                borderRadius: 50,
                padding: '0.85rem 2rem',
                fontSize: 15,
                fontWeight: 800,
                cursor: recommendedNext ? 'pointer' : 'not-allowed',
                letterSpacing: '0.1em',
                transition: 'all 0.2s ease',
              }}
            >
              NEXT SONG
            </button>

            {/* Start / Stop Party */}
            <button
              disabled={isPremiumError}
              onClick={() => {
                if (isPartyStarted) {
                  if (!testMode) stopCamera();
                  player?.pause();
                  setIsPartyStarted(false);
                } else {
                  if (!testMode) startCamera();
                  setIsPartyStarted(true);
                }
              }}
              style={{
                background: isPartyStarted ? '#1a1a1a' : (isPremiumError ? '#111' : '#1db954'),
                color: isPartyStarted ? '#f87171' : (isPremiumError ? '#333' : '#000'),
                border: isPartyStarted ? '1px solid #f87171' : (isPremiumError ? '1px solid #333' : 'none'),
                borderRadius: 50,
                padding: '0.85rem 2.5rem',
                fontSize: 15,
                fontWeight: 800,
                cursor: isPremiumError ? 'not-allowed' : 'pointer',
                letterSpacing: '0.1em',
                transition: 'all 0.2s ease',
              }}
            >
              {isPartyStarted ? 'STOP PARTY' : 'START PARTY'}
            </button>
          </div>

          {/* Bottom-right: Camera preview (always mounted so ref is populated) */}
          <div style={{ flex: 1, maxWidth: 320, display: 'flex', justifyContent: 'flex-end' }}>
            {cameraError && !testMode ? (
              <div style={{
                width: 160,
                height: 120,
                borderRadius: 10,
                background: '#0d0d0d',
                border: '1px solid #333',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.5rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color: '#555', lineHeight: 1.4 }}>
                  No camera
                </div>
              </div>
            ) : (
              <div style={{
                position: 'relative',
                width: 160,
                height: 120,
                borderRadius: 10,
                overflow: 'hidden',
                border: `2px solid ${c}`,
                background: '#000',
                transition: 'border-color 0.4s ease',
                flexShrink: 0,
                display: (isActive || testMode) ? 'block' : 'none',
              }}>
                <video
                  ref={videoRef}
                  width={160}
                  height={120}
                  autoPlay
                  muted
                  playsInline
                  style={{
                    display: testMode ? 'none' : 'block',
                    transform: 'scaleX(-1)',
                    objectFit: 'cover',
                  }}
                />

                {/* Test mode placeholder */}
                {testMode && (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#0d0d0d',
                    fontSize: 11,
                    color: '#1db954',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                  }}>
                    TEST MODE
                  </div>
                )}

                {/* Energy overlay */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: '0.2rem 0.4rem',
                  background: 'rgba(0,0,0,0.65)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#222', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: c,
                      borderRadius: 2,
                      transition: 'width 0.3s ease, background 0.3s ease',
                    }} />
                  </div>
                  <div style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: c,
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 28,
                    textAlign: 'right',
                  }}>
                    {pct}%
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
