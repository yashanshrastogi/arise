import React, { useState } from 'react';
import { askAriseChat } from '../api/client';

const QUICK_CHIPS = [
  "Can my kid play outside?",
  "Why is the air bad today?",
  "Is it safe to exercise?",
  "What mask should I wear?",
];

export default function AskBar({
  lat = 28.6139,
  lon = 77.2090,
  persona = 'General Public',
  demo = false,
  onOpenFullChat = null,
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async (queryText) => {
    const q = queryText || question;
    if (!q.trim() || loading) return;

    setLoading(true);
    try {
      const res = await askAriseChat({
        question: q,
        lat,
        lon,
        persona: persona || 'General Public',
        demo,
      });

      if (res && res.verdict) {
        setAnswer({
          question: q,
          headline: res.headline || 'Air Quality Synthesis',
          verdict: (res.verdict || 'STAY IN').replace('_', ' '),
          why: res.why || [],
          do: res.do || [],
          assistant_label: res.assistant_label || (res.is_rule_based ? 'Rule-based Fallback' : 'Google Gemini'),
          is_rule_based: res.is_rule_based,
        });
      }
    } catch {
      setAnswer({
        question: q,
        headline: 'Stay indoors and keep windows shut under current very bad air levels.',
        verdict: 'STAY IN',
        why: ['Fine particulate dust PM2.5 is elevated across the Delhi-NCR basin.'],
        do: ['Use an N95 mask if outdoors', 'Run indoor filtration'],
        assistant_label: 'Rule-based Fallback',
        is_rule_based: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="card p-5 space-y-3"
      style={{ background: 'var(--card)' }}
      role="search"
      aria-label="Ask Arise Environmental Intelligence"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <span className="text-sm font-extrabold t1">Ask Arise</span>
          <span className="text-xs font-semibold t3">· Uses today's live data</span>
        </div>
        <span
          className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border"
          style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          title="Google Gemini 2.5 Flash Lite with automatic rule-based fallback"
        >
          Gemini + Rule-based Fallback
        </span>
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAsk();
        }}
        className="flex items-center gap-2"
      >
        <input
          id="input-ask-bar"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='Ask a question, e.g. "Can my kid play outside?"'
          className="flex-1 px-4 py-3 rounded-xl border text-sm font-medium t1 outline-none transition-all focus:ring-2 focus:ring-indigo-500/30 touch-target"
          style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
        />
        <button
          id="btn-ask-submit"
          type="submit"
          disabled={loading || !question.trim()}
          className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-md transition-all active:scale-95 disabled:opacity-50 touch-target flex items-center gap-1.5"
        >
          {loading ? 'Thinking…' : 'Ask ➤'}
        </button>
      </form>

      {/* Quick Prompt Chips */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <span className="text-xs font-bold t3">Try:</span>
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              setQuestion(chip);
              handleAsk(chip);
            }}
            disabled={loading}
            className="text-xs font-bold px-3 py-1.5 rounded-full border t2 hover:bg-[var(--surface-alt)] transition-all touch-target"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Answer Display */}
      {answer && (
        <div
          className="mt-3 p-4 rounded-xl border space-y-2 bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800/40"
          aria-live="polite"
        >
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-indigo-700 dark:text-indigo-300 font-extrabold uppercase">
              Verdict: {answer.verdict}
            </span>
            <span className="text-slate-500 text-[11px]">
              Answered by {answer.assistant_label}
            </span>
          </div>

          <p className="text-sm font-bold t1 leading-snug">
            {answer.headline}
          </p>

          {answer.do && answer.do.length > 0 && (
            <ul className="text-xs font-semibold t2 space-y-1 pt-1">
              {answer.do.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-indigo-500 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}

          {onOpenFullChat && (
            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={onOpenFullChat}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Open full conversation →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
