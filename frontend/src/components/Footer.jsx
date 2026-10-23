import React, { useState } from 'react';
import {
  PLATFORM_LINKS,
  SCIENCE_LINKS,
  TECH_LINKS,
  FOOTER_DISCLAIMERS,
  handleFooterNavigation,
} from '../utils/footerData';

/**
 * Modernized, compact, and responsive enterprise footer for Arise.
 * Provides organized navigation, verified scientific sources, engineering stack documentation,
 * deterministic governance disclosures, and copyright notices.
 */
export default function Footer({ onNavigate = null, onOpenGlossary = null }) {
  // Mobile accordion state for secondary technical and scientific documentation groups
  const [openScience, setOpenScience] = useState(false);
  const [openTech, setOpenTech] = useState(false);

  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="w-full mt-8 sm:mt-12 pt-8 sm:pt-10 pb-20 md:pb-8 border-t transition-colors shrink-0"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
      }}
      role="contentinfo"
      aria-label="Arise Global Footer"
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        {/* Main Grid: Brand & 3 Link Columns */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 lg:gap-8 pb-6 sm:pb-8 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          {/* Brand & Mission Column */}
          <div className="lg:col-span-4 space-y-2.5 pr-0 lg:pr-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-sm font-black shadow-xs shrink-0">
                ✦
              </div>
              <span className="text-lg font-black t1 tracking-tight">Arise</span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full border t3 bg-[var(--surface-alt)]"
                style={{ borderColor: 'var(--border)' }}
              >
                Air Intelligence Platform
              </span>
            </div>

            <p className="text-xs font-medium tm leading-relaxed max-w-sm">
              Deterministic atmospheric intelligence answering everyday outdoor safety, exposure windows, and activity decisions for families.
            </p>

            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold t2 pt-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span>Ground &amp; Satellite Telemetry Live</span>
              </div>
              <span className="tm opacity-40">·</span>
              <span className="text-xs font-medium tm">CPCB NAQI Compliant</span>
            </div>
          </div>

          {/* Column 1: Platform Links */}
          <div className="lg:col-span-3 space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider t1 mb-2">Platform</h4>
            <ul className="space-y-1.5 text-xs font-semibold tm">
              {PLATFORM_LINKS.map((link) => (
                <li key={link.id}>
                  <button
                    type="button"
                    onClick={() => handleFooterNavigation(link, onNavigate, onOpenGlossary)}
                    className="hover:t1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-sm py-0.5"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 2: Environmental Data & Science (Collapsible on mobile) */}
          <div className="lg:col-span-3 space-y-2 border-t md:border-t-0 pt-3 md:pt-0" style={{ borderColor: 'var(--border)' }}>
            <div
              className="flex items-center justify-between cursor-pointer md:cursor-default select-none mb-2"
              onClick={() => setOpenScience(!openScience)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenScience(!openScience);
                }
              }}
              aria-expanded={openScience}
              aria-label="Toggle Environmental Data & Science Links"
            >
              <h4 className="text-xs font-black uppercase tracking-wider t1 pointer-events-none">
                Environmental Data &amp; Science
              </h4>
              <span className="text-xs t3 md:hidden transition-transform duration-200">
                {openScience ? '▴' : '▾'}
              </span>
            </div>

            <ul className={`space-y-1.5 text-xs font-semibold tm ${openScience ? 'block' : 'hidden md:block'}`}>
              {SCIENCE_LINKS.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:t1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors inline-flex items-center gap-1 group py-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-sm"
                    title={item.title}
                    aria-label={`${item.label} (opens documentation in new tab)`}
                  >
                    <span>{item.label}</span>
                    <span className="text-[10px] opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Technology & APIs (Collapsible on mobile) */}
          <div className="lg:col-span-2 space-y-2 border-t md:border-t-0 pt-3 md:pt-0" style={{ borderColor: 'var(--border)' }}>
            <div
              className="flex items-center justify-between cursor-pointer md:cursor-default select-none mb-2"
              onClick={() => setOpenTech(!openTech)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenTech(!openTech);
                }
              }}
              aria-expanded={openTech}
              aria-label="Toggle Technology & APIs Links"
            >
              <h4 className="text-xs font-black uppercase tracking-wider t1 pointer-events-none">
                Technology &amp; APIs
              </h4>
              <span className="text-xs t3 md:hidden transition-transform duration-200">
                {openTech ? '▴' : '▾'}
              </span>
            </div>

            <ul className={`space-y-1.5 text-xs font-semibold tm ${openTech ? 'block' : 'hidden md:block'}`}>
              {TECH_LINKS.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:t1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors inline-flex items-center gap-1 group py-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-sm"
                    title={item.title}
                    aria-label={`${item.label} (opens documentation in new tab)`}
                  >
                    <span>{item.label}</span>
                    <span className="text-[10px] opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Middle Notice: Compact Scientific Authority, Medical Disclaimer, and Zero Substitution Policy */}
        <div
          className="py-3 sm:py-3.5 border-b text-[11px] tm leading-relaxed space-y-1"
          style={{ borderColor: 'var(--border)' }}
        >
          <p>
            <strong className="t1 font-bold">Deterministic Science Authority:</strong> {FOOTER_DISCLAIMERS.authority}
          </p>
          <div className="flex flex-col md:flex-row md:items-start lg:items-center justify-between gap-1.5 md:gap-4 opacity-85 min-w-0">
            <p className="flex-1 min-w-0">
              <strong className="t1 font-bold">Disclaimer:</strong> {FOOTER_DISCLAIMERS.medical}
            </p>
            <p className="text-[10px] sm:text-[11px] font-semibold t2 min-w-0 max-w-full">
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span> {FOOTER_DISCLAIMERS.zeroSubstitution || FOOTER_DISCLAIMERS.zeroDelhi}
            </p>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Rights */}
        <div className="pt-3.5 sm:pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs tm">
          <div>
            <span>{FOOTER_DISCLAIMERS.copyright(currentYear)}</span>
          </div>

          <div className="flex items-center gap-2 text-[11px] sm:text-xs font-medium">
            <span>Global Environmental Intelligence</span>
            <span className="opacity-30">·</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">100% Deterministic Science</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
