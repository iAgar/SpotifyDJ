import { useEffect, useState } from 'react';
import { getToken, login } from './pkce';

const TOKEN_KEY = 'spotify_access_token';

export function useAuth() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY)
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (!code) return;

    // Clear the code from the URL immediately so a refresh doesn't re-use it
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);

    getToken(code)
      .then((accessToken) => {
        localStorage.setItem(TOKEN_KEY, accessToken);
        setToken(accessToken);
      })
      .catch((err) => {
        console.error('Token exchange error:', err);
      });
  }, []);

  return { token, login };
}
