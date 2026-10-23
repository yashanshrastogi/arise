/**
 * Centralized Time Context and Synchronization Utility for Arise
 *
 * Guarantees consistent Asia/Kolkata timezone handling across the Header Clock,
 * Forecast Horizon Chart, Verdict Hero, School Advisories, and Recheck Times.
 * Prevents expired time windows (e.g. morning 6-8 AM) from being presented
 * as future recommendations when the current time is in the afternoon.
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

// Waking hours outdoor boundary: recommendations strictly between 6:00 AM and 10:00 PM
export const MIN_OUTDOOR_WAKING_HOUR = 6;  // 6:00 AM
export const MAX_OUTDOOR_WAKING_HOUR = 22; // 10:00 PM

export function isWakingOutdoorHour(hour) {
  if (hour === null || hour === undefined || Number.isNaN(Number(hour))) return false;
  const h = Number(hour);
  return h >= MIN_OUTDOOR_WAKING_HOUR && h <= MAX_OUTDOOR_WAKING_HOUR;
}

/**
 * Returns current instant formatted or adapted to local or Asia/Kolkata timezone.
 */
export function getKolkataNow(referenceDate = new Date()) {
  return referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
}

/**
 * Format time in any valid IANA timeZone (default: Asia/Kolkata) (e.g. "12:15 PM")
 */
export function formatLocalTime(dateOrIso = new Date(), timeZone = DEFAULT_TIMEZONE, options = {}) {
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (isNaN(date.getTime())) return '';
  const tz = (typeof timeZone === 'string' && timeZone.trim()) ? timeZone.trim() : DEFAULT_TIMEZONE;
  try {
    return date.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      ...options,
    });
  } catch {
    return date.toLocaleTimeString('en-US', {
      timeZone: DEFAULT_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      ...options,
    });
  }
}

/**
 * Format time in Asia/Kolkata (e.g. "12:15 PM")
 */
export function formatKolkataTime(dateOrIso = new Date(), options = {}) {
  const tz = options?.timeZone || DEFAULT_TIMEZONE;
  return formatLocalTime(dateOrIso, tz, options);
}

/**
 * Format full date in any valid IANA timeZone (e.g. "Sunday, 11 Oct 2026")
 */
export function formatLocalDate(dateOrIso = new Date(), timeZone = DEFAULT_TIMEZONE, options = {}) {
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (isNaN(date.getTime())) return '';
  const tz = (typeof timeZone === 'string' && timeZone.trim()) ? timeZone.trim() : DEFAULT_TIMEZONE;
  try {
    return date.toLocaleDateString('en-US', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...options,
    });
  } catch {
    return date.toLocaleDateString('en-US', {
      timeZone: DEFAULT_TIMEZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...options,
    });
  }
}

/**
 * Format full date in Asia/Kolkata (e.g. "Sunday, 11 Oct 2026")
 */
export function formatKolkataDate(dateOrIso = new Date(), options = {}) {
  const tz = options?.timeZone || DEFAULT_TIMEZONE;
  return formatLocalDate(dateOrIso, tz, options);
}

/**
 * Format short date in any valid IANA timeZone (e.g. "Sun, 11 Oct")
 */
export function formatLocalShortDate(dateOrIso = new Date(), timeZone = DEFAULT_TIMEZONE, options = {}) {
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (isNaN(date.getTime())) return '';
  const tz = (typeof timeZone === 'string' && timeZone.trim()) ? timeZone.trim() : DEFAULT_TIMEZONE;
  try {
    return date.toLocaleDateString('en-US', {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...options,
    });
  } catch {
    return date.toLocaleDateString('en-US', {
      timeZone: DEFAULT_TIMEZONE,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...options,
    });
  }
}

/**
 * Format short date in Asia/Kolkata (e.g. "Sun, 11 Oct")
 */
export function formatKolkataShortDate(dateOrIso = new Date(), options = {}) {
  const tz = options?.timeZone || DEFAULT_TIMEZONE;
  return formatLocalShortDate(dateOrIso, tz, options);
}

/**
 * Get current hour number (0–23) in given timeZone
 */
export function getLocalHour(dateOrIso = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  const tz = (typeof timeZone === 'string' && timeZone.trim()) ? timeZone.trim() : DEFAULT_TIMEZONE;
  try {
    const hourStr = date.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    });
    const parsed = parseInt(hourStr, 10);
    return isNaN(parsed) ? date.getHours() : parsed % 24;
  } catch {
    return date.getHours();
  }
}

/**
 * Get current hour number (0–23) in Asia/Kolkata
 */
export function getKolkataHour(dateOrIso = new Date(), options = {}) {
  const tz = (typeof options === 'string' ? options : options?.timeZone) || DEFAULT_TIMEZONE;
  return getLocalHour(dateOrIso, tz);
}

/**
 * Parse standard time label string (e.g. "6 AM", "12 PM", "3 PM", "11 PM") to 0–23 hour number.
 */
export function parseHourLabel(label) {
  if (!label || typeof label !== 'string') return null;
  const match = label.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && h < 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return h;
}

/**
 * Compute realistic, dynamic recheck time in target timeZone (default: +3 hours, rounded to next hour).
 * Never returns a past time.
 */
export function computeDynamicRecheckTime(now = new Date(), hoursAhead = 3, timeZone = DEFAULT_TIMEZONE) {
  const currentHour = getLocalHour(now, timeZone);
  const targetHour = (currentHour + hoursAhead) % 24;
  const period = targetHour >= 12 ? 'PM' : 'AM';
  const displayHour = targetHour % 12 === 0 ? 12 : targetHour % 12;
  return `${displayHour}:00 ${period}`;
}

export function computeOutdoorWindowImprovement({
  currentAqi = null,
  nowVal = null,
  minFutureAqi = null,
  bwStart = null,
  bwEnd = null,
  isModelOnly = false,
  windowStatus = null,
} = {}) {
  const hasExplicitCurrent = currentAqi != null && !Number.isNaN(Number(currentAqi));
  const hasNowVal = nowVal != null && !Number.isNaN(Number(nowVal));

  const currentVal = hasExplicitCurrent
    ? Number(currentAqi)
    : (hasNowVal ? Number(nowVal) : null);

  const hasEffectiveBaseline = currentVal !== null;

  const minAqi = (minFutureAqi != null && !Number.isNaN(Number(minFutureAqi)))
    ? Number(minFutureAqi)
    : currentVal;

  const percentImprovement = (hasEffectiveBaseline && currentVal > 0 && minAqi !== null)
    ? (currentVal - minAqi) / currentVal
    : 0;

  const isBetterBand = Boolean(
    hasEffectiveBaseline && minAqi !== null && (
      (currentVal > 300 && minAqi <= 300) ||
      (currentVal > 200 && minAqi <= 200) ||
      (currentVal > 100 && minAqi <= 100)
    )
  );

  const hasRealSafeWindow = Boolean(
    hasEffectiveBaseline &&
    (percentImprovement >= 0.15 || isBetterBand) &&
    bwStart &&
    bwEnd
  );

  return {
    currentVal,
    minAqi,
    percentImprovement,
    isBetterBand,
    hasRealSafeWindow,
    hasEffectiveBaseline,
    isModelOnly: Boolean(isModelOnly || windowStatus === 'model_projected'),
    windowStatus: windowStatus || (hasRealSafeWindow ? 'ground_calibrated' : (hasEffectiveBaseline ? 'unsuitable' : 'unavailable')),
  };
}

/**
 * Synchronize forecast array with current local clock.
 * Corrects past vs future flags, identifies current point, and ensures
 * best outdoor window recommendations ONLY evaluate upcoming/future hours.
 */
export function synchronizeForecastTimeline(rawForecast = [], currentAqi = null, now = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const hasValidBaseline = currentAqi != null && !Number.isNaN(Number(currentAqi));
  const numericCurrentAqi = hasValidBaseline ? Number(currentAqi) : null;

  if (!Array.isArray(rawForecast) || rawForecast.length === 0) {
    return {
      synchronizedForecast: [],
      nowIdx: 0,
      nowTime: '12 PM',
      bestWindowStr: 'No recommended outdoor window',
      minFutureAqi: numericCurrentAqi,
      hasRealBestWindow: false,
      windowStatus: 'unavailable',
      isModelOnly: false,
    };
  }

  const tz = (typeof timeZone === 'string' && timeZone.trim()) ? timeZone.trim() : DEFAULT_TIMEZONE;
  const currentHour = getLocalHour(now, tz);
  const nowIsoHourStr = (() => {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
      const hPad = String(currentHour).padStart(2, '0');
      return `${parts}T${hPad}:00`;
    } catch {
      return '';
    }
  })();

  // 1. Tag each point with accurate past / isCurrent status
  let nowIdx = -1;

  // First pass: try matching ISO timestamp or isCurrent flag from backend
  const tagged = rawForecast.map((pt, idx) => {
    let isPast = false;
    let isCurrent = false;

    if (pt.timestamp && typeof pt.timestamp === 'string') {
      const ptHourStr = pt.timestamp.slice(0, 13); // "YYYY-MM-DDTHH"
      if (nowIsoHourStr && ptHourStr) {
        const cmp = ptHourStr.localeCompare(nowIsoHourStr.slice(0, 13));
        isPast = cmp < 0;
        isCurrent = cmp === 0;
      }
    } else if (pt.time) {
      const ptHour = parseHourLabel(pt.time);
      if (ptHour !== null) {
        // If within current day timeline
        isPast = ptHour < currentHour;
        isCurrent = ptHour === currentHour;
      } else {
        isPast = Boolean(pt.past);
      }
    } else {
      isPast = Boolean(pt.past);
    }

    if (pt.isCurrent) isCurrent = true;
    if (isCurrent && nowIdx === -1) nowIdx = idx;

    return {
      ...pt,
      past: isPast,
      isCurrent,
    };
  });

  // If no exact hour matched isCurrent, choose the first non-past point
  if (nowIdx === -1) {
    const firstFutureIdx = tagged.findIndex(p => !p.past);
    nowIdx = firstFutureIdx !== -1 ? firstFutureIdx : Math.max(0, tagged.length - 1);
    if (tagged[nowIdx]) {
      tagged[nowIdx].isCurrent = true;
      tagged[nowIdx].past = false;
    }
  }

  const nowTime = tagged[nowIdx]?.time || `${currentHour % 12 || 12} ${currentHour >= 12 ? 'PM' : 'AM'}`;

  // 2. Evaluate outdoor window strictly among valid FUTURE points (current hour onwards)
  const futurePoints = tagged.filter((p, i) => i >= nowIdx && !p.past);

  let bestCandidateStart = -1;
  let lowestRisk = 999999;
  const windowSize = Math.min(3, Math.max(1, futurePoints.length));

  if (futurePoints.length >= 1) {
    for (let i = 0; i <= futurePoints.length - windowSize; i++) {
      const slice = futurePoints.slice(i, i + windowSize);

      // 1. Waking outdoor hours check: strictly between 6:00 AM and 10:00 PM
      // Overnight hours (10:00 PM to 6:00 AM) are sleeping hours and must not be recommended
      let isOvernight = false;
      for (const p of slice) {
        let h = null;
        if (p.time) {
          h = parseHourLabel(p.time);
        } else if (p.timestamp && typeof p.timestamp === 'string' && p.timestamp.includes('T')) {
          h = parseInt(p.timestamp.split('T')[1].slice(0, 2), 10);
        }
        if (h !== null && !isWakingOutdoorHour(h)) {
          isOvernight = true;
          break;
        }
      }
      if (isOvernight) continue;

      // 2. Severe weather and AQI limit enforcement
      let isUnsuitable = false;
      for (const p of slice) {
        const aqiVal = p.aqi != null ? Number(p.aqi) : (numericCurrentAqi != null ? numericCurrentAqi : null);
        if (aqiVal == null || aqiVal > 300) {
          isUnsuitable = true;
          break;
        }
        const pPrecip = p.precipitation != null ? Number(p.precipitation) : (p.precip != null ? Number(p.precip) : null);
        const pRain = p.rainProb != null ? Number(p.rainProb) : (p.rain_probability != null ? Number(p.rain_probability) : null);
        const pWind = p.windSpeed != null ? Number(p.windSpeed) : (p.windKmh != null ? Number(p.windKmh) : (p.wind_speed != null ? Number(p.wind_speed) : null));
        const pGust = p.windGusts != null ? Number(p.windGusts) : (p.windGustsKmh != null ? Number(p.windGustsKmh) : (p.wind_gusts != null ? Number(p.wind_gusts) : null));

        if (pPrecip != null && pPrecip >= 1.0) {
          isUnsuitable = true;
          break;
        }
        if (pPrecip == null && pRain != null && pRain > 75) {
          isUnsuitable = true;
          break;
        }
        if (pWind != null && pWind > 30.0) {
          isUnsuitable = true;
          break;
        }
        if (pGust != null && pGust > 45.0) {
          isUnsuitable = true;
          break;
        }
      }
      if (isUnsuitable) continue;

      const avgAqi = slice.reduce((acc, p) => acc + (p.aqi != null ? Number(p.aqi) : (numericCurrentAqi != null ? numericCurrentAqi : 0)), 0) / windowSize;
      const avgRain = slice.reduce((acc, p) => acc + (p.rainProb != null ? Number(p.rainProb) : (p.rain_probability != null ? Number(p.rain_probability) : 10)), 0) / windowSize;
      const hasPrecip = slice.some(p => p.precipitation != null || p.precip != null);
      const avgPrecip = hasPrecip
        ? slice.reduce((acc, p) => acc + (p.precipitation != null ? Number(p.precipitation) : (p.precip != null ? Number(p.precip) : 0)), 0) / windowSize
        : null;
      const avgWind = slice.reduce((acc, p) => acc + (p.windSpeed != null ? Number(p.windSpeed) : (p.windKmh != null ? Number(p.windKmh) : (p.wind_speed != null ? Number(p.wind_speed) : 3.5))), 0) / windowSize;

      const rainPenalty = (avgPrecip !== null)
        ? (avgPrecip * 30.0) + (avgRain * 0.3)
        : avgRain * 1.0;
      const windPenalty = Math.max(0, avgWind - 15.0) * 1.5;

      const risk = avgAqi + rainPenalty + windPenalty;
      if (risk < lowestRisk) {
        lowestRisk = risk;
        bestCandidateStart = i;
      }
    }
  }

  // Check if future waking window represents meaningful improvement (>= 15% better or strictly better band)
  const wakingFuturePoints = futurePoints.filter(p => {
    let h = null;
    if (p.time) h = parseHourLabel(p.time);
    else if (p.timestamp && typeof p.timestamp === 'string' && p.timestamp.includes('T')) {
      h = parseInt(p.timestamp.split('T')[1].slice(0, 2), 10);
    }
    return h === null || isWakingOutdoorHour(h);
  });

  const futureAqis = (wakingFuturePoints.length > 0 ? wakingFuturePoints : futurePoints)
    .map(p => (p.aqi != null && !Number.isNaN(Number(p.aqi))) ? Number(p.aqi) : null)
    .filter(v => v !== null);
  const minFutureAqi = futureAqis.length > 0 ? Math.min(...futureAqis) : numericCurrentAqi;

  // Never compute improvement against an invented baseline. Zero baseline yields 0% without division-by-zero.
  const percentImprovement = (hasValidBaseline && numericCurrentAqi > 0 && minFutureAqi != null)
    ? (numericCurrentAqi - minFutureAqi) / numericCurrentAqi
    : 0;
  const isBetterBand = Boolean(
    hasValidBaseline && minFutureAqi != null && (
      (numericCurrentAqi > 300 && minFutureAqi <= 300) ||
      (numericCurrentAqi > 200 && minFutureAqi <= 200) ||
      (numericCurrentAqi > 100 && minFutureAqi <= 100)
    )
  );

  let windowStatus = 'unavailable';
  let hasRealBestWindow = false;
  let hasModelWindow = false;

  if (hasValidBaseline) {
    const hasMeaningfulImprovement = (percentImprovement >= 0.15 || isBetterBand);
    if (hasMeaningfulImprovement && bestCandidateStart !== -1 && lowestRisk < 320) {
      hasRealBestWindow = true;
      windowStatus = 'ground_calibrated';
    } else {
      hasRealBestWindow = false;
      windowStatus = 'unsuitable';
    }
  } else {
    // Current AQI is missing (e.g. London, NY, non-monitored coords)
    if (futureAqis.length === 0) {
      windowStatus = 'forecast_unavailable';
    } else if (bestCandidateStart !== -1 && lowestRisk < 320) {
      hasModelWindow = true;
      windowStatus = 'model_projected';
    } else {
      windowStatus = 'unsuitable';
    }
  }

  let bestWindowLabels = [];
  let modelWindowLabels = [];

  const synchronizedForecast = tagged.map(pt => {
    let isBest = false;
    let isModelBest = false;

    if (bestCandidateStart !== -1) {
      const futureIdx = futurePoints.indexOf(pt);
      if (futureIdx >= bestCandidateStart && futureIdx < bestCandidateStart + windowSize) {
        if (hasRealBestWindow) {
          isBest = true;
          bestWindowLabels.push(pt.time);
        } else if (hasModelWindow) {
          isModelBest = true;
          modelWindowLabels.push(pt.time);
        }
      }
    }

    return {
      ...pt,
      bestWindow: isBest,
      modelWindow: isModelBest,
      windowStatus: isBest ? 'ground_calibrated' : (isModelBest ? 'model_projected' : undefined),
    };
  });

  const bestWindowStr = (hasRealBestWindow && bestWindowLabels.length > 0)
    ? `${bestWindowLabels[0]} – ${bestWindowLabels[bestWindowLabels.length - 1]}`
    : 'No recommended outdoor window';

  const modelWindowStr = (hasModelWindow && modelWindowLabels.length > 0)
    ? `${modelWindowLabels[0]} – ${modelWindowLabels[modelWindowLabels.length - 1]}`
    : null;

  return {
    synchronizedForecast,
    nowIdx,
    nowTime,
    bestWindowStr,
    modelWindowStr,
    minFutureAqi,
    hasRealBestWindow,
    hasModelWindow,
    windowStatus,
    isModelOnly: !hasValidBaseline && hasModelWindow,
  };
}
