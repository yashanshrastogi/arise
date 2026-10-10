import React, { useState, useEffect, useMemo } from 'react';
import mockData from './mockData.json';
import mockDataModerate from './mockDataModerate.json';
import { fetchEnvironment, getUserProfile } from './api/client';
import AirMap from './components/AirMap';
import AqiGauge from './components/AqiGauge';
import WeatherCard from './components/WeatherCard';
import ForecastChart from './components/ForecastChart';
import AirFlowCard from './components/AirFlowCard';
import WhyPanel from './components/WhyPanel';
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
import { useAuth } from './auth/AuthContext';

/**
 * Arise — Delhi-NCR Air & Weather Intelligence Platform
 * Production Architecture: Air + Weather Integration, Compact/Expandable Map,
 * Deterministic Environmental Logic, and Cognito-ready Google/Email Auth.
 */

const NAV_ITEMS = [
  { id: 'today',      label: 'Home',         icon: '🏠' },
  { id: 'map',        label: 'Air Map',      icon: '🗺️' },
  { id: 'weather',    label: 'Weather',      icon: '🌤️' },
  { id: 'forecast',   label: 'Forecast',     icon: '📈' },
  { id: 'mobility',   label: 'Corridors',    icon: '🚗' },
  { id: 'ask',        label: 'Ask Arise',    icon: '✦' },
];

function getPersonaAdvisory(persona) {
  switch (persona) {
    case 'Asthma / Respiratory Sensitive':
      return 'Respiratory vigilance: High risk of airway irritation. Keep rescue inhaler accessible and use HEPA filtration indoors.';
    case 'Child / Parent':
    case 'Parent / Child Care':
      return 'Child protection protocol: Children inhale more air per body weight. Limit outdoor play during peak smog hours.';
    case 'Older Adult':
    case 'Senior Citizen':
      return 'Senior cardiovascular precaution: Minimize exertion outdoors and stay hydrated in filtered indoor environments.';
    case 'Athlete':
    case 'Athlete / Runner':
      return 'Aerobic safety advisory: High ventilation rates increase deep particle inhalation. Shift high-intensity cardio indoors.';
    case 'Outdoor Worker':
      return 'Occupational exposure alert: Mandatory N95 particulate respirator recommended for extended outdoor shifts.';
    case 'School Administrator':
      return 'Campus policy alert: Suspend outdoor physical education and keep classroom windows sealed during high pollution.';
    default:
      return null;
  }
}

export default function App() {
  const { isAuthenticated, accessToken } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');
  const [userProfile, setUserProfile] = useState(null);
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false);

  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('arise_view_mode') || 'basic';
    } catch {
      return 'basic';
    }
  });
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  const [dark, setDark] = useState(false);
  const [activeNav, setActiveNav] = useState('today');
  const [demoMode, setDemoMode] = useState(false);
  const [healthTipsOpen, setHealthTipsOpen] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState({ lat: 28.6139, lon: 77.2090, name: 'Delhi-NCR Central' });
  const [envData, setEnvData] = useState(null);
  const [loadingEnv, setLoadingEnv] = useState(false);
  const [liveStatus, setLiveStatus] = useState('demo');

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('arise_view_mode', mode);
    } catch {
      // ignore storage access errors
    }
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // Synchronize hash routing (#/login, #/signup, #/dashboard)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === '#/login' || hash === '#login') {
        setCurrentView('login');
      } else if (hash === '#/signup' || hash === '#signup') {
        setCurrentView('signup');
      } else if (currentView !== 'dashboard') {
        setCurrentView('dashboard');
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [currentView]);

  // If user signs in while on login or signup view, return to dashboard
  useEffect(() => {
    if (isAuthenticated && (currentView === 'login' || currentView === 'signup')) {
      window.location.hash = '#/';
    }
  }, [isAuthenticated, currentView]);

  // Profile status verification and mandatory post-registration completion enforcement
  useEffect(() => {
    let active = true;
    async function checkProfile() {
      if (!isAuthenticated || !accessToken) {
        setUserProfile(null);
        setNeedsProfileCompletion(false);
        return;
      }
      try {
        const p = await getUserProfile(accessToken);
        if (active) {
          setUserProfile(p);
          if (!p || !p.display_name || !p.profile_completed) {
            setNeedsProfileCompletion(true);
          } else {
            setNeedsProfileCompletion(false);
          }
        }
      } catch {
        if (active) {
          // If 404 / uninitialized profile, require user to complete profile
          setNeedsProfileCompletion(true);
        }
      }
    }
    checkProfile();
    return () => {
      active = false;
    };
  }, [isAuthenticated, accessToken]);

  // Load environmental intelligence snapshot from backend
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
          setLiveStatus((payload.isDemo || payload.is_demo) ? 'demo' : (payload.isStale ? 'stale' : 'live'));
        } else if (active) {
          setLiveStatus(demoMode ? 'demo' : 'offline');
        }
      } catch {
        if (active) setLiveStatus(demoMode ? 'demo' : 'offline');
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

  // Dynamic navigation items based on active view mode
  const activeNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => viewMode === 'advanced' || item.id !== 'mobility');
  }, [viewMode]);

  // Smooth scroll to section with dynamic sticky header offset calculation
  const scrollToSection = (id) => {
    setActiveNav(id);
    if (id === 'today') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const el = document.getElementById(id);
    if (el) {
      const header = document.querySelector('header');
      const headerHeight = header ? header.offsetHeight : 64;
      const elementTop = el.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo({
        top: elementTop - headerHeight - 16,
        behavior: 'smooth',
      });
    }
  };

  // Scroll spy: synchronize top navigation active pills with scroll position
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollPosition = window.pageYOffset + 140;
          const sectionIds = ['today', 'map', 'weather', 'forecast', 'mobility', 'ask'];

          for (let i = sectionIds.length - 1; i >= 0; i--) {
            const el = document.getElementById(sectionIds[i]);
            if (el) {
              const top = el.offsetTop;
              if (scrollPosition >= top) {
                setActiveNav(sectionIds[i]);
                break;
              }
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
    <div className="min-h-screen flex flex-col transition-colors duration-200">
      {/* ═══════════════ HEADER ═══════════════ */}
      <header
        className="sticky top-0 z-[2000] px-4 sm:px-6 lg:px-8 py-3 border-b backdrop-blur-md transition-colors"
        style={{
          borderColor: 'var(--border)',
          background: dark ? 'rgba(20, 28, 46, 0.90)' : 'rgba(255, 255, 255, 0.90)',
        }}
      >
        <div className="max-w-[1720px] mx-auto flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <a
            href="#today"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('today');
            }}
            className="flex items-center gap-3 select-none cursor-pointer group flex-shrink-0"
            title="Arise · Delhi-NCR Air & Weather Intelligence Platform"
          >
            <img
              src="/icon.png"
              alt="Arise Icon"
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl object-contain shadow-md shadow-indigo-500/20 transition-transform group-hover:scale-105"
            />
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2 leading-none">
                <span className="text-xl sm:text-2xl font-black tracking-tight t1">
                  Arise
                </span>
                <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo/10 text-indigo border border-indigo/20">
                  Delhi-NCR
                </span>
              </div>
              <div className="text-[11px] sm:text-xs font-semibold tm mt-1 tracking-normal">
                Air &amp; Weather Intelligence Platform
              </div>
            </div>
          </a>

          {/* Navigation Pills */}
          <nav
            className="hidden md:flex items-center gap-1 p-1 rounded-2xl border"
            style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
          >
            {activeNavItems.map(item => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  activeNav === item.id
                    ? 'bg-indigo text-white shadow-sm'
                    : 't3 hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Right Header Controls: View Mode, Demo Toggle, Dark Mode, Profile/Auth */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Persistent Basic / Advanced View Mode Toggle */}
            <div
              role="radiogroup"
              aria-label="Select view mode"
              className="flex items-center gap-1 p-1 rounded-xl border bg-[var(--surface-alt)] shadow-xs"
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                type="button"
                role="radio"
                id="btn-view-mode-basic"
                aria-checked={viewMode === 'basic'}
                onClick={() => handleViewModeChange('basic')}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                  viewMode === 'basic'
                    ? 'bg-indigo text-white shadow-xs'
                    : 't3 hover:text-[var(--text-primary)]'
                }`}
                title="Basic view: essential condition, health guidance, map, and forecast"
              >
                <span>🍃</span>
                <span className="hidden sm:inline">Basic</span>
              </button>
              <button
                type="button"
                role="radio"
                id="btn-view-mode-advanced"
                aria-checked={viewMode === 'advanced'}
                onClick={() => handleViewModeChange('advanced')}
                className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                  viewMode === 'advanced'
                    ? 'bg-indigo text-white shadow-xs'
                    : 't3 hover:text-[var(--text-primary)]'
                }`}
                title="Advanced view: comprehensive 6-pollutant telemetry, wind dynamics, and corridors"
              >
                <span>🔬</span>
                <span className="hidden sm:inline">Advanced</span>
              </button>
            </div>

            {/* Dynamic 'Data status' chip */}
            <div
              id="chip-data-status"
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border shadow-xs"
              style={{
                background: 'var(--surface-alt)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
              title={`Telemetry source status: ${liveStatus}`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold" style={{ color: 'var(--text-primary)' }}>Data status:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                Live = OpenAQ + Open-Meteo{hasLiveFires ? ' + NASA FIRMS' : ''}
              </span>
              <span className="opacity-30">|</span>
              <span className="opacity-75">
                Demo = {hasLiveFires ? 'traffic, indoor' : 'fires, traffic, indoor'}
              </span>
            </div>

            {/* Demo / Live Status Pill & Toggle */}
            <button
              onClick={() => {
                setDemoMode(!demoMode);
                setEnvData(null);
              }}
              id="btn-demo-mode"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border transition-all hover:scale-105 active:scale-95"
              style={{
                background: demoMode ? '#F28C2818' : (d?.isStale ? '#F5C54218' : '#2EB87218'),
                borderColor: demoMode ? '#F28C2850' : (d?.isStale ? '#F5C54250' : '#2EB87250'),
                color: demoMode ? '#F28C28' : (d?.isStale ? '#D97706' : '#2EB872'),
              }}
              title="Toggle Live Telemetry vs Demo Scenario"
            >
              <span className={`w-2 h-2 rounded-full ${demoMode ? 'bg-[#F28C28]' : (d?.isStale ? 'bg-[#F5C542]' : 'bg-[#2EB872] animate-pulse')}`} />
              <span>
                {loadingEnv ? 'Refreshing...' : demoMode ? 'Demo: Severe Event' : (d?.isStale ? `Stale Cache (AQI ${d.aqi})` : `Live Telemetry (AQI ${d.aqi})`)}
              </span>
            </button>

            {/* Dark/Light Mode Toggle */}
            <button
              id="btn-theme-toggle"
              onClick={() => setDark(!dark)}
              aria-label="Toggle Theme"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold border transition-colors hover:bg-[var(--surface-alt)]"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              {dark ? '☀️' : '🌙'}
            </button>

            {/* User Profile Menu (Supports both Guest mode buttons & Authenticated profile) */}
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
      <main className="flex-1 max-w-[1720px] mx-auto w-full p-4 sm:p-6 lg:p-8 flex flex-col gap-6">

        {/* Small 'Data status' chip for mobile / tablet viewports */}
        <div
          id="chip-data-status-mobile"
          className="flex lg:hidden items-center justify-between gap-2 px-3 py-2 rounded-xl text-[11px] font-semibold border"
          style={{
            background: 'var(--surface-alt)',
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>Data status:</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              Live = OpenAQ + Open-Meteo{hasLiveFires ? ' + NASA FIRMS' : ''}
            </span>
          </div>
          <span className="opacity-75 text-[10px] shrink-0">
            Demo = {hasLiveFires ? 'traffic, indoor' : 'fires, traffic, indoor'}
          </span>
        </div>

        {/* ── Personalized Health Advisory Banner (Active for Authenticated Personas) ── */}
        {userProfile?.persona && userProfile.persona !== 'General Public' && (
          <div
            id="banner-personalized-advisory"
            className="w-full p-3 sm:p-4 rounded-2xl border flex items-center justify-between gap-3 shadow-xs"
            style={{
              background: 'rgba(99, 102, 241, 0.08)',
              borderColor: 'rgba(99, 102, 241, 0.25)',
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🛡️</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                    Personalized Health Advisory · {userProfile.persona}
                  </span>
                  {userProfile.display_name && (
                    <span className="text-[10px] font-bold tm">
                      ({userProfile.display_name})
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold t1 mt-0.5 leading-snug">
                  {getPersonaAdvisory(userProfile.persona)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── 1. CONSOLIDATED PRIMARY ENVIRONMENTAL ADVISORY ── */}
        <section
          id="today"
          aria-label="Current Air Quality Advisory"
          className="w-full card p-4 sm:p-5 lg:p-6 flex flex-col gap-4 border shadow-sm transition-all scroll-mt-24"
        >
          {/* Top Row: Location & Monitoring Network + Quick Location Switches + Glossary Trigger */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center text-xl bg-indigo/10 text-indigo flex-shrink-0">
                📍
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-indigo">
                  Current Air Quality In Your Area
                </div>
                <div className="text-base sm:text-lg font-black t1 leading-tight">
                  {selectedCoords?.name ? selectedCoords.name.replace(' (Spatial IDW)', '') : (d.location || 'Delhi-NCR Central')}
                </div>
                <div className="text-[10px] font-bold t3 mt-0.5">
                  Monitored via CPCB &amp; OpenAQ stations · Updated {d.updated}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Quick Switch for Saved Home/Work Locations */}
              {(userProfile?.home_location?.latitude || userProfile?.work_location?.latitude) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold tm">Saved:</span>
                  {userProfile?.home_location?.latitude && (
                    <button
                      id="btn-quick-home"
                      type="button"
                      onClick={() => setSelectedCoords({
                        lat: Number(userProfile.home_location.latitude),
                        lon: Number(userProfile.home_location.longitude),
                        name: userProfile.home_location.label || 'Home',
                      })}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold border bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:scale-105 active:scale-95 transition-all"
                    >
                      🏠 {userProfile.home_location.label || 'Home'}
                    </button>
                  )}
                  {userProfile?.work_location?.latitude && (
                    <button
                      id="btn-quick-work"
                      type="button"
                      onClick={() => setSelectedCoords({
                        lat: Number(userProfile.work_location.latitude),
                        lon: Number(userProfile.work_location.longitude),
                        name: userProfile.work_location.label || 'Work',
                      })}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold border bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:scale-105 active:scale-95 transition-all"
                    >
                      🏢 {userProfile.work_location.label || 'Work'}
                    </button>
                  )}
                  <button
                    id="btn-quick-delhi"
                    type="button"
                    onClick={() => setSelectedCoords({ lat: 28.6139, lon: 77.2090, name: 'Delhi-NCR Central' })}
                    className="px-2 py-1 rounded-lg text-[10px] font-semibold border hover:bg-[var(--surface-alt)] transition-all"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    📍 Central NCR
                  </button>
                </div>
              )}

              {/* Glossary Trigger */}
              <button
                type="button"
                id="btn-open-glossary"
                onClick={() => setGlossaryOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-extrabold border bg-[var(--surface-alt)] hover:bg-[var(--surface)] transition-all t2"
                style={{ borderColor: 'var(--border)' }}
                title="Open Technical Glossary for AQI, PM2.5, and monitoring definitions"
              >
                <span>📖</span>
                <span>Glossary</span>
              </button>
            </div>
          </div>

          {/* Main Advisory Row: AQI Multi-Channel Pill + Verdict Badge + Action & Cause */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* AQI + Multi-Channel Severity Badge (4 cols) */}
            <div className="md:col-span-4 flex items-center gap-4 p-3 rounded-2xl bg-[var(--surface-alt)] border" style={{ borderColor: 'var(--border)' }}>
              <div
                className="text-4xl lg:text-5xl font-black tracking-tight"
                style={{
                  color: d.aqi > 300 ? '#E5484D' : d.aqi > 200 ? '#F28C28' : d.aqi > 100 ? '#F5C542' : '#2EB872'
                }}
              >
                {d.aqi}
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-black uppercase tracking-wider tm">Index &amp; Severity</div>
                <div
                  className="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-full mt-0.5"
                  style={{
                    background: (d.aqi > 300 ? '#E5484D' : d.aqi > 200 ? '#F28C28' : '#F5C542') + '18',
                    color: d.aqi > 300 ? '#E5484D' : d.aqi > 200 ? '#F28C28' : '#F5C542',
                    border: `1px solid ${(d.aqi > 300 ? '#E5484D' : d.aqi > 200 ? '#F28C28' : '#F5C542')}40`
                  }}
                >
                  <span>{d.aqi > 300 ? '🚨' : d.aqi > 200 ? '🔴' : d.aqi > 100 ? '🟠' : '🟢'}</span>
                  <span>{d.status}</span>
                </div>
              </div>
            </div>

            {/* Authoritative Action & Health Recommendation (8 cols) */}
            <div className="md:col-span-8 flex flex-col justify-center p-3.5 rounded-2xl border bg-[var(--surface-alt)]" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-white shadow-xs"
                    style={{
                      background: d.verdict === 'STAY IN' ? '#E5484D' : d.verdict === 'CUT BACK' ? '#F28C28' : '#2EB872',
                    }}
                  >
                    {d.verdict}
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-wider text-indigo">
                    Recommended Action
                  </span>
                </div>
                <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  Best Window: {d.bestWindow}
                </div>
              </div>

              <p className="text-xs font-bold t1 leading-snug">
                {d.recommendation}
              </p>

              {/* Primary Cause in Plain English */}
              <div className="mt-2 pt-1.5 border-t flex items-center justify-between gap-2 flex-wrap text-[11px] font-semibold" style={{ borderColor: 'var(--border)' }}>
                <span className="t2">
                  <strong className="text-indigo">Primary Driver:</strong> {d.why?.[0]?.label || 'Particulate Matter'} — {d.why?.[0]?.detail || 'High fine particle concentrations under calm surface winds.'}
                </span>
                <span className="text-[10px] font-bold tm">
                  Recheck at {d.recheckAt}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 2. COMPACT MAP CARD (Default ~320px with Expand / Layers / GPS) ── */}
        <section id="map" className="w-full scroll-mt-24">
          <AirMap
            stations={d.stations}
            fires={d.fires}
            weather={d.weather}
            traffic={d.traffic}
            dark={dark}
            onLocationSelect={(lat, lon, name) => {
              setSelectedCoords({ lat, lon, name: name || 'Selected Point' });
            }}
          />
        </section>

        {/* ── 3. PRIMARY STATUS & WEATHER INTELLIGENCE ── */}
        <section id="weather" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 scroll-mt-24">
          {/* Card 1: AQI Gauge */}
          <div className={`${viewMode === 'advanced' ? 'lg:col-span-4' : 'lg:col-span-6'} flex flex-col`}>
            <AqiGauge
              aqi={d.aqi}
              status={d.status}
              location={d.location}
              country="India"
              verdict={d.verdict}
              recommendation={d.recommendation}
              bestWindow={d.bestWindow}
              recheckAt={d.recheckAt}
            />
          </div>

          {/* Card 2: Weather Intelligence & Correlation */}
          <div className={`${viewMode === 'advanced' ? 'lg:col-span-4' : 'lg:col-span-6'} flex flex-col`}>
            <WeatherCard weather={d.weather} aqi={d.aqi} />
          </div>

          {/* Card 3: Air Flow Dynamics & Compass (Advanced Mode Only) */}
          {viewMode === 'advanced' && (
            <div className="lg:col-span-4 flex flex-col">
              <AirFlowCard
                speed={d.weather?.windSpeed != null ? String(d.weather.windSpeed) : (demoMode ? "3.2" : "8.5")}
                unit="km/h"
                direction={d.weather?.windDirection || (demoMode ? "NW" : "WNW")}
                degrees={d.weather?.windDegrees || (demoMode ? 315 : 290)}
              />
            </div>
          )}
        </section>

        {/* ── 4. MULTI-METRIC FORECAST CHART (Full Width) ── */}
        <section id="forecast" className="w-full scroll-mt-24">
          <ForecastChart data={d.forecast} data7Day={d.forecast7Day} currentAqi={d.aqi} />
        </section>

        {/* ── 5. INTELLIGENCE, SCHOOL CARE & MOBILITY CORRIDORS ── */}
        {viewMode === 'advanced' ? (
          <section id="mobility" className="grid grid-cols-1 md:grid-cols-3 gap-6 scroll-mt-24">
            {/* Card 1: Why is the air bad? */}
            <div id="why" className="flex flex-col">
              <WhyPanel
                reasons={d.why}
                dominantPollutant={d.dominantPollutant}
              />
            </div>

            {/* Card 2: School Safety Protocol */}
            <div id="school" className="flex flex-col">
              <SchoolCard data={d.school} />
            </div>

            {/* Card 3: Mobility & Smog Impact Corridors */}
            <div className="flex flex-col">
              <MobilityCard traffic={d.traffic} />
            </div>
          </section>
        ) : (
          <div className="card p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--surface-alt)] shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔬</span>
              <div>
                <div className="text-xs font-black t1">Looking for deeper environmental diagnostics?</div>
                <div className="text-[11px] font-semibold t3">
                  Explore 6-pollutant telemetry, wind dynamics, pollution causality, and transit corridors in Advanced Mode.
                </div>
              </div>
            </div>
            <button
              type="button"
              id="btn-switch-advanced-prompt"
              onClick={() => handleViewModeChange('advanced')}
              className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-indigo text-white hover:scale-105 active:scale-95 transition-all shrink-0 shadow-sm"
            >
              Switch to Advanced View ➔
            </button>
          </div>
        )}

        {/* ── 6. POLLUTANTS BREAKDOWN (Advanced Mode Only) ── */}
        {viewMode === 'advanced' && (
          <section className="w-full">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-sm font-black t1 uppercase tracking-wider">
                Pollutant Concentration Breakdown
              </h3>
              <span className="text-[11px] font-bold t3">
                Standardized to CPCB / WHO Reference Thresholds
              </span>
            </div>
            <PollutantCards pollutants={d.pollutants} />
          </section>
        )}

        {/* ── 7. AI COPILOT & PERSONAL WATCHLIST ── */}
        <section id="ask" className="grid grid-cols-1 lg:grid-cols-12 gap-6 scroll-mt-24">
          {/* Left: Ask Arise AI Assistant */}
          <div className="lg:col-span-8 flex flex-col">
            <AskArise
              lat={selectedCoords.lat}
              lon={selectedCoords.lon}
              demo={demoMode}
              persona={userProfile?.persona || "General Public"}
            />
          </div>

          {/* Right: Personal Watchlist & Alerts */}
          <div className="lg:col-span-4 flex flex-col justify-between card p-5">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">📍</span>
                  <h3 className="text-sm font-black t1">Monitored Locations</h3>
                </div>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  {demoMode ? 'All In Red Zone' : 'Monitored'}
                </span>
              </div>
              <p className="text-[11px] font-medium t3 mb-4">
                Personalized tracking for family transit, home, and workplaces.
              </p>

              <div className="space-y-2">
                <Watchlist
                  items={personalizedWatchlist}
                  onSelect={(lat, lon, name) => setSelectedCoords({ lat, lon, name })}
                  onOpenSaveLocations={() => {
                    setCurrentView('signup');
                    window.location.hash = '#/signup';
                  }}
                />
              </div>
            </div>

            {/* Quick alert setting */}
            <div
              className="mt-4 p-3.5 rounded-2xl border"
              style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between text-xs font-black t1 mb-1">
                <span>Severe Air Alert Threshold</span>
                <span className="text-indigo font-bold">AQI &gt; 300</span>
              </div>
              <p className="text-[11px] font-medium t3">
                {userProfile?.alerts_enabled
                  ? 'Personal alerts enabled for saved locations.'
                  : 'Push notifications enabled for Delhi-NCR critical air zones.'}
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ═══════════════ HEALTH TIPS MODAL ═══════════════ */}
      {healthTipsOpen && (
        <div className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🫁</span>
                <h3 className="text-lg font-black t1">Health &amp; Action Advisory</h3>
              </div>
              <button
                onClick={() => setHealthTipsOpen(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold t3 hover:bg-[var(--surface-alt)]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs font-semibold t2">
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">
                <strong>Current Status: {d.status} (AQI {d.aqi})</strong><br />
                Vulnerable groups (children, elderly, asthma patients) must limit outdoor exertion.
              </div>
              <ul className="list-disc list-inside space-y-1.5 pl-1 t1">
                <li>Wear a certified N95 or FFP2 mask if transit is unavoidable.</li>
                <li>Avoid early morning (6 AM – 9 AM) and night outdoor workouts.</li>
                <li>Keep indoor air purifiers running with windows and vents sealed.</li>
                <li>Utilize the {d.bestWindow} window for critical outdoor tasks.</li>
              </ul>
            </div>

            <button
              onClick={() => setHealthTipsOpen(false)}
              className="w-full mt-5 py-2.5 rounded-xl bg-indigo text-white font-extrabold text-xs shadow-md"
            >
              Close Advisory
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════ TECHNICAL GLOSSARY MODAL ═══════════════ */}
      {glossaryOpen && (
        <TechnicalGlossaryModal onClose={() => setGlossaryOpen(false)} />
      )}

      {/* ═══════════════ MANDATORY POST-REGISTRATION COMPLETE PROFILE MODAL ═══════════════ */}
      {needsProfileCompletion && isAuthenticated && (
        <CompleteProfileModal
          onProfileCompleted={(p) => {
            setUserProfile(p);
            setNeedsProfileCompletion(false);
          }}
        />
      )}

      {/* ═══════════════ BOTTOM ACTION BAR ═══════════════ */}
      <footer
        className="sticky bottom-0 z-[1500] px-4 sm:px-6 lg:px-8 py-3 border-t backdrop-blur-md transition-colors"
        style={{
          borderColor: 'var(--border)',
          background: dark ? 'rgba(20, 28, 46, 0.92)' : 'rgba(255, 255, 255, 0.92)',
        }}
      >
        <div className="max-w-[1720px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollToSection('ask')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black bg-indigo text-white shadow-sm hover:scale-105 active:scale-95 transition-all"
            >
              <span>✦</span>
              <span>Ask Arise</span>
            </button>
            <button
              onClick={() => alert('Push Alerts active for Delhi-NCR.')}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold border transition-colors hover:bg-[var(--surface-alt)]"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              title="Alert Notifications"
            >
              🔔
            </button>
            <button
              onClick={() => navigator.clipboard && navigator.clipboard.writeText(window.location.href)}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold border transition-colors hover:bg-[var(--surface-alt)]"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              title="Share Report"
            >
              ↗
            </button>
          </div>

          <div className="hidden md:block text-[11px] font-semibold t3">
            Live air data · OpenAQ / CPCB stations
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setHealthTipsOpen(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-black border transition-all hover:scale-105 active:scale-95 shadow-sm"
              style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <span>✚</span>
              <span>Health Tips</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
