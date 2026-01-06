import React from 'react';

interface ControlsProps {
  onInputChanged: (vector: { x: number, y: number }) => void;
}

const Controls: React.FC<ControlsProps> = ({ onInputChanged }) => {
  const handleStart = (x: number, y: number) => {
    onInputChanged({ x, y });
  };

  const handleEnd = () => {
    onInputChanged({ x: 0, y: 0 });
  };

  const btnClass = "w-16 h-16 bg-slate-800/80 backdrop-blur active:bg-cyan-900/80 rounded-full border-2 border-slate-600 active:border-cyan-400 flex items-center justify-center text-2xl select-none touch-none shadow-xl transition-all active:scale-95";
  const disabledBtnClass = "w-16 h-16 bg-slate-900/40 backdrop-blur rounded-full border-2 border-slate-800 flex items-center justify-center text-2xl select-none touch-none opacity-20 pointer-events-none";

  return (
    <div className="absolute bottom-8 left-0 w-full flex justify-center z-40 pointer-events-none md:hidden">
        <div className="pointer-events-auto grid grid-cols-3 gap-2">
            <div />
            <button 
                className={btnClass}
                onPointerDown={() => handleStart(0, -1)}
                onPointerUp={handleEnd}
                onPointerLeave={handleEnd}
            >▲</button>
            <div />
            
            <button 
                className={btnClass}
                onPointerDown={() => handleStart(-1, 0)}
                onPointerUp={handleEnd}
                onPointerLeave={handleEnd}
            >◀</button>
            <button 
                className={disabledBtnClass}
                disabled
            >▼</button>
            <button 
                className={btnClass}
                onPointerDown={() => handleStart(1, 0)}
                onPointerUp={handleEnd}
                onPointerLeave={handleEnd}
            >▶</button>
        </div>
    </div>
  );
};

export default Controls;