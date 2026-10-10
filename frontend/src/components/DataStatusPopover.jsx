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
          className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 w-72 p-4 rounded-2xl border shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          role="dialog"
          aria-label="Data sources explanation"
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-extrabold t1 text-xs">Where this data comes from</h4>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs t3 hover:bg-[var(--surface-alt)]"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <span className="font-black text-emerald-600 dark:text-emerald-400">Real data: </span>
              <span className="t2 font-medium">
                Official air sensors (CPCB/OpenAQ), live weather (Open-Meteo){hasLiveFires ? ', and satellite fire photos (NASA FIRMS)' : ''}.
              </span>
            </div>
            <div className="pt-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
              <span className="font-black text-amber-600 dark:text-amber-400">Practice data: </span>
              <span className="t2 font-medium">
                Traffic flow estimates and indoor sensor readings are simulated for demonstration.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
