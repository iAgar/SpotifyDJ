import { useAuth } from './auth/useAuth';
import { usePlayer } from './spotify/usePlayer';

function App() {
  const { token, login } = useAuth();
  const { deviceId, currentTrack, isReady } = usePlayer(token);

  if (!token) {
    return (
      <div>
        <button onClick={login}>Login with Spotify</button>
      </div>
    );
  }

  return (
    <div>
      <p>Authenticated</p>

      <p>Player status: {isReady ? 'Ready' : 'Not ready'}</p>

      {currentTrack ? (
        <p>
          Now playing: {currentTrack.name} — {currentTrack.artist}
        </p>
      ) : (
        <p>No track playing</p>
      )}

      {deviceId && <p style={{ fontSize: '0.75rem', color: '#888' }}>Device ID: {deviceId}</p>}
    </div>
  );
}

export default App;
