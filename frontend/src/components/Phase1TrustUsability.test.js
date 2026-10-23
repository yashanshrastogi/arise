import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOOTER_DISCLAIMERS } from '../utils/footerData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../..');

test('Phase 1 - VerdictHero provides interactive regional map navigation', () => {
  const heroPath = path.join(frontendDir, 'src/components/VerdictHero.jsx');
  const content = fs.readFileSync(heroPath, 'utf-8');
  assert.ok(content.includes('onOpenMap'), 'VerdictHero must accept onOpenMap callback');
  assert.ok(content.includes('Explore regional map'), 'VerdictHero must provide interactive regional map navigation');
});

test('Phase 1 - index.html title is location-neutral', () => {
  const indexPath = path.join(frontendDir, 'index.html');
  const content = fs.readFileSync(indexPath, 'utf-8');
  assert.ok(!content.includes('Delhi-NCR Air Intelligence'), 'index.html must not hardcode Delhi-NCR in title');
  assert.ok(
    content.includes('Arise · Global Environmental &amp; Weather Intelligence') ||
    content.includes('Arise · Environmental &amp; Weather Intelligence'),
    'index.html must have neutral environmental title'
  );
});

test('Phase 1 - Glossary modal does not hardcode Delhi-NCR', () => {
  const glossaryPath = path.join(frontendDir, 'src/components/TechnicalGlossaryModal.jsx');
  const content = fs.readFileSync(glossaryPath, 'utf-8');
  assert.ok(!content.includes('primary health driver across Delhi-NCR'), 'Glossary must not claim PM2.5 is only across Delhi-NCR');
  assert.ok(!content.includes('Understand Delhi-NCR air quality indicators'), 'Glossary subtitle must not be limited to Delhi-NCR');
});

test('Phase 1 - Footer tagline is location-neutral and deterministic', () => {
  assert.ok(!FOOTER_DISCLAIMERS.tagline.includes('Delhi-NCR'), 'Footer tagline must not be restricted to Delhi-NCR');
  assert.ok(FOOTER_DISCLAIMERS.tagline.includes('100% Deterministic Science'), 'Footer tagline must preserve deterministic authority');
});

test('Phase 1 - Reduced motion CSS uses graceful WCAG AA alternative without 0.001ms sledgehammer', () => {
  const cssPath = path.join(frontendDir, 'src/index.css');
  const content = fs.readFileSync(cssPath, 'utf-8');
  assert.ok(!content.includes('animation-duration: 0.001ms'), 'index.css must not use 0.001ms destructive animation duration');
  assert.ok(!content.includes('transition-duration: 0.001ms'), 'index.css must not use 0.001ms destructive transition duration');
  assert.ok(content.includes('prefers-reduced-motion: reduce'), 'index.css must contain prefers-reduced-motion media query');
});

test('Phase 1 - AirMap scope switcher and location denial are location-neutral', () => {
  const mapPath = path.join(frontendDir, 'src/components/AirMap.jsx');
  const content = fs.readFileSync(mapPath, 'utf-8');
  assert.ok(!content.includes('Showing Delhi-NCR.'), 'AirMap must not claim to show Delhi-NCR when location is denied');
  assert.ok(content.includes('Showing regional overview.'), 'AirMap must show neutral regional overview message on denial');
  assert.ok(content.includes('id="btn-scope-local"'), 'AirMap must provide dynamic local scope button');
});
