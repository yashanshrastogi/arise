import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { BarChart3 } from 'lucide-react';

export default function ForecastCard({ data }) {
  return (
    <div className="bg-card text-card-foreground p-8 rounded-[32px] shadow-sm border border-border flex flex-col h-full min-h-[300px]">
      <div className="flex justify-between items-center mb-8 border-b border-border pb-4">
         <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
               <BarChart3 size={18} className="text-slate-700 dark:text-slate-300" />
            </div>
            <div>
               <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">Analytics</h2>
               <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-100">Hourly Forecast</h3>
            </div>
         </div>
         <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">
            <div className="flex items-center gap-2">
               <div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-600"></div> Past
            </div>
            <div className="flex items-center gap-2">
               <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-500"></div> Future
            </div>
         </div>
      </div>
      <div className="flex-1 w-full min-h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorAqi" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5B4BDB" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#5B4BDB" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#cbd5e1" strokeOpacity={0.8} />
            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#475569', fontWeight: 700 }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#475569', fontWeight: 700 }} />
            <Tooltip 
              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px 16px', backgroundColor: '#ffffff' }}
              itemStyle={{ color: '#0f172a', fontWeight: '900', fontSize: '16px' }}
              labelStyle={{ color: '#475569', fontWeight: '700', fontSize: '12px', marginBottom: '4px' }}
            />
            <ReferenceLine x="10:00" stroke="#E5484D" strokeWidth={2} strokeDasharray="4 4" label={{ position: 'top', value: 'NOW', fill: '#E5484D', fontSize: 11, fontWeight: 900 }} />
            <Area type="monotone" dataKey="aqi" stroke="#5B4BDB" strokeWidth={4} fillOpacity={1} fill="url(#colorAqi)" activeDot={{ r: 6, strokeWidth: 0, fill: '#5B4BDB' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
