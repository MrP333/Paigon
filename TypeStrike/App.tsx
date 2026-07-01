import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './services/firebase';
import CalibrationGate from './components/CalibrationGate';
import HomeScreen from './components/HomeScreen';
import WaitingScreen from './components/WaitingScreen';
import GameScreen from './components/GameScreen';
import ResultScreen from './components/ResultScreen';
import { GameConfig, ResultData } from './types';

const SERVER_URL = 'https://mazergame11-production.up.railway.app';
const SOLO_DAILY_LIMIT = 5;

export default function App() {
  const [calibrated, setCalibrated] = useState(
    () => sessionStorage.getItem('typestrike_calibrated') === 'true',
  );
  const [screen, setScreen] = useState<'home' | 'waiting' | 'game' | 'result'>('home');
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<User | null | undefined>(undefined);
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#00ff88');
  const [balance, setBalance] = useState(0);
  const [trialComplete, setTrialComplete] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [soloRunsToday, setSoloRunsToday] = useState(0);
  const [points, setPoints] = useState(0);
  const [winStreak, setWinStreak] = useState(0);
  const [lossStreak, setLossStreak] = useState(0);
  const [queueCount, setQueueCount] = useState<{ count: number; min: number; max: number } | undefined>(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) return;
      socketRef.current?.emit('user:register', { uid: user.uid });
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const d = snap.data();
        if (d.username)  setPlayerName(d.username);
        if (d.color)     setPlayerColor(d.color);
        setBalance(d.balanceCents ?? 0);
        if (d.trialCompletedType) setTrialComplete(true);
        if (d.isDev) setIsDev(true);
        const today = new Date().toISOString().slice(0, 10);
        if (d.soloRunsDateType === today) setSoloRunsToday(d.soloRunsTodayType ?? 0);
        setPoints(d.points ?? 0);
        setWinStreak(d.winStreak ?? 0);
        setLossStreak(d.lossStreak ?? 0);
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
    setDoc(doc(db, 'users', firebaseUser.uid), { soloRunsDateType: today, soloRunsTodayType: next }, { merge: true }).catch(console.error);
    return true;
  }

  function getSocket(): Socket {
    if (!socketRef.current) {
      socketRef.current = io(SERVER_URL, { transports: ['polling', 'websocket'] });
    }
    return socketRef.current;
  }

  useEffect(() => {
    const sock = getSocket();

    sock.on('type:matched', (data: Record<string, unknown>) => {
      setQueueCount(undefined);
      const roomCode = data.roomCode as string;
      const opponents = (data.opponents as { name: string; color: string }[]) ?? [];
      const entryCents = (data.entryCents as number) ?? 0;
      const payoutCents = (data.payoutCents as number) ?? 0;
      setGameConfig({
        roomCode,
        playerName: playerName || `TYPER-${Math.floor(Math.random() * 9000) + 1000}`,
        playerColor,
        opponentName: opponents[0]?.name ?? '',
        opponentColor: opponents[0]?.color ?? '#22d3ee',
        opponents,
        stakeId: (data.stakeId as string) ?? 'free',
        entryCents,
        payoutCents,
      });
      setScreen('game');
    });

    sock.on('queue:count', (data: { count: number; min: number; max: number }) => setQueueCount(data));
    sock.on('balance:update', ({ delta }: { delta: number }) => setBalance(b => b + delta));

    return () => {
      sock.off('type:matched');
      sock.off('queue:count');
      sock.off('balance:update');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerName, playerColor]);

  function resolve() {
    return playerName.trim() || `TYPER-${Math.floor(Math.random() * 9000) + 1000}`;
  }

  async function handleQueue(stakeId: string, name: string, color: string) {
    setPlayerName(name); setPlayerColor(color);
    const sock = getSocket();
    let idToken: string | null = null;
    if (firebaseUser) { try { idToken = await firebaseUser.getIdToken(); } catch { /* no-op */ } }
    sock.emit('type:queue', { name, color, stakeId, idToken }, (res: Record<string, unknown>) => {
      if (res && !res.ok) {
        if (res.error === 'insufficient_balance') alert('Not enough PC for this tier. Add PC from your account page.');
        else if (res.error === 'auth_required') alert('Please log in to play paid lobbies.');
        setScreen('home');
      }
    });
    setGameConfig({ roomCode: '', playerName: name, playerColor: color, opponentName: '', opponentColor: '#22d3ee', stakeId, payoutCents: 0 });
    setScreen('waiting');
  }

  async function handleSolo(name: string, color: string) {
    const allowed = await consumeSoloRun();
    if (!allowed) { alert(`You've used all ${SOLO_DAILY_LIMIT} solo practice runs for today. Come back tomorrow!`); return; }
    setPlayerName(name); setPlayerColor(color);
    const code = 'SOLO-' + Date.now();
    setGameConfig({ roomCode: code, playerName: name, playerColor: color, opponentName: '', opponentColor: '', stakeId: 'free', payoutCents: 0, solo: true });
    setScreen('game');
  }

  async function handleBotTrial() {
    await handleSolo(resolve(), playerColor);
  }

  function handleLeave() {
    getSocket().emit('type:leave');
    setQueueCount(undefined);
    setScreen('home');
  }

  function handleResult(result: ResultData) {
    setResultData(result);
    setScreen('result');
    if (firebaseUser && !gameConfig?.solo) {
      const newWin  = result.won ? winStreak + 1 : 0;
      const newLoss = !result.won ? lossStreak + 1 : 0;
      setWinStreak(newWin); setLossStreak(newLoss);

      const isPaid = gameConfig?.stakeId && !['free'].includes(gameConfig.stakeId);
      const pointsEarned = result.won && isPaid ? 20 : 0;
      if (pointsEarned > 0) setPoints(p => p + pointsEarned);

      setDoc(doc(db, 'users', firebaseUser.uid), {
        winStreak: newWin, lossStreak: newLoss, trialCompletedType: true,
      }, { merge: true }).catch(console.error);

      addDoc(collection(db, 'users', firebaseUser.uid, 'matches'), {
        game: 'TYPESTRIKE',
        won: result.won,
        stakeId: gameConfig?.stakeId ?? 'free',
        entryCents: gameConfig?.entryCents ?? 0,
        stakeCents: gameConfig?.entryCents ?? 0,
        payoutCents: result.won ? (gameConfig?.payoutCents ?? 0) : 0,
        pointsEarned,
        createdAt: serverTimestamp(),
      }).catch(console.error);

      if (result.won) {
        addDoc(collection(db, 'recentActivity'), {
          game: 'TYPESTRIKE',
          winner: playerName,
          winnerColor: playerColor,
          stakeId: gameConfig?.stakeId ?? 'free',
          payoutCents: gameConfig?.payoutCents ?? 0,
          createdAt: serverTimestamp(),
        }).catch(console.error);
      }
    }

    // Mark trial complete after first run
    if (firebaseUser && !trialComplete) {
      setTrialComplete(true);
      setDoc(doc(db, 'users', firebaseUser.uid), { trialCompletedType: true }, { merge: true }).catch(console.error);
    }
  }

  function handlePlayAgain() { setResultData(null); setGameConfig(null); setScreen('home'); }

  if (!calibrated) {
    return (
      <CalibrationGate onComplete={() => {
        sessionStorage.setItem('typestrike_calibrated', 'true');
        setCalibrated(true);
      }} />
    );
  }

  if (firebaseUser === undefined) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#08080f' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(0,255,136,.2)', borderTopColor: '#00ff88', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#08080f', fontFamily: "'Space Grotesk', sans-serif", overflow: 'hidden' }}>
      {screen === 'home' && (
        <HomeScreen
          onQueue={handleQueue} onSolo={handleSolo} onBotTrial={handleBotTrial}
          trialComplete={trialComplete} playerName={playerName} playerColor={playerColor}
          balance={balance} isLoggedIn={!!firebaseUser}
          soloRunsToday={firebaseUser ? soloRunsToday : undefined}
          isDev={isDev} points={firebaseUser ? points : undefined}
          winStreak={winStreak} lossStreak={lossStreak}
        />
      )}
      {screen === 'waiting' && <WaitingScreen onLeave={handleLeave} queueCount={queueCount} />}
      {screen === 'game' && gameConfig && (
        <GameScreen config={gameConfig} socket={getSocket()} onResult={handleResult} />
      )}
      {screen === 'result' && resultData && (
        <ResultScreen result={resultData} onPlayAgain={handlePlayAgain} solo={gameConfig?.solo} config={gameConfig} />
      )}
    </div>
  );
}
