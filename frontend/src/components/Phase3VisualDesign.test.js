import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Phase 3 — ForecastChart eliminates negative left margins and prevents label clipping', () => {
  const chartPath = path.resolve(__dirname, 'ForecastChart.jsx');
  const content = fs.readFileSync(chartPath, 'utf8');

  // Verify negative margin is eliminated
  assert.ok(!content.includes("left: -16"), "ForecastChart must not have negative left margins");
  assert.ok(content.includes("left: 0"), "ForecastChart must use safe non-negative left margin (left: 0)");

  // Verify responsive width and min-w-0 constraints
  assert.ok(content.includes("w-full max-w-full min-w-0 overflow-hidden"), "ForecastChart root card must enforce min-w-0 max-w-full overflow-hidden");
  assert.ok(content.includes("w-full max-w-full min-w-0 flex items-center gap-1.5 overflow-x-auto"), "ForecastChart pills container must enforce min-w-0 max-w-full");

  // Verify minTickGap is configured to prevent overlapping tick labels
  assert.ok(content.includes("minTickGap={20}"), "ForecastChart must configure minTickGap >= 20 to avoid crowded X-axis labels");
});

test('Phase 3 — SignUpPage eliminates decorative bouncing animations', () => {
  const signUpPath = path.resolve(__dirname, 'SignUpPage.jsx');
  const content = fs.readFileSync(signUpPath, 'utf8');

  assert.ok(!content.includes("animate-bounce"), "SignUpPage must not use playful decorative animate-bounce");
  assert.ok(content.includes("animate-in zoom-in-95 duration-200"), "SignUpPage must use calm professional entrance transition");
});

test('Phase 3 — Footer disclaimers wrap responsively without forcing 913px horizontal overflow', () => {
  const footerPath = path.resolve(__dirname, 'Footer.jsx');
  const content = fs.readFileSync(footerPath, 'utf8');

  // Verify shrink-0 was removed from the disclaimer paragraph
  assert.ok(!content.includes('className="shrink-0 text-[10px] sm:text-[11px] font-semibold t2"'), "Footer must not use shrink-0 on zero-substitution disclaimer paragraph");
  assert.ok(content.includes('min-w-0 max-w-full'), "Footer disclaimer must be constrained to min-w-0 max-w-full");
});

test('Phase 3 — Clean environmental palette tokens and contrast are preserved', () => {
  const cssPath = path.resolve(__dirname, '../index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Verify essential design system tokens
  assert.ok(cssContent.includes("--good: #067647;"), "Good AQI token preserved");
  assert.ok(cssContent.includes("--sat: #4D7C0F;"), "Satisfactory AQI token preserved");
  assert.ok(cssContent.includes("--mod: #FDB022;"), "Moderate AQI token preserved");
  assert.ok(cssContent.includes("--poor: #B54708;"), "Poor AQI token preserved");
  assert.ok(cssContent.includes("--vpoor: #B42318;"), "Very Poor AQI token preserved");
  assert.ok(cssContent.includes("--sev: #7A1B3D;"), "Severe AQI token preserved");
});
