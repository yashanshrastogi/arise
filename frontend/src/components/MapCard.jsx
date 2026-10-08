import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers, Flame, Wind } from 'lucide-react';

export default function MapCard({ data }) {
  return (
    <div className="bg-card rounded-[24px] shadow-sm border border-border h-full flex flex-col overflow-hidden relative min-h-[400px]">
      <div className="absolute top-4 left-4 z-[1000] glass-panel px-4 py-2 rounded-xl flex gap-4 items-center">
         <h2 className="font-semibold text-sm">Delhi-NCR Air Map</h2>
      </div>
      
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
         <button className="glass-panel p-2 rounded-xl shadow-sm hover:bg-white/80 transition-colors"><Layers size={20} /></button>
         <button className="glass-panel p-2 rounded-xl shadow-sm hover:bg-white/80 transition-colors text-orange-500"><Flame size={20} /></button>
         <button className="glass-panel p-2 rounded-xl shadow-sm hover:bg-white/80 transition-colors text-blue-500"><Wind size={20} /></button>
      </div>

      <div className="flex-1 w-full h-full relative z-0">
        <MapContainer center={[28.6139, 77.2090]} zoom={11} scrollWheelZoom={false} className="w-full h-full z-0">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {data.stations.map(st => (
             <CircleMarker 
               key={st.id} 
               center={[st.lat, st.lng]} 
               radius={16}
               fillColor={st.aqi > 300 ? '#E5484D' : st.aqi > 200 ? '#F28C28' : '#5B4BDB'}
               fillOpacity={0.8}
               color="white"
               weight={2}
             >
               <Popup className="rounded-xl">
                 <div className="font-semibold">{st.name}</div>
                 <div className="text-red-500 font-bold text-lg">AQI: {st.aqi}</div>
                 <div className="text-xs text-slate-500">PM2.5: {st.pm25} µg/m³</div>
               </Popup>
             </CircleMarker>
          ))}
          {data.fires.map(fire => (
             <CircleMarker 
               key={fire.id}
               center={[fire.lat, fire.lng]}
               radius={8}
               fillColor="#ff4500"
               fillOpacity={0.6}
               color="#ff0000"
               weight={1}
             />
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
