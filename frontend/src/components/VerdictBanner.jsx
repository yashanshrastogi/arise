import React from 'react';

/**
 * Verdict banner — the strongest visual element.
 * Red gradient for STAY_IN, orange for CUT_BACK, etc.
 */
const VERDICT_STYLES = {
  'STAY IN':   { from: '#E5484D', to: '#8B1E3F' },
  'CUT BACK':  { from: '#F28C28', to: '#E5484D' },
  'BE SMART':  { from: '#F5C542', to: '#F28C28' },
  'GO':        { from: '#2EB872', to: '#9BD34A' },
};

export default function VerdictBanner({ verdict, recommendation, bestWindow, recheckAt }) {
  const style = VERDICT_STYLES[verdict] || VERDICT_STYLES['STAY IN'];

  return (
    <div
      className="rounded-2xl p-5 text-white shadow-lg"
      style={{ background: `linear-gradient(135deg, ${style.from}, ${style.to})` }}
    >
      <div className="text-3xl font-extrabold tracking-tight leading-none mb-2">{verdict}</div>
      <p className="text-sm font-medium leading-snug opacity-95 mb-4">{recommendation}</p>
      <div className="flex gap-6 text-xs font-bold uppercase tracking-widest opacity-80">
        <div>
          <span className="block opacity-70 mb-0.5">Best window</span>
          <span className="text-sm normal-case tracking-normal opacity-100">{bestWindow}</span>
        </div>
        <div>
          <span className="block opacity-70 mb-0.5">Recheck</span>
          <span className="text-sm normal-case tracking-normal opacity-100">{recheckAt}</span>
        </div>
      </div>
    </div>
  );
}
