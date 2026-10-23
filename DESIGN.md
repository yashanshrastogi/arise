# DESIGN — Arise Design System & Frontend Architecture

<!-- impeccable:design-schema 1 -->

## 1. Visual Philosophy & Mode

- **Primary Mode:** **Operate** (Citizen Atmospheric Decision Engine) with **Persuade** accents for member acquisition and clean onboarding.
- **Audience:** Everyday citizens, parents, seniors, runners, and school administrators (ages 12 to 80).
- **Aesthetic Tone:** Clean, scientifically grounded, calm, and high-contrast. Avoids alarmist bright red washes; uses curated semantic status colors (CPCB NAQI standard) with subtle background tints and high-contrast inks.

---

## 2. Typography Scales & Strict Fluid Layout System

### 2.1. Font Families
- **Interface Sans:** Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
- **Numeric & Metric Display:** Tabular figures (`font-variant-numeric: tabular-nums`) for AQI gauges, timestamps, weather metrics, and coordinate telemetry to eliminate jitter during updates.

### 2.2. Fluid Typography Scale
All font sizes use responsive fluid typography clamps and Tailwind utility tokens:

| Token | Class | Size Range | Usage |
|:---|:---|:---|:---|
| **Display AQI** | `text-4xl sm:text-5xl md:text-6xl font-black` | `36px – 64px` | Hero verdict AQI numeral |
| **Hero Title** | `text-2xl sm:text-3xl font-black` | `24px – 30px` | Headline verdict, main section headers |
| **Section Header**| `text-lg sm:text-xl font-black` | `18px – 20px` | Card headers, modal titles |
| **Card Title** | `text-base sm:text-lg font-bold` | `16px – 18px` | Card headers, pollutant labels |
| **Body Primary** | `text-sm sm:text-base font-medium` | `14px – 16px` | Actionable directives, recommendations |
| **Body Supporting**| `text-xs sm:text-sm font-semibold` | `12px – 14px` | Explanations, sub-labels, metadata |
| **Micro Labels** | `text-[11px] sm:text-xs font-bold uppercase` | `11px – 12px` | Pill badges, unit tags, timestamps |

*Rule:* Never drop font sizes below `11px` anywhere in the interface. Maintain minimum 1.5 line height for body text.

### 2.3. Fluid Grid & Spacing System
- **Responsive Container:** `max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8`.
- **Card Spacing:** 12-column responsive grid with `gap-4 sm:gap-6`.
- **Touch Target Floor:** All interactive elements (buttons, segmented tabs, info tooltips, links) MUST maintain a minimum touch target bounding box of `44px × 44px` (or `48px` on mobile nav) via `min-h-[44px]` or `touch-target` utilities.

---

## 3. Semantic Token System (Light & Dark Mode)

All colors map to CSS variables in `index.css` supporting automatic and manual theme switching:

```css
:root {
  /* Surfaces & Backgrounds */
  --bg: #F8FAFC;
  --surface: #FFFFFF;
  --surface-alt: #F1F5F9;
  --card: #FFFFFF;
  --border: #E2E8F0;

  /* Typography Inks */
  --t1: #0F172A; /* High contrast primary */
  --t2: #334155; /* Secondary text */
  --tm: #64748B; /* Muted supporting text */
  --t3: #94A3B8; /* Disabled / subtle */

  /* Semantic AQI Bands (CPCB NAQI) */
  --good-ink: #059669;    --good-bg: rgba(209, 250, 229, 0.9);
  --sat-ink: #65A30D;     --sat-bg: rgba(236, 252, 203, 0.9);
  --mod-ink: #B45309;     --mod-bg: rgba(254, 243, 199, 0.9);
  --poor-ink: #C2410C;    --poor-bg: rgba(255, 237, 213, 0.9);
  --vpoor-ink: #B91C1C;   --vpoor-bg: rgba(254, 226, 226, 0.9);
  --sev-ink: #701A75;     --sev-bg: rgba(250, 232, 255, 0.9);
}

.dark {
  --bg: #0B0F19;
  --surface: #131A2E;
  --surface-alt: #1E293B;
  --card: #131A2E;
  --border: #1E293B;

  --t1: #F8FAFC;
  --t2: #E2E8F0;
  --tm: #94A3B8;
  --t3: #64748B;
}
```

---

## 4. Component Lazy-Loading Boundaries & Bundle Optimization

To maintain sub-second First Contentful Paint (FCP) and minimal initial JavaScript payloads, the application applies strict code-splitting boundaries using React `lazy()` and `Suspense`:

### 4.1. Critical Path (Eagerly Loaded in Entry Chunk)
- `VerdictHero.jsx`: Core calculated AQI and immediate safety verdict.
- `WeatherCard.jsx`: Surface meteorological snapshot.
- `AirFlowCard.jsx`: Atmospheric ventilation, boundary layer, and inversion status.
- `PersonaSelector.jsx`: Primary audience selection bar.
- `Watchlist.jsx`: Saved user places & guest callout.
- `PollutantCards.jsx`: 6-pollutant criteria grid.

### 4.2. Non-Critical Deferred Boundaries (Dynamic Imports)
1. **Interactive Maps (`AirMap.jsx` & Google Maps JS Loader):**
   - *Rationale:* Google Maps JS API and vector geometry assets exceed 350 kB.
   - *Strategy:* Deferred import loaded only when the user switches to the `#/map` tab or requests commute route visualization.
2. **Horizon Forecast Chart (`ForecastChart.jsx` & `recharts`):**
   - *Rationale:* Recharts SVG rendering libraries add ~180 kB to bundle size.
   - *Strategy:* Wrapped in dynamic import boundary with a matching skeleton fallback matching diurnal height (`h-[280px]`).
3. **Conversational Copilot (`AskArise.jsx`):**
   - *Rationale:* Full chat interface with markdown parsing and storage history.
   - *Strategy:* Loaded dynamically on the `#/ask` route or deferred until after initial dashboard hydration.
4. **Modals & Overlays:**
   - `ProfileSettingsModal.jsx`
   - `TechnicalGlossaryModal.jsx`
   - `CompleteProfileModal.jsx`
   - *Strategy:* Loaded strictly on-demand when the user triggers their respective toggle button.

---

## 5. Core Web Vitals Targets & Layout Stability

| Metric | Target | Tactical Mitigation Rule |
|:---|:---|:---|
| **CLS (Cumulative Layout Shift)** | **< 0.05** | Reserve exact explicit layout heights for gauges (`h-[180px]`), charts (`h-[280px]`), and forecast bars. Prevent font swap shift via `font-display: swap` with matched fallback metrics. |
| **INP (Interaction to Next Paint)** | **< 100ms** | Debounce interactive controls (location search, slider adjustments). Defer expensive spatial IDW calculations and route polyline decoding to asynchronous worker microtasks. |
| **LCP (Largest Contentful Paint)** | **< 1.5s** | SSR/Initial HTML delivers inline critical CSS tokens and Verdict Hero markup before third-party map scripts load. |
| **FID / TBT (Total Blocking Time)** | **< 150ms** | Keep main-thread tasks under 50ms; chunk heavy array operations across microtasks. |

---

## 6. Accessibility (WCAG 2.1 AA Compliance) & Inclusion

1. **Aria Labels & Roles:**
   - Every interactive icon-only button must have an explicit `aria-label` or `title`.
   - Modals must implement `role="dialog"`, `aria-modal="true"`, focus trapping, and `Escape` key listeners.
   - Info tooltips (`InfoTooltip.jsx`) must announce explanations via `aria-live="polite"` or `role="tooltip"`.
2. **Contrast Ratios:**
   - Minimum 4.5:1 contrast for all normal text against `--card` and `--surface-alt`.
   - Minimum 3:1 contrast for graphical elements and status pill outlines.
3. **Motion Preferences:**
   - Respect `prefers-reduced-motion: reduce`: disable transition transforms, pulse rings, and SVG gauge rotation animations.
4. **Age-Friendly Plain Language:**
   - No standalone unexplained scientific acronyms (e.g. SBL, IDW, PM2.5). Every technical term must feature an inline plain English `(i)` tooltip with practical health consequences.
