import React, { useState, useEffect } from 'react';
import TodayCard from './components/TodayCard';
import MapCard from './components/MapCard';
import ForecastCard from './components/ForecastCard';
import WhyCard from './components/WhyCard';
import SchoolCard from './components/SchoolCard';
import AskArise from './components/AskArise';
import PollutantCards from './components/PollutantCards';
import Watchlist from './components/Watchlist';
import mockData from './mockData.json';
import { Moon, Sun, ToggleLeft, ToggleRight } from 'lucide-react';

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [demoMode, setDemoMode] = useState(true);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col gap-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-3">
           <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-white font-black text-xl">A</div>
           <h1 className="text-2xl font-bold tracking-tight text-indigo-950 dark:text-indigo-100">Arise</h1>
        </div>
        
        <div className="hidden md:flex flex-1 mx-12">
          <Watchlist data={mockData.watchlist} />
        </div>

        <div className="flex items-center gap-4">
           <button 
             onClick={() => setDemoMode(!demoMode)} 
             className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-orange-500"
           >
             {demoMode ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
             Demo Mode
           </button>
           <button 
             onClick={() => setDarkMode(!darkMode)}
             className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
           >
             {darkMode ? <Sun size={20} /> : <Moon size={20} />}
           </button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Left Column (Today & Intelligence) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <TodayCard data={mockData.today} />
          <WhyCard details={mockData.whyDetails} />
          <SchoolCard data={mockData.school} />
        </div>

        {/* Center Column (Map & Pollutants) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <PollutantCards data={mockData.pollutants} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
             <div className="lg:col-span-1 h-full min-h-[400px]">
                <MapCard data={mockData.mapData} />
             </div>
             <div className="lg:col-span-1 flex flex-col gap-6 h-full">
                <ForecastCard data={mockData.forecast} />
                <div className="flex-1">
                  <AskArise replies={mockData.chatReplies} />
                </div>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
