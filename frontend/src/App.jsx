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
import TechnicalGlossaryModal from './components/TechnicalGlossaryModal';
import VerdictHero from './components/VerdictHero';
import PersonaSelector from './components/PersonaSelector';
import AskBar from './components/AskBar';
import BasicAccordions from './components/BasicAccordions';
import DataStatusPopover from './components/DataStatusPopover';
import { useAuth } from './auth/AuthContext';

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
  const [userProfile, setUserProfile] = useState(null);
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false);

  // Default to Basic View mode per Section 3
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('arise_view_mode') || 'basic';
    } catch {
      return 'basic';
    }
  });

  const [persona, setPersona] = useState('General Public');
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [healthTipsOpen, setHealthTipsOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState({ lat: 28.6139, lon: 77.2090, name: 'Mandir Marg, New Delhi' });
  const [envData, setEnvData] = useState(null);
  const [loadingEnv, setLoadingEnv] = useState(false);

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('arise_view_mode', mode);
    } catch {
      // ignore
    }
  };

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

  // Hash routing (#/login, #/signup, #/dashboard)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === '#/login') {
        setCurrentView('login');
      } else if (hash === '#/signup') {
        setCurrentView('signup');
      } else {
        setCurrentView('dashboard');
      }
    };

    window.addEventListener('hashchange', handleHash);
    handleHash();
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Fetch authenticated profile
  useEffect(() => {
    let active = true;
    if (isAuthenticated && accessToken) {
      getUserProfile(accessToken)
        .then((profile) => {
          if (!active) return;
          if (profile) {
            setUserProfile(profile);
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
          demo: demoMode,
        });
        if (active && payload) {
          setEnvData(payload);
        }
      } catch {
        // Fall back gracefully
      } finally {
        if (active) setLoadingEnv(false);
      }
    }
    loadData();
    return () => { active = false; };
  }, [selectedCoords.lat, selectedCoords.lon, demoMode]);

  // Merge live backend data with fallback state
  const fallbackData = demoMode ? mockData : mockDataModerate;
  const d = envData ? { ...fallbackData, ...envData } : fallbackData;
  const hasLiveFires = Boolean(d?.fires?.some(f => !f.isDemo && f.source === 'NASA-FIRMS'));

  // Personalize Watchlist using saved Home and Work locations
  const personalizedWatchlist = useMemo(() => {
    const list = [];
    if (userProfile?.home_location?.latitude != null && userProfile?.home_location?.longitude != null) {
      list.push({
        name: userProfile.home_location.label || 'Home',
        location: userProfile.home_location.address || 'Saved Home Area',
        lat: Number(userProfile.home_location.latitude),
        lon: Number(userProfile.home_location.longitude),
        aqi: d?.aqi || 159,
        status: d?.status || 'Moderate',
        updated: 'Personal Location',
      });
    }
    if (userProfile?.work_location?.latitude != null && userProfile?.work_location?.longitude != null) {
      list.push({
        name: userProfile.work_location.label || 'Work',
        location: userProfile.work_location.address || 'Saved Work Area',
        lat: Number(userProfile.work_location.latitude),
        lon: Number(userProfile.work_location.longitude),
        aqi: d?.aqi || 159,
        status: d?.status || 'Moderate',
        updated: 'Personal Location',
      });
    }
    const existing = d?.watchlist || [];
    const filteredExisting = existing.filter(
      (item) => !list.some((p) => p.name.toLowerCase() === item.name.toLowerCase())
    );
    return [...list, ...filteredExisting];
  }, [userProfile, d?.watchlist, d?.aqi, d?.status]);

  // View routing: Dedicated Login Page
  if (currentView === 'login') {
    return (
      <LoginPage
        onNavigateSignUp={() => {
          setCurrentView('signup');
          window.location.hash = '#/signup';
        }}
        onContinueGuest={() => {
          setCurrentView('dashboard');
          window.location.hash = '';
        }}
      />
    );
  }

  // View routing: Dedicated Sign Up Page
  if (currentView === 'signup') {
    return (
      <SignUpPage
        onNavigateLogin={() => {
          setCurrentView('login');
          window.location.hash = '#/login';
        }}
        onContinueGuest={() => {
          setCurrentView('dashboard');
          window.location.hash = '';
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-180" style={{ background: 'var(--bg)' }}>
      {/* ═══════════════ SLIM HEADER (64px) ═══════════════ */}
      <header
        className="sticky top-0 z-[2000] px-4 sm:px-6 h-16 border-b backdrop-blur-md transition-colors flex items-center"
        style={{
          borderColor: 'var(--border)',
          background: dark ? 'rgba(19, 26, 46, 0.92)' : 'rgba(255, 255, 255, 0.92)',
        }}
      >
        <div className="max-w-[1400px] mx-auto w-full flex items-center justify-between gap-3">
          {/* Logo & Headline */}
          <a
            href="#today"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('today');
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

          {/* 3 Core Navigation Tabs */}
          <nav
            className="flex items-center gap-1 p-1 rounded-xl border bg-[var(--surface-alt)] shadow-xs"
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
                  onClick={() => setActiveTab(tab.id)}
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

          {/* Right Controls: Basic/Advanced Toggle, A+, Dark Mode, User Profile */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Basic / Advanced Mode Toggle */}
            <div
              role="radiogroup"
              aria-label="Select view mode"
              className="flex items-center gap-0.5 p-0.5 rounded-xl border bg-[var(--surface-alt)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                type="button"
                role="radio"
                id="btn-view-mode-basic"
                aria-checked={viewMode === 'basic'}
                onClick={() => handleViewModeChange('basic')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all touch-target flex items-center gap-1 ${
                  viewMode === 'basic'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 't3 hover:t1'
                }`}
                title="Basic view: quick verdict, advice, and reasons"
              >
                <span>🌱</span>
                <span className="hidden sm:inline">Basic</span>
              </button>
              <button
                type="button"
                role="radio"
                id="btn-view-mode-advanced"
                aria-checked={viewMode === 'advanced'}
                onClick={() => handleViewModeChange('advanced')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all touch-target flex items-center gap-1 ${
                  viewMode === 'advanced'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 't3 hover:t1'
                }`}
                title="Advanced view: detailed charts, telemetry, and corridors"
              >
                <span>⚡</span>
                <span className="hidden sm:inline">Advanced</span>
              </button>
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
            />
          </div>
        </div>
      </header>

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <main className="flex-1 w-full px-4 sm:px-6 py-6 flex flex-col items-center">
        {/* ── TAB 1: TODAY (Core "Can I go out?" Intelligence) ── */}
        {activeTab === 'today' && (
          viewMode === 'basic' ? (
            /* ─────────────────────────────────────────────────────────── */
            /* ── BASIC VIEW (Wireframe: Single Column, Max 720px) ────── */
            /* ─────────────────────────────────────────────────────────── */
            <div className="w-full max-w-[720px] space-y-5">
              {/* Persona Selector ("Who are you checking for?") */}
              <PersonaSelector
                currentPersona={persona}
                onSelectPersona={(p) => setPersona(p)}
              />

              {/* The Verdict Hero (Answers "Can I go out?" once, in 72px type) */}
              <VerdictHero
                aqi={d.aqi}
                locationName={selectedCoords.name}
                forecast={d.forecast}
                recheckAt={d.recheckAt}
                persona={persona}
                onOpenAdvisory={() => setHealthTipsOpen(true)}
              />

              {/* Single Ask Arise Box with Quick Chips */}
              <AskBar
                lat={selectedCoords.lat}
                lon={selectedCoords.lon}
                persona={persona}
                demo={demoMode}
                onOpenFullChat={() => setActiveTab('ask')}
              />

              {/* 3 Progressive Accordions (Why / Hour by hour / What's in the air) */}
              <BasicAccordions data={d} />

              {/* Meta & Navigation Utility Strip */}
              <div className="pt-3 border-t flex flex-wrap items-center justify-between gap-3 text-xs" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2">
                  <DataStatusPopover hasLiveFires={hasLiveFires} />
                  <button
                    type="button"
                    onClick={() => setGlossaryOpen(true)}
                    className="font-bold t2 hover:underline touch-target px-2 py-1"
                  >
                    📖 Glossary
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleViewModeChange('advanced')}
                  className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline touch-target px-2 py-1"
                >
                  Need deep telemetry? Switch to Advanced view →
                </button>
              </div>
            </div>
          ) : (
            /* ─────────────────────────────────────────────────────────── */
            /* ── ADVANCED VIEW (Multi-Column Detailed Telemetry) ─────── */
            /* ─────────────────────────────────────────────────────────── */
            <div className="w-full max-w-[1400px] space-y-6">
              {/* Quick Persona & Location Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl card" style={{ background: 'var(--card)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">📍</span>
                  <span className="font-extrabold t1">{selectedCoords.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <PersonaSelector currentPersona={persona} onSelectPersona={(p) => setPersona(p)} />
                  <DataStatusPopover hasLiveFires={hasLiveFires} />
                </div>
              </div>

              {/* Primary Severity & Weather Row */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-6 lg:col-span-5 flex flex-col">
                  <VerdictHero
                    aqi={d.aqi}
                    locationName={selectedCoords.name}
                    forecast={d.forecast}
                    recheckAt={d.recheckAt}
                    persona={persona}
                    onOpenAdvisory={() => setHealthTipsOpen(true)}
                  />
                </div>
                <div className="md:col-span-6 lg:col-span-4 flex flex-col">
                  <WeatherCard weather={d.weather} aqi={d.aqi} />
                </div>
                <div className="md:col-span-12 lg:col-span-3 flex flex-col">
                  <AirFlowCard
                    speed={d.weather?.windSpeed != null ? String(d.weather.windSpeed) : (demoMode ? "3.2" : "8.5")}
                    unit="km/h"
                    direction={d.weather?.windDirection || (demoMode ? "NW" : "WNW")}
                    degrees={d.weather?.windDegrees || (demoMode ? 315 : 290)}
                  />
                </div>
              </div>

              {/* Forecast Horizon Chart */}
              <ForecastChart data={d.forecast} data7Day={d.forecast7Day} currentAqi={d.aqi} />

              {/* School Safety & Travel Corridors */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <SchoolCard data={d.school} />
                <MobilityCard corridors={d.traffic?.corridors} />
                <div className="card p-5 flex flex-col justify-between" style={{ background: 'var(--card)' }}>
                  <div>
                    <h3 className="text-sm font-extrabold t1 mb-2">My places</h3>
                    <Watchlist
                      items={personalizedWatchlist}
                      isGuest={!isAuthenticated}
                      onSelect={(lat, lon, name) => setSelectedCoords({ lat, lon, name })}
                      onOpenSaveLocations={() => {
                        setCurrentView('signup');
                        window.location.hash = '#/signup';
                      }}
                    />
                  </div>
                  {/* Quick Alert Setting (Truth fix: Alerts coming soon) */}
                  <div className="mt-4 p-3 rounded-xl border" style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between text-xs font-bold t1 mb-1">
                      <span>Severe Air Alert Threshold</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">AQI &gt; 300</span>
                    </div>
                    <p className="text-[11px] font-medium t3">
                      {userProfile?.alerts_enabled
                        ? 'Personal alerts enabled for saved locations.'
                        : 'Alerts coming soon for critical Delhi-NCR air zones.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Pollutant Cards */}
              <PollutantCards pollutants={d.pollutants} />
            </div>
          )
        )}

        {/* ── TAB 2: MAP (Full Delhi-NCR Interactive Map) ── */}
        {activeTab === 'map' && (
          <div className="w-full max-w-[1400px] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black t1">Air Quality &amp; Fire Map</h2>
                <p className="text-xs font-medium t3">Official CPCB sensors and satellite fire signals across Delhi-NCR</p>
              </div>
              <DataStatusPopover hasLiveFires={hasLiveFires} />
            </div>
            <div className="w-full h-[640px] rounded-2xl overflow-hidden card">
              <AirMap
                stations={d.stations}
                fires={d.fires}
                weather={d.weather}
                traffic={d.traffic}
                dark={dark}
                onLocationSelect={(lat, lon, name) => {
                  setSelectedCoords({ lat, lon, name: name || 'Selected Area' });
                  setActiveTab('today');
                }}
              />
            </div>
          </div>
        )}

        {/* ── TAB 3: ASK (Ask Arise Dedicated Interface) ── */}
        {activeTab === 'ask' && (
          <div className="w-full max-w-[800px] h-[640px]">
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
          <div className="w-full max-w-[1100px] space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <SchoolCard data={d.school} />
              <div className="card p-5" style={{ background: 'var(--card)' }}>
                <h3 className="text-sm font-extrabold t1 mb-3">My places</h3>
                <Watchlist
                  items={personalizedWatchlist}
                  isGuest={!isAuthenticated}
                  onSelect={(lat, lon, name) => {
                    setSelectedCoords({ lat, lon, name });
                    setActiveTab('today');
                  }}
                  onOpenSaveLocations={() => {
                    setCurrentView('signup');
                    window.location.hash = '#/signup';
                  }}
                />
              </div>
            </div>
            <MobilityCard corridors={d.traffic?.corridors} />
          </div>
        )}
      </main>

      {/* ═══════════════ HEALTH TIPS / ADVISORY MODAL ═══════════════ */}
      {healthTipsOpen && (
        <div className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-180" style={{ background: 'var(--card)' }}>
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
            setNeedsProfileCompletion(false);
          }}
        />
      )}
    </div>
  );
}
