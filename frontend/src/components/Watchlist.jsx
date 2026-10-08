import React from 'react';
import { Bell } from 'lucide-react';

export default function Watchlist({ data }) {
  return (
    <div className="flex gap-4">
      {data.map(item => (
        <div key={item.name} className="bg-card text-card-foreground px-4 py-3 rounded-2xl shadow-sm border border-border flex items-center justify-between min-w-[150px]">
           <div>
              <div className="text-xs font-semibold text-slate-500 uppercase">{item.name}</div>
              <div className="flex items-center gap-2">
                 <span className="font-bold text-lg">{item.aqi}</span>
                 <span className="text-xs font-medium text-red-aqi">{item.status}</span>
              </div>
           </div>
           <button className="text-slate-400 hover:text-indigo-500 transition-colors">
              <Bell size={16} />
           </button>
        </div>
      ))}
    </div>
  );
}
