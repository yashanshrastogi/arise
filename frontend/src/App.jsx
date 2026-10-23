import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import mockData from './mockData.json';
import mockDataModerate from './mockDataModerate.json';
import { fetchEnvironment, getUserProfile, updateUserProfile } from './api/client';
import WeatherCard from './components/WeatherCard';
import AirFlowCard from './components/AirFlowCard';
import SchoolCard from './components/SchoolCard';
import MobilityCard from './components/MobilityCard';
import CommuteRouteCard from './components/CommuteRouteCard';
import PollutantCards from './components/PollutantCards';
import Watchlist from './components/Watchlist';
import UserProfileMenu from './components/UserProfileMenu';
import VerdictHero from './components/VerdictHero';
import PersonaSelector from './components/PersonaSelector';
import AskBar from './components/AskBar';
import DataStatusPopover from './components/DataStatusPopover';
import InfoTooltip from './components/InfoTooltip';
import Footer from './components/Footer';

// Lazy-loaded non-critical boundaries & heavy libraries
const AirMap = lazy(() => import('./components/AirMap'));
const ForecastChart = lazy(() => import('./components/ForecastChart'));
const AskArise = lazy(() => import('./components/AskArise'));
const LoginPage = lazy(() => import('./components/LoginPage'));
const SignUpPage = lazy(() => import('./components/SignUpPage'));
const CompleteProfileModal = lazy(() => import('./components/CompleteProfileModal'));
const ProfileSettingsModal = lazy(() => import('./components/ProfileSettingsModal'));
const TechnicalGlossaryModal = lazy(() => import('./components/TechnicalGlossaryModal'));

function ForecastChartSkeleton() {
  return (
    <div
      className="card p-6 rounded-2xl border flex flex-col justify-between min-h-[562px] animate-pulse"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="h-5 w-48 bg-slate-200 dark:bg-slate-800 rounded"></div>
          <div className="h-3 w-36 bg-slate-100 dark:bg-slate-800/60 rounded mt-2"></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7 w-40 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
          <div className="h-7 w-24 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
        </div>
      </div>
      <div className="w-full h-[260px] sm:h-[300px] my-1 bg-slate-100 dark:bg-slate-900/50 rounded-xl flex items-center justify-center text-xs font-semibold tm">
        Loading 24-hour atmospheric trajectory...
      </div>
      <div className="mt-3 pt-3 border-t flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
        <div className="h-3 w-44 bg-slate-200 dark:bg-slate-800 rounded"></div>
        <div className="h-7 w-full bg-slate-100 dark:bg-slate-800/60 rounded-lg"></div>
      </div>
      <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <div className="h-4 w-64 bg-slate-200 dark:bg-slate-800 rounded"></div>
        <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded"></div>
      </div>
    </div>
  );
}

function MapSkeleton() {
  return (
    <div
      className="w-full h-full rounded-2xl border flex flex-col items-center justify-center animate-pulse"
      style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
    >
      <div className="text-3xl mb-2" aria-hidden="true">🗺️</div>
      <div className="text-sm font-bold t1">Loading Pan-India Atmospheric Map...</div>
      <div className="text-xs font-semibold tm mt-1">Initializing geospatial monitors &amp; telemetry</div>
    </div>
  );
}

function AskSkeleton() {
  return (
    <div className="w-full h-full min-h-[480px] rounded-2xl border p-6 flex flex-col items-center justify-center animate-pulse" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="text-3xl mb-2" aria-hidden="true">✨</div>
      <div className="text-sm font-bold t1">Loading Ask Arise...</div>
      <div className="text-xs font-semibold tm mt-1">Checking local air quality and weather conditions</div>
    </div>
  );
}

function AuthSkeleton() {
  return (
    <div className="card max-w-md w-full p-8 rounded-3xl border shadow-2xl flex flex-col items-center justify-center animate-pulse" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 mb-4"></div>
      <div className="h-5 w-36 bg-slate-200 dark:bg-slate-800 rounded mb-2"></div>
      <div className="h-3 w-56 bg-slate-100 dark:bg-slate-800 rounded"></div>
    </div>
  );
}
import { useAuth } from './auth/AuthContext';
import { reverseGeocode, forwardGeocode } from './utils/geoUtils';
import { formatKolkataTime, formatKolkataDate, formatKolkataShortDate, synchronizeForecastTimeline } from './utils/timeContext';
import { resolveInitialLocation, isInDelhiNcr, MAJOR_INDIAN_CITIES, resolvePersonaLocation } from './utils/locationState';
import {
  getSavedTheme,
  resolveEffectiveTheme,
  saveTheme,
  applyThemeToDocument,
  cycleTheme,
  listenToSystemTheme,
} from './utils/themeUtils';

/**
 * Arise — Global Environmental & Weather Intelligence
 * Clean, accessible, progressive disclosure architecture.
 */

const NAV_TABS = [
  { id: 'today', label: 'Today', icon: '🏠' },
  { id: 'map',   label: 'Map',   icon: '🗺️' },
  { id: 'ask',   label: 'Ask',   icon: '💬' },
  { id: 'more',  label: 'More',  icon: '⋯' },
];

export default function App() {
  const { isAuthenticated, accessToken } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'map' | 'ask' | 'more'
  const [userProfile, setUserProfile] = useState(() => {
    try {
      const cached = localStorage.getItem('arise_user_profile');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);

  const [persona, setPersona] = useState(() => {
    try {
      const cached = localStorage.getItem('arise_user_profile');
      if (cached) {
        const p = JSON.parse(cached);
        if (p?.pinned_personas && p.pinned_personas.length > 0) {
          return p.pinned_personas[0];
        }
        if (p?.persona) return p.persona;
      }
    } catch {}
    return 'General Public';
  });
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [healthTipsOpen, setHealthTipsOpen] = useState(false);
  const [themeMode, setThemeMode] = useState(() => getSavedTheme());
  const [dark, setDark] = useState(() => resolveEffectiveTheme(getSavedTheme()));
  const [largeText, setLargeText] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState(() => resolveInitialLocation(userProfile));
  const [envData, setEnvData] = useState(null);
  const [loadingEnv, setLoadingEnv] = useState(false);
  const [activeRouteGeometry, setActiveRouteGeometry] = useState(null);
  const [activeRouteWeatherPoints, setActiveRouteWeatherPoints] = useState(null);
  const [activeRoutePollutionPoints, setActiveRoutePollutionPoints] = useState(null);

  // Handle persona switching and dynamically load the corresponding saved profile location
  const handlePersonaChange = useCallback(async (newPersona, profileOverride = null) => {
    setPersona(newPersona);
    const profile = profileOverride !== null ? profileOverride : userProfile;
    if (!profile) return;

    const targetLoc = resolvePersonaLocation(newPersona, profile);

    if (targetLoc) {
      const lat = targetLoc.latitude;
      const lon = targetLoc.longitude;

      if (lat != null && lon != null && !isNaN(Number(lat)) && !isNaN(Number(lon))) {
        const nextCoord = {
          lat: Number(lat),
          lon: Number(lon),
          name: targetLoc.label
            ? (targetLoc.address ? `${targetLoc.label} · ${targetLoc.address}` : targetLoc.label)
            : (targetLoc.address || 'Saved Location'),
          city: targetLoc.city || '',
          district: targetLoc.district || '',
          region: targetLoc.region || (isInDelhiNcr(lat, lon) ? 'Delhi-NCR' : 'India'),
          source: `profile_${newPersona.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        };
        setSelectedCoords(nextCoord);
        try {
          localStorage.setItem('arise_selected_location', JSON.stringify(nextCoord));
        } catch {}
      } else if (targetLoc.address) {
        try {
          const geo = await forwardGeocode(targetLoc.address);
          if (geo && geo.lat != null && geo.lon != null) {
            const nextCoord = {
              lat: geo.lat,
              lon: geo.lon,
              name: targetLoc.label
                ? `${targetLoc.label} · ${geo.formattedAddress || targetLoc.address}`
                : (geo.formattedAddress || targetLoc.address),
              city: geo.city || targetLoc.city || '',
              district: geo.district || targetLoc.district || '',
              region: geo.region || targetLoc.region || (isInDelhiNcr(geo.lat, geo.lon) ? 'Delhi-NCR' : 'India'),
              source: `profile_${newPersona.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
            };
            setSelectedCoords(nextCoord);
            try {
              localStorage.setItem('arise_selected_location', JSON.stringify(nextCoord));
            } catch {}
          }
        } catch (err) {
          console.warn('Unable to geocode target profile address on persona change:', err);
        }
      }
    }
  }, [userProfile]);

  // Handle pin/unpin toggle from PersonaSelector. Persists to localStorage immediately;
  // optionally syncs to cloud profile if authenticated.
  const handlePinToggle = useCallback((nextPinned) => {
    setUserProfile((prev) => {
      const updated = { ...prev, pinned_personas: nextPinned };
      try {
        localStorage.setItem('arise_user_profile', JSON.stringify(updated));
      } catch {}
      // Fire-and-forget cloud sync for authenticated users
      if (accessToken) {
        updateUserProfile(accessToken, { pinned_personas: nextPinned }).catch((err) => {
          console.warn('Pinned personas cloud sync skipped:', err.message);
        });
      }
      return updated;
    });
  }, [accessToken]);

  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationDetectionMessage, setLocationDetectionMessage] = useState(null);

  // High-accuracy device geolocation resolution
  const handleDetectCurrentLocation = useCallback((isSilent = false) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      if (!isSilent) {
        setLocationDetectionMessage({
          type: 'error',
          text: 'Geolocation is not supported by your browser.',
        });
        setTimeout(() => setLocationDetectionMessage(null), 5000);
      }
      return;
    }

    if (!isSilent) {
      setIsDetectingLocation(true);
      setLocationDetectionMessage({
        type: 'info',
        text: 'Acquiring high-accuracy GPS coordinates…',
      });
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const accuracy = position.coords.accuracy ? Math.round(position.coords.accuracy) : null;

        try {
          const geo = await reverseGeocode(lat, lon);
          const isNcr = isInDelhiNcr(lat, lon);
          const locationName = geo?.formattedLocation || geo?.stationName || (geo?.city ? `${geo.city}` : `GPS (${lat.toFixed(4)}, ${lon.toFixed(4)})`);

          const nextLocation = {
            lat,
            lon,
            name: locationName,
            city: geo?.city || (isNcr ? 'NCR' : ''),
            district: geo?.district || '',
            region: geo?.region || (isNcr ? 'National Capital Region' : 'Global'),
            source: 'device',
            accuracy,
            updatedAt: new Date().toISOString(),
          };

          setSelectedCoords(nextLocation);
          try {
            localStorage.setItem('arise_selected_location', JSON.stringify(nextLocation));
            localStorage.setItem('arise_last_detected_location', JSON.stringify(nextLocation));
          } catch {}

          if (!isSilent) {
            setLocationDetectionMessage({
              type: 'success',
              text: `Updated to ${locationName}${accuracy ? ` (±${accuracy}m)` : ''}`,
            });
            setTimeout(() => setLocationDetectionMessage(null), 4000);
          }
        } catch (err) {
          console.warn('Reverse geocode failed on location detect:', err);
          const isNcr = isInDelhiNcr(lat, lon);
          const fallbackName = `Current Location (${lat.toFixed(3)}, ${lon.toFixed(3)})`;
          const nextLocation = {
            lat,
            lon,
            name: fallbackName,
            city: isNcr ? 'NCR' : '',
            district: '',
            region: isNcr ? 'National Capital Region' : 'Global',
            source: 'device',
            accuracy,
            updatedAt: new Date().toISOString(),
          };
          setSelectedCoords(nextLocation);
          try {
            localStorage.setItem('arise_selected_location', JSON.stringify(nextLocation));
          } catch {}
          if (!isSilent) {
            setLocationDetectionMessage({
              type: 'success',
              text: `GPS coordinates locked (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
            });
            setTimeout(() => setLocationDetectionMessage(null), 4000);
          }
        } finally {
          setIsDetectingLocation(false);
        }
      },
      (err) => {
        setIsDetectingLocation(false);
        if (!isSilent) {
          let errText = 'Location access permission was denied or unavailable.';
          if (err.code === 1) {
            errText = 'Location permission denied. Please allow location access in your browser.';
          } else if (err.code === 2) {
            errText = 'GPS position unavailable. Check your device location settings.';
          } else if (err.code === 3) {
            errText = 'Location request timed out. Please try tapping Update Location again.';
          }
          setLocationDetectionMessage({
            type: 'error',
            text: errText,
          });
          setTimeout(() => setLocationDetectionMessage(null), 6000);
        } else {
          console.info('Background geolocation check:', err?.message || 'unavailable');
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }, []);

  // Automatic device geolocation resolution on startup & background periodic refresh
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;

    // Check if user has an explicit custom saved non-default location
    let shouldCheckOnStartup = true;
    try {
      const saved = localStorage.getItem('arise_selected_location');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only skip if the user explicitly chose a custom place (not default fallback or device)
        if (parsed.source && parsed.source !== 'default' && parsed.source !== 'device') {
          shouldCheckOnStartup = false;
        }
      }
    } catch {}

    if (shouldCheckOnStartup) {
      handleDetectCurrentLocation(true);
    }

    // Regularly run automatic background location detection (every 5 minutes)
    const intervalTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        handleDetectCurrentLocation(true);
      }
    }, 300000);

    // Re-check when user focuses or returns to the tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleDetectCurrentLocation(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleDetectCurrentLocation]);

  // Live formatted Day, Date, Time (updating every second)
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dayDate = formatKolkataDate(currentDateTime);
  const liveTime = formatKolkataTime(currentDateTime);
  const shortDayDate = formatKolkataShortDate(currentDateTime);

  // System theme synchronization & mode change
  useEffect(() => {
    const isDark = resolveEffectiveTheme(themeMode);
    setDark(isDark);
    applyThemeToDocument(isDark);

    if (themeMode === 'system') {
      const cleanup = listenToSystemTheme((matchesDark) => {
        setDark(matchesDark);
        applyThemeToDocument(matchesDark);
      });
      return cleanup;
    }
  }, [themeMode]);

  const handleThemeToggle = () => {
    const nextMode = cycleTheme(themeMode, dark);
    setThemeMode(nextMode);
    saveTheme(nextMode);
    const nextIsDark = resolveEffectiveTheme(nextMode);
    setDark(nextIsDark);
    applyThemeToDocument(nextIsDark);
  };

  // A+ Font Size Toggle sync (sets root font-size to 125%)
  useEffect(() => {
    if (largeText) {
      document.documentElement.setAttribute('data-text-large', 'true');
    } else {
      document.documentElement.removeAttribute('data-text-large');
    }
  }, [largeText]);

  // Escape key listener for health tips modal
  useEffect(() => {
    if (!healthTipsOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setHealthTipsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [healthTipsOpen]);

  // Escape key listener for auth modal overlay
  useEffect(() => {
    if (currentView !== 'login' && currentView !== 'signup') return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleCloseAuth();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, activeTab]);

  // Hash routing (#/login, #/signup, #/today, #/map, #/ask, #/more)
  useEffect(() => {
    const handleHash = () => {
      const raw = window.location.hash || '';
      const clean = raw.replace(/^#\/?/, '').toLowerCase().trim();
      if (clean === 'login') {
        setCurrentView('login');
        setProfileSettingsOpen(false);
      } else if (clean === 'signup') {
        setCurrentView('signup');
        setProfileSettingsOpen(false);
      } else if (clean === 'profile' || clean === 'settings') {
        setCurrentView('dashboard');
        setProfileSettingsOpen(true);
      } else {
        setCurrentView('dashboard');
        setProfileSettingsOpen(false);
        if (clean === 'map') {
          setActiveTab('map');
        } else if (clean === 'ask') {
          setActiveTab('ask');
        } else if (clean === 'more') {
          setActiveTab('more');
        } else if (clean === 'today' || clean === 'dashboard') {
          setActiveTab('today');
        }
      }
    };

    window.addEventListener('hashchange', handleHash);
    handleHash();
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (currentView !== 'dashboard') {
      setCurrentView('dashboard');
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    const targetHash = `#/${tabId}`;
    if (window.location.hash !== targetHash) {
      try {
        window.history.pushState(null, '', targetHash);
      } catch {
        window.location.hash = targetHash;
      }
    }
  };

const KNOWN_COORDS = {
  'saket': { lat: 28.524, lon: 77.206 },
  'vasant kunj': { lat: 28.529, lon: 77.154 },
  'connaught': { lat: 28.631, lon: 77.219 },
  'cp': { lat: 28.631, lon: 77.219 },
  'anand vihar': { lat: 28.647, lon: 77.316 },
  'ito': { lat: 28.629, lon: 77.241 },
  'rohini': { lat: 28.749, lon: 77.067 },
  'noida': { lat: 28.572, lon: 77.355 },
  'gurugram': { lat: 28.459, lon: 77.026 },
  'gurgaon': { lat: 28.459, lon: 77.026 },
  'greater kailash': { lat: 28.548, lon: 77.234 },
  'gk': { lat: 28.548, lon: 77.234 },
  'dwarka': { lat: 28.592, lon: 77.046 },
  'nehru place': { lat: 28.549, lon: 77.253 },
  'lajpat nagar': { lat: 28.570, lon: 77.243 },
};

  // Fetch authenticated profile
  useEffect(() => {
    let active = true;
    if (isAuthenticated && accessToken) {
      getUserProfile(accessToken)
        .then((profile) => {
          if (!active) return;
          if (profile) {
            setUserProfile(profile);
            try {
              localStorage.setItem('arise_user_profile', JSON.stringify(profile));
            } catch {}
            setNeedsProfileCompletion(false);
            const priorityPersona = (profile.pinned_personas && profile.pinned_personas.length > 0)
              ? profile.pinned_personas[0]
              : profile.persona;
            if (priorityPersona) {
              handlePersonaChange(priorityPersona, profile);
            }
          } else {
            setNeedsProfileCompletion(true);
          }
        })
        .catch(() => {
          if (active) setNeedsProfileCompletion(true);
        });
    } else {
      setUserProfile(null);
      setNeedsProfileCompletion(false);
      try {
        localStorage.removeItem('arise_user_profile');
      } catch {}
    }
    return () => { active = false; };
  }, [isAuthenticated, accessToken]);

  // Fetch telemetry from live API with request cancellation on location change
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function loadData() {
      setLoadingEnv(true);
      try {
        const payload = await fetchEnvironment({
          lat: selectedCoords.lat,
          lon: selectedCoords.lon,
          location_name: selectedCoords.name || selectedCoords.city,
          persona,
          demo: demoMode,
          signal: controller.signal,
        });
        if (active && payload) {
          setEnvData(payload);
          // If selectedCoords.name is generic coords and no resolved city, sync to payload.location
          if (payload.location && (!selectedCoords.name || selectedCoords.name.includes('°')) && !selectedCoords.city) {
            setSelectedCoords(prev => ({ ...prev, name: payload.location }));
          }
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          // Fall back gracefully
        }
      } finally {
        if (active) setLoadingEnv(false);
      }
    }
    loadData();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedCoords.lat, selectedCoords.lon, persona, demoMode]);

  // Synchronize document title dynamically with active location (strictly location-neutral / global-first)
  useEffect(() => {
    let loc = selectedCoords?.city || selectedCoords?.district || selectedCoords?.name || selectedCoords?.region;
    // Strip or sanitize any Delhi keyword to honor global-first positioning
    if (loc && typeof loc === 'string') {
      const sanitized = loc.replace(/\b(new\s+)?delhi(-ncr)?\b/gi, '').replace(/,\s*,/g, ',').trim().replace(/^,\s*|,\s*$/g, '');
      if (sanitized && !sanitized.includes('°') && sanitized !== 'Device Location' && sanitized !== 'Selected Area' && sanitized !== 'NCR' && sanitized !== 'National Capital Region') {
        document.title = `Arise · Air Quality & Weather in ${sanitized}`;
        return;
      }
    }
    document.title = 'Arise · Global Environmental & Weather Intelligence';
  }, [selectedCoords?.city, selectedCoords?.district, selectedCoords?.name, selectedCoords?.region]);

  // Merge live backend data with fallback state without leaking Delhi stations into non-Delhi views
  const fallbackData = demoMode ? mockData : mockDataModerate;
  const isSelectedNcr = isInDelhiNcr(selectedCoords.lat, selectedCoords.lon);
  const rawD = envData ? {
    ...fallbackData,
    ...envData,
    stations: envData.stations !== undefined ? envData.stations : (isSelectedNcr ? fallbackData.stations : []),
  } : (isSelectedNcr ? fallbackData : { ...fallbackData, stations: [] });
  const hasLiveFires = Boolean(rawD?.fires?.some(f => !f.isDemo && f.source === 'NASA-FIRMS'));

  // Synchronize forecast timeline and recommendations with local location clock
  const timelineAqi = (rawD?.aqi != null && !Number.isNaN(Number(rawD.aqi))) ? Number(rawD.aqi) : null;
  const targetTz = rawD?.weather?.local_timezone || rawD?.local_timezone || 'Asia/Kolkata';
  const synchronizedTimeline = useMemo(() => {
    return synchronizeForecastTimeline(rawD?.forecast || [], timelineAqi, currentDateTime, targetTz);
  }, [rawD?.forecast, timelineAqi, currentDateTime, targetTz]);

  const d = useMemo(() => {
    return {
      ...rawD,
      forecast: synchronizedTimeline.synchronizedForecast,
      bestWindow: synchronizedTimeline.hasRealBestWindow
        ? synchronizedTimeline.bestWindowStr
        : (synchronizedTimeline.hasModelWindow ? synchronizedTimeline.modelWindowStr : rawD.bestWindow),
      bestWindowDetails: {
        ...(rawD.bestWindowDetails || {}),
        window_str: synchronizedTimeline.hasRealBestWindow
          ? synchronizedTimeline.bestWindowStr
          : (synchronizedTimeline.hasModelWindow ? synchronizedTimeline.modelWindowStr : 'No recommended outdoor window'),
        status: synchronizedTimeline.windowStatus,
      },
    };
  }, [rawD, synchronizedTimeline]);

  // Personalize Watchlist using saved Home, School, Work, and Parent locations
  const personalizedWatchlist = useMemo(() => {
    const list = [];

    const resolveCoords = (loc) => {
      let lat = loc?.latitude != null && !Number.isNaN(Number(loc.latitude)) ? Number(loc.latitude) : null;
      let lon = loc?.longitude != null && !Number.isNaN(Number(loc.longitude)) ? Number(loc.longitude) : null;
      if (lat == null || lon == null) {
        const text = `${loc?.address || ''} ${loc?.label || ''}`.toLowerCase();
        const matched = Object.entries(KNOWN_COORDS).find(([k]) => text.includes(k));
        if (matched) {
          lat = matched[1].lat;
          lon = matched[1].lon;
        } else if (selectedCoords?.lat != null && selectedCoords?.lon != null) {
          lat = selectedCoords.lat;
          lon = selectedCoords.lon;
        }
      }
      return { lat, lon };
    };

    const currentAqi = d?.aqi != null ? d.aqi : null;
    const currentStatus = d?.status || (currentAqi != null
      ? (currentAqi > 300 ? 'Very Poor' : (currentAqi > 200 ? 'Poor' : (currentAqi > 100 ? 'Moderate' : 'Good')))
      : 'Unavailable');

    if (userProfile?.home_location && (userProfile.home_location.address || userProfile.home_location.latitude != null)) {
      const { lat, lon } = resolveCoords(userProfile.home_location);
      if (lat != null && lon != null) {
        list.push({
          name: userProfile.home_location.label || 'Home',
          location: userProfile.home_location.address || `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`,
          lat,
          lon,
          aqi: currentAqi,
          status: currentStatus,
          updated: 'Personal Location',
        });
      }
    }

    if (userProfile?.school_location && (userProfile.school_location.address || userProfile.school_location.latitude != null)) {
      const { lat, lon } = resolveCoords(userProfile.school_location);
      if (lat != null && lon != null) {
        list.push({
          name: userProfile.school_location.label || 'School',
          location: userProfile.school_location.address || `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`,
          lat,
          lon,
          aqi: currentAqi,
          status: currentStatus,
          updated: 'Saved',
        });
      }
    }

    if (userProfile?.work_location && (userProfile.work_location.address || userProfile.work_location.latitude != null)) {
      const { lat, lon } = resolveCoords(userProfile.work_location);
      if (lat != null && lon != null) {
        list.push({
          name: userProfile.work_location.label || 'Work',
          location: userProfile.work_location.address || `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`,
          lat,
          lon,
          aqi: currentAqi,
          status: currentStatus,
          updated: 'Saved',
        });
      }
    }

    if (userProfile?.parent_location && (userProfile.parent_location.address || userProfile.parent_location.latitude != null)) {
      const { lat, lon } = resolveCoords(userProfile.parent_location);
      if (lat != null && lon != null) {
        list.push({
          name: userProfile.parent_location.label || "Parent's Home",
          location: userProfile.parent_location.address || `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`,
          lat,
          lon,
          aqi: currentAqi,
          status: currentStatus,
          updated: 'Family',
        });
      }
    }

    // Only return saved personal locations for authenticated users; never show fake saved places for guests
    if (isAuthenticated && list.length > 0) {
      return list;
    }

    return [];
  }, [isAuthenticated, userProfile, d?.aqi, d?.status]);

  const commuteCoords = useMemo(() => {
    const resolveCoords = (loc) => {
      let lat = loc?.latitude != null && !Number.isNaN(Number(loc.latitude)) ? Number(loc.latitude) : null;
      let lon = loc?.longitude != null && !Number.isNaN(Number(loc.longitude)) ? Number(loc.longitude) : null;
      if (lat == null || lon == null) {
        const text = `${loc?.address || ''} ${loc?.label || ''}`.toLowerCase();
        const matched = Object.entries(KNOWN_COORDS).find(([k]) => text.includes(k));
        if (matched) {
          lat = matched[1].lat;
          lon = matched[1].lon;
        }
      }
      return { lat, lon };
    };

    if (userProfile?.home_location && userProfile?.work_location) {
      const home = resolveCoords(userProfile.home_location);
      const work = resolveCoords(userProfile.work_location);
      if (home.lat != null && home.lon != null && work.lat != null && work.lon != null) {
        return {
          originLat: home.lat,
          originLon: home.lon,
          originLabel: userProfile.home_location.label || 'Home',
          destLat: work.lat,
          destLon: work.lon,
          destinationLabel: userProfile.work_location.label || 'Work',
        };
      }
    }

    return null;
  }, [userProfile?.home_location, userProfile?.work_location]);

  const handleCloseAuth = () => {
    setCurrentView('dashboard');
    const targetHash = `#/${activeTab}`;
    if (window.location.hash !== targetHash) {
      try {
        window.history.pushState(null, '', targetHash);
      } catch {
        window.location.hash = targetHash;
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-180" style={{ background: 'var(--bg)' }}>
      {/* ═══════════════ SLIM ADAPTIVE HEADER (64px) ═══════════════ */}
      <header
        className="sticky top-0 z-[2000] px-3.5 sm:px-6 h-16 shrink-0 border-b backdrop-blur-md transition-colors flex items-center"
        style={{
          borderColor: 'var(--border)',
          background: dark ? 'rgba(19, 26, 46, 0.92)' : 'rgba(255, 255, 255, 0.92)',
        }}
      >
        <div className="responsive-container flex items-center justify-between gap-3">
          {/* Logo & Headline */}
          <a
            href="#today"
            onClick={(e) => {
              e.preventDefault();
              handleTabChange('today');
            }}
            className="flex items-center gap-2.5 select-none cursor-pointer group flex-shrink-0"
            title="Arise · Is the air safe today?"
          >
            <img
              src="/icon.png"
              alt="Arise Icon"
              className="w-9 h-9 rounded-xl object-contain shadow-xs transition-transform group-hover:scale-105"
            />
            <div className="flex flex-col justify-center">
              <span className="text-xl font-black tracking-tight t1 leading-tight">
                Arise
              </span>
              <h1 className="text-[11px] font-bold tm sr-only sm:not-sr-only sm:block -mt-0.5">
                Is the air safe today?
              </h1>
            </div>
          </a>

          {/* Desktop & Tablet Navigation Tabs (Hidden on mobile <md) */}
          <nav
            className="hidden md:flex items-center gap-1 p-1 rounded-xl border bg-[var(--surface-alt)] shadow-xs"
            style={{ borderColor: 'var(--border)' }}
            role="tablist"
            aria-label="Main Navigation"
          >
            {NAV_TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`tabpanel-${tab.id}`}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all touch-target ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 't3 hover:t1 hover:bg-[var(--border-subtle)]'
                  }`}
                >
                  <span aria-hidden="true">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Controls: A+, Dark Mode, User Profile */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Live Day, Date & Time indicator (normal on other pages, featured on homepage) */}
            <div
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border bg-[var(--surface-alt)] text-xs font-bold tm shadow-2xs"
              style={{ borderColor: 'var(--border)' }}
              title="Live Indian Standard Time (IST)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{shortDayDate}</span>
              <span className="opacity-40">·</span>
              <span className="font-extrabold t1">{liveTime}</span>
            </div>

            {/* A+ Font Size Toggle */}
            <button
              id="btn-font-large-toggle"
              type="button"
              onClick={() => setLargeText(!largeText)}
              aria-pressed={largeText}
              aria-label="Toggle larger text size"
              className={`px-2.5 py-1 rounded-xl text-xs font-black border transition-colors touch-target ${
                largeText
                  ? 'bg-indigo-600 text-white'
                  : 't2 hover:bg-[var(--surface-alt)] border'
              }`}
              style={{ borderColor: largeText ? 'transparent' : 'var(--border)' }}
              title="A+ Larger Text Mode"
            >
              A+
            </button>

            {/* Theme Toggle (System / Light / Dark) */}
            <button
              id="btn-theme-toggle"
              type="button"
              onClick={handleThemeToggle}
              aria-label={`Theme: ${themeMode} (${dark ? 'Dark' : 'Light'})`}
              title={
                themeMode === 'system'
                  ? `Theme: System (Auto · ${dark ? 'Dark' : 'Light'} active) — Click to cycle`
                  : `Theme: ${themeMode === 'dark' ? 'Dark' : 'Light'} (Manual) — Click to cycle`
              }
              className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold border transition-colors hover:bg-[var(--surface-alt)] touch-target cursor-pointer"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            >
              {dark ? '☀️' : '🌙'}
            </button>

            {/* User Profile Menu */}
            <UserProfileMenu
              userProfile={userProfile}
              onNavigateAuth={(v) => {
                setCurrentView(v);
                window.location.hash = '#/' + v;
              }}
              onProfileUpdated={(p) => setUserProfile(p)}
              onOpenProfile={() => setProfileSettingsOpen(true)}
            />
          </div>
        </div>
      </header>

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <main
        className={`flex-1 w-full flex flex-col min-h-0 ${
          activeTab === 'ask'
            ? 'p-2 sm:p-3 md:p-3.5 pb-20 md:pb-8'
            : 'px-3.5 sm:px-6 py-4 sm:py-6 pb-24 md:pb-8 items-center'
        }`}
      >
        {/* ── TAB 1: TODAY (Core "Can I go out?" Intelligence) ── */}
        {activeTab === 'today' && (
          <div role="tabpanel" id="tabpanel-today" aria-labelledby="tab-today" className="w-full responsive-container space-y-5 sm:space-y-6">
            {/* Persona Selector ("Who are you checking for?") */}
            <PersonaSelector
              currentPersona={persona}
              onSelectPersona={(p) => handlePersonaChange(p)}
              isAuthenticated={isAuthenticated}
              userProfile={userProfile}
              onOpenCustomize={() => setProfileSettingsOpen(true)}
              onPinToggle={handlePinToggle}
            />

            {/* Primary Severity & Weather Row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6">
              <div className="md:col-span-12 lg:col-span-5 flex flex-col">
                <VerdictHero
                  aqi={d.aqi}
                  locationName={selectedCoords.name}
                  city={selectedCoords.city}
                  district={selectedCoords.district}
                  region={selectedCoords.region}
                  lat={selectedCoords.lat}
                  lon={selectedCoords.lon}
                  forecast={d.forecast}
                  recheckAt={d.recheckAt}
                  persona={persona}
                  isLoading={loadingEnv}
                  onOpenAdvisory={() => setHealthTipsOpen(true)}
                  onOpenMap={() => handleTabChange('map')}
                  liveDateTime={{ dayDate, liveTime, shortDayDate }}
                  bestWindowDetails={d.bestWindowDetails}
                  locationSource={selectedCoords.source || (selectedCoords.name?.includes('Mandir Marg') ? 'default' : 'manual')}
                  onDetectLocation={() => handleDetectCurrentLocation(false)}
                  isDetectingLocation={isDetectingLocation}
                  detectionMessage={locationDetectionMessage}
                />
              </div>
              <div className="md:col-span-6 lg:col-span-4 flex flex-col">
                <WeatherCard weather={d.weather} aqi={d.aqi} />
              </div>
              <div className="md:col-span-6 lg:col-span-3 flex flex-col">
                <AirFlowCard
                  speed={d.weather?.windSpeed != null ? String(d.weather.windSpeed) : (demoMode ? "3.2" : "8.5")}
                  unit="km/h"
                  direction={d.weather?.windDirection || (demoMode ? "NW" : "WNW")}
                  degrees={d.weather?.windDegrees != null ? d.weather.windDegrees : (demoMode ? 315 : 290)}
                />
              </div>
            </div>

            {/* Single Ask Arise Box with Quick Chips */}
            <AskBar
              lat={selectedCoords.lat}
              lon={selectedCoords.lon}
              persona={persona}
              demo={demoMode}
              onOpenFullChat={() => handleTabChange('ask')}
            />

            {/* Forecast Horizon Chart */}
            <Suspense fallback={<ForecastChartSkeleton />}>
              <ForecastChart
                data={d.forecast}
                data7Day={d.forecast7Day}
                currentAqi={d.aqi}
                location={selectedCoords.city || selectedCoords.district || selectedCoords.name || selectedCoords.region || 'Your Location'}
              />
            </Suspense>

            {/* School Safety & Travel Corridors */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              <SchoolCard data={d.school} />
              <MobilityCard corridors={d.traffic?.corridors} onOpenMap={() => handleTabChange('map')} />
              <div
                className="card p-5 sm:p-6 flex flex-col justify-between rounded-2xl border shadow-sm"
                style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl" aria-hidden="true">📍</span>
                      <h3 className="text-base font-black t1">My places</h3>
                    </div>
                  </div>
                  <Watchlist
                    items={personalizedWatchlist}
                    isGuest={!isAuthenticated}
                    onSelect={async (lat, lon, name) => {
                      let meta = null;
                      try {
                        meta = await reverseGeocode(lat, lon);
                      } catch {}
                      const isNcr = isInDelhiNcr(lat, lon);
                      const newLoc = {
                        lat,
                        lon,
                        name,
                        city: meta?.city || '',
                        district: meta?.district || '',
                        region: meta?.region || name || (isNcr ? 'National Capital Region' : 'Global'),
                        source: 'saved',
                      };
                      try {
                        localStorage.setItem('arise_selected_location', JSON.stringify(newLoc));
                      } catch {}
                      setSelectedCoords(newLoc);
                    }}
                    onOpenSaveLocations={() => {
                      setProfileSettingsOpen(true);
                    }}
                  />
                </div>
                {/* Quick Alert Setting */}
                <div className="mt-3 p-3.5 rounded-2xl border" style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between text-xs sm:text-sm font-black t1 mb-1">
                    <span className="flex items-center gap-1.5">
                      <span>Severe Air Alert Threshold</span>
                      <InfoTooltip
                        title="Severe Air Alert Threshold (AQI > 300)"
                        explanation="Alert threshold triggered when AQI exceeds 300. At this level, air pollution causes acute respiratory irritation even in healthy adults. Wearing N95 masks outdoors and sealing indoor spaces is strongly recommended."
                      />
                    </span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-black">AQI &gt; 300</span>
                  </div>
                  <p className="text-xs font-medium tm leading-relaxed">
                    {userProfile?.alerts_enabled
                      ? 'Personal alerts enabled for saved locations.'
                      : `Alerts active for critical ${selectedCoords.city || selectedCoords.district || selectedCoords.region || 'local'} air zones.`}
                  </p>
                </div>
              </div>
            </div>

            {/* Commute Route Card */}
            <CommuteRouteCard
              originLat={commuteCoords?.originLat}
              originLon={commuteCoords?.originLon}
              destLat={commuteCoords?.destLat}
              destLon={commuteCoords?.destLon}
              originLabel={commuteCoords?.originLabel || 'Home'}
              destinationLabel={commuteCoords?.destinationLabel || 'Work'}
              isRouteActive={!!activeRouteGeometry}
              onShowOnMap={(geometry, bbox, weatherPoints, pollutionPoints) => {
                setActiveRouteGeometry(geometry);
                setActiveRouteWeatherPoints(weatherPoints || null);
                setActiveRoutePollutionPoints(pollutionPoints || null);
                handleTabChange('map');
              }}
              onClearFromMap={() => {
                setActiveRouteGeometry(null);
                setActiveRouteWeatherPoints(null);
                setActiveRoutePollutionPoints(null);
              }}
              onOpenMap={() => handleTabChange('map')}
              onConfigureLocations={() => setProfileSettingsOpen(true)}
            />

            {/* Pollutant Cards */}
            <PollutantCards pollutants={d.pollutants} />

            {/* Meta & Navigation Utility Strip */}
            <div className="pt-4 border-t flex flex-wrap items-center justify-between gap-3 text-xs" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2.5">
                <DataStatusPopover hasLiveFires={hasLiveFires} placement="top" align="left" />
                <button
                  type="button"
                  id="btn-open-glossary"
                  onClick={() => setGlossaryOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border t2 hover:t1 hover:bg-[var(--surface-alt)] transition-colors font-bold touch-target shadow-2xs cursor-pointer"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                >
                  <span aria-hidden="true">📖</span>
                  <span>Glossary</span>
                </button>
              </div>
            </div>

            {/* Global Professional Footer */}
            <Footer onNavigate={handleTabChange} onOpenGlossary={() => setGlossaryOpen(true)} />
          </div>
        )}

        {/* ── TAB 2: MAP (Interactive Air Quality & Telemetry Map) ── */}
        {activeTab === 'map' && (
          <div role="tabpanel" id="tabpanel-map" aria-labelledby="tab-map" className="w-full responsive-container space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black t1">Air Quality &amp; Fire Map</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-map-back-to-today"
                  onClick={() => handleTabChange('today')}
                  className="px-3 py-1.5 rounded-xl border text-xs font-black t2 hover:t1 hover:bg-[var(--surface-alt)] transition-colors flex items-center gap-1.5 shadow-xs touch-target"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span>←</span>
                  <span>Back to Today</span>
                </button>
                <DataStatusPopover hasLiveFires={hasLiveFires} placement="bottom" align="right" />
              </div>
            </div>
            <div className="w-full h-[clamp(420px,calc(100dvh-13rem),780px)] rounded-2xl overflow-hidden card" style={{ background: 'var(--card)' }}>
              <Suspense fallback={<MapSkeleton />}>
                <AirMap
                  stations={d.stations}
                  fires={d.fires}
                  weather={d.weather}
                  traffic={d.traffic}
                  nationalHubs={d.nationalHubs}
                  dark={dark}
                  center={selectedCoords}
                  selectedCoords={selectedCoords}
                  routeGeometry={activeRouteGeometry}
                  routeWeatherPoints={activeRouteWeatherPoints}
                  routePollutionPoints={activeRoutePollutionPoints}
                  onClearRoute={() => {
                    setActiveRouteGeometry(null);
                    setActiveRouteWeatherPoints(null);
                    setActiveRoutePollutionPoints(null);
                  }}
                  fullHeight={true}
                  onLocationSelect={(lat, lon, name, meta) => {
                    const isNcr = isInDelhiNcr(lat, lon);
                    const newLoc = {
                      lat,
                      lon,
                      name: name || 'Selected Area',
                      city: meta?.city || '',
                      district: meta?.district || '',
                      region: meta?.region || name || (isNcr ? 'National Capital Region' : 'Global'),
                      source: 'map_select',
                    };
                    try {
                      localStorage.setItem('arise_selected_location', JSON.stringify(newLoc));
                    } catch {}
                    setSelectedCoords(newLoc);
                  }}
                  onSwitchToToday={() => handleTabChange('today')}
                />
              </Suspense>
            </div>

            {/* Global Professional Footer */}
            <Footer onNavigate={handleTabChange} onOpenGlossary={() => setGlossaryOpen(true)} />
          </div>
        )}

        {/* ── TAB 3: ASK (Ask Arise Dedicated Interface) ── */}
        {activeTab === 'ask' && (
          <div role="tabpanel" id="tabpanel-ask" aria-labelledby="tab-ask" className="w-full flex flex-col flex-1 min-h-0">
            <div className="w-full h-[clamp(540px,calc(100dvh-5.5rem),900px)] xl:h-[calc(100dvh-5.5rem)] flex flex-col shrink-0">
              <Suspense fallback={<AskSkeleton />}>
                <AskArise
                  lat={selectedCoords.lat}
                  lon={selectedCoords.lon}
                  demo={demoMode}
                  persona={persona}
                  locationName={selectedCoords.city || selectedCoords.district || selectedCoords.name || selectedCoords.region || 'Your Location'}
                  userProfile={userProfile}
                  environmentalContext={{
                    aqi: d?.aqi,
                    category: d?.status || d?.verdict?.category,
                    verdict: d?.verdict,
                    dominant_pollutant: d?.dominantPollutant || 'PM2.5',
                    weather: d?.weather ? `${d.weather.temp}°C, ${d.weather.condition}, wind ${d.weather.windSpeed} km/h ${d.weather.windDirection}` : null,
                    best_window: d?.bestWindow,
                    school_directive: d?.school?.action ? `${d.school.action}: ${d.school.action === 'CANCEL' ? 'Indoor only' : 'Limit outdoor sports'}` : null,
                  }}
                />
              </Suspense>
            </div>

            {/* Global Professional Footer */}
            <Footer onNavigate={handleTabChange} onOpenGlossary={() => setGlossaryOpen(true)} />
          </div>
        )}

        {/* ── TAB 4: MORE (School, Travel & My Places) ── */}
        {activeTab === 'more' && (
          <div role="tabpanel" id="tabpanel-more" aria-labelledby="tab-more" className="w-full responsive-container space-y-5 sm:space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h2 className="text-xl sm:text-2xl font-black t1">Regional Life, School &amp; Travel Guides</h2>
                <p className="text-xs sm:text-sm font-semibold tm mt-1">
                  School sports advisories, personal saved monitors, and live arterial mobility corridors.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              <SchoolCard data={d.school} />
              <div className="card p-5 sm:p-6 flex flex-col justify-between" style={{ background: 'var(--card)' }}>
                <div>
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl" aria-hidden="true">📍</span>
                      <div>
                        <h3 className="text-base font-black t1">My places</h3>
                        <p className="text-xs font-semibold tm">Monitored home, work, and family locations</p>
                      </div>
                    </div>
                  </div>
                  <Watchlist
                    items={personalizedWatchlist}
                    isGuest={!isAuthenticated}
                    onSelect={async (lat, lon, name) => {
                      let meta = null;
                      try {
                        meta = await reverseGeocode(lat, lon);
                      } catch {}
                      setSelectedCoords({
                        lat,
                        lon,
                        name,
                        city: meta?.city || '',
                        district: meta?.district || '',
                        region: meta?.region || name || (isInDelhiNcr(lat, lon) ? 'National Capital Region' : 'Global'),
                      });
                      handleTabChange('today');
                    }}
                    onOpenMap={() => handleTabChange('map')}
                    onOpenSaveLocations={() => {
                      setProfileSettingsOpen(true);
                    }}
                  />
                </div>
              </div>
              <MobilityCard corridors={d.traffic?.corridors} onOpenMap={() => handleTabChange('map')} />
            </div>

            {/* Global Professional Footer */}
            <Footer onNavigate={handleTabChange} onOpenGlossary={() => setGlossaryOpen(true)} />
          </div>
        )}
      </main>

      {/* ═══════════════ MOBILE BOTTOM NAVIGATION BAR (<md) ═══════════════ */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-[2000] border-t backdrop-blur-md transition-colors safe-bottom-nav flex items-center justify-around px-2 py-1 shadow-lg"
        style={{
          borderColor: 'var(--border)',
          background: dark ? 'rgba(19, 26, 46, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        }}
        role="tablist"
        aria-label="Mobile Navigation"
      >
        {NAV_TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`mobile-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => handleTabChange(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-2 rounded-xl text-[11px] font-black transition-all touch-target select-none ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm font-black'
                  : 't3 hover:t1 hover:bg-[var(--surface-alt)]'
              }`}
            >
              <span className="text-lg leading-none mb-0.5" aria-hidden="true">{tab.icon}</span>
              <span className="leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ═══════════════ HEALTH TIPS / ADVISORY MODAL ═══════════════ */}
      {healthTipsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="advisory-modal-title"
          className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setHealthTipsOpen(false)}
        >
          <div
            className="card max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-180"
            style={{ background: 'var(--card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden="true">🫁</span>
                <h3 id="advisory-modal-title" className="text-lg font-black t1">Health &amp; Action Advisory</h3>
              </div>
              <button
                type="button"
                onClick={() => setHealthTipsOpen(false)}
                aria-label="Close health advisory modal"
                className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold t3 hover:bg-[var(--surface-alt)] touch-target border"
                style={{ borderColor: 'var(--border)' }}
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="p-3.5 rounded-xl border" style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}>
                <div className="font-extrabold t1">Vulnerable groups</div>
                <p className="t2 font-medium mt-1">
                  Children, older people, and anyone with asthma or heart/lung problems should stay indoors today.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border" style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}>
                <div className="font-extrabold t1">Mask recommendation</div>
                <p className="t2 font-medium mt-1">
                  A snug N95 mask is essential if you must step outdoors. Cloth and surgical masks do not filter fine PM2.5 dust.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border" style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}>
                <div className="font-extrabold t1">Indoor air precautions</div>
                <p className="t2 font-medium mt-1">
                  Keep windows and balcony doors shut. Run HEPA air purifiers if available and avoid burning candles or incense.
                </p>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t text-right" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={() => setHealthTipsOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs touch-target"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ TECHNICAL GLOSSARY MODAL ═══════════════ */}
      {glossaryOpen && (
        <Suspense fallback={null}>
          <TechnicalGlossaryModal
            isOpen={glossaryOpen}
            onClose={() => setGlossaryOpen(false)}
          />
        </Suspense>
      )}

      {/* ═══════════════ MANDATORY PROFILE COMPLETION MODAL ═══════════════ */}
      {needsProfileCompletion && (
        <Suspense fallback={null}>
          <CompleteProfileModal
            onProfileSaved={(p) => {
              setUserProfile(p);
              handlePersonaChange(p?.persona || persona, p);
              setNeedsProfileCompletion(false);
            }}
            onProfileCompleted={(p) => {
              setUserProfile(p);
              handlePersonaChange(p?.persona || persona, p);
              setNeedsProfileCompletion(false);
            }}
          />
        </Suspense>
      )}

      {/* ═══════════════ PROFILE SETTINGS & PERSONAS MODAL ═══════════════ */}
      {profileSettingsOpen && (
        <Suspense fallback={null}>
          <ProfileSettingsModal
            onClose={() => {
              setProfileSettingsOpen(false);
              if (window.location.hash === '#/profile' || window.location.hash === '#/settings') {
                window.location.hash = '#/' + activeTab;
              }
            }}
            onProfileSaved={(p) => {
              setUserProfile(p);
              try {
                localStorage.setItem('arise_user_profile', JSON.stringify(p));
              } catch {}
              const priorityPersona = (p?.pinned_personas && p.pinned_personas.length > 0)
                ? p.pinned_personas[0]
                : (p?.persona || persona);
              handlePersonaChange(priorityPersona, p);
              setProfileSettingsOpen(false);
              if (window.location.hash === '#/profile' || window.location.hash === '#/settings') {
                window.location.hash = '#/' + activeTab;
              }
            }}
          />
        </Suspense>
      )}

      {/* ═══════════════ TRANSLUCENT AUTH OVERLAY (LOGIN / SIGNUP) ═══════════════ */}
      {(currentView === 'login' || currentView === 'signup') && (
        <div
          id="auth-modal-backdrop"
          className="fixed inset-0 z-[3000] overflow-y-auto flex items-center justify-center p-4 sm:p-6 backdrop-blur-md bg-slate-900/40 dark:bg-black/70 transition-all animate-fadeIn"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseAuth();
            }
          }}
        >
          <Suspense fallback={<AuthSkeleton />}>
            {currentView === 'login' ? (
              <LoginPage
                onNavigateSignUp={() => {
                  setCurrentView('signup');
                  window.location.hash = '#/signup';
                }}
                onContinueGuest={handleCloseAuth}
                onBack={handleCloseAuth}
              />
            ) : (
              <SignUpPage
                onNavigateLogin={() => {
                  setCurrentView('login');
                  window.location.hash = '#/login';
                }}
                onContinueGuest={handleCloseAuth}
                onBack={handleCloseAuth}
              />
            )}
          </Suspense>
        </div>
      )}
    </div>
  );
}
