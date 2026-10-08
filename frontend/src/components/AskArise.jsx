import React from 'react';
import { Sparkles, Send } from 'lucide-react';

export default function AskArise({ replies }) {
  return (
    <div className="bg-card text-card-foreground p-6 rounded-[24px] shadow-sm border border-border flex flex-col h-full min-h-[400px]">
      <div className="flex items-center gap-2 mb-6">
         <Sparkles size={18} className="text-indigo-500" />
         <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Ask Arise</h2>
      </div>

      <div className="flex-1 flex flex-col gap-4 overflow-y-auto mb-4">
        {replies.map((reply, idx) => (
          <div key={idx} className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-2xl p-4">
            <div className="flex justify-between items-start mb-2">
               <span className="font-bold text-indigo-700 dark:text-indigo-400">{reply.verdict}</span>
               <span className="text-xs text-slate-400">{reply.timestamp}</span>
            </div>
            <p className="text-sm font-medium mb-3 leading-relaxed">{reply.text}</p>
            <div className="text-xs text-slate-500 flex gap-2">
               <span className="font-semibold">Sources:</span> {reply.sources.join(', ')}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {["Why is AQI high?", "Is it safe to exercise?", "Should school assembly move indoors?", "When is the best time to go outside?"].map(chip => (
          <button key={chip} className="text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-full transition-colors">
            {chip}
          </button>
        ))}
      </div>

      <div className="relative">
         <input type="text" placeholder="Ask about the air..." className="w-full bg-slate-50 dark:bg-slate-900 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
         <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors">
            <Send size={16} />
         </button>
      </div>
    </div>
  );
}
