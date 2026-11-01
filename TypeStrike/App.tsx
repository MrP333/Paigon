import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './services/firebase';
import { identifyUser, track } from './services/analytics';
import CalibrationGate from './components/CalibrationGate';
import Notice, { NoticeData } from './components/Notice';
import ConnectionBanner from './components/ConnectionBanner';
import HomeScreen from './components/HomeScreen';
import WaitingScreen from './components/WaitingScreen';
import GameScreen from './components/GameScreen';
import ResultScreen from './components/ResultScreen';
import { GameConfig, ResultData } from './types';
import { useShellBridge } from './services/shellBridge';

import { ENV } from './services/env';
const SERVER_URL = ENV.serverUrl;

export default function App() {
  const [calibrated, setCalibrated] = useState(
    () => sessionStorage.getItem('typestrike_calibrated') === 'true',
  );
  const [screen, setScreen] = useState<'home' | 'waiting' | 'game' | 'result'>('home');
  const [notice, setNotice] = useState<NoticeData | null>(null);
  // The socket lives in a ref, which never triggers a render; this lets the
  // connection banner mount once the socket actually exists.
  const [socketReady, setSocketReady] = useState(false);
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<User | null | undefined>(undefined);
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#00ff88');
  const [balance, setBalance] = useState(0);
  const [trialComplete, setTrialComplete] = useState(false);
  const [points, setPoints] = useState(0);
  const [winStreak, setWinStreak] = useState(0);
  const [lossStreak, setLossStreak] = useState(0);
  const [queueCount, setQueueCount] = useState<{ count: number; min: number; max: number } | undefined>(undefined);
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
        if (d.trialCompletedType) setTrialComplete(true);
        identifyUser(user.uid);
        setPoints(d.points ?? 0);
        setWinStreak(d.winStreak ?? 0);
        setLossStreak(d.lossStreak ?? 0);
      } else {
        setPlayerName(user.email?.split('@')[0] ?? '');
      }
    });
  }, []);

  function getSocket(): Socket {
    if (!socketRef.current) {
      socketRef.current = io(SERVER_URL, { transports: ['polling', 'websocket'] });
      setSocketReady(true);
    }
    return socketRef.current;
  }

  useEffect(() => {
    const sock = getSocket();

    sock.on('type:matched', (data: Record<string, unknown>) => {
      track('Game Matched', { game: 'TypeStrike', stake: data.stakeId });
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
    sock.on('balance:update', ({ delta }: { delta: number }) => { setBalance(b => b + delta); track('Balance Credited', { game: 'TypeStrike', delta_cents: delta }); });

    // The server closes a match nobody finished within its time limit.
    sock.on('match:expired', () => {
      setNotice({
        title: 'Match closed',
        body: 'Nobody finished this match before its time limit, so it was closed without a result. It does not count toward your record.',
        tone: 'info',
      });
      setQueueCount(undefined);
      setGameConfig(null);
      setScreen('home');
    });

    sock.on('tournament:lobby-assigned', (data: any) => {
      if (data.game !== 'TYPE') return;
      if (data.autoAdvance) { setTournamentBanner(`You auto-advanced to Round ${(data.roundNumber || 0) + 1}!`); return; }
      setGameConfig({ roomCode: data.roomCode, playerName: playerName || 'Player', playerColor, opponentName: data.opponentName ?? '', opponentColor: data.opponentColor ?? '#22d3ee', opponents: data.opponents ?? [], entryCents: 0, payoutCents: 0, stakeId: 'tournament' });
      setTournamentBanner(null);
      setScreen('game');
    });
    sock.on('tournament:eliminated', () => setTournamentBanner('You\'ve been eliminated from the tournament.'));
    sock.on('tournament:complete', (data: any) => {
      const me = (data.finalRankings || []).find((r: any) => r.uid === firebaseUser?.uid);
      if (me) { const s = ['st','nd','rd','th'][Math.min(me.rank - 1, 3)]; const p = me.prizeCents > 0 ? ` — +${Math.round(me.prizeCents / 100)} PC!` : ''; setTournamentBanner(`Tournament over! You finished ${me.rank}${s}${p}`); if (me.prizeCents > 0) setBalance(b => b + me.prizeCents); }
    });

    return () => {
      sock.off('type:matched');
      sock.off('queue:count');
      sock.off('balance:update');
      sock.off('tournament:lobby-assigned');
      sock.off('tournament:eliminated');
      sock.off('tournament:complete');
      sock.off('match:expired');
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
        if (res.error === 'insufficient_balance') setNotice({
          title: 'Not enough Paigon Credits',
          body: 'This lobby costs more PC than you have. Add credits from your account page to join.',
          tone: 'warn',
          action: { label: 'Add PC', href: '/account.html' },
        });
        else if (res.error === 'paid_play_disabled') setNotice({
          title: 'Paid lobbies are not available',
          body: 'Every Paigon match is free right now. Choose the Free lobby to play.',
          tone: 'info',
        });
        else if (res.error === 'auth_required') setNotice({
          title: 'Sign in required',
          body: 'Paid lobbies need a signed-in account so winnings can be credited to you.',
          tone: 'info',
        });
        else if (res.error === 'play_paused') setNotice({
          title: 'Matches are paused',
          body: 'Matchmaking is switched off for a short while. Try again in a few minutes.',
          tone: 'info',
        });
        else if (res.error === 'rate_limited') setNotice({
          title: 'One moment',
          body: 'That was a lot of tries in a short time. Wait a few seconds and try again.',
          tone: 'info',
        });
        else setNotice({
          title: "Couldn't join the lobby",
          body: 'The game server turned the request down. Refresh the page and try again.',
          tone: 'warn',
        });
        setScreen('home');
      }
    });
    setGameConfig({ roomCode: '', playerName: name, playerColor: color, opponentName: '', opponentColor: '#22d3ee', stakeId, payoutCents: 0 });
    track('Game Queued', { game: 'TypeStrike', stake: stakeId });
    setScreen('waiting');
  }

  // Practice is unlimited: getting better between matches is the whole point
  // of a skill game, and a solo run has no opponent and no prize.
  function handleSolo(name: string, color: string) {
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
    if (firebaseUser && !gameConfig?.solo && gameConfig?.stakeId !== 'tournament') {
      const newWin  = result.won ? winStreak + 1 : 0;
      const newLoss = !result.won ? lossStreak + 1 : 0;
      setWinStreak(newWin); setLossStreak(newLoss);

      const isPaid = gameConfig?.stakeId && !['free'].includes(gameConfig.stakeId);
      const pointsEarned = result.won && isPaid ? 20 : 0;
      if (pointsEarned > 0) setPoints(p => p + pointsEarned);
      track('Game Result', { game: 'TypeStrike', won: result.won, stake: gameConfig?.stakeId, paid: !!isPaid, wpm: result.myWpm });

      // Only the cosmetic streak is written here. The result itself is recorded

      // by the game server from the score it computed.

      setDoc(doc(db, 'users', firebaseUser.uid), {
        winStreak: newWin, lossStreak: newLoss, trialCompletedType: true,
      }, { merge: true }).catch(console.error);
    }

    // Mark trial complete after first run
    if (firebaseUser && !trialComplete) {
      setTrialComplete(true);
      setDoc(doc(db, 'users', firebaseUser.uid), { trialCompletedType: true }, { merge: true }).catch(console.error);
    }
  }

  function handlePlayAgain() { setResultData(null); setGameConfig(null); setScreen('home'); }

  // The site overlay closed → drop back to the home screen (and leave the
  // queue cleanly if we were still waiting), so reopening starts fresh.
  useShellBridge(screen, () => {
    if (screen === 'waiting') handleLeave();
    handlePlayAgain();
  });

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
          balance={balance}
          paidEnabled={ENV.realMoney} isLoggedIn={!!firebaseUser}
          points={firebaseUser ? points : undefined}
          winStreak={winStreak} lossStreak={lossStreak}
        />
      )}
      {screen === 'waiting' && <WaitingScreen onLeave={handleLeave} queueCount={queueCount} />}
      {screen === 'game' && gameConfig && (
        <GameScreen config={gameConfig} socket={getSocket()} onResult={handleResult} />
      )}
      {screen === 'result' && resultData && (
        <ResultScreen result={resultData} onPlayAgain={handlePlayAgain} solo={gameConfig?.solo} config={gameConfig} winStreak={winStreak} />
      )}
      {tournamentBanner && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.92)', border: '1px solid #00ff88', borderRadius: 8, padding: '12px 24px', color: '#00ff88', fontSize: '0.9rem', fontWeight: 700, zIndex: 9999, maxWidth: '90vw', textAlign: 'center', boxShadow: '0 0 20px rgba(0,255,136,0.3)' }}>
          {tournamentBanner}
          <button onClick={() => setTournamentBanner(null)} style={{ marginLeft: 16, background: 'none', border: 'none', color: 'rgba(0,255,136,0.5)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
        </div>
      )}

      {notice && <Notice notice={notice} onClose={() => setNotice(null)} />}
      <ConnectionBanner socket={socketReady ? socketRef.current : null} />
    </div>
  );
}
