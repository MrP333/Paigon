import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './services/firebase';
import { GameConfig, ResultData } from './types';
import HomeScreen from './components/HomeScreen';
import GameScreen from './components/GameScreen';
import TrialScreen from './components/TrialScreen';
import ResultScreen from './components/ResultScreen';
import DepositModal from './components/DepositModal';

const SERVER_URL = 'https://mazergame11-production.up.railway.app';

type Screen = 'home' | 'waiting' | 'game' | 'trial' | 'result';


export default function App() {
  const [screen, setScreen]           = useState<Screen>('home');
  const [config, setConfig]           = useState<GameConfig | null>(null);
  const [result, setResult]           = useState<ResultData | null>(null);
  const [selectedStake, setSelectedStake] = useState('free');

  // Firebase auth + user data
  const [firebaseUser, setFirebaseUser] = useState<User | null | undefined>(undefined);
  const [showDeposit, setShowDeposit] = useState(false);
  const [playerName, setPlayerName]   = useState('Soldier');
  const [playerColor, setPlayerColor] = useState('#ffa020');
  const [balance, setBalance]         = useState(0); // balanceCents
  const [trialComplete, setTrialComplete] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [soloRunsToday, setSoloRunsToday] = useState(0);
  const [points, setPoints]         = useState(0);
  const [winStreak, setWinStreak] = useState(0);
  const [lossStreak, setLossStreak] = useState(0);
  const [queueCount, setQueueCount] = useState<{ count: number; min: number; max: number } | undefined>(undefined);


  const SOLO_DAILY_LIMIT = 5;

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
        if (data.trialCompletedNml) setTrialComplete(true);
        if (data.isDev) setIsDev(true);
        const today = new Date().toISOString().slice(0, 10);
        if (data.soloRunsDate === today) setSoloRunsToday(data.soloRunsToday ?? 0);
        setPoints(data.points ?? 0);
        setWinStreak(data.winStreak ?? 0);
        setLossStreak(data.lossStreak ?? 0);
      } else {
        setPlayerName(user.email?.split('@')[0] ?? 'Soldier');
      }
    });
  }, []);

  async function consumeSoloRun(): Promise<boolean> {
    if (isDev) return true;
    if (!firebaseUser) return true;
    const today = new Date().toISOString().slice(0, 10);
    const currentCount = soloRunsToday;
    if (currentCount >= SOLO_DAILY_LIMIT) return false;
    const next = currentCount + 1;
    setSoloRunsToday(next);
    setDoc(doc(db, 'users', firebaseUser.uid), { soloRunsDate: today, soloRunsToday: next }, { merge: true }).catch(console.error);
    return true;
  }

  // Socket connection
  useEffect(() => {
    const s = io(SERVER_URL, { transports: ['polling', 'websocket'] });
    socketRef.current = s;

    s.on('nml:matched', (data: any) => {
      setQueueCount(undefined);
      setConfig(prev => prev ? {
        ...prev,
        roomCode: data.roomCode,
        opponentName: data.opponentName ?? data.opponents?.[0]?.name ?? '',
        opponentColor: data.opponentColor ?? data.opponents?.[0]?.color ?? '#fb923c',
        opponents: data.opponents ?? [],
        payoutCents: data.payoutCents ?? 0,
        towerCount: data.towerCount ?? 5,
      } : null);
      setScreen('game');
    });

    s.on('queue:count', (data: { count: number; min: number; max: number }) => {
      setQueueCount(data);
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

  const handleBotTrial = () => {
    setScreen('trial');
  };

  const handleTrialComplete = () => {
    setTrialComplete(true);
    if (firebaseUser) {
      setDoc(doc(db, 'users', firebaseUser.uid), { trialCompletedNml: true }, { merge: true }).catch(console.error);
    }
    setScreen('home');
  };

  const handleQueue = async (stakeId: string) => {
    const s = socketRef.current;
    if (!s) return;
    // Gate paid lobbies behind trial completion
    const isPaid = stakeId !== 'free';
    if (isPaid && !trialComplete) {
      handleBotTrial();
      return;
    }
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
    const idToken = firebaseUser ? await firebaseUser.getIdToken() : null;
    s.emit('nml:queue', { name: playerName, color: playerColor, stakeId, idToken }, (res: any) => {
      if (res?.error === 'insufficient_balance') {
        alert('Not enough Paigon Credits. Visit your account page to add PC.');
        setScreen('home');
        return;
      }
      if (res?.error === 'auth_required') {
        alert('Please sign in to enter paid lobbies.');
        setScreen('home');
        return;
      }
    });
    setScreen('waiting');
  };

  const handleSolo = async () => {
    const allowed = await consumeSoloRun();
    if (!allowed) {
      alert(`You've used all ${SOLO_DAILY_LIMIT} solo practice runs for today. Come back tomorrow, or play a free competitive match!`);
      return;
    }
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
      towerCount: 4,
    });
    setScreen('game');
  };

  const handleResult = (r: ResultData) => {
    setResult(r);
    setScreen('result');
    if (firebaseUser && !config?.solo) {
      const newWin  = r.won ? winStreak + 1 : 0;
      const newLoss = !r.won && !r.draw ? lossStreak + 1 : 0;
      setWinStreak(newWin);
      setLossStreak(newLoss);

      // Award points on win in paid lobby only (server writes to Firestore via creditWinner)
      const isPaid = (r.entryCents ?? 0) > 0;
      const pointsEarned = r.won && isPaid ? 20 : 0;
      if (pointsEarned > 0) setPoints(p => p + pointsEarned);
      setDoc(doc(db, 'users', firebaseUser.uid), {
        winStreak: newWin, lossStreak: newLoss,
      }, { merge: true }).catch(console.error);

      addDoc(collection(db, 'users', firebaseUser.uid, 'matches'), {
        game: 'NML',
        won: r.won, draw: r.draw,
        stakeCents: r.entryCents ?? 0,
        payoutCents: r.won ? (r.payoutCents ?? 0) : 0,
        myTimeMs: r.myTimeMs,
        opponentTimeMs: r.opponentTimeMs,
        pointsEarned,
        createdAt: serverTimestamp(),
      }).catch(console.error);

      if (r.won) {
        addDoc(collection(db, 'recentActivity'), {
          game: 'NML',
          winner: playerName,
          winnerColor: playerColor,
          loser: config?.opponentName ?? 'Opponent',
          stakeId: config?.stakeId ?? 'free',
          payoutCents: r.payoutCents ?? 0,
          createdAt: serverTimestamp(),
        }).catch(console.error);
      }
    }
  };

  const handlePlayAgain = () => {
    setResult(null);
    setConfig(null);
    setScreen('home');
  };

  const handleCancel = () => {
    socketRef.current?.emit('nml:leave');
    setQueueCount(undefined);
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
          onBotTrial={handleBotTrial}
          trialComplete={trialComplete}
          playerName={playerName}
          playerColor={playerColor}
          balance={balance}
          isLoggedIn={!!firebaseUser}
          onDeposit={() => setShowDeposit(true)}
          soloRunsToday={firebaseUser ? soloRunsToday : undefined}
          isDev={isDev}
          points={firebaseUser ? points : undefined}
          winStreak={winStreak}
          lossStreak={lossStreak}
        />
      )}

      {screen === 'waiting' && (() => {
        const TIERS: Record<string, { label: string; entryCents: number; payoutCents: number }> = {
          free:     { label: 'Free',     entryCents: 0,    payoutCents: 0    },
          quick:    { label: 'Quick',    entryCents: 50,   payoutCents: 98   },
          standard: { label: 'Standard', entryCents: 200,  payoutCents: 392  },
          high:     { label: 'High',     entryCents: 1000, payoutCents: 1960 },
          elite:    { label: 'Elite',    entryCents: 5000, payoutCents: 9800 },
        };
        const tier = TIERS[selectedStake] ?? TIERS.free;
        const pc = (c: number) => Math.floor(c / 10) + ' PC';
        return (
          <div style={{
            width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', background: '#03030a', gap: 16,
          }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>
              No Man's Land
            </div>

            {/* Stake badge */}
            {tier.entryCents > 0 && (
              <div style={{
                padding: '6px 16px', borderRadius: 20,
                background: 'rgba(255,160,32,0.1)', border: '1px solid rgba(255,160,32,0.25)',
                fontSize: '0.72rem', fontWeight: 700, color: '#ffa020', letterSpacing: '0.06em',
              }}>
                {tier.label} — {pc(tier.entryCents)} entry · pool grows with players
              </div>
            )}

            {/* Player tag */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: playerColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 800, color: '#000' }}>
                {playerName[0]?.toUpperCase()}
              </div>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: '0.95rem' }}>{playerName}</span>
            </div>

            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>
              {queueCount && queueCount.count >= queueCount.min ? 'Lobby Filling…' : 'Finding Players…'}
            </div>
            {queueCount ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)' }}>
                  {queueCount.count} of {queueCount.min}–{queueCount.max} players joined
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {Array.from({ length: queueCount.max }).map((_, i) => (
                    <div key={i} style={{ width: i < queueCount.count ? 9 : 7, height: i < queueCount.count ? 9 : 7, borderRadius: '50%', background: i < queueCount.count ? '#ffa020' : 'rgba(255,160,32,0.12)', border: i < queueCount.count ? 'none' : '1px solid rgba(255,160,32,0.2)', transition: 'all 0.3s', boxShadow: i < queueCount.count ? '0 0 6px #ffa02080' : 'none' }} />
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffa020', animation: `pulse 1.2s ${i*0.2}s ease-in-out infinite`, opacity: 0.4 }} />
                ))}
              </div>
            )}

            {/* Controls reminder */}
            <div style={{ marginTop: 8, display: 'flex', gap: 20, opacity: 0.22 }}>
              {[['WASD', 'Move'], ['SHIFT', 'Sprint'], ['C', 'Crawl']].map(([k, v]) => (
                <div key={k} style={{ textAlign: 'center', fontSize: '0.68rem' }}>
                  <div style={{ fontWeight: 800, color: '#fff', fontFamily: 'monospace', marginBottom: 2 }}>{k}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)' }}>{v}</div>
                </div>
              ))}
            </div>

            <button onClick={handleCancel} style={{
              marginTop: 12, padding: '8px 24px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
              color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Cancel
            </button>
            <style>{`@keyframes pulse{0%,100%{opacity:0.15;transform:scale(0.8)}50%{opacity:0.8;transform:scale(1.2)}}`}</style>
          </div>
        );
      })()}

      {screen === 'trial' && (
        <TrialScreen
          playerName={playerName}
          playerColor={playerColor}
          onComplete={handleTrialComplete}
          onBack={() => setScreen('home')}
        />
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

      {showDeposit && firebaseUser && (
        <DepositModal
          user={firebaseUser}
          onClose={() => setShowDeposit(false)}
          onSuccess={(creditCents) => {
            if (creditCents > 0) setBalance(b => b + creditCents);
          }}
        />
      )}
    </div>
  );
}
