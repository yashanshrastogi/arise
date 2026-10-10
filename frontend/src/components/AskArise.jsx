import React, { useState } from 'react';
import { askAriseChat } from '../api/client';

/**
 * Ask Arise — AI assistant panel powered by Strands Agents.
 * Real-time grounded queries, structured verdict responses,
 * and reliable fallback.
 */
const DEFAULT_CHIPS = [
  "Can I go out now?",
  "Can my kid play outside?",
  "Why is the AQI bad today?",
  "What is the best time to go outside?",
  "Should my school cancel outdoor sports?",
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

export default function AskArise({ lat = 28.6139, lon = 77.2090, demo = false }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAsk = async (query) => {
    const q = query || input;
    if (!q.trim() || loading) return;

    setInput('');
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
          persona: "General Public",
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
            assistant_label: res.assistant_label || (isRuleBased ? "Arise Assistant (rule-based)" : "Arise AI (Bedrock)"),
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
            assistant_label: "Arise Assistant (rule-based)",
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
        assistant_label: "Arise Assistant (rule-based)",
        is_rule_based: true,
        timestamp: "Unavailable",
      },
    ]);
    setLoading(false);
  };

  return (
    <div className="card p-5 h-full flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo flex items-center justify-center text-white text-sm font-bold shadow-md">
            ✦
          </div>
          <div>
            <h3 className="text-sm font-extrabold t1">Ask Arise</h3>
            <p className="text-[10px] font-semibold t3">Environmental Decision Assistant · Tool Grounded</p>
          </div>
        </div>
        <span
          className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5"
          style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          title="Bedrock AI with automatic rule-based verdict fallback"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Bedrock + Rule Fallback</span>
        </span>
      </div>

      {/* Chat Thread */}
      <div className="flex-1 overflow-y-auto space-y-3 my-2 max-h-[260px] pr-1">
        {messages.length === 0 ? (
          <div
            className="p-4 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 my-2"
            style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
          >
            <div className="text-xl">💬</div>
            <p className="text-xs font-bold t1">Ask Arise Environmental Copilot</p>
            <p className="text-[11px] font-medium tm max-w-sm">
              Query real-time health risks, activity windows, and precautions grounded in live CPCB and meteorological telemetry.
            </p>
          </div>
        ) : (
          messages.map((m, i) => {
          const col = VERDICT_COLORS[m.verdict] || '#E5484D';
          return (
            <div key={i} className="space-y-2">
              {/* User message */}
              <div className="flex justify-end">
                <div
                  className="px-3.5 py-2 rounded-2xl rounded-tr-sm text-xs font-bold max-w-[85%]"
                  style={{ background: 'var(--surface-alt)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                >
                  {m.q}
                </div>
              </div>

              {/* Arise Copilot Response */}
              <div
                className="p-3.5 rounded-2xl rounded-tl-sm max-w-[95%] border space-y-2"
                style={{
                  background: 'var(--surface-alt)',
                  borderColor: 'var(--border)',
                  borderLeft: `4px solid ${col}`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className="text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider"
                      style={{ background: `${col}18`, color: col }}
                    >
                      {m.verdict}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                        m.is_rule_based
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                          : 'bg-indigo/10 text-indigo border-indigo/20'
                      }`}
                    >
                      {m.assistant_label || (m.is_rule_based ? 'Arise Assistant (rule-based)' : 'Arise AI (Bedrock)')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.best_window && (
                      <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                        Window: {m.best_window}
                      </span>
                    )}
                    <span className="text-[10px] font-semibold tm">{m.timestamp}</span>
                  </div>
                </div>

                {/* Headline */}
                <p className="text-xs font-extrabold t1 leading-snug">
                  {m.headline}
                </p>

                {/* Why factors */}
                {m.why && m.why.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="text-[10px] font-black uppercase tracking-wider text-indigo">
                      Environmental Telemetry
                    </div>
                    <ul className="text-[11px] font-medium t2 list-disc list-inside space-y-0.5 pl-0.5">
                      {m.why.map((reason, idx) => (
                        <li key={idx} className="leading-tight">{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Precautions / Do */}
                {m.do && m.do.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Recommended Action
                    </div>
                    <ul className="text-[11px] font-medium t2 list-disc list-inside space-y-0.5 pl-0.5">
                      {m.do.map((act, idx) => (
                        <li key={idx} className="leading-tight">{act}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Evidence citations */}
                {m.sources && m.sources.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-[9px] font-bold t3">Telemetry Sources:</span>
                    {m.sources.map(s => (
                      <span
                        key={s}
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--surface)] border"
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
        }))}

        {loading && (
          <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-[var(--surface-alt)] border max-w-[85%] shadow-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo animate-ping shrink-0" />
            <div className="flex flex-col">
              <span className="text-xs font-bold t1">Synthesizing environmental intelligence...</span>
              <span className="text-[10px] font-medium t3">Querying ground telemetry, atmospheric dispersion &amp; satellite detections</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggested Prompt Chips */}
      <div className="flex flex-wrap gap-1.5 my-2">
        {DEFAULT_CHIPS.map(c => (
          <button
            key={c}
            onClick={() => handleAsk(c)}
            disabled={loading}
            className="text-[11px] font-bold px-3 py-1 rounded-full t2 transition-all hover:bg-[var(--surface-alt)] hover:scale-[1.02] active:scale-95 border disabled:opacity-50"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Input Field */}
      <div className="flex items-center gap-2 mt-1">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAsk()}
          disabled={loading}
          placeholder="Ask Arise about Delhi's air quality, risks, or precautions..."
          className="flex-1 rounded-xl px-4 py-2.5 text-xs font-semibold t1 outline-none border transition-all focus:ring-2 focus:ring-indigo/30 disabled:opacity-50"
          style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
        />
        <button
          onClick={() => handleAsk()}
          disabled={loading}
          className="w-9 h-9 rounded-xl bg-indigo text-white flex items-center justify-center text-xs font-bold shadow-md hover:scale-105 active:scale-95 transition-transform flex-shrink-0 disabled:opacity-50"
        >
          {loading ? '…' : '➤'}
        </button>
      </div>

      {/* Non-medical guidance disclaimer */}
      <div className="text-[10px] font-medium tm text-center mt-2 pt-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
        Environmental exposure intelligence for everyday decisions · Not medical advice
      </div>
    </div>
  );
}
