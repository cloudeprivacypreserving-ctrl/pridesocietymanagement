import { supabase } from './supabaseClient';

async function authHeaders() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (err) {
    // supabase-js can throw (rather than return a null session) if its
    // local session state is corrupted or stale — treat that the same as
    // "not signed in" instead of letting a raw client error surface. The
    // request will then get a 401 from the API and route through the
    // normal not-authenticated handling.
    console.error('Failed to read auth session:', err.message);
    return {};
  }
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
    ...(options.headers || {}),
  };

  const res = await fetch(`/api${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = body?.error?.message || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.field = body?.error?.field;

    if (res.status === 401) {
      // The session is missing, expired, or otherwise invalid — clear it
      // and send the user back to a clean login page instead of leaving
      // them on the current page with a confusing "not authenticated"
      // error to read.
      supabase.auth.signOut().finally(() => {
        window.location.href = '/login';
      });
    }

    throw err;
  }

  return body.data;
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path, body) => request(path, { method: 'DELETE', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
};
