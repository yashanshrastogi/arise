import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORM_LINKS,
  SCIENCE_LINKS,
  TECH_LINKS,
  FOOTER_DISCLAIMERS,
  handleFooterNavigation,
} from './footerData.js';

test('Platform links contain exactly the 5 verified application destinations', () => {
  const ids = PLATFORM_LINKS.map(l => l.id);
  assert.deepEqual(ids, ['today', 'map', 'ask', 'more', 'glossary']);

  const labels = PLATFORM_LINKS.map(l => l.label);
  assert.ok(labels.includes("Today's Air Intelligence"));
  assert.ok(labels.includes("Airshed & Satellite Fire Map"));
  assert.ok(labels.includes("Ask Arise"));
  assert.ok(labels.includes("School Safety & Mobility Guides"));
  assert.ok(labels.includes("Environmental Glossary"));
});

test('handleFooterNavigation routes platform tabs via onNavigate callback', () => {
  let navigatedTab = null;
  const mockNavigate = (tab) => { navigatedTab = tab; };

  handleFooterNavigation(PLATFORM_LINKS[0], mockNavigate, null);
  assert.equal(navigatedTab, 'today');

  handleFooterNavigation(PLATFORM_LINKS[1], mockNavigate, null);
  assert.equal(navigatedTab, 'map');

  handleFooterNavigation(PLATFORM_LINKS[2], mockNavigate, null);
  assert.equal(navigatedTab, 'ask');

  handleFooterNavigation(PLATFORM_LINKS[3], mockNavigate, null);
  assert.equal(navigatedTab, 'more');
});

test('handleFooterNavigation routes glossary link via onOpenGlossary callback', () => {
  let glossaryOpened = false;
  const mockOpenGlossary = () => { glossaryOpened = true; };

  const glossaryItem = PLATFORM_LINKS.find(l => l.id === 'glossary');
  handleFooterNavigation(glossaryItem, null, mockOpenGlossary);
  assert.equal(glossaryOpened, true);
});

test('Environmental Data & Science links contain 6 verified official provider URLs', () => {
  assert.equal(SCIENCE_LINKS.length, 6);
  const labels = SCIENCE_LINKS.map(l => l.label);
  assert.deepEqual(labels, [
    'CPCB NAQI Standards',
    'OpenAQ',
    'Open-Meteo',
    'NASA FIRMS',
    'OpenRouteService',
    'OSM Photon',
  ]);

  for (const item of SCIENCE_LINKS) {
    assert.ok(item.href.startsWith('https://'), `href must be HTTPS: ${item.href}`);
    assert.ok(item.title && item.title.length > 5, `must have descriptive title: ${item.label}`);
  }

  const cpcb = SCIENCE_LINKS.find(l => l.label === 'CPCB NAQI Standards');
  assert.equal(cpcb.href, 'https://cpcb.nic.in/national-air-quality-index/');

  const openaq = SCIENCE_LINKS.find(l => l.label === 'OpenAQ');
  assert.equal(openaq.href, 'https://openaq.org/');

  const openmeteo = SCIENCE_LINKS.find(l => l.label === 'Open-Meteo');
  assert.equal(openmeteo.href, 'https://open-meteo.com/en/docs');

  const firms = SCIENCE_LINKS.find(l => l.label === 'NASA FIRMS');
  assert.equal(firms.href, 'https://firms.modaps.eosdis.nasa.gov/');
});

test('Technology & APIs links contain 5 verified engineering stack URLs', () => {
  assert.equal(TECH_LINKS.length, 5);
  const labels = TECH_LINKS.map(l => l.label);
  assert.deepEqual(labels, [
    'FastAPI',
    'AWS Serverless',
    'Google Gemini AI',
    'Amazon Cognito',
    'React & Vite',
  ]);

  for (const item of TECH_LINKS) {
    assert.ok(item.href.startsWith('https://'), `href must be HTTPS: ${item.href}`);
    assert.ok(item.title && item.title.length > 5, `must have descriptive title: ${item.label}`);
  }

  const fastapi = TECH_LINKS.find(l => l.label === 'FastAPI');
  assert.equal(fastapi.href, 'https://fastapi.tiangolo.com/');

  const gemini = TECH_LINKS.find(l => l.label === 'Google Gemini AI');
  assert.equal(gemini.href, 'https://ai.google.dev/');
});

test('Disclaimers strictly preserve deterministic science authority, medical disclaimer, and Zero Substitution policy', () => {
  assert.ok(FOOTER_DISCLAIMERS.authority.includes('deterministic algorithms'));
  assert.ok(FOOTER_DISCLAIMERS.authority.includes('CPCB NAQI'));
  assert.ok(FOOTER_DISCLAIMERS.medical.includes('medical diagnoses'));
  assert.ok(FOOTER_DISCLAIMERS.zeroSubstitution.includes('Zero Cross-Location Substitution Policy'));
  assert.ok(!FOOTER_DISCLAIMERS.zeroSubstitution.toLowerCase().includes('delhi'), 'Must not contain any mentions of Delhi');
  assert.ok(FOOTER_DISCLAIMERS.zeroDelhi.includes('Zero Cross-Location Substitution Policy'));
  assert.ok(FOOTER_DISCLAIMERS.copyright(2026).includes('2026 Arise Air Intelligence'));
  assert.ok(FOOTER_DISCLAIMERS.tagline.includes('100% Deterministic Science'));
});
