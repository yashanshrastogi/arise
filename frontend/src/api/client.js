/**
 * Arise API Client Layer
 * Connects React frontend directly to FastAPI environmental backend.
 * Provides resilient fallbacks and graceful degradation.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
      return await res.json();
    }
    console.warn(`Backend /environment returned status ${res.status}`);
  } catch (err) {
    console.warn('Failed to fetch from backend /environment, falling back:', err.message);
  }
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
    console.warn('Failed to post /chat, falling back:', err.message);
  }
  return null;
}

