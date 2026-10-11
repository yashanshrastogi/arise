/**
 * Arise API Client Layer
 * Connects React frontend directly to FastAPI environmental backend.
 * Provides resilient fallbacks and graceful degradation.
 */

function resolveApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    if (!envUrl || envUrl.includes('execute-api') || envUrl.includes('amazonaws.com')) {
      return 'http://localhost:8000';
    }
  }
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'https://ll84ry8heh.execute-api.us-east-1.amazonaws.com/prod';
}

const API_BASE_URL = resolveApiBaseUrl();

export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Arise backend health check unreachable, using local fallback:', err.message);
  }
  return null;
}

export async function fetchEnvironment({ lat = 28.6139, lon = 77.2090, persona = 'General Public', demo = false } = {}) {
  try {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      persona,
      demo: demo ? 'true' : 'false',
    });
    const res = await fetch(`${API_BASE_URL}/environment?${params.toString()}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      try {
        localStorage.setItem('arise_cached_env', JSON.stringify({ ...data, _cachedAt: Date.now() }));
      } catch {}
      return data;
    }
    console.warn(`Backend /environment returned status ${res.status}`);
  } catch (err) {
    console.warn('Failed to fetch from backend /environment, checking cache:', err.message);
  }
  try {
    const cached = localStorage.getItem('arise_cached_env');
    if (cached) return JSON.parse(cached);
  } catch {}
  return null;
}

export async function fetchAirNow({ lat, lon, demo = false } = {}) {
  try {
    const params = new URLSearchParams({ lat: lat.toString(), lon: lon.toString(), demo: demo.toString() });
    const res = await fetch(`${API_BASE_URL}/air/now?${params.toString()}`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Failed to fetch /air/now:', err.message);
  }
  return null;
}

export async function fetchWeatherNow({ lat, lon, demo = false } = {}) {
  try {
    const params = new URLSearchParams({ lat: lat.toString(), lon: lon.toString(), demo: demo.toString() });
    const res = await fetch(`${API_BASE_URL}/weather/now?${params.toString()}`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Failed to fetch /weather/now:', err.message);
  }
  return null;
}

export async function fetchVerdict({ lat, lon, persona = 'General Public', demo = false } = {}) {
  try {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      persona,
      demo: demo.toString(),
    });
    const res = await fetch(`${API_BASE_URL}/verdict?${params.toString()}`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Failed to fetch /verdict:', err.message);
  }
  return null;
}

export async function comparePlaces(places, demo = false) {
  try {
    const res = await fetch(`${API_BASE_URL}/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ places, demo }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Failed to post /compare:', err.message);
  }
  return null;
}

export async function askAriseChat({ question, lat = 28.6139, lon = 77.2090, persona = 'General Public', demo = false } = {}) {
  try {
    const res = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, lat, lon, persona, demo }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      return await res.json();
    }
    console.warn(`Backend /chat returned status ${res.status}`);
  } catch (err) {
    console.warn('Failed to post /chat, checking local retry:', err.message);
    if (
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      !API_BASE_URL.startsWith('http://localhost:8000')
    ) {
      try {
        const localRes = await fetch('http://localhost:8000/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, lat, lon, persona, demo }),
          signal: AbortSignal.timeout(10000),
        });
        if (localRes.ok) return await localRes.json();
      } catch {}
    }
  }
  return null;
}



// Authenticated user-profile API.
// The API verifies this Cognito access token before accessing profile data.
function profileHeaders(accessToken, json = false) {
  if (!accessToken) {
    throw new Error("Sign in with Google to access your profile.");
  }
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function profileRequest(path, accessToken, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...profileHeaders(accessToken, Boolean(options.body)),
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || `Profile API failed (${response.status}).`);
    }

    return await response.json();
  } catch (err) {
    // If remote endpoint failed while in local dev, retry with localhost:8000
    if (
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      !url.startsWith('http://localhost:8000')
    ) {
      try {
        const localResponse = await fetch(`http://localhost:8000${path}`, {
          ...options,
          headers: {
            ...profileHeaders(accessToken, Boolean(options.body)),
            ...(options.headers || {}),
          },
          signal: AbortSignal.timeout(10000),
        });
        if (localResponse.ok) {
          return await localResponse.json();
        }
      } catch {}
    }
    if (err.name === 'AbortError' || /signal timed out|timeout/i.test(err.message || '')) {
      throw new Error('Connection timed out. Please check your network and try again.');
    }
    throw err;
  }
}

export function getUserProfile(accessToken) {
  return profileRequest("/profile", accessToken);
}

export function bootstrapUserProfile(accessToken, profile) {
  return profileRequest("/profile/bootstrap", accessToken, {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

export async function updateUserProfile(accessToken, updates) {
  try {
    return await profileRequest("/profile", accessToken, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  } catch (err) {
    // If profile not yet bootstrapped, seamlessly bootstrap it with updates
    if (/not initialized/i.test(err.message || '')) {
      return await bootstrapUserProfile(accessToken, {
        display_name: updates.display_name || "Arise User",
        ...updates,
      });
    }
    throw err;
  }
}
