import React from 'react';

const PERSONAS = [
  { id: 'General Public', label: 'Me', icon: '👤' },
  { id: 'Children & Schools', label: 'My child', icon: '🎒' },
  { id: 'Elderly & Respiratory', label: 'My parent', icon: '🫁' },
  { id: 'School Administration', label: 'A school', icon: '🏫' },
];

export default function PersonaSelector({ currentPersona = 'General Public', onSelectPersona }) {
  return (
    <div
      className="p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 shadow-xs"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      role="group"
      aria-label="Who are you checking for?"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-extrabold t1">Who are you checking for?</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {PERSONAS.map(p => {
          const isSelected = currentPersona === p.id || (p.id === 'General Public' && !currentPersona);

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPersona(p.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 touch-target ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-xs scale-100'
                  : 't2 hover:bg-[var(--surface-alt)] border'
              }`}
              style={{
                borderColor: isSelected ? 'transparent' : 'var(--border)',
              }}
              aria-pressed={isSelected}
            >
              <span aria-hidden="true">{p.icon}</span>
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
