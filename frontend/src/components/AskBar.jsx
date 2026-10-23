import React, { useState, useEffect } from 'react';
import { askAriseChat } from '../api/client';
import { isEnvironmentalQuery, getOutOfScopeGuardrailResponse } from '../utils/guardrails';
import FormattedBotText from './FormattedBotText';
import { useAuth } from '../auth/AuthContext';
import { speakText, stopSpeech, buildSpeechText } from '../utils/speechUtils';

const QUICK_CHIPS = [
  "Can I go out now?",
  "Can my kid play outside?",
  "Why is the AQI bad today?",
];

export default function AskBar({
  lat = 28.6139,
  lon = 77.2090,
  persona = 'General Public',
  demo = false,
  onOpenFullChat = null,
}) {
  const { isAuthenticated } = useAuth();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, []);

  const handleAsk = async (queryText) => {
    if (!isAuthenticated) {
      window.location.hash = '#/login';
      return;
    }

    const q = queryText || question;
    if (!q.trim() || loading) return;

    // Pre-flight Guardrail: strictly restrict AI to website environmental context
    // Do NOT make API call if question is off-topic!
    if (!isEnvironmentalQuery(q)) {
      const guardrailRes = getOutOfScopeGuardrailResponse(q);
      setAnswer({
        question: q,
        headline: guardrailRes.headline,
        verdict: guardrailRes.verdict,
        why: guardrailRes.why,
        do: guardrailRes.do,
        assistant_label: guardrailRes.assistant_label,
        is_rule_based: true,
      });
      return;
    }

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
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">· Atmospheric Intelligence</span>
        </div>
        {!isAuthenticated ? (
          <button
            type="button"
            onClick={() => { window.location.hash = '#/login'; }}
            className="text-xs font-black px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 shadow-2xs hover:border-indigo-400 dark:hover:border-indigo-500 transition-all cursor-pointer"
            style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <span>🔒</span>
            <span>Sign in to ask</span>
          </button>
        ) : (
          <span
            className="text-xs font-black px-2.5 py-0.5 rounded-full border flex items-center gap-1.5"
            style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            title="Google Gemini with automatic rule-based safety verdict grounding"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>✦ Arise Intelligence</span>
          </span>
        )}
      </div>

      {/* Input Bar or Guest CTA */}
      {!isAuthenticated ? (
        <div
          id="guest-askbar-cta"
          onClick={() => { window.location.hash = '#/login'; }}
          role="button"
          tabIndex={0}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (window.location.hash = '#/login')}
          className="flex items-center justify-between gap-3 p-2.5 rounded-xl border cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-600 transition-all bg-[var(--surface-alt)] shadow-xs"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2.5 pl-2">
            <span className="text-base text-indigo-500">🔒</span>
            <span className="text-xs sm:text-sm font-semibold tm">
              Sign in to ask a question, e.g. "Can my kid play outside?"
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.location.hash = '#/login';
            }}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-xs transition-all active:scale-95 shrink-0"
          >
            Sign In
          </button>
        </div>
      ) : (
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
      )}

      {/* Quick Prompt Chips */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <span className="text-xs font-bold t3">Try:</span>
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              if (!isAuthenticated) {
                window.location.hash = '#/login';
                return;
              }
              setQuestion(chip);
              handleAsk(chip);
            }}
            disabled={loading}
            className="text-xs font-bold px-3 py-1.5 rounded-full border t2 hover:bg-[var(--surface-alt)] transition-all touch-target flex items-center gap-1"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            title={!isAuthenticated ? "Sign in to ask this question" : chip}
          >
            {!isAuthenticated && <span className="text-[11px] opacity-60">🔒</span>}
            <span>{chip}</span>
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
            <button
              type="button"
              onClick={() => {
                if (isSpeaking) {
                  stopSpeech();
                  setIsSpeaking(false);
                } else {
                  const text = buildSpeechText(answer);
                  if (text) {
                    setIsSpeaking(true);
                    speakText(text, {
                      onStart: () => setIsSpeaking(true),
                      onEnd: () => setIsSpeaking(false),
                      onError: () => setIsSpeaking(false),
                    });
                  }
                }
              }}
              id="btn-askbar-read-aloud"
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                isSpeaking
                  ? 'bg-indigo-600 text-white border-indigo-500 animate-pulse'
                  : 'bg-[var(--surface)] hover:bg-[var(--surface-alt)] border-[var(--border)] t2'
              }`}
              title={isSpeaking ? "Stop reading response" : "Read response aloud"}
              aria-label={isSpeaking ? "Stop reading response aloud" : "Read response aloud"}
            >
              <span aria-hidden="true">{isSpeaking ? '⏹️' : '🔊'}</span>
              <span>{isSpeaking ? 'Stop' : 'Read Aloud'}</span>
            </button>
          </div>

          <div className="text-sm font-bold t1 leading-snug">
            <FormattedBotText text={answer.headline} />
          </div>

          {answer.do && answer.do.length > 0 && (
            <ul className="text-xs font-semibold t2 space-y-1.5 pt-1">
              {answer.do.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-indigo-500 font-bold mt-0.5">•</span>
                  <span><FormattedBotText text={item} /></span>
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
