/**
 * Footer navigation links, verified external documentation destinations,
 * and authoritative scientific/governance disclaimers for Arise.
 */

export const PLATFORM_LINKS = [
  { id: 'today', label: "Today's Air Intelligence", tab: 'today' },
  { id: 'map', label: "Airshed & Satellite Fire Map", tab: 'map' },
  { id: 'ask', label: "Ask Arise", tab: 'ask' },
  { id: 'more', label: "School Safety & Mobility Guides", tab: 'more' },
  { id: 'glossary', label: "Environmental Glossary", isGlossary: true },
];

export const SCIENCE_LINKS = [
  {
    label: "CPCB NAQI Standards",
    href: "https://cpcb.nic.in/national-air-quality-index/",
    title: "Central Pollution Control Board National Air Quality Index standard formulations",
  },
  {
    label: "OpenAQ",
    href: "https://openaq.org/",
    title: "OpenAQ Global Real-Time Air Quality Platform",
  },
  {
    label: "Open-Meteo",
    href: "https://open-meteo.com/en/docs",
    title: "Open-Meteo High-Resolution Weather & Boundary Layer Prediction",
  },
  {
    label: "NASA FIRMS",
    href: "https://firms.modaps.eosdis.nasa.gov/",
    title: "NASA FIRMS VIIRS & MODIS Thermal Satellite Fire Detection",
  },
  {
    label: "OpenRouteService",
    href: "https://openrouteservice.org/dev/#/api-docs",
    title: "OpenRouteService Routing Engine & Isochrone Documentation",
  },
  {
    label: "OSM Photon",
    href: "https://photon.komoot.io/",
    title: "OpenStreetMap Photon Spatial Geocoder API",
  },
];

export const TECH_LINKS = [
  {
    label: "FastAPI",
    href: "https://fastapi.tiangolo.com/",
    title: "FastAPI Python 3.12 Asynchronous Backend Engine",
  },
  {
    label: "AWS Serverless",
    href: "https://aws.amazon.com/serverless/",
    title: "Amazon Web Services Serverless: Lambda, API Gateway, DynamoDB TTL Cache",
  },
  {
    label: "Google Gemini AI",
    href: "https://ai.google.dev/",
    title: "Google Gemini AI Environmental Intelligence Synthesis Pipeline",
  },
  {
    label: "Amazon Cognito",
    href: "https://aws.amazon.com/cognito/",
    title: "Amazon Cognito OAuth 2.0 PKCE Authentication",
  },
  {
    label: "React & Vite",
    href: "https://vite.dev/",
    title: "React 19 & Vite 8 Frontend Single Page Application",
  },
];

export const FOOTER_DISCLAIMERS = {
  authority: "Air quality calculations and safety verdicts are computed strictly by deterministic algorithms conforming to Indian CPCB NAQI formulations. Generative AI models never calculate or alter environmental scores.",
  medical: "Arise provides atmospheric exposure intelligence for everyday decisions and does not provide medical diagnoses or replace emergency healthcare.",
  zeroSubstitution: "Zero Cross-Location Substitution Policy: Telemetry and verdicts reflect the selected coordinates only. External data is never substituted for outside locations.",
  get zeroDelhi() { return this.zeroSubstitution; },
  copyright: (year = new Date().getFullYear()) => `© ${year} Arise Air Intelligence. All rights reserved.`,
  tagline: "Environmental & Weather Intelligence for Everyday Decisions · 100% Deterministic Science",
};

/**
 * Handles tab navigation or opens external fallback hash
 */
export function handleFooterNavigation(item, onNavigate, onOpenGlossary) {
  if (item.isGlossary) {
    if (typeof onOpenGlossary === 'function') {
      onOpenGlossary();
      return;
    }
  }
  if (item.tab) {
    if (typeof onNavigate === 'function') {
      onNavigate(item.tab);
    } else if (typeof window !== 'undefined') {
      window.location.hash = `#/${item.tab}`;
    }
  }
}
