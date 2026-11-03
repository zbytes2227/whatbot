// lib/clientApi.js
// Browser-side API client. Authentication rides on the httpOnly session
// cookie, so no token is ever stored in JavaScript-accessible storage.

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function redirectToLogin() {
  if (typeof window === 'undefined' || window.location.pathname === '/login') return;
  const next = `${window.location.pathname}${window.location.search}`;
  // A full reload is intentional: it discards all client state for the old session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/login${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;
}

export async function apiFetch(url, { method = 'GET', body, headers = {}, signal } = {}) {
  const init = { method, headers: { Accept: 'application/json', ...headers }, credentials: 'same-origin', signal, cache: 'no-store' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }

  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('Network error. Check your connection and try again.', 0);
  }

  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json().catch(() => ({})) : null;
  if (res.status === 401 && !url.startsWith('/api/login')) {
    redirectToLogin();
    throw new ApiError(data?.msg || 'Session expired', 401, data);
  }
  if (!res.ok || data?.success === false) {
    throw new ApiError(data?.msg || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

export const api = {
  get: (url, opts) => apiFetch(url, { ...opts, method: 'GET' }),
  post: (url, body, opts) => apiFetch(url, { ...opts, method: 'POST', body }),
  put: (url, body, opts) => apiFetch(url, { ...opts, method: 'PUT', body }),
  patch: (url, body, opts) => apiFetch(url, { ...opts, method: 'PATCH', body }),
  del: (url, opts) => apiFetch(url, { ...opts, method: 'DELETE' }),
};

/** Trigger a file download from an authenticated GET endpoint. */
export function download(url) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function logout() {
  try {
    await api.post('/api/logout');
  } finally {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch {}
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login';
  }
}
