import React from 'react';
import { Info } from 'lucide-react';

export default function WhyCard({ details }) {
  return (
    <div className="bg-card text-card-foreground p-6 rounded-[24px] shadow-sm border border-border">
      <div className="flex items-center gap-2 mb-4">
         <Info size={18} className="text-indigo-500" />
         <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Intelligence Brief</h2>
      </div>
      <h3 className="text-xl font-bold mb-4">Why is the air bad?</h3>
      <div className="space-y-3">
        {details.map((detail, idx) => (
          <div key={idx} className="flex gap-3 items-start">
             <div className="mt-1 w-2 h-2 rounded-full bg-orange-500 flex-shrink-0"></div>
             <p className="text-sm font-medium leading-relaxed">{detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
