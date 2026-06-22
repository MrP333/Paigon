import { useState, useEffect, useRef, useMemo } from 'react';
import GameScreen from './GameScreen';
import { GameConfig, ResultData } from '../types';

const BOT_CORRECT = 3;
const BOT_TOTAL_MS = 9000;
const BOT_SCORE = BOT_CORRECT * 100000 - BOT_TOTAL_MS;

// Simulate bot completing rounds over the course of a 5-round game
// Each round the bot "answers" roughly every BOT_TOTAL_MS / 5
const BOT_ROUND_MS = BOT_TOTAL_MS / 5;

interface Props {
  playerName: string;
  playerColor: string;
  onComplete: () => void;
  onBack: () => void;
}

export default function TrialScreen({ playerName, playerColor, onComplete, onBack }: Props) {
  const [attempt, setAttempt] = useState(0);
  return (
    <TrialAttempt
      key={attempt}
      playerName={playerName}
      playerColor={playerColor}
      onComplete={onComplete}
      onBack={onBack}
      onRetry={() => setAttempt(a => a + 1)}
    />
  );
}

interface AttemptProps {
  playerName: string;
  playerColor: string;
  onComplete: () => void;
  onBack: () => void;
  onRetry: () => void;
}

function TrialAttempt({ playerName, playerColor, onComplete, onBack, onRetry }: AttemptProps) {
  const [outcome, setOutcome] = useState<'won' | 'lost' | null>(null);
  const [playerResult, setPlayerResult] = useState<ResultData | null>(null);
  const [botRounds, setBotRounds] = useState(0);

  const resultFiredRef = useRef(false);

  const config = useMemo<GameConfig>(() => ({
    roomCode: Math.random().toString(36).slice(2, 7).toUpperCase(),
    playerName,
    playerColor,
    opponentName: 'SENTINEL',
    opponentColor: '#a855f7',
    stakeId: 'free',
    payoutCents: 0,
    solo: true,
  }), []); // stable for this attempt's lifetime

  // Animate bot completing rounds at BOT_ROUND_MS intervals
  useEffect(() => {
    let rounds = 0;
    const iv = setInterval(() => {
      if (resultFiredRef.current) { clearInterval(iv); return; }
      rounds++;
      setBotRounds(rounds);
      if (rounds >= 5) clearInterval(iv);
    }, BOT_ROUND_MS);
    return () => clearInterval(iv);
  }, []);

  function handleResult(r: ResultData) {
    if (resultFiredRef.current) return;
    resultFiredRef.current = true;
    setBotRounds(5);
    setPlayerResult(r);
    setOutcome(r.myScore > BOT_SCORE ? 'won' : 'lost');
  }

  const accentWon = '#00ff88';
  const accentLost = '#a855f7';
  const accent = outcome === 'won' ? accentWon : accentLost;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <GameScreen config={config} socket={null as any} onResult={handleResult} />

      {/* Sentinel progress overlay — shown while playing */}
      {outcome === null && (
        <div style={{
          position: 'absolute', top: 0, right: 0,
          padding: '8px 14px', pointerEvents: 'none', zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
        }}>
          <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#a855f7' }}>
            SENTINEL
          </span>
          <div style={{ display: 'flex', gap: 5 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{
                width: 7, height: 7, borderRadius: '50%',
                background: i < botRounds ? '#a855f7' : 'rgba(168,85,247,0.15)',
                boxShadow: i < botRounds ? '0 0 5px #a855f7' : 'none',
                transition: 'all 0.15s',
              }} />
            ))}
          </div>
          <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.3)' }}>
            {botRounds}/5 rounds
          </div>
        </div>
      )}

      {/* Result overlay */}
      {outcome !== null && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: `radial-gradient(ellipse 70% 50% at 50% 40%, ${outcome === 'won' ? 'rgba(0,255,136,0.05)' : 'rgba(168,85,247,0.05)'} 0%, transparent 70%), rgba(3,3,10,0.95)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: '100%', maxWidth: 400, padding: '40px 32px', margin: '0 16px',
            background: outcome === 'won' ? 'rgba(0,255,136,0.07)' : 'rgba(168,85,247,0.07)',
            border: `1px solid ${outcome === 'won' ? 'rgba(0,255,136,0.2)' : 'rgba(168,85,247,0.2)'}`,
            borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 20,
            boxShadow: `0 0 80px ${outcome === 'won' ? 'rgba(0,255,136,0.08)' : 'rgba(168,85,247,0.08)'}`,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 10 }}>
                Odd Signal · Trial
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 900, color: accent, letterSpacing: '0.06em', lineHeight: 1 }}>
                {outcome === 'won' ? 'TRIAL PASSED' : 'SENTINEL WINS'}
              </div>
              <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                {outcome === 'won'
                  ? 'Sharp eye — competitive lobbies unlocked'
                  : `Beat the SENTINEL: score over ${BOT_SCORE.toLocaleString()}`}
              </div>
            </div>

            {playerResult && (
              <div style={{ padding: '0 4px' }}>
                {[
                  { label: 'Your score', value: playerResult.myScore.toLocaleString(), hi: true },
                  { label: 'Bot score',  value: BOT_SCORE.toLocaleString() },
                  { label: 'Correct',    value: `${playerResult.myCorrect} / 5` },
                  { label: 'Total time', value: (playerResult.myTotalMs / 1000).toFixed(2) + 's' },
                ].map(({ label, value, hi }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>{label}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: hi ? '#22d3ee' : 'rgba(255,255,255,0.75)' }}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            {outcome === 'won' ? (
              <button onClick={onComplete} style={{ padding: '13px', borderRadius: 12, border: '1px solid rgba(0,255,136,0.2)', background: 'rgba(0,255,136,0.12)', color: accentWon, fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.06em', cursor: 'pointer', fontFamily: 'inherit' }}>
                PLAY COMPETITIVE →
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onRetry} style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.12)', color: accentLost, fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.06em', cursor: 'pointer', fontFamily: 'inherit' }}>
                  TRY AGAIN
                </button>
                <button onClick={onBack} style={{ padding: '13px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.35)', fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.06em', cursor: 'pointer', fontFamily: 'inherit' }}>
                  BACK
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
