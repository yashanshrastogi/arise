import React, { useState, useEffect, useMemo } from 'react';
import mockData from './mockData.json';
import mockDataModerate from './mockDataModerate.json';
import { fetchEnvironment, getUserProfile } from './api/client';
import AirMap from './components/AirMap';
import AqiGauge from './components/AqiGauge';
import WeatherCard from './components/WeatherCard';
import ForecastChart from './components/ForecastChart';
import AirFlowCard from './components/AirFlowCard';
import SchoolCard from './components/SchoolCard';
import MobilityCard from './components/MobilityCard';
import PollutantCards from './components/PollutantCards';
import AskArise from './components/AskArise';
import Watchlist from './components/Watchlist';
import UserProfileMenu from './components/UserProfileMenu';
import LoginPage from './components/LoginPage';
import SignUpPage from './components/SignUpPage';
import CompleteProfileModal from './components/CompleteProfileModal';
import ProfileSettingsModal from './components/ProfileSettingsModal';
import TechnicalGlossaryModal from './components/TechnicalGlossaryModal';
import VerdictHero from './components/VerdictHero';
import PersonaSelector from './components/PersonaSelector';
import AskBar from './components/AskBar';
import DataStatusPopover from './components/DataStatusPopover';
import { useAuth } from './auth/AuthContext';
import { reverseGeocode } from './utils/geoUtils';
import { formatKolkataTime, formatKolkataDate, formatKolkataShortDate, synchronizeForecastTimeline } from './utils/timeContext';

/**
 * Arise — Delhi-NCR Air Intelligence
 * "Can I go out?" test refactor.
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

  const [persona, setPersona] = useState('General Public');
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [healthTipsOpen, setHealthTipsOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState({
    lat: 28.6139,
    lon: 77.2090,
    name: 'Mandir Marg, New Delhi',
    city: 'New Delhi',
    district: 'Central Delhi',
    region: 'Delhi-NCR',
  });
  const [envData, setEnvData] = useState(null);
  const [loadingEnv, setLoadingEnv] = useState(false);

  // Automatic device geolocation & reverse-geocoding resolution on startup
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;

    let isMounted = true;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (!isMounted) return;
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        try {
          const geo = await reverseGeocode(lat, lon);
          if (isMounted && geo) {
            setSelectedCoords({
              lat,
              lon,
              name: geo.formattedLocation || `${geo.city || 'My Location'}`,
              city: geo.city || '',
              district: geo.district || '',
              region: geo.region || 'Delhi-NCR',
            });
          }
        } catch {
          if (isMounted) {
            setSelectedCoords(prev => ({ ...prev, lat, lon }));
          }
        }
      },
      (err) => {
        console.info('Auto-geolocation permission:', err?.message || 'not granted');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 }
    );

    return () => { isMounted = false; };
  }, []);

  // Live formatted Day, Date, Time (updating every second)
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dayDate = formatKolkataDate(currentDateTime);
  const liveTime = formatKolkataTime(currentDateTime);
  const shortDayDate = formatKolkataShortDate(currentDateTime);

  // Dark mode class sync
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

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
      } else if (clean === 'signup') {
        setCurrentView('signup');
      } else {
        setCurrentView('dashboard');
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
            if (profile.persona) {
              setPersona(profile.persona);
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
    }
    return () => { active = false; };
  }, [isAuthenticated, accessToken]);

  // Fetch telemetry from live API
  useEffect(() => {
    let active = true;
    async function loadData() {
      setLoadingEnv(true);
      try {
        const payload = await fetchEnvironment({
          lat: selectedCoords.lat,
          lon: selectedCoords.lon,
          persona,
          demo: demoMode,
        });
        if (active && payload) {
          setEnvData(payload);
          // If selectedCoords.name is generic coords and no resolved city, sync to payload.location
          if (payload.location && (!selectedCoords.name || selectedCoords.name.includes('°')) && !selectedCoords.city) {
            setSelectedCoords(prev => ({ ...prev, name: payload.location }));
          }
        }
      } catch {
        // Fall back gracefully
      } finally {
        if (active) setLoadingEnv(false);
      }
    }
    loadData();
    return () => { active = false; };
  }, [selectedCoords.lat, selectedCoords.lon, persona, demoMode]);

  // Merge live backend data with fallback state
  const fallbackData = demoMode ? mockData : mockDataModerate;
  const rawD = envData ? { ...fallbackData, ...envData } : fallbackData;
  const hasLiveFires = Boolean(rawD?.fires?.some(f => !f.isDemo && f.source === 'NASA-FIRMS'));

  // Synchronize forecast timeline and recommendations with current Asia/Kolkata clock
  const synchronizedTimeline = useMemo(() => {
    return synchronizeForecastTimeline(rawD?.forecast || [], rawD?.aqi || 312, currentDateTime);
  }, [rawD?.forecast, rawD?.aqi, currentDateTime]);

  const d = useMemo(() => {
    return {
      ...rawD,
      forecast: synchronizedTimeline.synchronizedForecast,
      bestWindow: synchronizedTimeline.hasRealBestWindow ? synchronizedTimeline.bestWindowStr : rawD.bestWindow,
    };
  }, [rawD, synchronizedTimeline]);

  // Personalize Watchlist using saved Home, School, Work, and Parent locations
  const personalizedWatchlist = useMemo(() => {
    const list = [];

    const resolveCoords = (loc, fallbackLat = 28.6139, fallbackLon = 77.2090) => {
      let lat = loc?.latitude != null && !Number.isNaN(Number(loc.latitude)) ? Number(loc.latitude) : null;
      let lon = loc?.longitude != null && !Number.isNaN(Number(loc.longitude)) ? Number(loc.longitude) : null;
      if (lat == null || lon == null) {
        const text = `${loc?.address || ''} ${loc?.label || ''}`.toLowerCase();
        const matched = Object.entries(KNOWN_COORDS).find(([k]) => text.includes(k));
        if (matched) {
          lat = matched[1].lat;
          lon = matched[1].lon;
        } else {
          lat = fallbackLat;
          lon = fallbackLon;
        }
      }
      return { lat, lon };
    };

    if (userProfile?.home_location && (userProfile.home_location.address || userProfile.home_location.latitude != null)) {
      const { lat, lon } = resolveCoords(userProfile.home_location, 28.6845, 77.2618);
      list.push({
        name: userProfile.home_location.label || 'Home',
        location: userProfile.home_location.address || `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`,
        lat,
        lon,
        aqi: d?.aqi || 329,
        status: d?.status || 'Very Poor',
        updated: 'Personal Location',
      });
    }

    if (userProfile?.school_location && (userProfile.school_location.address || userProfile.school_location.latitude != null)) {
      const { lat, lon } = resolveCoords(userProfile.school_location, 28.529, 77.154);
      list.push({
        name: userProfile.school_location.label || 'School',
        location: userProfile.school_location.address || `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`,
        lat,
        lon,
        aqi: Math.min(500, Math.round((d?.aqi || 329) * 1.02)),
        status: d?.status || 'Very Poor',
        updated: 'Saved',
      });
    }

    if (userProfile?.work_location && (userProfile.work_location.address || userProfile.work_location.latitude != null)) {
      const { lat, lon } = resolveCoords(userProfile.work_location, 28.631, 77.219);
      list.push({
        name: userProfile.work_location.label || 'Work',
        location: userProfile.work_location.address || `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`,
        lat,
        lon,
        aqi: Math.max(50, Math.round((d?.aqi || 329) * 0.95)),
        status: d?.status || 'Very Poor',
        updated: 'Saved',
      });
    }

    if (userProfile?.parent_location && (userProfile.parent_location.address || userProfile.parent_location.latitude != null)) {
      const { lat, lon } = resolveCoords(userProfile.parent_location, 28.572, 77.355);
      list.push({
        name: userProfile.parent_location.label || "Parent's Home",
        location: userProfile.parent_location.address || `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`,
        lat,
        lon,
        aqi: Math.round((d?.aqi || 329) * 0.98),
        status: d?.status || 'Very Poor',
        updated: 'Saved',
      });
    }

    // If user has saved locations, display their saved locations!
    if (list.length > 0) {
      return list;
    }

    // Otherwise show default sample places
    return d?.watchlist || [];
  }, [userProfile, d?.watchlist, d?.aqi, d?.status]);

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
        className="sticky top-0 z-[2000] px-3.5 sm:px-6 h-16 border-b backdrop-blur-md transition-colors flex items-center"
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
              <h1 className="text-[11px] font-bold tm hidden sm:block -mt-0.5">
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

            {/* Dark Mode Toggle */}
            <button
              id="btn-theme-toggle"
              type="button"
              onClick={() => setDark(!dark)}
              aria-label="Toggle Theme"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold border transition-colors hover:bg-[var(--surface-alt)] touch-target"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            >
              {dark ? '☀️' : '🌙'}
            </button>

            {/* User Profile Menu */}
            <UserProfileMenu
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
      <main className="flex-1 w-full px-3.5 sm:px-6 py-4 sm:py-6 pb-24 md:pb-8 flex flex-col items-center">
        {/* ── TAB 1: TODAY (Core "Can I go out?" Intelligence) ── */}
        {activeTab === 'today' && (
          <div className="w-full responsive-container space-y-5 sm:space-y-6">
            {/* Persona Selector ("Who are you checking for?") */}
            <PersonaSelector
              currentPersona={persona}
              onSelectPersona={(p) => setPersona(p)}
              isAuthenticated={isAuthenticated}
              userProfile={userProfile}
              onOpenCustomize={() => setProfileSettingsOpen(true)}
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
                  forecast={d.forecast}
                  recheckAt={d.recheckAt}
                  persona={persona}
                  isLoading={loadingEnv}
                  onOpenAdvisory={() => setHealthTipsOpen(true)}
                  onOpenMap={() => handleTabChange('map')}
                  liveDateTime={{ dayDate, liveTime, shortDayDate }}
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
                  degrees={d.weather?.windDegrees || (demoMode ? 315 : 290)}
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
            <ForecastChart
              data={d.forecast}
              data7Day={d.forecast7Day}
              currentAqi={d.aqi}
              location={selectedCoords.city || selectedCoords.district || selectedCoords.region || 'Delhi-NCR'}
            />

            {/* School Safety & Travel Corridors */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              <SchoolCard data={d.school} />
              <MobilityCard corridors={d.traffic?.corridors} onOpenMap={() => handleTabChange('map')} />
              <div className="card p-5 flex flex-col justify-between" style={{ background: 'var(--card)' }}>
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
                      setSelectedCoords({
                        lat,
                        lon,
                        name,
                        city: meta?.city || '',
                        district: meta?.district || '',
                        region: meta?.region || name || 'Delhi-NCR',
                      });
                    }}
                    onOpenSaveLocations={() => {
                      setProfileSettingsOpen(true);
                    }}
                  />
                </div>
                {/* Quick Alert Setting */}
                <div className="mt-4 p-3.5 rounded-2xl border" style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between text-xs sm:text-sm font-black t1 mb-1">
                    <span>Severe Air Alert Threshold</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-black">AQI &gt; 300</span>
                  </div>
                  <p className="text-xs font-medium tm leading-relaxed">
                    {userProfile?.alerts_enabled
                      ? 'Personal alerts enabled for saved locations.'
                      : `Alerts coming soon for critical ${selectedCoords.city || selectedCoords.district || 'Delhi-NCR'} air zones.`}
                  </p>
                </div>
              </div>
            </div>

            {/* Pollutant Cards */}
            <PollutantCards pollutants={d.pollutants} />

            {/* Meta & Navigation Utility Strip */}
            <div className="pt-4 border-t flex flex-wrap items-center justify-between gap-3 text-xs" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2.5">
                <DataStatusPopover hasLiveFires={hasLiveFires} />
                <button
                  type="button"
                  id="btn-open-glossary"
                  onClick={() => setGlossaryOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border t2 hover:t1 hover:bg-[var(--surface-alt)] transition-colors font-bold touch-target shadow-2xs"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                >
                  <span aria-hidden="true">📖</span>
                  <span>Glossary</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: MAP (Full Delhi-NCR Interactive Map) ── */}
        {activeTab === 'map' && (
          <div className="w-full responsive-container space-y-4">
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
                <DataStatusPopover hasLiveFires={hasLiveFires} />
              </div>
            </div>
            <div className="w-full h-[clamp(420px,calc(100dvh-13rem),780px)] rounded-2xl overflow-hidden card" style={{ background: 'var(--card)' }}>
              <AirMap
                stations={d.stations}
                fires={d.fires}
                weather={d.weather}
                traffic={d.traffic}
                nationalHubs={d.nationalHubs}
                dark={dark}
                fullHeight={true}
                onLocationSelect={(lat, lon, name, meta) => {
                  setSelectedCoords({
                    lat,
                    lon,
                    name: name || 'Selected Area',
                    city: meta?.city || '',
                    district: meta?.district || '',
                    region: meta?.region || name || 'Delhi-NCR',
                  });
                }}
                onSwitchToToday={() => handleTabChange('today')}
              />
            </div>
          </div>
        )}

        {/* ── TAB 3: ASK (Ask Arise Dedicated Interface) ── */}
        {activeTab === 'ask' && (
          <div className="w-full max-w-[1000px] xl:max-w-[1100px] h-[clamp(480px,calc(100dvh-12rem),800px)] flex flex-col">
            <AskArise
              lat={selectedCoords.lat}
              lon={selectedCoords.lon}
              demo={demoMode}
              persona={persona}
            />
          </div>
        )}

        {/* ── TAB 4: MORE (School, Travel & My Places) ── */}
        {activeTab === 'more' && (
          <div className="w-full responsive-container space-y-5 sm:space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h2 className="text-xl sm:text-2xl font-black t1">Regional Life, School &amp; Travel Guides</h2>
                <p className="text-xs sm:text-sm font-semibold tm mt-1">
                  School sports advisories, saved family monitors, and arterial NCR smog corridors.
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
                        region: meta?.region || name || 'Delhi-NCR',
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
                <h3 className="text-lg font-black t1">Health &amp; Action Advisory</h3>
              </div>
              <button
                type="button"
                onClick={() => setHealthTipsOpen(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold t3 hover:bg-[var(--surface-alt)] touch-target"
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
        <TechnicalGlossaryModal
          isOpen={glossaryOpen}
          onClose={() => setGlossaryOpen(false)}
        />
      )}

      {/* ═══════════════ MANDATORY PROFILE COMPLETION MODAL ═══════════════ */}
      {needsProfileCompletion && (
        <CompleteProfileModal
          onProfileSaved={(p) => {
            setUserProfile(p);
            if (p?.persona) setPersona(p.persona);
            setNeedsProfileCompletion(false);
          }}
          onProfileCompleted={(p) => {
            setUserProfile(p);
            if (p?.persona) setPersona(p.persona);
            setNeedsProfileCompletion(false);
          }}
        />
      )}

      {/* ═══════════════ PROFILE SETTINGS & PERSONAS MODAL ═══════════════ */}
      {profileSettingsOpen && (
        <ProfileSettingsModal
          onClose={() => setProfileSettingsOpen(false)}
          onProfileSaved={(p) => {
            setUserProfile(p);
            try {
              localStorage.setItem('arise_user_profile', JSON.stringify(p));
            } catch {}
            if (p.persona) setPersona(p.persona);
            setProfileSettingsOpen(false);
          }}
        />
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
        </div>
      )}
    </div>
  );
}
