import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameConfig, ResultData } from './types';
import HomeScreen from './components/HomeScreen';
import GameScreen from './components/GameScreen';
import ResultScreen from './components/ResultScreen';

const SERVER_URL = 'https://mazergame11-production.up.railway.app';

type Screen = 'home' | 'waiting' | 'game' | 'result';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [waitMsg, setWaitMsg] = useState('Searching for opponent…');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const s = io(SERVER_URL, { transports: ['websocket'] });
    socketRef.current = s;

    s.on('nml:matched', (data: { roomCode: string; opponentName: string; opponentColor: string }) => {
      setConfig(prev => prev ? {
        ...prev,
        roomCode: data.roomCode,
        opponentName: data.opponentName,
        opponentColor: data.opponentColor,
      } : null);
      setScreen('game');
    });

    return () => { s.disconnect(); };
  }, []);

  const handleSolo = () => {
    const roomCode = Math.random().toString(36).slice(2, 7).toUpperCase();
    setConfig({
      roomCode,
      playerName: 'Soldier',
      playerColor: '#22d3ee',
      opponentName: '',
      opponentColor: '#fb923c',
      stakeId: '',
      payoutCents: 0,
      solo: true,
    });
    setScreen('game');
  };

  const handleQueue = () => {
    const s = socketRef.current;
    if (!s) return;
    setWaitMsg('Searching for opponent…');
    setConfig({
      roomCode: '',
      playerName: 'Soldier',
      playerColor: '#22d3ee',
      opponentName: '',
      opponentColor: '#fb923c',
      stakeId: '',
      payoutCents: 0,
    });
    s.emit('nml:queue', { playerName: 'Soldier', playerColor: '#22d3ee' });
    setScreen('waiting');
  };

  const handleResult = (r: ResultData) => {
    setResult(r);
    setScreen('result');
  };

  const handlePlayAgain = () => {
    setResult(null);
    setConfig(null);
    setScreen('home');
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {screen === 'home' && (
        <HomeScreen socket={socketRef.current!} onSolo={handleSolo} onQueue={handleQueue} />
      )}

      {screen === 'waiting' && (
        <div style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: '#03030a', gap: 20,
        }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>
            No Man's Land
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
            {waitMsg}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 7, height: 7, borderRadius: '50%', background: '#fff',
                animation: `pulse 1.2s ${i * 0.2}s ease-in-out infinite`,
                opacity: 0.3,
              }} />
            ))}
          </div>
          <button onClick={() => { socketRef.current?.emit('nml:leave'); setScreen('home'); }} style={{
            marginTop: 16, padding: '8px 20px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
            color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Cancel
          </button>
          <style>{`@keyframes pulse { 0%,100%{opacity:0.15;transform:scale(0.8)} 50%{opacity:0.8;transform:scale(1.2)} }`}</style>
        </div>
      )}

      {screen === 'game' && config && socketRef.current && (
        <GameScreen config={config} socket={socketRef.current} onResult={handleResult} />
      )}

      {screen === 'result' && result && config && (
        <ResultScreen result={result} playerName={config.playerName} solo={!!config.solo} onPlayAgain={handlePlayAgain} />
      )}
    </div>
  );
}
