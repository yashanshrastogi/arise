import React from 'react';
import { Clock, AlertTriangle, Wind } from 'lucide-react';

export default function TodayCard({ data }) {
  return (
    <div className="bg-card text-card-foreground rounded-[32px] p-8 shadow-sm border border-border flex flex-col justify-between relative overflow-hidden">
      {/* Background aesthetic gradient */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-red-aqi/5 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2"></div>
      
      <div className="z-10">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-700 dark:text-slate-400 mb-2">Delhi-NCR</h2>
            <div className="flex items-baseline gap-3">
              <span className="text-7xl font-black tracking-tighter text-slate-900 dark:text-slate-100">{data.aqi}</span>
              <div className="bg-red-aqi/15 text-red-aqi dark:bg-red-aqi/30 dark:text-red-200 px-4 py-1.5 rounded-full text-sm font-bold tracking-wide uppercase">
                {data.status}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-aqi to-[#8B1E3F] text-white rounded-[24px] p-6 mb-8 shadow-lg shadow-red-aqi/20">
          <h1 className="text-4xl font-black mb-3 tracking-tight">{data.verdict}</h1>
          <p className="text-white/95 font-medium text-lg leading-snug">{data.recommendation}</p>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-200 dark:border-slate-700">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
              <AlertTriangle size={14} className="text-orange-600 dark:text-orange-500" />
              Primary Reason
            </h3>
            <p className="text-base font-bold leading-relaxed text-slate-900 dark:text-slate-100">
              {data.why}
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-2">
             <div className="bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1 flex items-center gap-1.5">
                  <Clock size={14} className="text-green-700 dark:text-green-500" /> Best Window
                </h3>
                <p className="font-bold text-base text-slate-900 dark:text-slate-100">{data.bestWindow}</p>
             </div>
             <div className="bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1 flex items-center gap-1.5">
                  <Wind size={14} className="text-indigo-600 dark:text-indigo-400" /> Dominant
                </h3>
                <p className="font-bold text-base text-slate-900 dark:text-slate-100">{data.dominantPollutant}</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
