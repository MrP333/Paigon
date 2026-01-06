import React from 'react';

interface StatsHUDProps {
  time: number;
  moves: number;
  size: number;
}

const StatsHUD: React.FC<StatsHUDProps> = ({ time, moves, size }) => {
  // Format time as MM:SS
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;
  const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="w-full max-w-lg mx-auto mb-2">
      <div className="grid grid-cols-3 gap-2 md:gap-4 bg-slate-800/80 p-3 rounded-xl border border-slate-700 backdrop-blur-sm shadow-lg">
        <div className="flex flex-col items-center border-r border-slate-700/50">
          <span className="text-slate-400 text-[10px] uppercase tracking-wider">Grid Size</span>
          <span className="text-lg md:text-xl font-bold text-purple-400">{size} × {size}</span>
        </div>
        <div className="flex flex-col items-center border-r border-slate-700/50">
          <span className="text-slate-400 text-[10px] uppercase tracking-wider">Time</span>
          <span className="text-xl md:text-2xl font-bold text-emerald-400 font-mono">{timeString}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-slate-400 text-[10px] uppercase tracking-wider">Moves</span>
          <span className="text-xl md:text-2xl font-bold text-amber-400 font-mono">{moves}</span>
        </div>
      </div>
    </div>
  );
};

export default StatsHUD;