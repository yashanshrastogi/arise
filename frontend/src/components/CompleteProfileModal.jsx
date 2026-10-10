import React, { useState } from 'react';
import { bootstrapUserProfile } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function CompleteProfileModal({ onProfileCompleted }) {
  const { user, accessToken } = useAuth();
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [persona, setPersona] = useState('General Public');
  const [alertsEnabled, setAlertsEnabled] = useState(false);

  // Home location
  const [homeAddress, setHomeAddress] = useState('');
  const [homeLat, setHomeLat] = useState('');
  const [homeLon, setHomeLon] = useState('');

  // Work location
  const [workAddress, setWorkAddress] = useState('');
  const [workLat, setWorkLat] = useState('');
  const [workLon, setWorkLon] = useState('');

  const [locatingPrefix, setLocatingPrefix] = useState(null);
  const [locationStatus, setLocationStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // "Use my current location" with browser permission request and user review
  const handleUseCurrentLocation = (prefix) => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setError('');
    setLocatingPrefix(prefix);
    setLocationStatus(`Requesting browser permission for ${prefix} location...`);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        if (prefix === 'home') {
          setHomeLat(String(lat));
          setHomeLon(String(lon));
          if (!homeAddress) setHomeAddress(`${lat}°N, ${lon}°E (Current Area)`);
        } else {
          setWorkLat(String(lat));
          setWorkLon(String(lon));
          if (!workAddress) setWorkAddress(`${lat}°N, ${lon}°E (Current Area)`);
        }
        setLocatingPrefix(null);
        setLocationStatus(`Coordinates obtained (${lat}, ${lon}). You can review and edit below.`);
      },
      (err) => {
        setLocatingPrefix(null);
        setError(`Location access denied or timed out (${err.message}). You can enter an address manually.`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!displayName.trim()) {
      setError('Please provide your name.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        display_name: displayName.trim(),
        persona,
        alerts_enabled: alertsEnabled,
      };

      if (homeAddress.trim() || homeLat.trim() || homeLon.trim()) {
        payload.home_location = {
          label: 'Home',
          address: homeAddress.trim() || 'Home Location',
          latitude: homeLat ? Number(homeLat) : undefined,
          longitude: homeLon ? Number(homeLon) : undefined,
        };
      }

      if (workAddress.trim() || workLat.trim() || workLon.trim()) {
        payload.work_location = {
          label: 'Work',
          address: workAddress.trim() || 'Work Location',
          latitude: workLat ? Number(workLat) : undefined,
          longitude: workLon ? Number(workLon) : undefined,
        };
      }

      const res = await bootstrapUserProfile(accessToken, payload);
      onProfileCompleted(res);
    } catch (err) {
      setError(err.message || 'Failed to complete profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-profile-title"
        className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl border p-6 sm:p-8 shadow-2xl"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl font-black t1">Welcome to Arise</span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              Profile Setup
            </span>
          </div>
          <h2 id="complete-profile-title" className="text-lg font-bold t1">
            Complete your Arise Profile
          </h2>
          <p className="text-xs tm mt-1">
            Required after registration to tailor air quality recommendations and health advisories.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Display Name */}
          <div>
            <label className="block text-xs font-semibold t1 mb-1">
              Your Name <span className="text-red-500">*</span>
            </label>
            <input
              id="input-profile-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alice Sharma"
              className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              style={{
                background: 'var(--surface-alt)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Verified Email from Cognito */}
          <div>
            <label className="block text-xs font-semibold t1 mb-1">Verified Cognito Email</label>
            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border bg-slate-50 dark:bg-slate-900/40 text-sm" style={{ borderColor: 'var(--border)' }}>
              <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                {user?.email || 'Authenticated User'}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/20">
                <span>✓</span> Verified by Cognito
              </span>
            </div>
            <p className="text-[10px] tm mt-1">
              Sourced directly from your authenticated AWS Cognito session. Browser cannot alter verified email.
            </p>
          </div>

          {/* Persona */}
          <div>
            <label className="block text-xs font-semibold t1 mb-1">Health & Activity Profile</label>
            <select
              id="select-profile-persona"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              style={{
                background: 'var(--surface-alt)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              <option>General Public</option>
              <option>Child / Parent</option>
              <option>Older Adult</option>
              <option>Asthma / Respiratory Sensitive</option>
              <option>Outdoor Worker</option>
              <option>Athlete</option>
              <option>School Administrator</option>
            </select>
          </div>

          {/* Location Status Message */}
          {locationStatus && (
            <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-500/20">
              {locationStatus}
            </p>
          )}

          {/* Home Location */}
          <div className="p-4 rounded-2xl border space-y-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold t1">Home Location (Optional)</span>
              <button
                id="btn-use-current-location-home"
                type="button"
                onClick={() => handleUseCurrentLocation('home')}
                disabled={locatingPrefix === 'home'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors disabled:opacity-60"
              >
                <span>📍</span>
                <span>{locatingPrefix === 'home' ? 'Detecting…' : 'Use my current location'}</span>
              </button>
            </div>
            <input
              type="text"
              value={homeAddress}
              onChange={(e) => setHomeAddress(e.target.value)}
              placeholder="e.g. Saket, South Delhi"
              className="w-full px-3 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <input
                type="number"
                step="any"
                value={homeLat}
                onChange={(e) => setHomeLat(e.target.value)}
                placeholder="Latitude (e.g. 28.52)"
                className="px-3 py-2 rounded-xl border outline-none"
                style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
              />
              <input
                type="number"
                step="any"
                value={homeLon}
                onChange={(e) => setHomeLon(e.target.value)}
                placeholder="Longitude (e.g. 77.21)"
                className="px-3 py-2 rounded-xl border outline-none"
                style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
              />
            </div>
          </div>

          {/* Work Location */}
          <div className="p-4 rounded-2xl border space-y-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold t1">Work or School Location (Optional)</span>
              <button
                id="btn-use-current-location-work"
                type="button"
                onClick={() => handleUseCurrentLocation('work')}
                disabled={locatingPrefix === 'work'}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors disabled:opacity-60"
              >
                <span>📍</span>
                <span>{locatingPrefix === 'work' ? 'Detecting…' : 'Use my current location'}</span>
              </button>
            </div>
            <input
              type="text"
              value={workAddress}
              onChange={(e) => setWorkAddress(e.target.value)}
              placeholder="e.g. Cyber City, Gurugram"
              className="w-full px-3 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <input
                type="number"
                step="any"
                value={workLat}
                onChange={(e) => setWorkLat(e.target.value)}
                placeholder="Latitude (e.g. 28.49)"
                className="px-3 py-2 rounded-xl border outline-none"
                style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
              />
              <input
                type="number"
                step="any"
                value={workLon}
                onChange={(e) => setWorkLon(e.target.value)}
                placeholder="Longitude (e.g. 77.09)"
                className="px-3 py-2 rounded-xl border outline-none"
                style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
              />
            </div>
          </div>

          {/* Alerts checkbox */}
          <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer" style={{ borderColor: 'var(--border)' }}>
            <input
              type="checkbox"
              checked={alertsEnabled}
              onChange={(e) => setAlertsEnabled(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs font-semibold t1">Enable air quality advisory alerts</span>
          </label>

          {error && (
            <p role="alert" className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 p-3 rounded-xl border border-red-500/20">
              {error}
            </p>
          )}

          <button
            id="btn-complete-profile-submit"
            type="submit"
            disabled={saving}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? 'Saving Profile…' : 'Complete Profile & Launch Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
