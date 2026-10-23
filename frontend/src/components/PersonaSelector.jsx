import React, { useEffect, useMemo } from 'react';
import { ALL_PERSONAS, resolveVisiblePersonas, togglePinnedPersona } from '../utils/personaState.js';

export { ALL_PERSONAS, resolveVisiblePersonas };

export default function PersonaSelector({
  currentPersona = 'General Public',
  onSelectPersona,
  isAuthenticated = false,
  userProfile = null,
  onOpenCustomize = null,
  onPinToggle = null,
}) {
  // Determine visible personas:
  // In Guest mode: ONLY show "Me". Do not show Child, Parent, Work, School by default.
  // When Authenticated: Show "Me" + only the additional personas the user has configured/enabled in their profile.
  const visiblePersonas = useMemo(() => {
    return resolveVisiblePersonas({ isAuthenticated, userProfile });
  }, [isAuthenticated, userProfile?.configured_personas, userProfile?.pinned_personas]);

  // Ensure currentPersona remains valid among visiblePersonas
  useEffect(() => {
    if (visiblePersonas.length > 0 && !visiblePersonas.some(p => p.id === currentPersona)) {
      if (typeof onSelectPersona === 'function') {
        onSelectPersona('General Public');
      }
    }
  }, [visiblePersonas, currentPersona, onSelectPersona]);

  const handleAddClick = () => {
    if (!isAuthenticated) {
      if (typeof window !== 'undefined') {
        window.location.hash = '#/login';
      }
      return;
    }
    if (onOpenCustomize) {
      onOpenCustomize();
    } else if (typeof window !== 'undefined') {
      window.location.hash = '#/login';
    }
  };

  const handlePinClick = (personaId, e) => {
    e.stopPropagation();
    if (!isAuthenticated || !onPinToggle) return;
    const currentPinned = userProfile?.pinned_personas || ['General Public'];
    const nextPinned = togglePinnedPersona(personaId, currentPinned);
    onPinToggle(nextPinned);
  };

  return (
    <div
      className="p-3 sm:p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 shadow-xs transition-colors"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      role="group"
      aria-label="Who are you checking for?"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm font-black" aria-hidden="true">
          👥
        </div>
        <div>
          <span className="text-sm font-black t1 block leading-tight">Who are you checking for?</span>
          <span className="text-[11px] font-semibold tm block mt-0.5">
            {isAuthenticated ? 'Personalized health protocols for saved family members' : 'Tailor environmental guidance for kids, seniors, or outdoor work'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap max-w-full">
        {/* Active Profile Segmented Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[var(--surface-alt)] border max-w-full" style={{ borderColor: 'var(--border)' }}>
          {visiblePersonas.map((p) => {
            const isSelected = currentPersona === p.id || (p.id === 'General Public' && !currentPersona);

            return (
              <div key={p.id} className="relative group flex items-center">
                <button
                  type="button"
                  onClick={() => onSelectPersona(p.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-2 touch-target ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs ring-1 ring-indigo-500'
                      : 't2 hover:t1 hover:bg-[var(--surface)]'
                  }`}
                  aria-pressed={isSelected}
                  title={p.description}
                >
                  <span
                    aria-hidden="true"
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs leading-none shrink-0 ${
                      isSelected
                        ? 'bg-white/25 text-white ring-1 ring-white/50 shadow-xs'
                        : 'bg-indigo-100/70 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                    }`}
                  >
                    {p.icon}
                  </span>
                  <span>{p.label}</span>
                  {p.isPinned && (
                    <span className="text-[9px] leading-none opacity-70" aria-label="Pinned" title="Pinned profile">📌</span>
                  )}
                </button>
                {/* Pin toggle — visible on hover for authenticated users with multiple personas */}
                {isAuthenticated && onPinToggle && visiblePersonas.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => handlePinClick(p.id, e)}
                    className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[8px] leading-none flex items-center justify-center border transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 z-10 cursor-pointer ${
                      p.isPinned
                        ? 'bg-amber-100 dark:bg-amber-900/60 border-amber-400/50 text-amber-600 dark:text-amber-300'
                        : 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-300'
                    }`}
                    aria-label={p.isPinned ? `Unpin ${p.label}` : `Pin ${p.label}`}
                    title={p.isPinned ? `Unpin ${p.label}` : `Pin ${p.label} to dashboard`}
                  >
                    📌
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Button: Add or customize profiles */}
        <button
          type="button"
          onClick={handleAddClick}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs border border-indigo-500/40 transition-all active:scale-[0.98] cursor-pointer touch-target"
          title="Add or manage profiles for Child, Parent, Work, or School"
        >
          <span
            className="w-5 h-5 rounded-full bg-white text-indigo-700 flex items-center justify-center text-xs font-black leading-none shrink-0 shadow-xs ring-2 ring-white/30"
            aria-hidden="true"
          >
            +
          </span>
          <span className="text-white font-black">
            Add Work, Child or Parent
          </span>
        </button>
      </div>
    </div>
  );
}
