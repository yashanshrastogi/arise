/**
 * Centralized Time Context and Synchronization Utility for Arise
 *
 * Guarantees consistent Asia/Kolkata timezone handling across the Header Clock,
 * Forecast Horizon Chart, Verdict Hero, School Advisories, and Recheck Times.
 * Prevents expired time windows (e.g. morning 6-8 AM) from being presented
 * as future recommendations when the current time is in the afternoon.
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns current instant formatted or adapted to Asia/Kolkata timezone.
 */
export function getKolkataNow(referenceDate = new Date()) {
  return referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
}

/**
 * Format time in Asia/Kolkata (e.g. "12:15 PM")
 */
export function formatKolkataTime(dateOrIso = new Date(), options = {}) {
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-IN', {
    timeZone: DEFAULT_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options,
  });
}

/**
 * Format full date in Asia/Kolkata (e.g. "Sunday, 11 Oct 2026")
 */
export function formatKolkataDate(dateOrIso = new Date(), options = {}) {
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    timeZone: DEFAULT_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  });
}

/**
 * Format short date in Asia/Kolkata (e.g. "Sun, 11 Oct")
 */
export function formatKolkataShortDate(dateOrIso = new Date(), options = {}) {
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    timeZone: DEFAULT_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...options,
  });
}

/**
 * Get current hour number (0–23) in Asia/Kolkata
 */
export function getKolkataHour(dateOrIso = new Date()) {
  const date = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  const hourStr = date.toLocaleTimeString('en-IN', {
    timeZone: DEFAULT_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  });
  const parsed = parseInt(hourStr, 10);
  return isNaN(parsed) ? date.getHours() : parsed % 24;
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
 * Compute realistic, dynamic recheck time in Asia/Kolkata (default: +3 hours, rounded to next hour).
 * Never returns a past time.
 */
export function computeDynamicRecheckTime(now = new Date(), hoursAhead = 3) {
  const currentHour = getKolkataHour(now);
  const targetHour = (currentHour + hoursAhead) % 24;
  const period = targetHour >= 12 ? 'PM' : 'AM';
  const displayHour = targetHour % 12 === 0 ? 12 : targetHour % 12;
  return `${displayHour}:00 ${period}`;
}

/**
 * Synchronize forecast array with current Asia/Kolkata clock.
 * Corrects past vs future flags, identifies current point, and ensures
 * best outdoor window recommendations ONLY evaluate upcoming/future hours.
 */
export function synchronizeForecastTimeline(rawForecast = [], currentAqi = 312, now = new Date()) {
  if (!Array.isArray(rawForecast) || rawForecast.length === 0) {
    return {
      synchronizedForecast: [],
      nowIdx: 0,
      nowTime: '12 PM',
      bestWindowStr: 'No recommended outdoor window',
      minFutureAqi: currentAqi,
      hasRealBestWindow: false,
    };
  }

  const currentHour = getKolkataHour(now);
  const nowIsoHourStr = (() => {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: DEFAULT_TIMEZONE,
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

  if (futurePoints.length >= 2) {
    for (let i = 0; i <= futurePoints.length - windowSize; i++) {
      const slice = futurePoints.slice(i, i + windowSize);
      const avgAqi = slice.reduce((acc, p) => acc + (Number(p.aqi) || currentAqi), 0) / windowSize;
      const avgRain = slice.reduce((acc, p) => acc + (Number(p.rainProb) || 10), 0) / windowSize;
      const risk = avgAqi + (avgRain * 1.5);
      if (risk < lowestRisk) {
        lowestRisk = risk;
        bestCandidateStart = i;
      }
    }
  }

  // Check if future window represents meaningful improvement (>= 15% better or strictly better band)
  const futureAqis = futurePoints.map(p => Number(p.aqi)).filter(v => !isNaN(v) && v > 0);
  const minFutureAqi = futureAqis.length > 0 ? Math.min(...futureAqis) : currentAqi;
  const percentImprovement = currentAqi > 0 ? (currentAqi - minFutureAqi) / currentAqi : 0;
  const isBetterBand = (currentAqi > 300 && minFutureAqi <= 300) ||
                       (currentAqi > 200 && minFutureAqi <= 200) ||
                       (currentAqi > 100 && minFutureAqi <= 100);
  const hasRealBestWindow = (percentImprovement >= 0.15 || isBetterBand) && bestCandidateStart !== -1 && lowestRisk < 350;

  let bestWindowLabels = [];
  const synchronizedForecast = tagged.map(pt => {
    let isBest = false;
    if (hasRealBestWindow && bestCandidateStart !== -1) {
      const futureIdx = futurePoints.indexOf(pt);
      if (futureIdx >= bestCandidateStart && futureIdx < bestCandidateStart + windowSize) {
        isBest = true;
        bestWindowLabels.push(pt.time);
      }
    }
    return {
      ...pt,
      bestWindow: isBest,
    };
  });

  const bestWindowStr = (hasRealBestWindow && bestWindowLabels.length > 0)
    ? `${bestWindowLabels[0]} – ${bestWindowLabels[bestWindowLabels.length - 1]}`
    : 'No recommended outdoor window';

  return {
    synchronizedForecast,
    nowIdx,
    nowTime,
    bestWindowStr,
    minFutureAqi,
    hasRealBestWindow,
  };
}
