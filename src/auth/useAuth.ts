import { useEffect, useState } from 'react';
import { getToken, login } from './pkce';

const TOKEN_KEY  = 'spotify_access_token';
const EXPIRY_KEY = 'spotify_token_expiry'; // Unix timestamp in seconds

export function isTokenExpired(): boolean {
  const expiry = localStorage.getItem(EXPIRY_KEY);
  if (!expiry) return true;
  return Date.now() / 1000 >= Number(expiry);
}

function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

function loadValidToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  if (isTokenExpired()) {
    clearAuth();
    return null;
  }
  return token;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => loadValidToken());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (!code) {
      // No OAuth callback — if we have no valid token, nothing to do here;
      // the render path will show the login button.
      return;
    }

    // Clear the code from the URL immediately so a refresh doesn't re-use it.
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);

    getToken(code)
      .then(({ accessToken, expiresIn }) => {
        const expiry = Math.floor(Date.now() / 1000) + expiresIn;
        localStorage.setItem(TOKEN_KEY, accessToken);
        localStorage.setItem(EXPIRY_KEY, String(expiry));
        setToken(accessToken);
      })
      .catch((err) => {
        console.error('Token exchange error:', err);
      });
  }, []);

  return { token, login };
}
