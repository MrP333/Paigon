import React, { useState, useEffect, useCallback, useRef } from 'react';
import { generateMaze } from './services/ai';
import MazeDisplay from './components/MazeDisplay';
import StatsHUD from './components/StatsHUD';
import Controls from './components/Controls';
import HomeScreen from './components/HomeScreen';
import { MazeData, Coordinate, GameState } from './types';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.IDLE);
  const [maze, setMaze] = useState<MazeData | null>(null);
  
  const [moves, setMoves] = useState(0);
  const [time, setTime] = useState(0);
  const [inputVector, setInputVector] = useState({ x: 0, y: 0 });

  const timerRef = useRef<number | null>(null);

  const initGame = useCallback(async (size: number) => {
    setGameState(GameState.GENERATING);
    setMoves(0);
    setTime(0);
    setMaze(null);
    setInputVector({x:0, y:0});

    try {
      // Deterministic generation guarantees success
      const newMaze = await generateMaze(size);
      setMaze(newMaze);
      setGameState(GameState.PLAYING);
    } catch (err) {
      console.error("Game Init Failed:", err);
      setGameState(GameState.IDLE);
    }
  }, []);

  const handleRegenerate = () => {
    initGame(15);
  };

  const handleBackToHome = () => {
    setGameState(GameState.IDLE);
    setMaze(null);
  };

  useEffect(() => {
    if (gameState === GameState.PLAYING) {
      timerRef.current = window.setInterval(() => {
        setTime(t => t + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState]);

  const handleWin = useCallback(() => {
    setGameState(GameState.WON);
  }, []);

  const handlePlayerMove = useCallback((pos: Coordinate) => {
    // Increment moves normally; MazeDisplay handles teleport internally
    setMoves(m => m + 1);
  }, []);

  const handleInputChange = useCallback((vec: { x: number, y: number }) => {
    setInputVector(vec);
  }, []);

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-950">
        {gameState === GameState.IDLE && (
            <HomeScreen onSelectSize={initGame} />
        )}

        {gameState === GameState.GENERATING && (
             <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-slate-950 text-cyan-500">
                <div className="text-6xl animate-spin-slow mb-6">🌀</div>
                <div className="animate-pulse text-2xl font-mono tracking-widest text-center">
                  MAPPING NEURAL PATHS...<br/>
                  <span className="text-xs text-cyan-800 mt-2 block">ENSURING CONNECTIVITY</span>
                </div>
             </div>
        )}

        {(gameState === GameState.PLAYING || gameState === GameState.WON) && maze && (
            <>
                <div className="absolute top-0 left-0 w-full z-10 p-4 pointer-events-none">
                    <StatsHUD time={time} moves={moves} size={maze.size} />
                </div>
                
                <div className="absolute inset-0 z-0">
                    <MazeDisplay 
                        maze={maze} 
                        onWin={handleWin} 
                        onMoveChange={handlePlayerMove}
                        inputVector={inputVector}
                    />
                </div>

                {gameState === GameState.PLAYING && (
                    <Controls onInputChanged={handleInputChange} />
                )}

                <button 
                    onClick={handleBackToHome}
                    className="absolute top-4 left-4 z-20 text-slate-500 hover:text-white bg-slate-900/50 p-2 rounded text-xs border border-slate-700/30 backdrop-blur-md"
                >
                    &larr; HOME
                </button>
            </>
        )}

        {gameState === GameState.WON && (
            <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in zoom-in">
                 <div className="bg-slate-900 border border-emerald-500 p-8 rounded-3xl text-center max-w-sm w-full mx-4 shadow-[0_0_100px_rgba(16,185,129,0.3)]">
                    <div className="text-6xl mb-4">🏆</div>
                    <h2 className="text-4xl font-black text-white mb-2 italic">ESCAPED</h2>
                    <p className="text-slate-400 text-sm mb-6 uppercase tracking-widest">Labyrinth successfully solved.</p>
                    
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl">
                            <div className="text-[10px] text-slate-500 uppercase">Elapsed</div>
                            <div className="text-2xl font-mono text-emerald-400 font-bold">{time}s</div>
                        </div>
                        <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl">
                            <div className="text-[10px] text-slate-500 uppercase">Steps</div>
                            <div className="text-2xl font-mono text-amber-400 font-bold">{moves}</div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <button onClick={() => initGame(maze?.size || 15)} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl transition-all shadow-lg shadow-emerald-900/40 active:scale-95 uppercase tracking-tighter">
                            Next Challenge
                        </button>
                        <button onClick={handleBackToHome} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 font-bold rounded-xl transition-colors uppercase text-sm">
                            Main Menu
                        </button>
                    </div>
                 </div>
            </div>
        )}
    </div>
  );
};

export default App;
