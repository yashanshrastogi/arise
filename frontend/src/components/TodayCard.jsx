import React from 'react';
import { AlertTriangle, Clock } from 'lucide-react';

export default function TodayCard({ data }) {
  return (
    <div className="bg-card text-card-foreground rounded-[24px] p-6 shadow-sm border border-border flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Delhi-NCR</h2>
            <div className="flex items-center gap-2">
              <span className="text-5xl font-bold tracking-tight">{data.aqi}</span>
              <div className="bg-red-aqi/10 text-red-aqi px-3 py-1 rounded-full text-sm font-semibold">
                {data.status}
              </div>
            </div>
          </div>
          <div className="w-16 h-16 rounded-full border-4 border-red-aqi flex items-center justify-center">
             <span className="font-bold text-lg text-red-aqi">AQI</span>
          </div>
        </div>

        <div className="bg-red-aqi text-white rounded-2xl p-4 mb-6">
          <h1 className="text-3xl font-black mb-1">{data.verdict}</h1>
          <p className="text-white/90 font-medium">{data.recommendation}</p>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase mb-1">Why?</h3>
            <p className="text-sm font-medium">{data.why}</p>
          </div>
          <div className="flex justify-between border-t border-border pt-4 mt-2">
             <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
                  <Clock size={14} /> Best Window
                </h3>
                <p className="font-medium text-sm text-green-aqi">{data.bestWindow}</p>
             </div>
             <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase mb-1">Recheck</h3>
                <p className="font-medium text-sm">{data.recheckAt}</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
