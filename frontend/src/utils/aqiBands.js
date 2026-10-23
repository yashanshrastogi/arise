/**
 * Band mapping with WCAG-compliant colors, word labels, and distinct symbols.
 * Never relies on color alone.
 */
export function getAqiBandInfo(aqi) {
  if (aqi === null || aqi === undefined || aqi === '' || isNaN(Number(aqi))) {
    return {
      band: 'Unavailable',
      label: 'Air quality unavailable',
      symbol: '—',
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.12)',
      ink: '#64748b',
      iconClass: 'slash',
      plainAction: 'No ground monitoring in range',
    };
  }
  const val = Number(aqi);
  if (val > 400) {
    return {
      band: 'Severe',
      label: 'Severe air emergency',
      symbol: '⚠️',
      color: 'var(--sev)',
      bg: 'var(--sev-bg)',
      ink: 'var(--sev-ink)',
      iconClass: 'alert-triangle',
      plainAction: 'Stay indoors today',
    };
  }
  if (val > 300) {
    return {
      band: 'Very Bad',
      label: 'Very bad air',
      symbol: '■',
      color: 'var(--vpoor)',
      bg: 'var(--vpoor-bg)',
      ink: 'var(--vpoor-ink)',
      iconClass: 'square',
      plainAction: 'Stay indoors today',
    };
  }
  if (val > 200) {
    return {
      band: 'Poor',
      label: 'Poor air',
      symbol: '▲',
      color: 'var(--poor)',
      bg: 'var(--poor-bg)',
      ink: 'var(--poor-ink)',
      iconClass: 'triangle',
      plainAction: 'Limit outdoor exertion',
    };
  }
  if (val > 100) {
    return {
      band: 'Moderate',
      label: 'Moderate air',
      symbol: '●',
      color: 'var(--mod)',
      bg: 'var(--mod-bg)',
      ink: 'var(--mod-ink)',
      iconClass: 'circle',
      plainAction: 'Sensitive groups take care',
    };
  }
  if (val > 50) {
    return {
      band: 'Satisfactory',
      label: 'Satisfactory air',
      symbol: '●',
      color: 'var(--sat)',
      bg: 'var(--sat-bg)',
      ink: 'var(--sat-ink)',
      iconClass: 'circle-small',
      plainAction: 'Normal outdoor activity permitted',
    };
  }
  return {
    band: 'Good',
    label: 'Good air',
    symbol: '✓',
    color: 'var(--good)',
    bg: 'var(--good-bg)',
    ink: 'var(--good-ink)',
    iconClass: 'check',
    plainAction: 'Great time to be outside',
  };
}

export function getWatchlistAqiColor(aqi) {
  if (aqi == null || aqi === '' || isNaN(Number(aqi))) {
    return '#94a3b8';
  }
  const val = Number(aqi);
  return val > 400 ? '#7A1B3D' :
    val > 300 ? '#B42318' :
    val > 200 ? '#B54708' :
    val > 100 ? '#FDB022' :
    val > 50  ? '#4D7C0F' : '#067647';
}

export function getWatchlistSeverityIcon(aqi) {
  if (aqi == null || aqi === '' || isNaN(Number(aqi))) {
    return '—';
  }
  const val = Number(aqi);
  return val > 400 ? '⚠️' :
    val > 300 ? '■' :
    val > 200 ? '▲' :
    val > 100 ? '●' :
    val > 50  ? '●' : '✓';
}
