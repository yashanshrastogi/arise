import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLATFORM_LINKS } from '../utils/footerData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Phase 2 — AskArise loading stages use plain-English progress without developer pipeline jargon', () => {
  const askArisePath = path.resolve(__dirname, 'AskArise.jsx');
  const content = fs.readFileSync(askArisePath, 'utf8');

  // Verify internal software pipeline terminology was replaced
  assert.ok(!content.includes("Executing Arise Intelligence Pipeline..."), "Must not use developer pipeline execution message");
  assert.ok(content.includes("Analyzing local environmental conditions..."), "Must use user-friendly loading description");

  // Verify pipeline stages are human friendly
  assert.ok(content.includes("'Question'"), "Must include Question stage");
  assert.ok(content.includes("'Conditions'"), "Must include Conditions stage");
  assert.ok(content.includes("'Guidance'"), "Must include Guidance stage");
  assert.ok(content.includes("'Verified'"), "Must include Verified stage");

  // Verify Copilot references in headings were replaced
  assert.ok(!content.includes("Ask Arise Atmospheric Copilot"), "Must not use Copilot in main heading");
  assert.ok(!content.includes("Members-Only Environmental Copilot"), "Must not use Copilot in members badge");
  assert.ok(content.includes("Ask Arise Environmental Intelligence"), "Must use clean Environmental Intelligence heading");
});

test('Phase 2 — Footer platform links use plain Ask Arise without Copilot suffix', () => {
  const askLink = PLATFORM_LINKS.find(l => l.id === 'ask');
  assert.ok(askLink, "Ask link must exist");
  assert.equal(askLink.label, "Ask Arise");
  assert.ok(!askLink.label.includes("Copilot"), "Ask link must not include Copilot");
});

test('Phase 2 — AirFlowCard uses plain-English air ceiling terminology and location-neutral dispersion', () => {
  const airFlowCardPath = path.resolve(__dirname, 'AirFlowCard.jsx');
  const content = fs.readFileSync(airFlowCardPath, 'utf8');

  // Verify plain English layer descriptions
  assert.ok(content.includes("Low air ceiling (< 400m)"), "Must use plain-English low air ceiling");
  assert.ok(content.includes("Moderate air mixing (~600m)"), "Must use plain-English moderate air mixing");
  assert.ok(content.includes("Well ventilated (> 800m)"), "Must use plain-English well ventilated");

  // Verify removal of regional Indo-Gangetic basin hardcoding from banner
  assert.ok(!content.includes("Indo-Gangetic basin stagnation"), "Must not hardcode Indo-Gangetic basin into general dispersion banner");
  assert.ok(content.includes("Calm surface wind is preventing dispersion of fine particulates"), "Must use location-neutral dispersion description");

  // Verify scientific Surface Boundary Layer tooltip remains accessible for advanced users
  assert.ok(content.includes("Surface Boundary Layer"), "Must preserve scientific boundary layer in InfoTooltip");
  assert.ok(content.includes("InfoTooltip"), "Must keep InfoTooltip component for scientific depth");
});

test('Phase 2 — PollutantCards uses inclusive Official Ground Telemetry badge', () => {
  const pollutantCardsPath = path.resolve(__dirname, 'PollutantCards.jsx');
  const content = fs.readFileSync(pollutantCardsPath, 'utf8');

  assert.ok(content.includes("Official Ground Telemetry"), "Must use Official Ground Telemetry badge");
  assert.ok(!content.includes("CPCB Ground Telemetry\n        </span>"), "Must not restrict telemetry badge to CPCB only");
});

test('Phase 2 — WeatherCard focuses on visibility and thermal link without duplicating wind dispersion box', () => {
  const weatherCardPath = path.resolve(__dirname, 'WeatherCard.jsx');
  const content = fs.readFileSync(weatherCardPath, 'utf8');

  // Visibility prominently displayed
  assert.ok(content.includes("Visibility:"), "WeatherCard must feature visibility");
  // Correlation box explains temperature & moisture
  assert.ok(content.includes("Thermal & Moisture Impact"), "WeatherCard correlation must focus on thermal and moisture impact");
  assert.ok(content.includes("Weather & Air Quality Link"), "Tooltip must describe weather and air quality link");
});

test('Phase 2 — Three-level information hierarchy is strictly preserved in primary views', () => {
  const verdictHeroPath = path.resolve(__dirname, 'VerdictHero.jsx');
  const heroContent = fs.readFileSync(verdictHeroPath, 'utf8');

  // Level 1: Everyday decision
  assert.ok(heroContent.includes("Current Air Quality Verdict"), "VerdictHero provides Level 1 decision verdict");
  assert.ok(heroContent.includes("bestWindowLabel") || heroContent.includes("bestForecastHour"), "VerdictHero provides Level 1 best outdoor window");

  // Level 2: Explanation
  assert.ok(heroContent.includes("Tiny fine dust is trapped near the ground") || heroContent.includes("Air quality permits regular routines"), "VerdictHero provides Level 2 explanation of emission drivers");
  assert.ok(heroContent.includes("Explore regional map"), "Provides link to spatial map explanation");

  // Level 3: Deep scientific telemetry
  const glossaryPath = path.resolve(__dirname, 'TechnicalGlossaryModal.jsx');
  const glossaryContent = fs.readFileSync(glossaryPath, 'utf8');
  assert.ok(glossaryContent.includes("PM2.5"), "Level 3 scientific measurements defined");
  assert.ok(glossaryContent.includes("Spatial IDW"), "Level 3 spatial interpolation explained");
});
