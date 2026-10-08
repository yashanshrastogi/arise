import React from 'react';

const colorMap = {
  Good: 'bg-green-aqi text-white',
  Satisfactory: 'bg-lime-aqi text-slate-900',
  Moderate: 'bg-yellow-aqi text-slate-900',
  Poor: 'bg-orange-aqi text-white',
  Severe: 'bg-red-aqi text-white'
};

export default function PollutantCards({ data }) {
  const pollutants = Object.values(data);
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {pollutants.map(p => (
        <div key={p.name} className="bg-card text-card-foreground p-4 rounded-2xl shadow-sm border border-border flex flex-col justify-between">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-sm">{p.name}</span>
            <div className={`w-3 h-3 rounded-full ${colorMap[p.status] || 'bg-slate-300'}`}></div>
          </div>
          <div className="mb-1">
            <span className="text-2xl font-bold">{p.value}</span>
            <span className="text-xs text-slate-500 ml-1">{p.unit}</span>
          </div>
          <div className="text-xs font-medium text-slate-500">{p.status}</div>
        </div>
      ))}
    </div>
  );
}
