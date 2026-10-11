/**
 * Arise Scope Guardrail & Domain Verification Utility
 * Ensures queries are strictly restricted to the context of environmental intelligence:
 * - Air quality, pollutants, and AQI
 * - Weather, temperature, and atmospheric conditions
 * - Health advisories, outdoor safety, masks, purifiers, schools
 * - Regional airshed (Delhi-NCR, satellite fire signals)
 * - Arise environmental API telemetry integration
 *
 * If a query is out-of-scope, prevents unnecessary API calls and returns
 * a kind, instructive user-training denial response with highlighted keywords.
 */

// Strict word-boundary regex to prevent false positives (e.g. 'code' matching 'co', 'airplane' matching 'air')
const ENVIRONMENTAL_REGEX = new RegExp(
  '\\b(' +
  // Air quality & pollutants
  'aqi|air|airshed|basin|cpcb|openaq|pm2\\.5|pm25|pm10|pm\\s*2\\.5|pm\\s*10|' +
  'pollut\\w*|smog|smoke|haze|dust|particulate\\w*|ozone|o3|no2|so2|co2|carbon monoxide|' +
  'emission\\w*|exhaust|stubble|parali|inversion|stagnat\\w*|boundary layer|' +
  // Weather & atmospheric dynamics
  'weather|temp|temperature\\w*|forecast\\w*|wind\\w*|breeze|rain\\w*|cloud\\w*|sun\\w*|uv|' +
  'humid\\w*|climate|celsius|fahrenheit|degree\\w*|hot|cold|warm\\w*|chilly|winter|monsoon|fog|visibility|' +
  // Outdoor activities & exposure safety
  'go out|going out|outside|outdoor\\w*|stay in|staying in|walk\\w*|run\\w*|jog\\w*|marathon|' +
  'exercise\\w*|workout\\w*|gym|cycle\\w*|cycling|bike|biking|commute\\w*|transit|play\\w*|playground|park|' +
  'safe|safety|hazard\\w*|risk\\w*|' +
  // Sensitive demographics & health symptoms
  'kid\\w*|child\\w*|baby|babies|toddler\\w*|school\\w*|student\\w*|sports|elderly|senior\\w*|' +
  'parent\\w*|grandparent\\w*|asthma|respiratory|breath\\w*|lung\\w*|cough\\w*|throat|allergy|allergies|inhaler|' +
  // Protective actions & protocols
  'mask\\w*|n95|kn95|ffp2|purifier\\w*|hepa|filter\\w*|filtration|window\\w*|balcony|indoor\\w*|recirculat\\w*|' +
  // Satellite fire anomalies & agricultural burning
  'fire\\w*|burn\\w*|flame\\w*|hotspot\\w*|thermal|firms|viirs|modis|' +
  // Geographic airshed
  'delhi|ncr|noida|gurugram|gurgaon|ghaziabad|faridabad|mandir marg|anand vihar|punjab|haryana|' +
  // Platform & environmental telemetry
  'arise|telemetry|sensor\\w*|station\\w*' +
  ')\\b',
  'i'
);

/**
 * Validates if a user's question belongs to Arise's environmental domain.
 * @param {string} question
 * @returns {boolean}
 */
export function isEnvironmentalQuery(question) {
  if (!question || typeof question !== 'string') return false;
  const q = question.trim();
  if (q.length === 0) return false;
  return ENVIRONMENTAL_REGEX.test(q);
}

/**
 * Produces a warm, educational user-training denial response when a non-environmental
 * question is submitted, avoiding wasteful API calls and coaching the user on Arise's capabilities.
 * @param {string} question
 * @returns {object}
 */
export function getOutOfScopeGuardrailResponse(question) {
  return {
    verdict: 'BE SMART',
    headline: 'I am **Arise**, an **environmental intelligence assistant**. I focus on **air quality**, **weather**, **health advisories**, and **environmental telemetry**.',
    why: [
      'I am **Arise**, an **environmental intelligence assistant**. I focus on **air quality**, **weather**, **health advisories**, and **environmental telemetry**.',
      'If you have general coding, math, or off-topic questions, I politely decline so I remain dedicated to atmospheric and health intelligence.',
    ],
    do: [
      'Ask: *"Can I go for an outdoor run right now?"* to evaluate **respiratory exertion safety**.',
      'Ask: *"Is the air safe for children or elderly parents?"* for **tailored group health advisories**.',
      'Ask: *"What is the current temperature and wind speed?"* for **real-time meteorological telemetry**.',
      'Ask: *"Write a python script to fetch air data"* for **Arise environmental REST API integration**.',
    ],
    best_window: 'Check live hourly forecast above',
    recheck_at: 'Hourly',
    sources: ['Arise Intelligence Guardrail'],
    assistant_label: 'Arise Intelligence (Scope Guardrail)',
    is_rule_based: true,
    provider: 'rule-based',
    timestamp: 'Scope Guidance',
  };
}
