import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { bootstrapUserProfile } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import AddressInput from './AddressInput';
import { reverseGeocodeDetailed, forwardGeocode } from '../utils/geoUtils';

export default function CompleteProfileModal({ onProfileCompleted, onProfileSaved }) {
  const { user, accessToken } = useAuth();
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [persona, setPersona] = useState('General Public');
  const [configuredPersonas, setConfiguredPersonas] = useState(['General Public']);
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
  const [activeDropdownPrefix, setActiveDropdownPrefix] = useState(null);
  const [locationStatus, setLocationStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // "Use my current location" with automatic reverse geocoding to full address
  const handleUseCurrentLocation = (prefix) => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setError('');
    setLocatingPrefix(prefix);
    setLocationStatus(`Detecting your precise current location...`);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lon = Number(pos.coords.longitude.toFixed(5));
        try {
          const detailed = await reverseGeocodeDetailed(lat, lon);
          const fullAddress = detailed?.formattedAddress || `${lat}°N, ${lon}°E`;
          if (prefix === 'home') {
            setHomeLat(String(lat));
            setHomeLon(String(lon));
            setHomeAddress(fullAddress);
          } else {
            setWorkLat(String(lat));
            setWorkLon(String(lon));
            setWorkAddress(fullAddress);
          }
          setLocationStatus(`Location detected & pinned: ${detailed?.formattedLocation || fullAddress}`);
        } catch {
          if (prefix === 'home') {
            setHomeLat(String(lat));
            setHomeLon(String(lon));
          } else {
            setWorkLat(String(lat));
            setWorkLon(String(lon));
          }
          setLocationStatus(`Coordinates pinned (${lat}, ${lon}).`);
        } finally {
          setLocatingPrefix(null);
        }
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
        configured_personas: configuredPersonas,
        alerts_enabled: alertsEnabled,
      };

      // Resolve coordinates in background if address was typed manually
      let finalHomeLat = homeLat;
      let finalHomeLon = homeLon;
      let finalHomeAddress = homeAddress.trim();
      if (finalHomeAddress && (!finalHomeLat || !finalHomeLon)) {
        try {
          const geo = await forwardGeocode(finalHomeAddress);
          if (geo && geo.lat != null && geo.lon != null) {
            finalHomeLat = String(geo.lat);
            finalHomeLon = String(geo.lon);
            if (geo.formattedAddress) finalHomeAddress = geo.formattedAddress;
          }
        } catch {}
      }

      let finalWorkLat = workLat;
      let finalWorkLon = workLon;
      let finalWorkAddress = workAddress.trim();
      if (finalWorkAddress && (!finalWorkLat || !finalWorkLon)) {
        try {
          const geo = await forwardGeocode(finalWorkAddress);
          if (geo && geo.lat != null && geo.lon != null) {
            finalWorkLat = String(geo.lat);
            finalWorkLon = String(geo.lon);
            if (geo.formattedAddress) finalWorkAddress = geo.formattedAddress;
          }
        } catch {}
      }

      if (finalHomeAddress || finalHomeLat || finalHomeLon) {
        payload.home_location = {
          label: 'Home',
          address: finalHomeAddress || 'Home Location',
          latitude: finalHomeLat ? Number(finalHomeLat) : undefined,
          longitude: finalHomeLon ? Number(finalHomeLon) : undefined,
        };
      }

      if (finalWorkAddress || finalWorkLat || finalWorkLon) {
        payload.work_location = {
          label: 'Work',
          address: finalWorkAddress || 'Work Location',
          latitude: finalWorkLat ? Number(finalWorkLat) : undefined,
          longitude: finalWorkLon ? Number(finalWorkLon) : undefined,
        };
      }

      try {
        localStorage.setItem('arise_user_profile', JSON.stringify(payload));
      } catch {}

      const handleComplete = onProfileCompleted || onProfileSaved;

      try {
        const res = await bootstrapUserProfile(accessToken, payload);
        if (handleComplete) handleComplete(res || payload);
      } catch (cloudErr) {
        console.warn('Bootstrap cloud sync failed, completing locally:', cloudErr.message);
        if (handleComplete) handleComplete(payload);
      }
    } catch (err) {
      setError(err.message || 'Failed to complete profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-profile-title"
        className="w-full max-w-xl max-h-[88vh] my-auto overflow-y-auto rounded-3xl border p-6 sm:p-8 shadow-2xl"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl font-black t1">Welcome to Arise</span>
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
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
            <p className="text-[11px] tm mt-1">
              Sourced directly from your authenticated AWS Cognito session. Browser cannot alter verified email.
            </p>
          </div>

          {/* Personas to check for */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold t1">
                Who do you check air quality for?
              </label>
              <span className="text-[11px] tm">Select all that apply</span>
            </div>
            <p className="text-[11px] tm mb-2.5">
              Choose which personas appear in your daily dashboard check. You can stay with just Me, or add Child, Parent, Work, or School.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { id: 'General Public', label: '👤 Me (General)', desc: 'Standard adult outdoors & commute' },
                { id: 'Children & Schools', label: '🎒 My Child', desc: 'Recess, outdoor playtime & school sports' },
                { id: 'Elderly & Respiratory', label: '🫁 My Parent / Senior', desc: 'Vulnerable seniors & respiratory care' },
                { id: 'Work & Outdoor Labor', label: '💼 Work & Commute', desc: 'Commuter & field work shift safety' },
                { id: 'School Administration', label: '🏫 School Admin', desc: 'Campus outdoor activity & assembly decisions' },
              ].map((p) => {
                const checked = configuredPersonas.includes(p.id) || p.id === 'General Public';
                return (
                  <label
                    key={p.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      checked
                        ? 'persona-card-active ring-1 ring-indigo-400/30 shadow-xs'
                        : 'border-[var(--border)] hover:bg-[var(--surface-alt)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={p.id === 'General Public'}
                      onChange={() => {
                        if (p.id === 'General Public') return;
                        setConfiguredPersonas((prev) =>
                          prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                        );
                      }}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="min-w-0">
                      <span className={`text-xs block truncate ${checked ? 'persona-title font-black' : 'font-bold t1'}`}>
                        {p.label}
                      </span>
                      <span className={`text-[11px] block leading-tight mt-0.5 ${checked ? 'persona-desc font-semibold' : 't2 font-medium'}`}>
                        {p.desc}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Location Status Message */}
          {locationStatus && (
            <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 p-2.5 rounded-xl border border-indigo-500/20">
              {locationStatus}
            </p>
          )}

          {/* Home Location */}
          <div
            className={`p-4 rounded-2xl border space-y-3 transition-all duration-150 ${
              activeDropdownPrefix === 'home' ? 'relative z-30 shadow-md ring-1 ring-indigo-500/20' : 'relative z-10'
            }`}
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold t1">Home Location (Optional)</span>
              <button
                id="btn-use-current-location-home"
                type="button"
                onClick={() => handleUseCurrentLocation('home')}
                disabled={locatingPrefix === 'home'}
                className="location-btn-theme inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border transition-all shadow-2xs disabled:opacity-60 cursor-pointer active:scale-[0.98] shrink-0"
              >
                <span aria-hidden="true">📍</span>
                <span>{locatingPrefix === 'home' ? 'Detecting…' : 'Use my current location'}</span>
              </button>
            </div>
            <AddressInput
              id="input-complete-profile-home"
              label="Address or area"
              value={homeAddress}
              onChange={(val) => {
                setHomeAddress(val);
                if (!val.trim()) {
                  setHomeLat('');
                  setHomeLon('');
                }
              }}
              onSelectLocation={(item) => {
                setHomeAddress(item.formattedAddress || item.subtitle || item.name);
                setHomeLat(String(item.lat));
                setHomeLon(String(item.lon));
                setLocationStatus(`Home location pinned: ${item.name}`);
              }}
              onDropdownOpenChange={(open) => setActiveDropdownPrefix(open ? 'home' : null)}
              hasCoords={Boolean(homeLat && homeLon)}
              coordLat={homeLat}
              coordLon={homeLon}
              placeholder="e.g. 350 Fifth Avenue, New York"
            />
          </div>

          {/* Work Location */}
          <div
            className={`p-4 rounded-2xl border space-y-3 transition-all duration-150 ${
              activeDropdownPrefix === 'work' ? 'relative z-30 shadow-md ring-1 ring-indigo-500/20' : 'relative z-10'
            }`}
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold t1">Work or School Location (Optional)</span>
              <button
                id="btn-use-current-location-work"
                type="button"
                onClick={() => handleUseCurrentLocation('work')}
                disabled={locatingPrefix === 'work'}
                className="location-btn-theme inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border transition-all shadow-2xs disabled:opacity-60 cursor-pointer active:scale-[0.98] shrink-0"
              >
                <span aria-hidden="true">📍</span>
                <span>{locatingPrefix === 'work' ? 'Detecting…' : 'Use my current location'}</span>
              </button>
            </div>
            <AddressInput
              id="input-complete-profile-work"
              label="Address or area"
              value={workAddress}
              onChange={(val) => {
                setWorkAddress(val);
                if (!val.trim()) {
                  setWorkLat('');
                  setWorkLon('');
                }
              }}
              onSelectLocation={(item) => {
                setWorkAddress(item.formattedAddress || item.subtitle || item.name);
                setWorkLat(String(item.lat));
                setWorkLon(String(item.lon));
                setLocationStatus(`Work location pinned: ${item.name}`);
              }}
              onDropdownOpenChange={(open) => setActiveDropdownPrefix(open ? 'work' : null)}
              hasCoords={Boolean(workLat && workLon)}
              coordLat={workLat}
              coordLon={workLon}
              placeholder="e.g. Pari Chowk, Greater Noida"
            />
          </div>


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

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
