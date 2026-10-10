import React, { useEffect, useState } from 'react';
import {
  getUserProfile,
  bootstrapUserProfile,
  updateUserProfile,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';

const initialForm = {
  display_name: '',
  persona: 'General Public',
  alerts_enabled: false,
  home_label: 'Home',
  home_address: '',
  home_lat: '',
  home_lon: '',
  work_label: 'Work',
  work_address: '',
  work_lat: '',
  work_lon: '',
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
  const address = form[`${prefix}_address`].trim();
  const latText = form[`${prefix}_lat`].trim();
  const lonText = form[`${prefix}_lon`].trim();

  if (!address && !latText && !lonText) return null;

  if ((latText && !lonText) || (!latText && lonText)) {
    throw new Error(`Enter both latitude and longitude for ${fallbackLabel.toLowerCase()}.`);
  }

  const location = {
    label: form[`${prefix}_label`].trim() || fallbackLabel,
    address: address || null,
  };

  if (latText && lonText) {
    const latitude = Number(latText);
    const longitude = Number(lonText);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error(`Invalid coordinates for ${fallbackLabel.toLowerCase()}.`);
    }

    location.latitude = latitude;
    location.longitude = longitude;
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

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!accessToken) {
        setError('Your sign-in session is unavailable. Please sign in again.');
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
          persona: profile.persona || 'General Public',
          alerts_enabled: Boolean(profile.alerts_enabled),
          ...locationToForm(profile.home_location, 'home', 'Home'),
          ...locationToForm(profile.work_location, 'work', 'Work'),
        });
      } catch (err) {
        if (!cancelled) {
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
      const updates = {
        display_name: form.display_name.trim(),
        persona: form.persona,
        alerts_enabled: form.alerts_enabled,
        home_location: formToLocation(form, 'home', 'Home'),
        work_location: formToLocation(form, 'work', 'Work'),
      };

      const saved = await updateUserProfile(accessToken, updates);
      setMessage('Your profile and preferences have been saved.');
      if (onProfileSaved) {
        onProfileSaved(saved || updates);
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

  function handleUseCurrentLocation(prefix) {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setError('');
    setLocatingPrefix(prefix);
    setMessage(`Requesting browser permission for ${prefix} location...`);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        setForm((prev) => ({
          ...prev,
          [`${prefix}_lat`]: String(lat),
          [`${prefix}_lon`]: String(lon),
          [`${prefix}_address`]: prev[`${prefix}_address`] || `${lat}°N, ${lon}°E (Current Area)`,
        }));
        setLocatingPrefix(null);
        setMessage(`Coordinates obtained (${lat}, ${lon}). You can review and edit before saving.`);
      },
      (err) => {
        setLocatingPrefix(null);
        setError(`Unable to detect location: ${err.message}. Please enter address or coordinates manually.`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  function locationSection(title, prefix) {
    return (
      <section className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold t1">{title}</h3>
          <button
            type="button"
            onClick={() => handleUseCurrentLocation(prefix)}
            disabled={locatingPrefix === prefix}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors disabled:opacity-60"
          >
            <span>📍</span>
            <span>{locatingPrefix === prefix ? 'Detecting…' : 'Use my current location'}</span>
          </button>
        </div>
        <p className="text-xs tm">
          Optional. Leave blank if you do not want to save this location.
        </p>
        {textField('Label', `${prefix}_label`, { maxLength: 80 })}
        {textField('Address or area', `${prefix}_address`, {
          placeholder: 'e.g. Connaught Place, New Delhi',
        })}
        <div className="grid grid-cols-2 gap-3">
          {textField('Latitude (optional)', `${prefix}_lat`, {
            type: 'number',
            min: -90,
            max: 90,
            step: 'any',
            maxLength: 40,
          })}
          {textField('Longitude (optional)', `${prefix}_lon`, {
            type: 'number',
            min: -180,
            max: 180,
            step: 'any',
            maxLength: 40,
          })}
        </div>
      </section>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/55 p-3 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-settings-title"
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border p-5 sm:p-6 shadow-2xl"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h2 id="profile-settings-title" className="text-lg font-black">
              Profile & Locations
            </h2>
            <p className="text-xs tm mt-1">
              {user?.email || 'Signed-in Arise account'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)' }}
            aria-label="Close profile settings"
          >
            Close
          </button>
        </div>

        {loading ? (
          <p className="text-sm tm py-8">Loading your saved profile…</p>
        ) : (
          <form onSubmit={saveProfile} className="space-y-5">
            {textField('Display name', 'display_name', { maxLength: 120 })}

            <label className="block space-y-1">
              <span className="text-xs font-semibold t1">Recommendation profile</span>
              <select
                className={fieldClass}
                style={fieldStyle}
                value={form.persona}
                onChange={(event) => change('persona', event.target.value)}
              >
                <option>General Public</option>
                <option>Child / Parent</option>
                <option>Older Adult</option>
                <option>Asthma / Respiratory Sensitive</option>
                <option>Outdoor Worker</option>
                <option>Athlete</option>
                <option>School Administrator</option>
              </select>
            </label>

            {locationSection('Home location', 'home')}
            {locationSection('Work or school location', 'work')}

            <label className="flex items-start gap-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
              <input
                type="checkbox"
                checked={form.alerts_enabled}
                onChange={(event) => change('alerts_enabled', event.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold t1">Enable alert preference</span>
                <span className="block text-xs tm mt-1">
                  Saves your preference. Notifications are not sent until a notification service is implemented.
                </span>
              </span>
            </label>

            {error && (
              <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">
                {error}
              </p>
            )}

            {message && (
              <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">
                {message}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border px-4 py-2 text-sm font-semibold"
                style={{ borderColor: 'var(--border)' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
