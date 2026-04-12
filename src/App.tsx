import { useAuth } from './auth/useAuth';

function App() {
  const { token, login } = useAuth();

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
    </div>
  );
}

export default App;
