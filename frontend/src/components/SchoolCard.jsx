import React from 'react';
import { ShieldAlert } from 'lucide-react';

export default function SchoolCard({ data }) {
  return (
    <div className="bg-card text-card-foreground p-8 rounded-[32px] shadow-sm border border-border">
      <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
         <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
           <ShieldAlert size={18} className="text-red-500" />
         </div>
         <div>
           <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">School Safety</h2>
           <h3 className="text-lg font-black tracking-tight text-slate-800 dark:text-slate-200">Outdoor Activity</h3>
         </div>
      </div>
      
      <div className="flex gap-3 mb-8">
        <div className={`flex-1 py-3 text-center rounded-xl font-black text-sm tracking-wide transition-all ${data.action === 'GO' ? 'bg-green-aqi text-white shadow-md shadow-green-aqi/20' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>GO</div>
        <div className={`flex-1 py-3 text-center rounded-xl font-black text-sm tracking-wide transition-all ${data.action === 'MODIFY' ? 'bg-orange-aqi text-white shadow-md shadow-orange-aqi/20' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>MODIFY</div>
        <div className={`flex-1 py-3 text-center rounded-xl font-black text-sm tracking-wide transition-all ${data.action === 'CANCEL' ? 'bg-red-aqi text-white shadow-md shadow-red-aqi/20' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>CANCEL</div>
      </div>

      <div className="border border-slate-100 dark:border-slate-800 rounded-2xl p-5 bg-slate-50 dark:bg-slate-800/30 relative">
        <span className="absolute -top-3 left-6 bg-slate-200 dark:bg-slate-700 text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full text-slate-600 dark:text-slate-300 shadow-sm border border-slate-300 dark:border-slate-600">Demo data</span>
        <div className="grid grid-cols-2 gap-6 mt-3">
           <div>
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Indoor PM2.5</div>
              <div className="font-black text-xl text-slate-800 dark:text-slate-200">{data.indoorPm25} <span className="text-xs font-semibold text-slate-500">µg/m³</span></div>
           </div>
           <div>
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Indoor CO2</div>
              <div className="font-black text-xl text-slate-800 dark:text-slate-200">{data.indoorCo2} <span className="text-xs font-semibold text-slate-500">ppm</span></div>
           </div>
           <div className="col-span-2 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Ventilation Status</div>
              <div className="font-bold text-sm text-indigo-500 flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                 {data.ventilation}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
