import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './services/firebase';
import { GameConfig, ResultData } from './types';
import HomeScreen from './components/HomeScreen';
import GameScreen from './components/GameScreen';
import ResultScreen from './components/ResultScreen';

const SERVER_URL = 'https://mazergame11-production.up.railway.app';

type Screen = 'home' | 'waiting' | 'game' | 'result';

export default function App() {
  const [screen, setScreen]           = useState<Screen>('home');
  const [config, setConfig]           = useState<GameConfig | null>(null);
  const [result, setResult]           = useState<ResultData | null>(null);
  const [selectedStake, setSelectedStake] = useState('free');

  // Firebase auth + user data
  const [firebaseUser, setFirebaseUser] = useState<User | null | undefined>(undefined);
  const [playerName, setPlayerName]   = useState('Soldier');
  const [playerColor, setPlayerColor] = useState('#ffa020');
  const [balance, setBalance]         = useState(0); // balanceCents

  const socketRef = useRef<Socket | null>(null);

  // Firebase auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) return;
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const data = snap.data();
        if (data.username) setPlayerName(data.username);
        if (data.color)    setPlayerColor(data.color);
        setBalance(data.balanceCents ?? 0);
      } else {
        // Fall back to email prefix as name
        setPlayerName(user.email?.split('@')[0] ?? 'Soldier');
      }
    });
  }, []);

  // Socket connection
  useEffect(() => {
    const s = io(SERVER_URL, { transports: ['polling', 'websocket'] });
    socketRef.current = s;

    s.on('nml:matched', (data: { roomCode: string; opponentName: string; opponentColor: string; entryCents?: number; payoutCents?: number }) => {
      setConfig(prev => prev ? {
        ...prev,
        roomCode: data.roomCode,
        opponentName: data.opponentName,
        opponentColor: data.opponentColor,
        payoutCents: data.payoutCents ?? 0,
      } : null);
      setScreen('game');
    });

    s.on('balance:update', ({ delta }: { delta: number }) => {
      setBalance(b => b + delta);
    });

    s.on('match:error', ({ code }: { code: string }) => {
      if (code === 'insufficient_balance') {
        alert('Not enough Paigon Credits. Visit your account to deposit more.');
      }
      setScreen('home');
    });

    return () => { s.disconnect(); socketRef.current = null; };
  }, []);

  const handleQueue = (stakeId: string) => {
    const s = socketRef.current;
    if (!s) return;
    setSelectedStake(stakeId);
    setConfig({
      roomCode: '',
      playerName,
      playerColor,
      opponentName: '',
      opponentColor: '#fb923c',
      stakeId,
      payoutCents: 0,
    });
    s.emit('nml:queue', {
      name: playerName,
      color: playerColor,
      stakeId,
      uid: firebaseUser?.uid ?? null,
    });
    setScreen('waiting');
  };

  const handleSolo = () => {
    const roomCode = Math.random().toString(36).slice(2, 7).toUpperCase();
    setConfig({
      roomCode,
      playerName,
      playerColor,
      opponentName: '',
      opponentColor: '#fb923c',
      stakeId: '',
      payoutCents: 0,
      solo: true,
    });
    setScreen('game');
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

  const handleCancel = () => {
    socketRef.current?.emit('nml:leave');
    setScreen('home');
  };

  // Still loading auth state
  if (firebaseUser === undefined) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03030a' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(255,160,32,0.2)', borderTopColor: '#ffa020', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {screen === 'home' && (
        <HomeScreen
          onQueue={handleQueue}
          onSolo={handleSolo}
          playerName={playerName}
          playerColor={playerColor}
          balance={balance}
          isLoggedIn={!!firebaseUser}
        />
      )}

      {screen === 'waiting' && (
        <div style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: '#03030a', gap: 16,
        }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>
            No Man's Land
          </div>
          {/* Player tag */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: playerColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 800, color: '#000' }}>
              {playerName[0]?.toUpperCase()}
            </div>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: '0.95rem' }}>{playerName}</span>
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
            Searching for opponent…
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffa020', animation: `pulse 1.2s ${i*0.2}s ease-in-out infinite`, opacity: 0.4 }} />
            ))}
          </div>
          <button onClick={handleCancel} style={{
            marginTop: 20, padding: '8px 24px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
            color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Cancel
          </button>
          <style>{`@keyframes pulse{0%,100%{opacity:0.15;transform:scale(0.8)}50%{opacity:0.8;transform:scale(1.2)}}`}</style>
        </div>
      )}

      {screen === 'game' && config && socketRef.current && (
        <GameScreen config={config} socket={socketRef.current} onResult={handleResult} />
      )}

      {screen === 'result' && result && config && (
        <ResultScreen
          result={result}
          playerName={config.playerName}
          solo={!!config.solo}
          stakeId={config.stakeId}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  );
}
