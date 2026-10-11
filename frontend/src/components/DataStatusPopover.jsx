import React, { useState, useRef, useEffect } from 'react';

export default function DataStatusPopover({ hasLiveFires = true }) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-xs" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border t2 hover:bg-[var(--surface-alt)] transition-colors font-bold touch-target"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        aria-expanded={open}
        aria-label="Where this comes from"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
        <span>Where this comes from</span>
        <span className="text-[10px] opacity-75">ℹ️</span>
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-2.5 left-0 w-80 max-w-[calc(100vw-2rem)] p-4 rounded-2xl border shadow-2xl z-[4000] animate-in fade-in zoom-in-95 duration-150"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          role="dialog"
          aria-label="Data sources explanation"
        >
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="font-black t1 text-sm">Where this data comes from</h4>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-xs t3 hover:bg-[var(--surface-alt)] font-bold"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2.5 text-xs sm:text-[13px] leading-relaxed">
            <div className="p-2.5 rounded-xl border bg-[var(--surface-alt)]" style={{ borderColor: 'var(--border)' }}>
              <div className="font-black text-emerald-600 dark:text-emerald-400 mb-0.5">Official Live Telemetry</div>
              <div className="t2 font-medium">
                Official air sensors (CPCB / OpenAQ), live weather (Open-Meteo){hasLiveFires ? ', and satellite thermal fires (NASA FIRMS)' : ''}.
              </div>
            </div>
            <div className="p-2.5 rounded-xl border bg-[var(--surface-alt)]" style={{ borderColor: 'var(--border)' }}>
              <div className="font-black text-amber-600 dark:text-amber-400 mb-0.5">Calibrated Demonstrations</div>
              <div className="t2 font-medium">
                Traffic flow estimates and indoor sensor readings are modeled for demonstration.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
