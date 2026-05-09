const TOKEN_STORAGE_KEY = "daedalus.authToken";

export function getAuthToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    return token;
  }

  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? undefined;
}

export function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function fetchWithAuth(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    headers: {
      ...authHeaders(),
      ...init.headers
    }
  });
}
