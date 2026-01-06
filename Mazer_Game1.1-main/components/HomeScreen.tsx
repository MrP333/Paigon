import React from 'react';

interface HomeScreenProps {
  onSelectSize: (size: number) => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ onSelectSize }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in zoom-in duration-500 relative z-20">
      <div className="bg-slate-900/80 p-8 rounded-2xl border border-slate-700 backdrop-blur-md shadow-2xl max-w-md w-full">
        <h1 className="text-5xl md:text-6xl font-black mb-4 bg-gradient-to-r from-cyan-400 to-blue-500 text-transparent bg-clip-text italic tracking-tighter">
            MAZER
        </h1>
        <p className="text-slate-400 mb-8 text-sm md:text-base leading-relaxed">
            Navigate the labyrinth in first-person view. 
            The AI generates a new layout every time.
            <br/><br/>
            <span className="text-xs text-slate-600">ANTI-AI MODE ACTIVE: FOG ENABLED</span>
        </p>

        <button
          onClick={() => onSelectSize(15)}
          className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-cyan-900/50 flex items-center justify-center gap-2 uppercase tracking-widest"
        >
          <span>Enter the Maze</span>
        </button>
      </div>
    </div>
  );
};

export default HomeScreen;