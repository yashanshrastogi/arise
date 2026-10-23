import React, { useState, useRef, useEffect } from 'react';

/**
 * InfoTooltip - Accessible (i) information popover
 * Explains complex/sophisticated environmental terms in short, plain English
 * with their practical health consequence.
 */
export default function InfoTooltip({
  title,
  text,
  impact = null,
  ariaLabel = null,
  placement = 'top',
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const popoverRef = useRef(null);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const label = ariaLabel || (title ? `Info about ${title}` : 'More information');

  return (
    <span ref={containerRef} className={`relative inline-flex items-center align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        aria-label={label}
        aria-expanded={isOpen}
        className="w-4.5 h-4.5 sm:w-5 sm:h-5 rounded-full inline-flex items-center justify-center text-[11px] sm:text-xs font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500 shrink-0"
      >
        i
      </button>

      {isOpen && (
        <span
          ref={popoverRef}
          role="tooltip"
          className={`absolute z-[2500] w-64 sm:w-72 p-3 rounded-xl border shadow-xl text-left normal-case tracking-normal font-normal pointer-events-auto transition-opacity animate-in fade-in duration-150 ${
            placement === 'bottom'
              ? 'top-full mt-2 left-1/2 -translate-x-1/2'
              : placement === 'left'
              ? 'right-full mr-2 top-1/2 -translate-y-1/2'
              : placement === 'right'
              ? 'left-full ml-2 top-1/2 -translate-y-1/2'
              : 'bottom-full mb-2 left-1/2 -translate-x-1/2'
          }`}
          style={{
            background: 'var(--card)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-2)',
            color: 'var(--text-primary)',
          }}
        >
          {title && (
            <span className="block text-xs sm:text-sm font-black t1 mb-1 leading-snug">
              {title}
            </span>
          )}
          <span className="block text-xs leading-relaxed t2 font-medium">
            {text}
          </span>
          {impact && (
            <span className="block text-[11px] sm:text-xs font-semibold text-amber-700 dark:text-amber-400 mt-1.5 pt-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
              ⚡ {impact}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
