import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getUserProfile,
  bootstrapUserProfile,
  updateUserProfile,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import AddressInput from './AddressInput';
import { reverseGeocodeDetailed, forwardGeocode, KNOWN_COORDS } from '../utils/geoUtils';


const PREFIX_TO_PERSONA = {
  home: 'General Public',
  work: 'Work & Outdoor Labor',
  school: 'Children & Schools',
  parent: 'Elderly & Respiratory',
  admin_school: 'School Administration',
};

const initialForm = {
  display_name: '',
  persona: 'General Public',
  pinned_personas: [],
  configured_personas: ['General Public'],
  alerts_enabled: false,
  home_label: 'Home',
  home_address: '',
  home_lat: '',
  home_lon: '',
  work_label: 'Work',
  work_address: '',
  work_lat: '',
  work_lon: '',
  school_label: 'School',
  school_address: '',
  school_lat: '',
  school_lon: '',
  parent_label: "Parent's Home",
  parent_address: '',
  parent_lat: '',
  parent_lon: '',
  admin_school_label: 'Campus',
  admin_school_address: '',
  admin_school_lat: '',
  admin_school_lon: '',
};

function locationToForm(location, prefix, fallbackLabel) {
  return {
    [`${prefix}_label`]: location?.label || fallbackLabel,
    [`${prefix}_address`]: location?.address || '',
    [`${prefix}_lat`]: location?.latitude == null ? '' : String(location.latitude),
    [`${prefix}_lon`]: location?.longitude == null ? '' : String(location.longitude),
  };
}

function formToLocation(form, prefix, fallbackLabel) {
  const address = (form[`${prefix}_address`] || '').trim();
  const latText = (form[`${prefix}_lat`] || '').trim();
  const lonText = (form[`${prefix}_lon`] || '').trim();

  if (!address && !latText && !lonText) return null;

  const location = {
    label: (form[`${prefix}_label`] || '').trim() || fallbackLabel,
    address: address || null,
  };

  if (latText && lonText) {
    const latitude = Number(latText);
    const longitude = Number(lonText);

    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      location.latitude = latitude;
      location.longitude = longitude;
    }
  }

  // Fallback to known coords if matched; never substitute Delhi for unknown locations
  if (location.latitude == null && address) {
    const lower = address.toLowerCase();
    const matched = Object.entries(KNOWN_COORDS).find(([k]) => lower.includes(k));
    if (matched) {
      location.latitude = matched[1].lat;
      location.longitude = matched[1].lon;
    }
  }

  return location;
}

export default function ProfileSettingsModal({ onClose, onProfileSaved }) {
  const { user, accessToken } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const scrollContainerRef = useRef(null);

  // Close with keyboard Escape key
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Ensure scroll container starts cleanly at top
  useEffect(() => {
    if (!loading && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [loading]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      // First, immediately populate from localStorage if available
      let localCached = null;
      try {
        const cachedRaw = localStorage.getItem('arise_user_profile');
        if (cachedRaw) {
          localCached = JSON.parse(cachedRaw);
          setForm({
            ...initialForm,
            display_name: localCached.display_name || user?.name || '',
            persona: (localCached.pinned_personas && localCached.pinned_personas.length > 0)
              ? localCached.pinned_personas[0]
              : (localCached.persona || 'General Public'),
            pinned_personas: localCached.pinned_personas || [],
            configured_personas: localCached.configured_personas || initialForm.configured_personas,
            alerts_enabled: Boolean(localCached.alerts_enabled),
            ...locationToForm(localCached.home_location, 'home', 'Home'),
            ...locationToForm(localCached.work_location, 'work', 'Work'),
            ...locationToForm(localCached.school_location, 'school', 'School'),
            ...locationToForm(localCached.parent_location, 'parent', "Parent's Home"),
          });
          setLoading(false);
        }
      } catch {}

      if (!accessToken) {
        // Guest mode: load local settings without throwing session errors
        setLoading(false);
        return;
      }

      try {
        let profile;

        try {
          profile = await getUserProfile(accessToken);
        } catch (err) {
          if (!/profile not initialized/i.test(err.message || '')) {
            throw err;
          }

          profile = await bootstrapUserProfile(accessToken, {
            display_name: user?.name || 'Arise User',
          });
        }

        if (cancelled) return;

        setForm({
          ...initialForm,
          display_name: profile.display_name || user?.name || '',
          persona: (profile.pinned_personas && profile.pinned_personas.length > 0)
            ? profile.pinned_personas[0]
            : (profile.persona || 'General Public'),
          pinned_personas: profile.pinned_personas || [],
          configured_personas: profile.configured_personas || initialForm.configured_personas,
          alerts_enabled: Boolean(profile.alerts_enabled),
          ...locationToForm(profile.home_location, 'home', 'Home'),
          ...locationToForm(profile.work_location, 'work', 'Work'),
          ...locationToForm(profile.school_location, 'school', 'School'),
          ...locationToForm(profile.parent_location, 'parent', "Parent's Home"),
        });
        try {
          localStorage.setItem('arise_user_profile', JSON.stringify(profile));
        } catch {}
      } catch (err) {
        if (!cancelled && !localCached) {
          setError(
            err.message ||
              'Unable to load your profile. Check the backend configuration and try again.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [accessToken, user?.name, user?.email]);

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
    setMessage('');
  }

  async function saveProfile(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!form.display_name.trim()) {
      setError('Enter a display name.');
      return;
    }

    setSaving(true);

    try {
      // Auto-geocode any filled location that is missing coordinates in the background
      const prefixes = ['home', 'work', 'school', 'parent', 'admin_school'];
      const updatedForm = { ...form };
      for (const pfx of prefixes) {
        const addr = (updatedForm[`${pfx}_address`] || '').trim();
        const hasLat = Boolean(updatedForm[`${pfx}_lat`]);
        const hasLon = Boolean(updatedForm[`${pfx}_lon`]);
        if (addr && (!hasLat || !hasLon)) {
          try {
            const geo = await forwardGeocode(addr);
            if (geo && geo.lat != null && geo.lon != null) {
              updatedForm[`${pfx}_lat`] = String(geo.lat);
              updatedForm[`${pfx}_lon`] = String(geo.lon);
              if (geo.formattedAddress) {
                updatedForm[`${pfx}_address`] = geo.formattedAddress;
              }
            }
          } catch (geoErr) {
            console.warn(`Geocoding skipped for ${pfx}:`, geoErr);
          }
        }
      }

      const activePersonas = updatedForm.configured_personas || ['General Public'];
      const homeLoc = formToLocation(updatedForm, 'home', 'Home');
      const workLoc = activePersonas.includes('Work & Outdoor Labor')
        ? formToLocation(updatedForm, 'work', 'Work')
        : (formToLocation(updatedForm, 'work', 'Work') || null);
      const schoolLoc = (activePersonas.includes('Children & Schools') || activePersonas.includes('School Administration'))
        ? (formToLocation(updatedForm, 'school', 'School') || formToLocation(updatedForm, 'admin_school', 'Campus'))
        : null;
      const parentLoc = activePersonas.includes('Elderly & Respiratory')
        ? formToLocation(updatedForm, 'parent', "Parent's Home")
        : null;

      const priorityPersona = (updatedForm.pinned_personas && updatedForm.pinned_personas.length > 0)
        ? updatedForm.pinned_personas[0]
        : (updatedForm.persona || 'General Public');

      const updates = {
        display_name: updatedForm.display_name.trim(),
        persona: priorityPersona,
        pinned_personas: updatedForm.pinned_personas || [],
        configured_personas: updatedForm.configured_personas,
        alerts_enabled: updatedForm.alerts_enabled,
        home_location: homeLoc,
        work_location: workLoc,
        school_location: schoolLoc,
        parent_location: parentLoc,
      };

      // Always save to localStorage immediately to guarantee instant local persistence
      try {
        localStorage.setItem('arise_user_profile', JSON.stringify(updates));
      } catch {}

      // Notify parent immediately so dashboard & watchlist update without waiting
      if (onProfileSaved) {
        onProfileSaved(updates);
      }

      let saved = null;
      let syncError = null;

      if (accessToken) {
        try {
          saved = await updateUserProfile(accessToken, updates);
          try {
            localStorage.setItem('arise_user_profile', JSON.stringify(saved || updates));
          } catch {}
        } catch (err) {
          console.warn('Profile cloud sync skipped/failed:', err.message);
          syncError = err;
        }

        if (syncError) {
          setMessage('Preferences saved to your device. Cloud sync will retry automatically.');
        } else {
          setMessage('Your profile and preferences have been saved.');
        }
      } else {
        setMessage('Preferences saved to this device. Sign in anytime to sync to the cloud.');
      }
    } catch (err) {
      setError(err.message || 'Unable to save your profile.');
    } finally {
      setSaving(false);
    }
  }

  const fieldClass =
    'w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500';
  const fieldStyle = {
    background: 'var(--surface)',
    borderColor: 'var(--border)',
    color: 'var(--text-primary)',
  };

  function textField(label, field, options = {}) {
    return (
      <label className="block space-y-1" key={field}>
        <span className="text-xs font-semibold t1">{label}</span>
        <input
          className={fieldClass}
          style={fieldStyle}
          value={form[field]}
          onChange={(event) => change(field, event.target.value)}
          type={options.type || 'text'}
          min={options.min}
          max={options.max}
          step={options.step}
          maxLength={options.maxLength || 300}
          placeholder={options.placeholder || ''}
          autoComplete="off"
        />
      </label>
    );
  }

  const [locatingPrefix, setLocatingPrefix] = useState(null);
  const [activeDropdownPrefix, setActiveDropdownPrefix] = useState(null);

  async function handleUseCurrentLocation(prefix) {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setError('');
    setLocatingPrefix(prefix);
    setMessage(`Detecting your precise current location...`);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lon = Number(pos.coords.longitude.toFixed(5));
        try {
          const detailed = await reverseGeocodeDetailed(lat, lon);
          const fullAddress = detailed?.formattedAddress || `${lat}°N, ${lon}°E`;
          setForm((prev) => ({
            ...prev,
            [`${prefix}_lat`]: String(lat),
            [`${prefix}_lon`]: String(lon),
            [`${prefix}_address`]: fullAddress,
          }));
          setMessage(`Location detected & verified: ${detailed?.formattedLocation || fullAddress}`);
        } catch {
          setForm((prev) => ({
            ...prev,
            [`${prefix}_lat`]: String(lat),
            [`${prefix}_lon`]: String(lon),
          }));
          setMessage(`Coordinates pinned (${lat}, ${lon}).`);
        } finally {
          setLocatingPrefix(null);
        }
      },
      (err) => {
        setLocatingPrefix(null);
        setError(`Unable to detect location: ${err.message}. Please enter address manually.`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  function handleTogglePin(prefix) {
    const targetPersona = PREFIX_TO_PERSONA[prefix];
    if (!targetPersona) return;

    setForm((prev) => {
      const prevPinned = prev.pinned_personas || [];
      const isCurrentlyPinned = prevPinned.includes(targetPersona);

      let nextPinned;
      let nextPersona;
      let nextConfigured = prev.configured_personas || ['General Public'];

      if (isCurrentlyPinned) {
        // Toggle OFF: unpin
        nextPinned = prevPinned.filter((p) => p !== targetPersona);
        nextPersona = nextPinned.length > 0 ? nextPinned[0] : (nextConfigured[0] || 'General Public');
      } else {
        // Toggle ON: pin and prioritize
        nextPinned = [targetPersona, ...prevPinned.filter((p) => p !== targetPersona)];
        nextPersona = targetPersona;
        if (!nextConfigured.includes(targetPersona)) {
          nextConfigured = [...nextConfigured, targetPersona];
        }
      }

      return {
        ...prev,
        pinned_personas: nextPinned,
        configured_personas: nextConfigured,
        persona: nextPersona,
      };
    });
  }

  const SECTION_Z_INDEX = {
    home: 'z-[50]',
    work: 'z-[40]',
    school: 'z-[30]',
    parent: 'z-[20]',
    admin_school: 'z-[10]',
  };

  function locationSection(title, prefix, fallbackLabel, placeholder = 'e.g. Pari Chowk, Greater Noida') {
    const icon = prefix === 'home' ? '🏠' : prefix === 'work' ? '💼' : prefix === 'parent' ? '🫁' : '🏫';
    const addressVal = form[`${prefix}_address`] || '';
    const latVal = form[`${prefix}_lat`];
    const lonVal = form[`${prefix}_lon`];
    const hasCoords = Boolean(latVal && lonVal && !isNaN(Number(latVal)) && !isNaN(Number(lonVal)));
    const isDropdownActive = activeDropdownPrefix === prefix;

    return (
      <section
        key={prefix}
        className={`space-y-3 rounded-xl border p-4 transition-all duration-150 relative ${
          SECTION_Z_INDEX[prefix] || 'z-10'
        } ${isDropdownActive ? 'shadow-md ring-1 ring-indigo-500/20' : ''}`}
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">{icon}</span>
            <h3 className="text-sm font-bold t1">{title}</h3>
          </div>
          <button
            type="button"
            onClick={() => handleUseCurrentLocation(prefix)}
            disabled={locatingPrefix === prefix}
            className="location-btn-theme inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border transition-all shadow-2xs disabled:opacity-60 cursor-pointer active:scale-[0.98] shrink-0"
          >
            <span aria-hidden="true">📍</span>
            <span>{locatingPrefix === prefix ? 'Detecting…' : 'Use my current location'}</span>
          </button>
        </div>
        <p className="text-xs tm">
          {prefix === 'home'
            ? 'Primary personal residence for daily air quality assessment.'
            : `Monitored location for your ${fallbackLabel.toLowerCase()} profile. Leave blank if not needed.`}
        </p>
        {textField('Label', `${prefix}_label`, { maxLength: 80, placeholder: fallbackLabel })}

        {/* Smart Address Input with explicit selection and elevated active dropdown */}
        <AddressInput
          id={`address-input-${prefix}`}
          label="Address or area"
          value={addressVal}
          onChange={(val) => {
            change(`${prefix}_address`, val);
            if (!val.trim()) {
              setForm((prev) => ({ ...prev, [`${prefix}_lat`]: '', [`${prefix}_lon`]: '' }));
            }
          }}
          onSelectLocation={(item) => {
            setForm((prev) => ({
              ...prev,
              [`${prefix}_address`]: item.formattedAddress || item.subtitle || item.name,
              [`${prefix}_lat`]: String(item.lat),
              [`${prefix}_lon`]: String(item.lon),
            }));
            setMessage(`Location pinned: ${item.name}`);
          }}
          onDropdownOpenChange={(open) => {
            setActiveDropdownPrefix(open ? prefix : null);
          }}
          hasCoords={hasCoords}
          coordLat={latVal}
          coordLon={lonVal}
          placeholder={placeholder}
          pinToggle={{
            id: `btn-pin-toggle-${prefix}`,
            isPinned: (form.pinned_personas || []).includes(PREFIX_TO_PERSONA[prefix]),
            onToggle: () => handleTogglePin(prefix),
          }}
        />
      </section>
    );
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 md:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-settings-title"
        className="w-full max-w-xl max-h-[86vh] sm:max-h-[82vh] my-auto flex flex-col rounded-3xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Sticky Top Header — Always centered, anchored, and visible */}
        <div
          className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b flex-shrink-0"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center text-xl shrink-0 shadow-2xs">
              📍
            </div>
            <div className="min-w-0">
              <h2 id="profile-settings-title" className="text-base sm:text-lg font-black t1 leading-tight truncate">
                Profile &amp; Locations
              </h2>
              <p className="text-xs font-semibold tm mt-0.5 truncate">
                {user?.email || 'Customize your personal and family air quality checkpoints'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl border flex items-center justify-center text-sm font-bold t2 hover:t1 hover:bg-[var(--surface-alt)] transition-colors shrink-0"
            style={{ borderColor: 'var(--border)' }}
            aria-label="Close profile settings"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold tm">Loading your saved profile…</p>
          </div>
        ) : (
          <form
            id="profile-settings-form"
            ref={scrollContainerRef}
            onSubmit={saveProfile}
            className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 overscroll-contain"
          >
            {textField('Display name', 'display_name', { maxLength: 120 })}

            {/* Dashboard Personas Multi-Select */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold t1">Dashboard Personas</span>
                <span className="text-[11px] tm">Choose who to show on your daily checks</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                {[
                  { id: 'General Public', label: '👤 Me (General)', desc: 'Standard adult outdoors & commute' },
                  { id: 'Children & Schools', label: '🎒 My Child', desc: 'Recess, playtime & school sports' },
                  { id: 'Elderly & Respiratory', label: '🫁 My Parent', desc: 'Seniors, asthma & cardiac care' },
                  { id: 'Work & Outdoor Labor', label: '💼 Work & Commute', desc: 'Field shifts & commute safety' },
                  { id: 'School Administration', label: '🏫 School Admin', desc: 'Outdoor classes & assemblies' },
                ].map((p) => {
                  const activeList = form.configured_personas || ['General Public'];
                  const checked = activeList.includes(p.id) || p.id === 'General Public';
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
                          const next = checked
                            ? activeList.filter((x) => x !== p.id)
                            : [...activeList, p.id];
                          change('configured_personas', next);
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

            {/* Dynamic location sections according to checked tags */}
            <div className="space-y-3.5 pt-1">
              <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs font-black t1 uppercase tracking-wider block">
                  Location Details for Selected Profiles
                </span>
                <span className="text-[11px] tm block mt-0.5">
                  Adding or removing persona tags above automatically shows or hides the location fields below.
                </span>
              </div>

              {/* Home location - always active for personal residence */}
              {locationSection('Home location (Me)', 'home', 'Home', 'e.g. 221B Baker Street, London')}

              {/* Work location - shown if Work & Outdoor Labor is checked */}
              {form.configured_personas?.includes('Work & Outdoor Labor') &&
                locationSection('Work or office location', 'work', 'Work', 'e.g. Financial District, Mumbai')}

              {/* School location - shown if Children & Schools is checked */}
              {form.configured_personas?.includes('Children & Schools') &&
                locationSection("Child's school location", 'school', 'School', 'e.g. Greenfield Academy, Bangalore')}

              {/* Parent location - shown if Elderly & Respiratory is checked */}
              {form.configured_personas?.includes('Elderly & Respiratory') &&
                locationSection("Parent's residence location", 'parent', "Parent's Home", 'e.g. Noida Sector 62, UP')}

              {/* School Administration campus location - shown if School Administration is checked */}
              {form.configured_personas?.includes('School Administration') &&
                locationSection('School campus / institution location', 'admin_school', 'Campus', 'e.g. Oxford University, Oxford')}
            </div>
          </form>
        )}

        {/* Sticky Action Footer — Always visible at bottom */}
        <div
          className="px-5 sm:px-6 py-3.5 border-t flex flex-wrap items-center justify-between gap-3 flex-shrink-0"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="flex-1 min-w-0">
            {error && (
              <p role="alert" className="text-xs font-bold text-red-600 truncate">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="text-xs font-bold text-emerald-600 truncate">
                {message}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border px-4 py-2 text-xs font-bold transition-colors hover:bg-[var(--surface-alt)]"
              style={{ borderColor: 'var(--border)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="profile-settings-form"
              disabled={saving}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-xs font-black text-white disabled:opacity-60 shadow-xs transition-all active:scale-[0.98]"
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
