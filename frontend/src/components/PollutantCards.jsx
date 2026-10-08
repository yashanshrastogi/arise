import React from 'react';

const colorMap = {
  Good: 'bg-green-aqi text-white shadow-green-aqi/20',
  Satisfactory: 'bg-lime-aqi text-slate-900 shadow-lime-aqi/20',
  Moderate: 'bg-yellow-aqi text-slate-900 shadow-yellow-aqi/20',
  Poor: 'bg-orange-aqi text-white shadow-orange-aqi/20',
  Severe: 'bg-red-aqi text-white shadow-red-aqi/20'
};

export default function PollutantCards({ data }) {
  const pollutants = Object.values(data);
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {pollutants.map(p => (
        <div key={p.name} className="bg-card text-card-foreground p-5 rounded-[24px] shadow-sm border border-border flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex justify-between items-center mb-3">
            <span className="font-bold text-xs text-slate-700 dark:text-slate-400 tracking-wide uppercase">{p.name}</span>
            <div className={`w-3 h-3 rounded-full ${colorMap[p.status] ? colorMap[p.status].split(' ')[0] : 'bg-slate-400'}`}></div>
          </div>
          <div className="mb-2">
            <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{p.value}</span>
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 ml-1 uppercase tracking-wider">{p.unit}</span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-500">{p.status}</div>
        </div>
      ))}
    </div>
  );
}
