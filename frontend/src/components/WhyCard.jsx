import React from 'react';
import { Target, Activity, Flame, CloudOff } from 'lucide-react';

export default function WhyCard({ details }) {
  const getIntelligenceConfig = (idx) => {
    switch(idx) {
      case 0: return { icon: <Target size={16} />, color: "text-indigo-700 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-500/20" };
      case 1: return { icon: <Activity size={16} />, color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-500/20" };
      case 2: return { icon: <Flame size={16} />, color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-500/20" };
      case 3: return { icon: <CloudOff size={16} />, color: "text-slate-700 dark:text-slate-400", bg: "bg-slate-200 dark:bg-slate-500/20" };
      default: return { icon: <Target size={16} />, color: "text-indigo-700 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-500/20" };
    }
  };

  return (
    <div className="bg-card text-card-foreground p-8 rounded-[32px] shadow-sm border border-border">
      <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
         <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
           <Activity size={18} className="text-slate-700 dark:text-slate-300" />
         </div>
         <div>
           <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">Intelligence Brief</h2>
           <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-100">Environmental Factors</h3>
         </div>
      </div>
      
      <div className="space-y-4">
        {details.map((detail, idx) => {
          const config = getIntelligenceConfig(idx);
          return (
            <div key={idx} className="flex gap-4 items-center group">
               <div className={`p-3 rounded-xl ${config.bg} ${config.color} shrink-0 transition-transform group-hover:scale-105`}>
                 {config.icon}
               </div>
               <p className="text-sm font-bold text-slate-800 dark:text-slate-200 leading-snug">{detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
