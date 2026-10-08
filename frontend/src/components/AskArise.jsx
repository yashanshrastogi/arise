import React, { useState } from 'react';

/**
 * Ask Arise — AI assistant panel (mock mode).
 * Interactive conversational interface with quick question chips,
 * verdict badges, and evidence citations.
 */
const DEFAULT_CHIPS = [
  "Why is AQI high today?",
  "Is it safe to exercise outdoors?",
  "Should school kids go outdoors?",
  "When is the best time to ventilate?",
];

const KNOWLEDGE_RESPONSES = {
  "Why is AQI high today?": {
    verdict: "STAY IN",
    color: "#E5484D",
    text: "AQI is 312 due to severe PM2.5 accumulation (142.5 µg/m³). High stubble-burning fire signals in Punjab/Haryana combined with calm surface winds (<4 km/h) and a 400m boundary layer inversion have trapped pollutants over the Delhi-NCR basin.",
    sources: ["CPCB Stations", "NASA FIRMS Satellite", "IMD Dispersion Model"],
  },
  "Is it safe to exercise outdoors?": {
    verdict: "STAY IN",
    color: "#E5484D",
    text: "With AQI at 312, outdoor cardiovascular exertion is hazardous for all individuals. Fine particulates penetrate deep into lung alveoli. Switch to indoor workouts with HEPA air filtration. If outdoor transit is required, use an N95 respirator.",
    sources: ["WHO Health Guidelines", "CPCB Health Advisory"],
  },
  "Should school kids go outdoors?": {
    verdict: "CANCEL OUTDOORS",
    color: "#E5484D",
    text: "All outdoor school activities, sports periods, and morning assemblies should be cancelled immediately. Keep classroom windows closed and run indoor air filtration units in recirculation mode.",
    sources: ["Delhi Directorate of Education Air Protocol", "Arise School Safety Engine"],
  },
  "When is the best time to ventilate?": {
    verdict: "3 PM – 5 PM WINDOW",
    color: "#2EB872",
    text: "The lowest pollution window today is projected between 3:00 PM and 5:00 PM (forecasted dip to ~245 AQI) due to peak afternoon solar heating and brief boundary layer expansion. Keep windows closed outside this window.",
    sources: ["Arise 24h Diurnal Forecast", "IMD Meteorological Sounding"],
  },
};

export default function AskArise({ replies = [] }) {
  const [messages, setMessages] = useState([
    {
      q: "Is it safe to exercise outdoors?",
      verdict: "STAY IN",
      color: "#E5484D",
      text: "With AQI at 312, outdoor exercise is strongly discouraged for all groups. Consider indoor alternatives like yoga or gym workouts. If you must go out, the best window is 3–5 PM when AQI may dip to ~245.",
      sources: ["CPCB Delhi", "Arise Forecast"],
      timestamp: "10:15 AM",
    },
  ]);
  const [input, setInput] = useState('');

  const handleAsk = (query) => {
    const q = query || input;
    if (!q.trim()) return;

    const matched = KNOWLEDGE_RESPONSES[q] || {
      verdict: "STAY IN",
      color: "#E5484D",
      text: `Based on current Delhi-NCR telemetry (AQI 312, PM2.5 142.5 µg/m³), environmental risk remains elevated. Avoid prolonged exposure. Optimal outdoor window today is 3 PM – 5 PM.`,
      sources: ["CPCB Network", "Arise Intelligence Core"],
    };

    setMessages(prev => [
      ...prev,
      {
        q,
        verdict: matched.verdict,
        color: matched.color,
        text: matched.text,
        sources: matched.sources,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setInput('');
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
            <p className="text-[10px] font-semibold t3">Air Intelligence Copilot · Evidence Grounded</p>
          </div>
        </div>
        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo/10 text-indigo">
          AI Copilot
        </span>
      </div>

      {/* Chat Thread */}
      <div className="flex-1 overflow-y-auto space-y-3 my-2 max-h-[220px] pr-1">
        {messages.map((m, i) => (
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
              className="p-3.5 rounded-2xl rounded-tl-sm max-w-[95%] border"
              style={{
                background: 'var(--surface-alt)',
                borderColor: 'var(--border)',
                borderLeft: `4px solid ${m.color || '#5B4BDB'}`,
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase"
                  style={{ background: `${m.color || '#5B4BDB'}20`, color: m.color || '#5B4BDB' }}
                >
                  {m.verdict}
                </span>
                <span className="text-[10px] font-semibold tm">{m.timestamp}</span>
              </div>
              <p className="text-xs font-semibold t1 leading-relaxed">
                {m.text}
              </p>
              <div className="flex flex-wrap items-center gap-1 mt-2.5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <span className="text-[9px] font-bold t3">Sources:</span>
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
            </div>
          </div>
        ))}
      </div>

      {/* Suggested Prompt Chips */}
      <div className="flex flex-wrap gap-1.5 my-2">
        {DEFAULT_CHIPS.map(c => (
          <button
            key={c}
            onClick={() => handleAsk(c)}
            className="text-[11px] font-bold px-3 py-1 rounded-full t2 transition-all hover:bg-[var(--surface-alt)] hover:scale-[1.02] active:scale-95 border"
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
          placeholder="Ask Arise about Delhi's air quality, risks, or precautions..."
          className="flex-1 rounded-xl px-4 py-2.5 text-xs font-semibold t1 outline-none border transition-all focus:ring-2 focus:ring-indigo/30"
          style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
        />
        <button
          onClick={() => handleAsk()}
          className="w-9 h-9 rounded-xl bg-indigo text-white flex items-center justify-center text-xs font-bold shadow-md hover:scale-105 active:scale-95 transition-transform flex-shrink-0"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
