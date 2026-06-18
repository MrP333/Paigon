import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './services/firebase';
import HomeScreen from './components/HomeScreen';
import WaitingScreen from './components/WaitingScreen';
import GameScreen from './components/GameScreen';
import TrialScreen from './components/TrialScreen';
import ResultScreen from './components/ResultScreen';
import DepositModal from './components/DepositModal';
import { GameConfig, ResultData } from './types';

const SERVER_URL = 'https://mazergame11-production.up.railway.app';
const SOLO_DAILY_LIMIT = 5;

export default function App() {
  const [screen, setScreen] = useState<'home' | 'waiting' | 'game' | 'trial' | 'result'>('home');
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<User | null | undefined>(undefined);
  const [showDeposit, setShowDeposit] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [playerColor] = useState('#a855f7');
  const [balance, setBalance] = useState(0);
  const [trialComplete, setTrialComplete] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [soloRunsToday, setSoloRunsToday] = useState(0);
  const [elo, setElo]               = useState(1000);
  const [opponentElo, setOpponentElo] = useState(1000);
  const [winStreak, setWinStreak]   = useState(0);
  const [lossStreak, setLossStreak] = useState(0);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) return;
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const data = snap.data();
        if (data.username) setPlayerName(data.username);
        setBalance(data.balanceCents ?? 0);
        if (data.trialCompletedOdd) setTrialComplete(true);
        if (data.isDev) setIsDev(true);
        const today = new Date().toISOString().slice(0, 10);
        if (data.soloRunsDateOdd === today) setSoloRunsToday(data.soloRunsTodayOdd ?? 0);
        setElo(data.eloOdd ?? 1000);
        setWinStreak(data.winStreakOdd ?? 0);
        setLossStreak(data.lossStreakOdd ?? 0);
      } else {
        setPlayerName(user.email?.split('@')[0] ?? '');
      }
    });
  }, []);

  async function consumeSoloRun(): Promise<boolean> {
    if (isDev) return true;
    if (!firebaseUser) return true;
    const today = new Date().toISOString().slice(0, 10);
    if (soloRunsToday >= SOLO_DAILY_LIMIT) return false;
    const next = soloRunsToday + 1;
    setSoloRunsToday(next);
    setDoc(doc(db, 'users', firebaseUser.uid), { soloRunsDateOdd: today, soloRunsTodayOdd: next }, { merge: true }).catch(console.error);
    return true;
  }

  function getSocket() {
    if (!socketRef.current) {
      socketRef.current = io(SERVER_URL, { transports: ['polling', 'websocket'] });
    }
    return socketRef.current;
  }

  useEffect(() => {
    const sock = getSocket();
    sock.on('odd:matched', (data: any) => {
      if (data.opponentElo) setOpponentElo(data.opponentElo);
      setGameConfig(prev => prev ? { ...prev, roomCode: data.roomCode, opponentName: data.opponentName, opponentColor: data.opponentColor, payoutCents: data.payoutCents || 0 } : null);
      setScreen('game');
    });
    sock.on('balance:update', ({ delta }: { delta: number }) => {
      setBalance(b => b + delta);
    });
    sock.on('connect_error', () => console.warn('[odd-signal] socket connect error'));
    return () => { sock.off('odd:matched'); sock.off('balance:update'); };
  }, []);

  function resolveName() {
    return playerName.trim() || `PLAYER-${Math.floor(Math.random() * 9000) + 1000}`;
  }

  function handleBotTrial() { setScreen('trial'); }

  function handleTrialComplete() {
    setTrialComplete(true);
    if (firebaseUser) {
      setDoc(doc(db, 'users', firebaseUser.uid), { trialCompletedOdd: true }, { merge: true }).catch(console.error);
    }
    setScreen('home');
  }

  async function handleQueue(stakeId: string, name: string, color: string) {
    setPlayerName(name);
    const sock = getSocket();
    let idToken: string | null = null;
    if (firebaseUser) {
      try { idToken = await firebaseUser.getIdToken(); } catch { /* no-op */ }
    }
    sock.emit('odd:queue', { name, color, stakeId, idToken, elo }, (res: any) => {
      if (res && !res.ok) {
        if (res.error === 'insufficient_balance') alert('Not enough PC. Add PC from your account page.');
        else if (res.error === 'auth_required') alert('Please log in to play paid lobbies.');
        setScreen('home');
      }
    });
    setGameConfig({ roomCode: '', playerName: name, playerColor: color, opponentName: '', opponentColor: '#ec4899', stakeId, payoutCents: 0 });
    setScreen('waiting');
  }

  async function handleSolo(name: string, color: string) {
    const allowed = await consumeSoloRun();
    if (!allowed) {
      alert(`You've used all ${SOLO_DAILY_LIMIT} solo practice runs for today.`);
      return;
    }
    setPlayerName(name);
    const code = Math.random().toString(36).slice(2, 7).toUpperCase();
    setGameConfig({ roomCode: code, playerName: name, playerColor: color, opponentName: '', opponentColor: '', stakeId: 'free', payoutCents: 0, solo: true });
    setScreen('game');
  }

  function handleLeave() {
    getSocket().emit('odd:leave');
    setScreen('home');
  }

  function handleResult(result: ResultData) {
    setResultData(result);
    setScreen('result');
    if (firebaseUser && !gameConfig?.solo) {
      const K = 32;
      const expected = 1 / (1 + Math.pow(10, (opponentElo - elo) / 400));
      const score = result.won ? 1 : 0;
      const newElo   = Math.max(100, Math.round(elo + K * (score - expected)));
      const newWin   = result.won ? winStreak + 1 : 0;
      const newLoss  = !result.won ? lossStreak + 1 : 0;
      setElo(newElo); setWinStreak(newWin); setLossStreak(newLoss);
      setDoc(doc(db, 'users', firebaseUser.uid), { eloOdd: newElo, winStreakOdd: newWin, lossStreakOdd: newLoss }, { merge: true }).catch(console.error);

      addDoc(collection(db, 'users', firebaseUser.uid, 'matches'), {
        game: 'ODD_SIGNAL',
        won: result.won,
        stakeId: gameConfig?.stakeId ?? 'free',
        payoutCents: result.won ? (gameConfig?.payoutCents ?? 0) : 0,
        opponent: gameConfig?.opponentName ?? 'Opponent',
        eloChange: newElo - elo,
        createdAt: serverTimestamp(),
      }).catch(console.error);

      if (result.won) {
        addDoc(collection(db, 'recentActivity'), {
          game: 'ODD_SIGNAL',
          winner: playerName,
          winnerColor: playerColor,
          loser: gameConfig?.opponentName ?? 'Opponent',
          stakeId: gameConfig?.stakeId ?? 'free',
          payoutCents: gameConfig?.payoutCents ?? 0,
          createdAt: serverTimestamp(),
        }).catch(console.error);
      }
    }
  }

  function handlePlayAgain() {
    setResultData(null);
    setGameConfig(null);
    setScreen('home');
  }

  if (firebaseUser === undefined) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03030a' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#03030a', fontFamily: "'Space Grotesk', sans-serif", overflow: 'hidden' }}>
      {screen === 'home' && (
        <HomeScreen
          onQueue={handleQueue}
          onSolo={handleSolo}
          onBotTrial={handleBotTrial}
          trialComplete={trialComplete}
          playerName={playerName}
          playerColor={playerColor}
          balance={balance}
          isLoggedIn={!!firebaseUser}
          soloRunsToday={firebaseUser ? soloRunsToday : undefined}
          isDev={isDev}
          elo={firebaseUser ? elo : undefined}
          winStreak={winStreak}
          lossStreak={lossStreak}
        />
      )}
      {screen === 'waiting' && <WaitingScreen onLeave={handleLeave} />}
      {screen === 'trial' && (
        <TrialScreen playerName={resolveName()} playerColor={playerColor} onComplete={handleTrialComplete} onBack={() => setScreen('home')} />
      )}
      {screen === 'game' && gameConfig && (
        <GameScreen config={gameConfig} socket={getSocket()} onResult={handleResult} />
      )}
      {screen === 'result' && resultData && (
        <ResultScreen result={resultData} onPlayAgain={handlePlayAgain} solo={gameConfig?.solo} />
      )}
      {showDeposit && firebaseUser && (
        <DepositModal user={firebaseUser} onClose={() => setShowDeposit(false)} onSuccess={(c) => { if (c > 0) setBalance(b => b + c); }} />
      )}
    </div>
  );
}
