// lib/clientApi.js

export function getAuthToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token') || null;
}

export function getAuthHeaders(customHeaders = {}) {
  const headers = { ...customHeaders };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-auth-token'] = token;
  }
  return headers;
}

export async function authFetch(url, options = {}) {
  const headers = getAuthHeaders(options.headers || {});
  return fetch(url, { ...options, headers });
}

export function saveAuthSession(token, user) {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem('token', token);
    try {
      document.cookie = `token=${encodeURIComponent(token)}; path=/; max-age=2592000; SameSite=Lax`;
    } catch {}
  }
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  }
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  try {
    document.cookie = 'token=; Max-Age=0; path=/;';
  } catch {}
}
