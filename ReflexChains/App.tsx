import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import HomeScreen from './components/HomeScreen';
import WaitingScreen from './components/WaitingScreen';
import GameScreen from './components/GameScreen';
import ResultScreen from './components/ResultScreen';
import { GameConfig, ResultData } from './types';

const SERVER_URL = 'https://mazergame11-production.up.railway.app';

export default function App() {
  const [screen, setScreen] = useState<'home' | 'waiting' | 'game' | 'result'>('home');
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#22d3ee');
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const socketRef = useRef<Socket | null>(null);

  function getSocket() {
    if (!socketRef.current) {
      socketRef.current = io(SERVER_URL, { transports: ['polling', 'websocket'] });
    }
    return socketRef.current;
  }

  useEffect(() => {
    const sock = getSocket();

    sock.on('reflex:matched', (data: any) => {
      setGameConfig({
        roomCode: data.roomCode,
        playerName,
        playerColor,
        opponentName: data.opponentName,
        opponentColor: data.opponentColor,
        stakeId: data.stakeId || 'free',
        payoutCents: data.payoutCents || 0,
      });
      setScreen('game');
    });

    sock.on('connect_error', () => console.warn('[reflex] socket connect error'));

    return () => {
      sock.off('reflex:matched');
    };
  }, [playerName, playerColor]);

  function handlePlay(name: string, color: string) {
    setPlayerName(name);
    setPlayerColor(color);
    const sock = getSocket();
    sock.emit('reflex:queue', { name, color, stakeId: 'free' });
    setScreen('waiting');
  }

  function handleSolo(name: string, color: string) {
    setPlayerName(name);
    setPlayerColor(color);
    // Generate a random room code — seeds the target sequence without needing a server
    const code = Math.random().toString(36).slice(2, 7).toUpperCase();
    setGameConfig({
      roomCode: code,
      playerName: name,
      playerColor: color,
      opponentName: '',
      opponentColor: '',
      stakeId: 'free',
      payoutCents: 0,
      solo: true,
    });
    setScreen('game');
  }

  function handleLeave() {
    getSocket().emit('reflex:leave');
    setScreen('home');
  }

  function handleResult(result: ResultData) {
    setResultData(result);
    setScreen('result');
  }

  function handlePlayAgain() {
    setResultData(null);
    setGameConfig(null);
    setScreen('home');
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#03030a', fontFamily: "'Space Grotesk', sans-serif", overflow: 'hidden' }}>
      {screen === 'home'    && <HomeScreen onPlay={handlePlay} onSolo={handleSolo} />}
      {screen === 'waiting' && <WaitingScreen onLeave={handleLeave} />}
      {screen === 'game'    && gameConfig && (
        <GameScreen config={gameConfig} socket={getSocket()} onResult={handleResult} />
      )}
      {screen === 'result'  && resultData && (
        <ResultScreen result={resultData} onPlayAgain={handlePlayAgain} solo={gameConfig?.solo} />
      )}
    </div>
  );
}
