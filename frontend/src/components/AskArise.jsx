import React from 'react';
import { Sparkles, Send } from 'lucide-react';

export default function AskArise({ replies }) {
  return (
    <div className="bg-card text-card-foreground p-8 rounded-[32px] shadow-sm border border-border flex flex-col h-full min-h-[400px]">
      <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
         <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg">
           <Sparkles size={18} className="text-indigo-500" />
         </div>
         <div>
           <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Assistant</h2>
           <h3 className="text-lg font-black tracking-tight text-slate-800 dark:text-slate-100">Ask Arise</h3>
         </div>
      </div>

      <div className="flex-1 flex flex-col gap-5 overflow-y-auto mb-6 pr-2">
        {replies.map((reply, idx) => (
          <div key={idx} className="bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100/50 dark:border-indigo-800/50 rounded-[24px] p-5 shadow-sm">
            <div className="flex justify-between items-center mb-3">
               <span className="font-bold text-sm text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/50 px-3 py-1 rounded-full">{reply.verdict}</span>
               <span className="text-xs font-semibold text-slate-400 dark:text-slate-400">{reply.timestamp}</span>
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed mb-4">{reply.text}</p>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-2 border-t border-indigo-100 dark:border-indigo-900/50 pt-3">
               <span>Sources:</span> 
               <span className="text-indigo-600 dark:text-indigo-300">{reply.sources.join(', ')}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {["Why is AQI high?", "Is it safe to exercise?", "Should school assembly move indoors?", "When is the best time to go outside?"].map(chip => (
          <button key={chip} className="text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 px-4 py-2 rounded-full transition-all hover:scale-105 active:scale-95">
            {chip}
          </button>
        ))}
      </div>

      <div className="relative group">
         <input type="text" placeholder="Ask about the air..." className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400" />
         <button className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-500/20 group-focus-within:bg-indigo-600">
            <Send size={16} />
         </button>
      </div>
    </div>
  );
}
