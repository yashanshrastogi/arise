import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function ForecastCard({ data }) {
  return (
    <div className="bg-card text-card-foreground p-6 rounded-[24px] shadow-sm border border-border">
      <div className="flex justify-between items-center mb-6">
         <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Hourly Forecast</h2>
         <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1">
               <div className="w-3 h-3 rounded-full bg-slate-300"></div> Past
            </div>
            <div className="flex items-center gap-1">
               <div className="w-3 h-3 rounded-full bg-indigo-500"></div> Future
            </div>
         </div>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorAqi" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5B4BDB" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#5B4BDB" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
            <Tooltip 
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              itemStyle={{ color: '#1e293b', fontWeight: 'bold' }}
            />
            <ReferenceLine x="10:00" stroke="#ff0000" strokeDasharray="3 3" label={{ position: 'top', value: 'Now', fill: '#ff0000', fontSize: 12 }} />
            <Area type="monotone" dataKey="aqi" stroke="#5B4BDB" strokeWidth={3} fillOpacity={1} fill="url(#colorAqi)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
