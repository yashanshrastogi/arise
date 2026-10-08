import React from 'react';
import { ShieldAlert } from 'lucide-react';

export default function SchoolCard({ data }) {
  return (
    <div className="bg-card text-card-foreground p-6 rounded-[24px] shadow-sm border border-border">
      <div className="flex items-center gap-2 mb-4">
         <ShieldAlert size={18} className="text-red-500" />
         <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">School Safety</h2>
      </div>
      <p className="font-bold text-lg mb-4">Should outdoor school activity continue?</p>
      
      <div className="flex gap-2 mb-6">
        <div className={`flex-1 py-2 text-center rounded-lg font-bold text-sm ${data.action === 'GO' ? 'bg-green-aqi text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>GO</div>
        <div className={`flex-1 py-2 text-center rounded-lg font-bold text-sm ${data.action === 'MODIFY' ? 'bg-orange-aqi text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>MODIFY</div>
        <div className={`flex-1 py-2 text-center rounded-lg font-bold text-sm ${data.action === 'CANCEL' ? 'bg-red-aqi text-white' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>CANCEL</div>
      </div>

      <div className="border border-border rounded-xl p-4 bg-slate-50 dark:bg-slate-800/50 relative">
        <span className="absolute -top-3 left-4 bg-slate-200 dark:bg-slate-700 text-xs font-bold px-2 py-1 rounded text-slate-600 dark:text-slate-300">Demo data</span>
        <div className="grid grid-cols-2 gap-4 mt-2">
           <div>
              <div className="text-xs text-slate-500 uppercase font-semibold">Indoor PM2.5</div>
              <div className="font-bold text-lg">{data.indoorPm25} <span className="text-sm font-normal text-slate-500">µg/m³</span></div>
           </div>
           <div>
              <div className="text-xs text-slate-500 uppercase font-semibold">Indoor CO2</div>
              <div className="font-bold text-lg">{data.indoorCo2} <span className="text-sm font-normal text-slate-500">ppm</span></div>
           </div>
           <div className="col-span-2">
              <div className="text-xs text-slate-500 uppercase font-semibold">Ventilation</div>
              <div className="font-bold text-sm text-indigo-500">{data.ventilation}</div>
           </div>
        </div>
      </div>
    </div>
  );
}
