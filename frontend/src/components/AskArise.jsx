import React, { useState, useRef, useEffect } from 'react';
import { askAriseChat } from '../api/client';
import { isEnvironmentalQuery, getOutOfScopeGuardrailResponse } from '../utils/guardrails';
import FormattedBotText from './FormattedBotText';
import { useAuth } from '../auth/AuthContext';

/**
 * Ask Arise — AI assistant panel powered by Strands Agents.
 * Real-time grounded queries, structured verdict responses,
 * and reliable fallback.
 */
const DEFAULT_CHIPS = [
  "Can I go out now?",
  "Can my kid play outside?",
  "Why is the AQI bad today?",
];

const VERDICT_COLORS = {
  STAY_IN: '#E5484D',
  'STAY IN': '#E5484D',
  CUT_BACK: '#F28C28',
  'CUT BACK': '#F28C28',
  BE_SMART: '#F5C542',
  'BE SMART': '#F5C542',
  GO: '#2EB872',
};



export default function AskArise({ lat = 28.6139, lon = 77.2090, demo = false, persona = 'General Public' }) {
  const { isAuthenticated } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const chatScrollRef = useRef(null);
  const messagesEndRef = useRef(null);

  const handleOpenLogin = () => {
    window.location.hash = '#/login';
  };

  const handleOpenSignUp = () => {
    window.location.hash = '#/signup';
  };

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    setShowScrollBottom(false);
  };

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isUp = scrollHeight - scrollTop - clientHeight > 60;
    setShowScrollBottom(isUp);
  };

  useEffect(() => {
    scrollToBottom(true);
  }, [messages, loading]);

  const handleAsk = async (query) => {
    if (!isAuthenticated) {
      handleOpenLogin();
      return;
    }

    const q = query || input;
    if (!q.trim() || loading) return;

    setInput('');

    // Pre-flight Guardrail: strictly restrict AI to website environmental context
    // Do NOT make API call if question is off-topic!
    if (!isEnvironmentalQuery(q)) {
      const guardrailRes = getOutOfScopeGuardrailResponse(q);
      setMessages(prev => [
        ...prev,
        {
          q,
          verdict: guardrailRes.verdict,
          headline: guardrailRes.headline,
          why: guardrailRes.why || [],
          do: guardrailRes.do || [],
          best_window: guardrailRes.best_window,
          recheck_at: guardrailRes.recheck_at,
          sources: guardrailRes.sources,
          assistant_label: guardrailRes.assistant_label,
          is_rule_based: true,
          timestamp: guardrailRes.timestamp,
        },
      ]);
      return;
    }

    setLoading(true);

    let isTimeout = false;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        isTimeout = true;
        reject(new Error("TIMEOUT_25S"));
      }, 25000);
    });

    try {
      const res = await Promise.race([
        askAriseChat({
          question: q,
          lat,
          lon,
          persona: persona || "General Public",
          demo,
        }),
        timeoutPromise,
      ]);

      if (res && res.verdict) {
        const isRuleBased = res.provider === 'rule-based' || res.is_rule_based === true;
        setMessages(prev => [
          ...prev,
          {
            q,
            verdict: res.verdict.replace('_', ' '),
            headline: res.headline,
            why: res.why || [],
            do: res.do || [],
            best_window: res.best_window,
            recheck_at: res.recheck_at,
            sources: Array.isArray(res.sources) && res.sources.length > 0 ? res.sources : [],
            assistant_label: res.assistant_label || (isRuleBased ? "Arise Copilot (rule-based)" : "Arise AI (Google Gemini)"),
            is_rule_based: isRuleBased,
            timestamp: res.timestamp || res.recheck_at || "Live Response",
          },
        ]);
        setLoading(false);
        return;
      }
    } catch (err) {
      if (isTimeout || err?.message === "TIMEOUT_25S") {
        setMessages(prev => [
          ...prev,
          {
            q,
            verdict: "BE SMART",
            headline: "Telemetry synthesis is taking longer than expected under peak load. Please try asking again in a moment.",
            why: ["The live environmental telemetry query exceeded our 25-second responsiveness budget."],
            do: ["Check the live AQI gauges above or re-submit your question shortly."],
            best_window: "Unavailable",
            recheck_at: "Shortly",
            sources: [],
            assistant_label: "Arise Copilot (rule-based)",
            is_rule_based: true,
            timestamp: "Timeout",
          },
        ]);
        setLoading(false);
        return;
      }
      console.warn("Ask Arise chat error:", err);
    }

    // Network / service error state
    setMessages(prev => [
      ...prev,
      {
        q,
        verdict: "STAY IN",
        headline: "Telemetry service temporarily unreachable. Please retry shortly.",
        why: ["Unable to establish connection to the backend telemetry service."],
        do: ["Check your internet connection and re-query."],
        best_window: "Unavailable",
        recheck_at: "Unavailable",
        sources: [],
        assistant_label: "Arise Copilot (rule-based)",
        is_rule_based: true,
        timestamp: "Unavailable",
      },
    ]);
    setLoading(false);
  };

  return (
    <div className="card p-5 sm:p-6 h-full flex flex-col justify-between relative">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-base font-black shadow-md shadow-indigo-500/20">
            ✦
          </div>
          <div>
            <h3 className="text-base font-black t1 tracking-tight">Ask Arise</h3>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              ⚡ Atmospheric Intelligence · Live Environmental Fusion
            </p>
          </div>
        </div>
        {!isAuthenticated ? (
          <button
            type="button"
            onClick={handleOpenLogin}
            className="text-xs font-black px-3 py-1 rounded-full border flex items-center gap-1.5 shadow-2xs hover:border-indigo-400 dark:hover:border-indigo-500 transition-all cursor-pointer"
            style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <span>🔒</span>
            <span>Sign in to unlock</span>
          </button>
        ) : (
          <span
            className="text-xs font-black px-3 py-1 rounded-full border flex items-center gap-2 shadow-2xs"
            style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            title="Google Gemini with automatic rule-based safety verdict grounding"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>✦ Arise Intelligence</span>
          </span>
        )}
      </div>

      {/* Chat Thread Container with auto-scroll and relative positioning */}
      <div className="relative flex-1 min-h-[260px] flex flex-col my-1 overflow-hidden">
        <div
          ref={chatScrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto space-y-3.5 pr-1.5 py-3 scroll-smooth"
        >
          {messages.length === 0 ? (
            <div
              className="p-6 rounded-2xl border text-center flex flex-col items-center justify-center gap-3 my-auto shrink-0"
              style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-2xl shadow-xs">
                ✦
              </div>
              <div>
                <p className="text-base font-black t1">Ask Arise Environmental Copilot</p>
                <p className="text-xs font-medium tm max-w-md leading-relaxed mt-1">
                  Ask anything about current air quality, outdoor safety windows, temperature, or personalized family precautions.
                </p>
              </div>

              {!isAuthenticated && (
                <div
                  className="w-full max-w-md mt-2 p-5 rounded-2xl border bg-[var(--surface)] text-left shadow-sm space-y-3"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center text-base shrink-0 font-black">
                      🔒
                    </div>
                    <div>
                      <span className="text-xs font-black t1">Members-Only Environmental Copilot</span>
                      <p className="text-[11px] font-semibold tm">
                        Sign in to unlock interactive queries, predictions &amp; AI synthesis
                      </p>
                    </div>
                  </div>

                  <div className="text-xs font-semibold t2 space-y-1.5 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Real-time atmospheric telemetry fusion &amp; verdict explanations</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>14-day weather &amp; AQI horizon forecasting</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Personalized advisories for asthma, seniors, athletes &amp; schools</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                    <button
                      type="button"
                      id="btn-ask-signin"
                      onClick={handleOpenLogin}
                      className="px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-all active:scale-95"
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      id="btn-ask-signup"
                      onClick={handleOpenSignUp}
                      className="px-4 py-2 rounded-xl text-xs font-black border transition-all hover:bg-[var(--surface-alt)] shadow-xs"
                      style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      Create Free Account
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            messages.map((m, i) => {
              const col = VERDICT_COLORS[m.verdict] || '#E5484D';
              return (
                <div key={i} className="space-y-2">
                  {/* User message */}
                  <div className="flex justify-end">
                    <div
                      className="px-4 py-2.5 rounded-2xl rounded-tr-sm text-xs sm:text-sm font-bold max-w-[85%] shadow-xs"
                      style={{ background: 'var(--surface-alt)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    >
                      {m.q}
                    </div>
                  </div>

                  {/* Arise Copilot Response */}
                  <div
                    className="p-4 sm:p-5 rounded-2xl rounded-tl-sm max-w-[95%] border space-y-3 shadow-xs"
                    style={{
                      background: 'var(--surface-alt)',
                      borderColor: 'var(--border)',
                      borderLeft: `5px solid ${col}`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider"
                          style={{ background: `${col}20`, color: col }}
                        >
                          {m.verdict}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                            m.is_rule_based
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                              : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
                          }`}
                        >
                          {m.assistant_label || (m.is_rule_based ? 'Arise Copilot (rule-based)' : 'Arise AI (Google Gemini)')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.best_window && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            Window: {m.best_window}
                          </span>
                        )}
                        <span className="text-[11px] font-semibold tm">{m.timestamp}</span>
                      </div>
                    </div>

                    {/* Headline - Larger & readable */}
                    <div className="text-sm sm:text-base font-extrabold t1 leading-snug tracking-tight">
                      <FormattedBotText text={m.headline} />
                    </div>

                    {/* Why factors */}
                    {m.why && m.why.length > 0 && (
                      <div className="space-y-1 pt-1.5">
                        <div className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                          Key Air Observations
                        </div>
                        <ul className="text-xs sm:text-sm font-semibold t2 list-disc list-inside space-y-1 pl-1 leading-relaxed">
                          {m.why.map((reason, idx) => (
                            <li key={idx} className="leading-snug">
                              <FormattedBotText text={reason} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Precautions / Do */}
                    {m.do && m.do.length > 0 && (
                      <div className="space-y-1 pt-1.5">
                        <div className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          Recommended Actions
                        </div>
                        <ul className="text-xs sm:text-sm font-semibold t2 list-disc list-inside space-y-1 pl-1 leading-relaxed">
                          {m.do.map((act, idx) => (
                            <li key={idx} className="leading-snug">
                              <FormattedBotText text={act} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Telemetry citations */}
                    {m.sources && m.sources.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
                        <span className="text-[10px] font-bold t3">Telemetry Sources:</span>
                        {m.sources.map(s => (
                          <span
                            key={s}
                            className="text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--surface)] border"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {loading && (
            <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[var(--surface-alt)] border max-w-[85%] shadow-xs">
              <span className="w-3 h-3 rounded-full bg-indigo-600 animate-ping shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs sm:text-sm font-bold t1">Synthesizing environmental intelligence...</span>
                <span className="text-[11px] font-medium t3">Querying ground telemetry, atmospheric dispersion &amp; satellite detections</span>
              </div>
            </div>
          )}

          {/* Anchor to scroll to */}
          <div ref={messagesEndRef} />
        </div>

        {/* Floating Instant Scroll Down Button */}
        {showScrollBottom && (
          <button
            type="button"
            id="btn-scroll-chat-bottom"
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-2 right-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-black shadow-lg hover:bg-indigo-700 active:scale-95 transition-all animate-bounce"
            aria-label="Scroll to newest response"
          >
            <span>↓</span>
            <span>Newest response</span>
          </button>
        )}
      </div>

      {/* Suggested Prompt Chips */}
      <div className="flex flex-wrap gap-1.5 my-2">
        {DEFAULT_CHIPS.map(c => (
          <button
            key={c}
            onClick={() => {
              if (!isAuthenticated) {
                handleOpenLogin();
                return;
              }
              handleAsk(c);
            }}
            disabled={loading}
            className="text-xs font-bold px-3 py-1.5 rounded-full t2 transition-all hover:bg-[var(--surface-alt)] hover:scale-[1.02] active:scale-95 border disabled:opacity-50 flex items-center gap-1.5"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            title={!isAuthenticated ? "Sign in to ask this question" : c}
          >
            {!isAuthenticated && <span className="text-[10px] opacity-60">🔒</span>}
            <span>{c}</span>
          </button>
        ))}
      </div>

      {/* Input Field or Guest Sign In Bar */}
      {!isAuthenticated ? (
        <div
          id="guest-ask-cta-bar"
          onClick={handleOpenLogin}
          role="button"
          tabIndex={0}
          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleOpenLogin()}
          className="flex items-center justify-between gap-3 p-2.5 rounded-xl border cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-600 transition-all bg-[var(--surface-alt)] shadow-xs"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2.5 pl-2">
            <span className="text-base text-indigo-500">🔒</span>
            <span className="text-xs sm:text-sm font-semibold tm">
              Sign in to ask Arise about Delhi's air quality, risks, or precautions...
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenLogin();
            }}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black shadow-xs hover:bg-indigo-500 transition-all active:scale-95 shrink-0"
          >
            Sign In
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-1">
          <input
            id="input-ask-arise"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAsk()}
            disabled={loading}
            placeholder="Ask Arise about Delhi's air quality, risks, or precautions..."
            className="flex-1 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold t1 outline-none border transition-all focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50"
            style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
          />
          <button
            id="btn-ask-submit"
            onClick={() => handleAsk()}
            disabled={loading}
            className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-md hover:bg-indigo-700 active:scale-95 transition-all flex-shrink-0 disabled:opacity-50"
            aria-label="Send query"
          >
            {loading ? '…' : '➤'}
          </button>
        </div>
      )}

      {/* Non-medical guidance disclaimer */}
      <div className="text-[11px] font-medium tm text-center mt-2 pt-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
        Environmental exposure intelligence for everyday decisions · Not medical advice
      </div>
    </div>
  );
}
