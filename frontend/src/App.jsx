import React, { useState, useEffect } from 'react';
import mockData from './mockData.json';
import mockDataModerate from './mockDataModerate.json';
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

/**
 * Arise — Delhi-NCR Air & Weather Intelligence Platform
 * Production Architecture: Air + Weather Integration, Compact/Expandable Map,
 * Deterministic Environmental Logic, and Cognito-ready Google Auth.
 */

const NAV_ITEMS = [
  { id: 'today',      label: 'Home',         icon: '🏠' },
  { id: 'map',        label: 'Air Map',      icon: '🗺️' },
  { id: 'weather',    label: 'Weather',      icon: '🌤️' },
  { id: 'forecast',   label: 'Forecast',     icon: '📈' },
  { id: 'mobility',   label: 'Corridors',    icon: '🚗' },
  { id: 'ask',        label: 'Ask Arise',    icon: '✦' },
];

export default function App() {
  const [dark, setDark] = useState(false);
  const [activeNav, setActiveNav] = useState('today');
  const [demoMode, setDemoMode] = useState(true);
  const [healthTipsOpen, setHealthTipsOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  // Demo mode toggle: dynamically loads the saved very-bad-air day or live moderate day
  const d = demoMode ? mockData : mockDataModerate;

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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#4F46E5] to-[#7C3AED] flex items-center justify-center text-white font-black text-lg shadow-md shadow-indigo-500/25">
              A
            </div>
            <div>
              <div className="text-xl font-black t1 tracking-tight leading-none flex items-center gap-2">
                <span>Arise</span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo/10 text-indigo">
                  Delhi-NCR
                </span>
              </div>
              <div className="text-[10px] font-bold tm mt-0.5">
                Air + Weather Intelligence Platform
              </div>
            </div>
          </div>

          {/* Navigation Pills */}
          <nav
            className="hidden md:flex items-center gap-1 p-1 rounded-2xl border"
            style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
          >
            {NAV_ITEMS.map(item => (
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

          {/* Right Header Controls: Demo Toggle, Dark Mode, Profile/Auth */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Demo Mode Toggle */}
            <button
              onClick={() => setDemoMode(!demoMode)}
              id="btn-demo-mode"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border transition-all hover:scale-105 active:scale-95"
              style={{
                background: demoMode ? '#E5484D18' : '#2EB87218',
                borderColor: demoMode ? '#E5484D50' : '#2EB87250',
                color: demoMode ? '#E5484D' : '#2EB872',
              }}
              title="Toggle Demo Mode: Saved Very-Bad Day (AQI 312) vs Live Moderate Day (AQI 128)"
            >
              <span className={`w-2 h-2 rounded-full ${demoMode ? 'bg-[#E5484D] animate-ping' : 'bg-[#2EB872]'}`} />
              <span>{demoMode ? 'Demo: Bad Air (AQI 312)' : 'Live: Moderate (AQI 128)'}</span>
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

            {/* User Profile & Google Authentication Component */}
            <UserProfileMenu />
          </div>
        </div>
      </header>

      {/* ═══════════════ MAIN CONTENT ═══════════════ */}
      <main className="flex-1 max-w-[1720px] mx-auto w-full p-4 sm:p-6 lg:p-8 flex flex-col gap-6">

        {/* ── 1. FIRST VIEWPORT EXECUTIVE FLOW: Location → AQI → Severity → Verdict → Reason → Action ── */}
        <section
          id="today"
          className="w-full card p-4 lg:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 border shadow-sm transition-all scroll-mt-24"
        >
          {/* Location */}
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl bg-indigo/10 text-indigo flex-shrink-0">
              📍
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider tm">Monitored Basin</div>
              <div className="text-base lg:text-lg font-black t1 leading-tight">{d.location}</div>
              <div className="text-[10px] font-bold t3 mt-0.5">{d.updated}</div>
            </div>
          </div>

          {/* AQI & Severity */}
          <div className="flex items-center gap-3.5 px-4 md:border-x min-w-[170px]" style={{ borderColor: 'var(--border)' }}>
            <div
              className="text-3xl lg:text-4xl font-black tracking-tight"
              style={{
                color: d.aqi > 300 ? '#E5484D' : d.aqi > 200 ? '#F28C28' : d.aqi > 100 ? '#F5C542' : '#2EB872'
              }}
            >
              {d.aqi}
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider tm">Index / Level</div>
              <span
                className="inline-flex text-xs font-black px-2.5 py-0.5 rounded-full mt-0.5"
                style={{
                  background: (d.aqi > 300 ? '#E5484D' : d.aqi > 200 ? '#F28C28' : '#F5C542') + '18',
                  color: d.aqi > 300 ? '#E5484D' : d.aqi > 200 ? '#F28C28' : '#F5C542',
                  border: `1px solid ${(d.aqi > 300 ? '#E5484D' : d.aqi > 200 ? '#F28C28' : '#F5C542')}35`
                }}
              >
                {d.status}
              </span>
            </div>
          </div>

          {/* Verdict */}
          <div className="flex items-center min-w-[130px]">
            <div
              className="w-full text-center px-4 py-2 rounded-xl text-xs font-black tracking-wider uppercase shadow-sm"
              style={{
                background: d.verdict === 'STAY IN' ? '#E5484D' : d.verdict === 'CUT BACK' ? '#F28C28' : '#2EB872',
                color: '#ffffff',
              }}
            >
              {d.verdict}
            </div>
          </div>

          {/* Reason */}
          <div className="flex-1 md:max-w-md px-2">
            <div className="text-[10px] font-black uppercase tracking-wider tm mb-0.5">Primary Reason</div>
            <p className="text-xs font-bold t1 leading-snug line-clamp-2">
              <span className="text-indigo font-extrabold">{d.why?.[0]?.label}:</span> {d.why?.[0]?.detail}
            </p>
          </div>

          {/* Recommended Action */}
          <div
            className="min-w-[240px] p-2.5 rounded-2xl border flex flex-col justify-center"
            style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
          >
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo mb-0.5">Recommended Action</div>
            <div className="text-xs font-bold t1 leading-tight line-clamp-2">{d.recommendation}</div>
            <div className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 mt-1 flex items-center justify-between">
              <span>Best Window: {d.bestWindow}</span>
              <span className="t3 font-bold">Recheck {d.recheckAt}</span>
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
          />
        </section>

        {/* ── 3. PRIMARY STATUS & WEATHER INTELLIGENCE ── */}
        <section id="weather" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 scroll-mt-24">
          {/* Card 1: AQI Gauge (4 cols) */}
          <div className="lg:col-span-4 flex flex-col">
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

          {/* Card 2: Weather Intelligence & Correlation (4 cols) */}
          <div className="lg:col-span-4 flex flex-col">
            <WeatherCard weather={d.weather} aqi={d.aqi} />
          </div>

          {/* Card 3: Air Flow Dynamics & Compass (4 cols) */}
          <div className="lg:col-span-4 flex flex-col">
            <AirFlowCard
              speed={demoMode ? "3.2" : "8.5"}
              unit="km/h"
              direction={demoMode ? "NW" : "WNW"}
              degrees={demoMode ? 315 : 290}
            />
          </div>
        </section>

        {/* ── 4. MULTI-METRIC FORECAST CHART (Full Width) ── */}
        <section id="forecast" className="w-full scroll-mt-24">
          <ForecastChart data={d.forecast} data7Day={d.forecast7Day} />
        </section>

        {/* ── 5. INTELLIGENCE, SCHOOL CARE & MOBILITY CORRIDORS ── */}
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

        {/* ── 6. POLLUTANTS BREAKDOWN ── */}
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

        {/* ── 7. AI COPILOT & PERSONAL WATCHLIST ── */}
        <section id="ask" className="grid grid-cols-1 lg:grid-cols-12 gap-6 scroll-mt-24">
          {/* Left: Ask Arise AI Assistant */}
          <div className="lg:col-span-8 flex flex-col">
            <AskArise replies={d.chatReplies} />
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
                  {demoMode ? 'All 3 In Red Zone' : 'All 3 In Moderate Zone'}
                </span>
              </div>
              <p className="text-[11px] font-medium t3 mb-4">
                Personalized tracking for family transit and workplaces.
              </p>

              <div className="space-y-2">
                <Watchlist items={d.watchlist} />
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
                Push notifications enabled for Saket (Home) &amp; Vasant Kunj (School).
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
            Arise Core · Real-time CPCB + Satellite Inversion Telemetry · {demoMode ? 'Saved Severe Event' : 'Moderate Day Simulation'}
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
