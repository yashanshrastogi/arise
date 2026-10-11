import React from 'react';

export const ALL_PERSONAS = [
  { id: 'General Public', key: 'me', label: 'Me', icon: '👤', description: 'General adult daily recommendation' },
  { id: 'Children & Schools', key: 'child', label: 'Child', icon: '🎒', description: 'Vulnerable respiratory tract & sports guidance' },
  { id: 'Elderly & Respiratory', key: 'parent', label: 'Parent', icon: '🫁', description: 'Senior & asthma health precautions' },
  { id: 'Work & Outdoor Labor', key: 'work', label: 'Work', icon: '💼', description: 'Commuter & outdoor worker respiratory protection' },
  { id: 'School Administration', key: 'school', label: 'School', icon: '🏫', description: 'Campus outdoor sports & morning assembly protocol' },
];

export default function PersonaSelector({
  currentPersona = 'General Public',
  onSelectPersona,
  isAuthenticated = false,
  userProfile = null,
  onOpenCustomize = null,
}) {
  // Determine visible personas:
  // By default: show ONLY 'Me' section.
  // Other profiles (Child, Parent, Work, School) appear when added by the user (persisted in userProfile or localStorage).
  let visiblePersonas = [ALL_PERSONAS[0]];

  if (userProfile?.configured_personas && Array.isArray(userProfile.configured_personas)) {
    const configuredSet = new Set(userProfile.configured_personas.map(p => p.toLowerCase()));
    const hasCustom = ALL_PERSONAS.slice(1).some(p =>
      configuredSet.has(p.id.toLowerCase()) ||
      configuredSet.has(p.key.toLowerCase()) ||
      configuredSet.has(p.label.toLowerCase())
    );
    if (hasCustom) {
      visiblePersonas = ALL_PERSONAS.filter(p =>
        p.id === 'General Public' ||
        configuredSet.has(p.id.toLowerCase()) ||
        configuredSet.has(p.key.toLowerCase()) ||
        configuredSet.has(p.label.toLowerCase())
      );
    }
  }

  const handleAddClick = () => {
    if (onOpenCustomize) {
      onOpenCustomize();
    } else if (typeof window !== 'undefined') {
      window.location.hash = '#/signup';
    }
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

      <div className="flex items-center gap-2 flex-wrap">
        {/* Active Profile Segmented Buttons */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--surface-alt)] border" style={{ borderColor: 'var(--border)' }}>
          {visiblePersonas.map((p) => {
            const isSelected = currentPersona === p.id || (p.id === 'General Public' && !currentPersona);

            return (
              <button
                key={p.id}
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
              </button>
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
