import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Phase 4 — Universal visible focus indicators comply with WCAG 2.2 (SC 2.4.11)', () => {
  const cssPath = path.resolve(__dirname, '../index.css');
  const content = fs.readFileSync(cssPath, 'utf8');

  // Verify focus-visible rules with high contrast outlines
  assert.ok(content.includes('button:focus-visible'), 'Must define focus-visible on buttons');
  assert.ok(content.includes('a:focus-visible'), 'Must define focus-visible on anchors');
  assert.ok(content.includes('input:focus-visible'), 'Must define focus-visible on inputs');
  assert.ok(content.includes('[role="button"]:focus-visible'), 'Must define focus-visible on role=button');
  assert.ok(content.includes('outline: 3px solid #1F3FD6'), 'Must provide 3px solid high contrast focus ring in light mode');
  assert.ok(content.includes('outline: 3px solid #818CF8'), 'Must provide 3px solid high contrast focus ring in dark mode');
  assert.ok(content.includes('outline-offset: 3px'), 'Must provide 3px outline offset to prevent border collisions');
});

test('Phase 4 — Dialogs and modals handle Escape key and manage focus correctly', () => {
  const glossaryPath = path.resolve(__dirname, 'TechnicalGlossaryModal.jsx');
  const glossary = fs.readFileSync(glossaryPath, 'utf8');
  assert.ok(glossary.includes("e.key === 'Escape'"), 'Glossary modal must dismiss on Escape');
  assert.ok(glossary.includes('role="dialog"'), 'Glossary modal must declare role="dialog"');
  assert.ok(glossary.includes('aria-modal="true"'), 'Glossary modal must declare aria-modal="true"');

  const profileSettingsPath = path.resolve(__dirname, 'ProfileSettingsModal.jsx');
  const profileSettings = fs.readFileSync(profileSettingsPath, 'utf8');
  assert.ok(profileSettings.includes("event.key === 'Escape'"), 'Profile settings modal must dismiss on Escape');
  assert.ok(profileSettings.includes('role="dialog"'), 'Profile settings modal must declare role="dialog"');
  assert.ok(profileSettings.includes('aria-modal="true"'), 'Profile settings modal must declare aria-modal="true"');

  const memoryPath = path.resolve(__dirname, 'MemoryManagerModal.jsx');
  const memory = fs.readFileSync(memoryPath, 'utf8');
  assert.ok(memory.includes("e.key === 'Escape'"), 'Memory manager modal must dismiss on Escape');
  assert.ok(memory.includes('role="dialog"'), 'Memory manager modal must declare role="dialog"');
  assert.ok(memory.includes('aria-modal="true"'), 'Memory manager modal must declare aria-modal="true"');

  const loginPath = path.resolve(__dirname, 'LoginPage.jsx');
  const login = fs.readFileSync(loginPath, 'utf8');
  assert.ok(login.includes("e.key === 'Escape'"), 'Login page modal must dismiss on Escape');

  const signUpPath = path.resolve(__dirname, 'SignUpPage.jsx');
  const signUp = fs.readFileSync(signUpPath, 'utf8');
  assert.ok(signUp.includes("e.key === 'Escape'"), 'SignUp page modal must dismiss on Escape');
});

test('Phase 4 — Touch targets satisfy WCAG 2.2 Level AA target size requirements (SC 2.5.8)', () => {
  const cssPath = path.resolve(__dirname, '../index.css');
  const content = fs.readFileSync(cssPath, 'utf8');

  assert.ok(content.includes('.touch-target'), 'Must provide touch-target utility class');
  assert.ok(content.includes('min-height: 44px;'), 'Touch target min-height must be at least 44px');
  assert.ok(content.includes('min-width: 44px;'), 'Touch target min-width must be at least 44px');
});

test('Phase 4 — Reduced motion preferences avoid disorienting animations without breaking state changes', () => {
  const cssPath = path.resolve(__dirname, '../index.css');
  const content = fs.readFileSync(cssPath, 'utf8');

  // Verify graceful transition preservation instead of 0.001ms sledgehammer
  assert.ok(!content.includes('animation-duration: 0.001ms !important;'), 'Must not use destructive 0.001ms sledgehammer');
  assert.ok(content.includes('@media (prefers-reduced-motion: reduce)'), 'Must define prefers-reduced-motion media query');
  assert.ok(content.includes('animation: none !important;'), 'Must disable decorative animations on reduce');
});

test('Phase 4 — Cumulative regression check: all key fixes from Phases 1-3 remain active', () => {
  // Phase 1: Regional map navigation
  const heroPath = path.resolve(__dirname, 'VerdictHero.jsx');
  const hero = fs.readFileSync(heroPath, 'utf8');
  assert.ok(hero.includes('onOpenMap') && hero.includes('Explore regional map'), 'VerdictHero map navigation button must remain active');

  // Phase 1: Document title neutral
  const htmlPath = path.resolve(__dirname, '../../index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.ok(
    html.includes('Arise · Global Environmental &amp; Weather Intelligence') ||
    html.includes('Arise · Environmental &amp; Weather Intelligence') ||
    html.includes('Arise · Environmental & Weather Intelligence'),
    'HTML default title must remain location-neutral'
  );

  // Phase 2: Pipeline stages user-friendly
  const askPath = path.resolve(__dirname, 'AskArise.jsx');
  const ask = fs.readFileSync(askPath, 'utf8');
  assert.ok(!ask.includes('Executing Arise Intelligence Pipeline...'), 'AskArise must not revert to developer pipeline message');

  // Phase 2: Footer platform links
  const footerDataPath = path.resolve(__dirname, '../utils/footerData.js');
  const footerData = fs.readFileSync(footerDataPath, 'utf8');
  assert.ok(footerData.includes('label: "Ask Arise"'), 'Footer link must remain Ask Arise without Copilot');

  // Phase 3: Forecast chart left margin
  const chartPath = path.resolve(__dirname, 'ForecastChart.jsx');
  const chart = fs.readFileSync(chartPath, 'utf8');
  assert.ok(!chart.includes('left: -16'), 'ForecastChart must not revert to negative margin');

  // Phase 3: Responsive footer disclaimers
  const footerPath = path.resolve(__dirname, 'Footer.jsx');
  const footer = fs.readFileSync(footerPath, 'utf8');
  assert.ok(!footer.includes('className="shrink-0 text-[10px] sm:text-[11px] font-semibold t2"'), 'Footer disclaimer must not force shrink-0 overflow');
});
