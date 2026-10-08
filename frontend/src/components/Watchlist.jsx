import React from 'react';
import { Bell } from 'lucide-react';

export default function Watchlist({ data }) {
  return (
    <div className="flex gap-4 items-center">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-2">Watchlist</span>
      {data.map(item => (
        <div key={item.name} className="bg-card text-card-foreground px-5 py-2.5 rounded-[20px] shadow-sm border border-border flex items-center justify-between min-w-[140px] hover:shadow-md transition-shadow cursor-pointer group">
           <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{item.name}</div>
              <div className="flex items-center gap-2">
                 <span className="font-black text-base">{item.aqi}</span>
                 <span className="text-[10px] font-bold text-red-aqi uppercase tracking-wider">{item.status}</span>
              </div>
           </div>
           <button className="text-slate-300 group-hover:text-indigo-500 transition-colors ml-3">
              <Bell size={16} />
           </button>
        </div>
      ))}
    </div>
  );
}
