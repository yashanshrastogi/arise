/**
 * Determine the exact outdoor window status across the 5 canonical states:
 * 1. ground_calibrated (verified ground telemetry & weather favorable)
 * 2. model_projected (uncalibrated atmospheric model forecast)
 * 3. unsuitable (forecast available but AQI or severe weather exceeds limits)
 * 4. forecast_unavailable (insufficient or failed forecast data)
 * 5. current_unavailable_no_window (no ground monitoring and no model window identified)
 */
export function resolveVerdictWindowStatus({
  bestWindowDetails = null,
  bwTaggedItems = [],
  modelTaggedItems = [],
  currentAqi = null,
  forecastAqiValues = [],
  candidatePoints = [],
} = {}) {
  // 1. Authoritative status from backend or timeline bundle
  if (bestWindowDetails && typeof bestWindowDetails.status === 'string') {
    const s = bestWindowDetails.status.toLowerCase();
    if (s === 'ground_calibrated' && (bwTaggedItems.length > 0 || bestWindowDetails.window_str !== 'No recommended outdoor window')) {
      return 'ground_calibrated';
    }
    if (s === 'model_projected' && (bwTaggedItems.length > 0 || modelTaggedItems.length > 0 || bestWindowDetails.window_str !== 'No recommended outdoor window')) {
      return 'model_projected';
    }
    if (s === 'unsuitable') {
      return 'unsuitable';
    }
    if (s === 'unavailable') {
      return currentAqi !== null ? 'unsuitable' : (forecastAqiValues.length === 0 ? 'forecast_unavailable' : 'current_unavailable_no_window');
    }
  }

  // 2. Direct point tagging (from timeContext or backend)
  if (bwTaggedItems.length > 0) {
    return 'ground_calibrated';
  }
  if (modelTaggedItems.length > 0) {
    return 'model_projected';
  }

  // 3. Fallback when neither ground nor model window is tagged
  const isCurrentUnavailable = currentAqi === null || currentAqi === undefined || Number.isNaN(Number(currentAqi));
  if (!isCurrentUnavailable) {
    // Current AQI is known, but no suitable window was tagged
    if (candidatePoints.length === 0 || forecastAqiValues.length === 0) {
      return 'forecast_unavailable';
    }
    return 'unsuitable';
  }

  // 4. Current AQI is unavailable
  if (forecastAqiValues.length === 0) {
    return 'forecast_unavailable';
  }
  return 'current_unavailable_no_window';
}
