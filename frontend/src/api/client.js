/**
 * Arise API Client Layer
 * Connects React frontend directly to FastAPI environmental backend.
 * Provides resilient fallbacks and graceful degradation.
 */

export const PRODUCTION_API_URL = 'https://ll84ry8heh.execute-api.us-east-1.amazonaws.com/prod';

export function resolveApiBaseUrl(options = {}) {
  const envUrl = options.envUrl !== undefined
    ? options.envUrl
    : (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_URL : undefined);
  const mode = options.mode !== undefined
    ? options.mode
    : (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.MODE : undefined);
  const stage = options.stage !== undefined
    ? options.stage
    : (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_STAGE : undefined);
  const hostname = options.hostname !== undefined
    ? options.hostname
    : (typeof window !== 'undefined' && window.location ? window.location.hostname : '');

  // 1. Preserve local-development safeguard: routes local development to local backend
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    if (!envUrl || envUrl.includes('execute-api') || envUrl.includes('amazonaws.com')) {
      return 'http://localhost:8000';
    }
  }

  const isStaging =
    mode === 'staging' ||
    stage === 'staging' ||
    (Boolean(hostname) && (hostname.includes('staging') || hostname.startsWith('staging.')));

  // 2. Prevent staging from accidentally using production or failing silently
  if (isStaging) {
    const trimmed = typeof envUrl === 'string' ? envUrl.trim() : '';
    if (!trimmed || trimmed.includes('localhost') || trimmed.includes('127.0.0.1')) {
      const msg = 'Configuration Error: Missing or invalid VITE_API_URL for staging environment. Staging must not fall back to production API.';
      console.error(msg);
      throw new Error(msg);
    }
    if (trimmed.includes('/prod') || trimmed === PRODUCTION_API_URL) {
      const msg = 'Configuration Error: Staging environment configured with production API URL. Expected a staging API endpoint.';
      console.error(msg);
      throw new Error(msg);
    }
    return trimmed.replace(/\/+$/, '');
  }

  // 3. Explicitly configured non-empty URL
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // 4. Preserve existing production API default for production build
  return PRODUCTION_API_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();

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

export async function fetchEnvironment({ lat, lon, persona = 'General Public', demo = false, location_name = null, signal = null } = {}) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  if (isNaN(latNum) || isNaN(lonNum) || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
    console.warn('fetchEnvironment: Invalid coordinates provided');
    return null;
  }
  const cacheKey = `arise_cached_env_${latNum.toFixed(2)}_${lonNum.toFixed(2)}`;
  const queryLat = latNum;
  const queryLon = lonNum;

  try {
    const params = new URLSearchParams({
      lat: queryLat.toString(),
      lon: queryLon.toString(),
      persona,
      demo: demo ? 'true' : 'false',
    });
    if (location_name && typeof location_name === 'string') {
      params.append('location_name', location_name.trim());
    }
    const timeoutSignal = AbortSignal.timeout(8000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    const res = await fetch(`${API_BASE_URL}/environment?${params.toString()}`, {
      signal: combinedSignal,
    });
    if (res.ok) {
      const data = await res.json();
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ ...data, _cachedAt: Date.now() }));
      } catch {}
      return data;
    }
    console.warn(`Backend /environment returned status ${res.status}`);
  } catch (err) {
    console.warn('Failed to fetch from backend /environment, checking cache:', err.message);
  }
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {}
  return null;
}

export async function fetchAirNow({ lat, lon, demo = false } = {}) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  if (isNaN(latNum) || isNaN(lonNum) || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
    console.warn('fetchAirNow: Invalid coordinates provided');
    return null;
  }
  try {
    const params = new URLSearchParams({ lat: latNum.toString(), lon: lonNum.toString(), demo: demo.toString() });
    const res = await fetch(`${API_BASE_URL}/air/now?${params.toString()}`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Failed to fetch /air/now:', err.message);
  }
  return null;
}

export async function fetchWeatherNow({ lat, lon, demo = false } = {}) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  if (isNaN(latNum) || isNaN(lonNum) || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
    console.warn('fetchWeatherNow: Invalid coordinates provided');
    return null;
  }
  try {
    const params = new URLSearchParams({ lat: latNum.toString(), lon: lonNum.toString(), demo: demo.toString() });
    const res = await fetch(`${API_BASE_URL}/weather/now?${params.toString()}`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Failed to fetch /weather/now:', err.message);
  }
  return null;
}

export async function fetchVerdict({ lat, lon, persona = 'General Public', demo = false } = {}) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  if (isNaN(latNum) || isNaN(lonNum) || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
    console.warn('fetchVerdict: Invalid coordinates provided');
    return null;
  }
  try {
    const params = new URLSearchParams({
      lat: latNum.toString(),
      lon: lonNum.toString(),
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

export async function askAriseChat({
  question,
  lat = 28.6139,
  lon = 77.2090,
  persona = 'General Public',
  demo = false,
  location_name = null,
  user_context = null,
  environmental_context = null,
  conversation_id = null,
  include_memories = true,
  force_deep_pipeline = false,
  accessToken = null,
} = {}) {
  const payload = {
    question,
    lat,
    lon,
    persona,
    demo,
    location_name,
    user_context,
    environmental_context,
    conversation_id,
    include_memories,
    force_deep_pipeline,
  };
  const headers = {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };

  try {
    const res = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000),
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
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(12000),
        });
        if (localRes.ok) return await localRes.json();
      } catch {}
    }
  }
  return null;
}

/**
 * Fetch a commute route from the Arise backend (which calls OpenRouteService).
 *
 * Security note: The ORS API key lives exclusively on the backend.
 * This function only sends coordinates — no secrets are handled here.
 *
 * @param {Object} params
 * @param {number} params.originLat    Origin latitude (-90 to 90)
 * @param {number} params.originLon    Origin longitude (-180 to 180)
 * @param {number} params.destLat      Destination latitude
 * @param {number} params.destLon      Destination longitude
 * @param {string} [params.profile]    'driving-car' | 'cycling-regular' | 'foot-walking'
 * @param {string} [params.originLabel]       Human-readable origin name
 * @param {string} [params.destinationLabel]  Human-readable destination name
 * @returns {Promise<Object|null>}  RouteResult or null on error/unavailability
 */
export async function fetchRoute({
  originLat,
  originLon,
  destLat,
  destLon,
  profile = 'driving-car',
  originLabel,
  destinationLabel,
  includeWeather = true,
  includePollution = true,
  demo = false,
} = {}) {
  // Client-side coordinate guard — prevent sending obviously invalid requests
  const coords = [originLat, originLon, destLat, destLon].map(Number);
  if (coords.some((v) => !Number.isFinite(v))) {
    console.warn('fetchRoute: one or more coordinates are non-finite');
    return null;
  }
  const [oLat, oLon, dLat, dLon] = coords;
  if (oLat < -90 || oLat > 90 || dLat < -90 || dLat > 90) {
    console.warn('fetchRoute: latitude out of range');
    return null;
  }
  if (oLon < -180 || oLon > 180 || dLon < -180 || dLon > 180) {
    console.warn('fetchRoute: longitude out of range');
    return null;
  }

  try {
    const params = new URLSearchParams({
      origin_lat: oLat.toString(),
      origin_lon: oLon.toString(),
      dest_lat: dLat.toString(),
      dest_lon: dLon.toString(),
      profile,
      include_weather: includeWeather ? 'true' : 'false',
      include_pollution: includePollution ? 'true' : 'false',
    });
    if (demo) params.append('force_demo', 'true');
    if (originLabel) params.append('origin_label', originLabel);
    if (destinationLabel) params.append('destination_label', destinationLabel);

    const res = await fetch(`${API_BASE_URL}/route?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) return await res.json();

    // Graceful degradation — log but do not crash
    const body = await res.json().catch(() => ({}));
    console.warn(
      `fetchRoute: backend /route returned ${res.status}:`,
      body.detail || '(no detail)'
    );
    return null;
  } catch (err) {
    console.warn('fetchRoute: request failed:', err?.message || err);
    return null;
  }
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

// -------------------------------------------------------------
// Persistent Conversations API
// -------------------------------------------------------------

export async function listConversations(accessToken, { include_archived = false, query = '', limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (include_archived) params.append('include_archived', 'true');
  if (query) params.append('query', query);
  return profileRequest(`/conversations?${params.toString()}`, accessToken);
}

export async function createConversation(accessToken, { id = null, title = 'New Conversation', initial_messages = [], initial_message = null } = {}) {
  const body = { title };
  if (id) body.id = id;
  if (initial_message) body.initial_message = initial_message;
  if (Array.isArray(initial_messages) && initial_messages.length > 0) body.initial_messages = initial_messages;
  return profileRequest('/conversations', accessToken, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getConversation(accessToken, conversationId) {
  return profileRequest(`/conversations/${conversationId}`, accessToken);
}

export async function updateConversation(accessToken, conversationId, patch) {
  return profileRequest(`/conversations/${conversationId}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteConversation(accessToken, conversationId) {
  return profileRequest(`/conversations/${conversationId}`, accessToken, {
    method: 'DELETE',
  });
}

// -------------------------------------------------------------
// Long-Term Persistent Memory API
// -------------------------------------------------------------

export async function listMemories(accessToken, { status = null, category = null } = {}) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (category) params.append('category', category);
  const q = params.toString() ? `?${params.toString()}` : '';
  return profileRequest(`/memories${q}`, accessToken);
}

export async function createMemory(accessToken, memoryData) {
  const text = (memoryData.content || memoryData.fact || '').trim();
  const rawKey = (memoryData.key || '').trim();
  const derivedKey = rawKey || (text ? text.slice(0, 30).toLowerCase().replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') : 'user_fact') || 'user_fact';
  const payload = {
    category: memoryData.category || 'preference',
    content: text,
    fact: text,
    key: derivedKey,
    confidence: memoryData.confidence !== undefined ? memoryData.confidence : 1.0,
    status: memoryData.status || null,
    source_conversation_id: memoryData.source_conversation_id || null,
    is_sensitive: Boolean(memoryData.is_sensitive),
  };
  return profileRequest('/memories', accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateMemory(accessToken, memoryId, patch) {
  const payload = { ...patch };
  if (patch.fact && !patch.content) {
    payload.content = patch.fact;
  } else if (patch.content && !patch.fact) {
    payload.fact = patch.content;
  }
  return profileRequest(`/memories/${memoryId}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function approveMemory(accessToken, memoryId) {
  return profileRequest(`/memories/${memoryId}/approve`, accessToken, {
    method: 'POST',
  });
}

export async function deleteMemory(accessToken, memoryId) {
  return profileRequest(`/memories/${memoryId}`, accessToken, {
    method: 'DELETE',
  });
}

