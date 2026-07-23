import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './services/firebase';
import { identifyUser, track } from './services/analytics';
import CalibrationGate from './components/CalibrationGate';
import HomeScreen from './components/HomeScreen';
import WaitingScreen from './components/WaitingScreen';
import GameScreen from './components/GameScreen';
import ResultScreen from './components/ResultScreen';
import DepositModal from './components/DepositModal';
import { GameConfig, ResultData } from './types';

const SERVER_URL = 'https://mazergame11-production.up.railway.app';
const SOLO_DAILY_LIMIT = 5;

export default function App() {
  const [calibrated, setCalibrated] = useState(
    () => sessionStorage.getItem('dashCalibrationPassed') === 'true',
  );
  const [screen, setScreen] = useState<'home' | 'waiting' | 'game' | 'result'>('home');
  const [gameConfig, setGameConfig]   = useState<GameConfig | null>(null);
  const [resultData, setResultData]   = useState<ResultData | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<User | null | undefined>(undefined);
  const [showDeposit, setShowDeposit] = useState(false);
  const [playerName, setPlayerName]   = useState('');
  const [playerColor, setPlayerColor] = useState('#00ff88');
  const [balance, setBalance]         = useState(0);
  const [trialComplete, setTrialComplete] = useState(false);
  const [isDev, setIsDev]             = useState(false);
  const [soloRunsToday, setSoloRunsToday] = useState(0);
  const [points, setPoints]           = useState(0);
  const [winStreak, setWinStreak]     = useState(0);
  const [lossStreak, setLossStreak]   = useState(0);
  const [queueCount, setQueueCount]   = useState<{ count: number; min: number; max: number } | undefined>(undefined);
  const [tournamentBanner, setTournamentBanner] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) return;
      try { const idToken = await user.getIdToken(); socketRef.current?.emit('user:register', { uid: user.uid, idToken }); } catch { /* no-op */ }
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const d = snap.data();
        if (d.username)  setPlayerName(d.username);
        if (d.color)     setPlayerColor(d.color);
        setBalance(d.balanceCents ?? 0);
        if (d.trialCompletedDash) setTrialComplete(true);
        if (d.isDev) setIsDev(true);
        identifyUser(user.uid, d.username || user.email || user.uid);
        const today = new Date().toISOString().slice(0, 10);
        if (d.soloRunsDateDash === today) setSoloRunsToday(d.soloRunsTodayDash ?? 0);
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
    setDoc(doc(db, 'users', firebaseUser.uid), { soloRunsDateDash: today, soloRunsTodayDash: next }, { merge: true }).catch(console.error);
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
    sock.on('dash:matched', (data: any) => {
      track('Game Matched', { game: 'Dash', stake: data.stakeId });
      setQueueCount(undefined);
      setGameConfig(prev => prev ? {
        ...prev,
        roomCode:      data.roomCode,
        opponents:     data.opponents ?? [],
        opponentName:  data.opponents?.[0]?.name ?? '',
        opponentColor: data.opponents?.[0]?.color ?? '#fb923c',
        entryCents:    data.entryCents ?? 0,
        payoutCents:   data.payoutCents ?? 0,
      } : null);
      setScreen('game');
    });
    sock.on('queue:count', (data: { count: number; min: number; max: number }) => setQueueCount(data));
    sock.on('balance:update', ({ delta }: { delta: number }) => { setBalance(b => b + delta); track('Balance Credited', { game: 'Dash', delta_cents: delta }); });

    sock.on('tournament:lobby-assigned', (data: any) => {
      if (data.game !== 'DASH') return;
      if (data.autoAdvance) { setTournamentBanner(`You auto-advanced to Round ${(data.roundNumber || 0) + 1}!`); return; }
      setGameConfig({ roomCode: data.roomCode, playerName: playerName || 'Player', playerColor, opponentName: data.opponentName ?? '', opponentColor: data.opponentColor ?? '#fb923c', opponents: data.opponents ?? [], entryCents: 0, payoutCents: 0, stakeId: 'tournament' });
      setTournamentBanner(null);
      setScreen('game');
    });
    sock.on('tournament:eliminated', () => setTournamentBanner('You\'ve been eliminated from the tournament.'));
    sock.on('tournament:complete', (data: any) => {
      const me = (data.finalRankings || []).find((r: any) => r.uid === firebaseUser?.uid);
      if (me) { const s = ['st','nd','rd','th'][Math.min(me.rank - 1, 3)]; const p = me.prizeCents > 0 ? ` — +${Math.round(me.prizeCents / 100)} PC!` : ''; setTournamentBanner(`Tournament over! You finished ${me.rank}${s}${p}`); if (me.prizeCents > 0) setBalance(b => b + me.prizeCents); }
    });

    return () => {
      sock.off('dash:matched');
      sock.off('queue:count');
      sock.off('balance:update');
      sock.off('tournament:lobby-assigned');
      sock.off('tournament:eliminated');
      sock.off('tournament:complete');
    };
  }, []);

  function resolve() { return playerName.trim() || `RUNNER-${Math.floor(Math.random() * 9000) + 1000}`; }

  async function handleQueue(stakeId: string, name: string, color: string) {
    setPlayerName(name); setPlayerColor(color);
    const sock = getSocket();
    let idToken: string | null = null;
    if (firebaseUser) { try { idToken = await firebaseUser.getIdToken(); } catch { /* no-op */ } }
    sock.emit('dash:queue', { name, color, stakeId, idToken }, (res: any) => {
      if (res && !res.ok) {
        if (res.error === 'insufficient_balance') alert('Not enough PC for this tier. Add PC from your account page.');
        else if (res.error === 'auth_required') alert('Please log in to play paid lobbies.');
        setScreen('home');
      }
    });
    setGameConfig({ roomCode: '', playerName: name, playerColor: color, opponentName: '', opponentColor: '#fb923c', stakeId, payoutCents: 0 });
    track('Game Queued', { game: 'Dash', stake: stakeId });
    setScreen('waiting');
  }

  async function handleSolo(name: string, color: string) {
    const allowed = await consumeSoloRun();
    if (!allowed) { alert(`You've used all ${SOLO_DAILY_LIMIT} solo practice runs for today. Come back tomorrow!`); return; }
    setPlayerName(name); setPlayerColor(color);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    setGameConfig({ roomCode: code, playerName: name, playerColor: color, opponentName: '', opponentColor: '', stakeId: 'free', payoutCents: 0, solo: true });
    setScreen('game');
  }

  // Trial = first solo run to unlock paid lobbies
  async function handleBotTrial() {
    track('Trial Started', { game: 'Dash' });
    await handleSolo(resolve(), playerColor);
  }

  function handleLeave() {
    getSocket().emit('dash:leave');
    setQueueCount(undefined);
    setScreen('home');
  }

  function handleResult(result: ResultData) {
    setResultData(result);
    setScreen('result');
    if (firebaseUser && !gameConfig?.solo && gameConfig?.stakeId !== 'tournament') {
      const newWin  = result.won ? winStreak + 1 : 0;
      const newLoss = !result.won ? lossStreak + 1 : 0;
      setWinStreak(newWin); setLossStreak(newLoss);

      const isPaid = gameConfig?.stakeId && !['free'].includes(gameConfig.stakeId);
      const pointsEarned = result.won && isPaid ? 20 : 0;
      if (pointsEarned > 0) setPoints(p => p + pointsEarned);
      track('Game Result', { game: 'Dash', won: result.won, stake: gameConfig?.stakeId, paid: !!isPaid });
      setDoc(doc(db, 'users', firebaseUser.uid), { winStreak: newWin, lossStreak: newLoss, trialCompletedDash: true }, { merge: true }).catch(console.error);
      addDoc(collection(db, 'users', firebaseUser.uid, 'matches'), { game: 'DASH', won: result.won, stakeId: gameConfig?.stakeId ?? 'free', entryCents: gameConfig?.entryCents ?? 0, stakeCents: gameConfig?.entryCents ?? 0, payoutCents: result.won ? (gameConfig?.payoutCents ?? 0) : 0, pointsEarned, createdAt: serverTimestamp() }).catch(console.error);
      if (result.won) {
        addDoc(collection(db, 'recentActivity'), { game: 'DASH', winner: playerName, winnerColor: playerColor, loser: gameConfig?.opponentName ?? 'Opponent', stakeId: gameConfig?.stakeId ?? 'free', payoutCents: gameConfig?.payoutCents ?? 0, createdAt: serverTimestamp() }).catch(console.error);
      }
    }
    // Mark trial complete after first run
    if (firebaseUser && !trialComplete) {
      setTrialComplete(true);
      setDoc(doc(db, 'users', firebaseUser.uid), { trialCompletedDash: true }, { merge: true }).catch(console.error);
    }
  }

  function handlePlayAgain() { setResultData(null); setGameConfig(null); setScreen('home'); }

  if (!calibrated) {
    return (
      <CalibrationGate onComplete={() => {
        sessionStorage.setItem('dashCalibrationPassed', 'true');
        setCalibrated(true);
      }} />
    );
  }

  if (firebaseUser === undefined) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03030a' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(0,255,136,.2)', borderTopColor: '#00ff88', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#03030a', fontFamily: "'Space Grotesk', sans-serif", overflow: 'hidden' }}>
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
        <ResultScreen result={resultData} onPlayAgain={handlePlayAgain} solo={gameConfig?.solo} />
      )}
      {tournamentBanner && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.92)', border: '1px solid #00ff88', borderRadius: 8, padding: '12px 24px', color: '#00ff88', fontSize: '0.9rem', fontWeight: 700, zIndex: 9999, maxWidth: '90vw', textAlign: 'center', boxShadow: '0 0 20px rgba(0,255,136,0.3)' }}>
          {tournamentBanner}
          <button onClick={() => setTournamentBanner(null)} style={{ marginLeft: 16, background: 'none', border: 'none', color: 'rgba(0,255,136,0.5)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
        </div>
      )}
      {showDeposit && firebaseUser && (
        <DepositModal user={firebaseUser} onClose={() => setShowDeposit(false)} onSuccess={(creditCents) => { if (creditCents > 0) setBalance(b => b + creditCents); }} />
      )}
    </div>
  );
}
