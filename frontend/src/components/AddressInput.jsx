import React, { useState, useEffect, useRef } from 'react';
import { searchLocations, forwardGeocode } from '../utils/geoUtils';
import { shouldShowClearButton, handleAddressClear, shouldShowLocationPinnedBadge } from '../utils/addressInputState';

/**
 * Smart Address Autocomplete Input
 * Features:
 * - Live suggestions dropdown via Photon / Nominatim / Google
 * - Resolves detailed house number, street, district, city, state, country
 * - Hidden background coordinate management (lat/lon) with reassuring UI badge
 * - Auto-geocoding on manual typing blur
 */
export default function AddressInput({
  id = 'address-input',
  label = 'Address or area',
  value = '',
  onChange,
  onSelectLocation,
  onBlurResolve,
  onClear,
  onDropdownOpenChange = null,
  hasCoords = false,
  coordLat = null,
  coordLon = null,
  placeholder = 'e.g. Pari Chowk, Greater Noida',
  disabled = false,
  required = false,
  pinToggle = null,
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef(null);
  const debounceTimer = useRef(null);

  // Sync internal query when external value changes
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  // Notify parent of dropdown visibility to elevate stacking contexts dynamically
  useEffect(() => {
    if (typeof onDropdownOpenChange === 'function') {
      onDropdownOpenChange(Boolean(isOpen && suggestions.length > 0));
    }
  }, [isOpen, suggestions.length, onDropdownOpenChange]);

  // Handle outside click to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = (text) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        const results = await searchLocations(trimmed);
        setSuggestions(results || []);
        setIsOpen((results || []).length > 0);
      } catch (err) {
        console.warn('Address autocomplete search error:', err);
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  const handleInputChange = (e) => {
    const nextVal = e.target.value;
    setQuery(nextVal);
    onChange(nextVal);
    fetchSuggestions(nextVal);
  };

  const handleSelect = (item) => {
    const formatted = item.formattedAddress || item.subtitle || item.name;
    setQuery(formatted);
    setIsOpen(false);
    setSuggestions([]);
    if (onSelectLocation) {
      onSelectLocation(item);
    }
  };

  const handleBlur = () => {
    // Small delay so user can click on suggestions
    setTimeout(async () => {
      setIsOpen(false);
      if (onBlurResolve) {
        await onBlurResolve();
      }
    }, 200);
  };

  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (focusedIndex >= 0 && focusedIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[focusedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const isDropdownVisible = Boolean(isOpen && suggestions.length > 0);

  return (
    <div className={`relative space-y-1 ${isDropdownVisible ? 'z-40' : 'z-auto'}`} ref={containerRef}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-semibold t1 block">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {pinToggle ? (
          <button
            type="button"
            id={pinToggle.id || `${id}-pin-toggle`}
            role="switch"
            aria-checked={Boolean(pinToggle.isPinned)}
            onClick={pinToggle.onToggle}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all border cursor-pointer select-none active:scale-95 shadow-2xs ${
              pinToggle.isPinned
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/80'
                : 'hover:border-indigo-400 dark:hover:border-slate-500'
            }`}
            style={{
              background: pinToggle.isPinned ? undefined : 'var(--surface-alt)',
              borderColor: pinToggle.isPinned ? undefined : 'var(--border)',
              color: pinToggle.isPinned ? undefined : 'var(--text-secondary)',
            }}
            title={pinToggle.isPinned ? 'Location pinned as priority on startup. Click to unpin.' : 'Pin this location profile as priority on startup'}
          >
            <span aria-hidden="true" className={pinToggle.isPinned ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
              {pinToggle.isPinned ? '📌' : '📍'}
            </span>
            <span>{pinToggle.isPinned ? 'Pinned' : 'Pin'}</span>
          </button>
        ) : (
          shouldShowLocationPinnedBadge(hasCoords, coordLat, coordLon, query) && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/20 shadow-2xs"
              title={`Latitude: ${Number(coordLat).toFixed(4)}, Longitude: ${Number(coordLon).toFixed(4)}`}
            >
              <span aria-hidden="true">✓</span>
              <span>Location pinned</span>
            </span>
          )
        )}
      </div>

      <div className="relative">
        <input
          id={id}
          type="text"
          value={query}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 pr-9 transition-all"
          style={{
            background: 'var(--surface-alt)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
        />

        {/* Clear button or status icon */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-xs tm">
          {loading ? (
            <span className="animate-spin inline-block pointer-events-none">⏳</span>
          ) : shouldShowClearButton(query, disabled) ? (
            <button
              type="button"
              id={`${id}-clear`}
              onClick={() => {
                handleAddressClear({ setQuery, setSuggestions, setIsOpen, onChange, onClear });
              }}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold bg-slate-200 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-900/40 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
              aria-label="Clear address"
              title="Clear address"
            >
              ✕
            </button>
          ) : query ? (
            <span className="opacity-40 pointer-events-none">📍</span>
          ) : null}
        </div>

        {/* Autocomplete Suggestions Dropdown: directly anchored to input wrapper with opaque solid background */}
        {isDropdownVisible && (
          <ul
            id={`${id}-dropdown`}
            className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl border shadow-2xl max-h-56 sm:max-h-64 overflow-y-auto overscroll-contain divide-y bg-white dark:bg-[#131A2E]"
            style={{
              backgroundColor: 'var(--card)',
              borderColor: 'var(--border)',
            }}
            role="listbox"
            aria-label={`${label} suggestions`}
          >
            {suggestions.map((item, idx) => {
              const isFocused = idx === focusedIndex;
              const formattedContext =
                item.subtitle || [item.district, item.city, item.state, item.country].filter(Boolean).join(', ');
              return (
                <li
                  key={item.id || `${item.lat}-${item.lon}-${idx}`}
                  id={`${id}-option-${idx}`}
                  role="option"
                  aria-selected={isFocused}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input blur before click
                    handleSelect(item);
                  }}
                  className={`px-3.5 py-2.5 text-xs cursor-pointer flex items-start gap-2.5 transition-colors ${
                    isFocused
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 t1'
                  }`}
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: isFocused ? undefined : 'var(--card)',
                  }}
                >
                  <span className="text-sm mt-0.5 shrink-0" aria-hidden="true">
                    {item.type === 'station' ? '📡' : item.type === 'street' ? '🛣️' : '📍'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs t1 truncate max-w-full">{item.name}</span>
                      {item.state && item.state !== item.name && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                          {item.state}
                        </span>
                      )}
                      {item.country && item.country !== 'India' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 shrink-0">
                          {item.country}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] tm truncate mt-0.5" title={formattedContext}>
                      {formattedContext}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
