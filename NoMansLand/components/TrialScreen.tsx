import { useRef, useState, useEffect, useMemo } from 'react';
import GameScreen from './GameScreen';
import { GameConfig, ResultData, GamePhase } from '../types';

const BOT_CROSSING_MS = 65_000;

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
  const [botPct, setBotPct] = useState(0);
  const [outcome, setOutcome] = useState<'won' | 'lost' | null>(null);

  const resultFiredRef = useRef(false);
  const playerPhaseRef = useRef<GamePhase>('playing');

  const config = useMemo<GameConfig>(() => ({
    roomCode: Math.random().toString(36).slice(2, 7).toUpperCase(),
    playerName,
    playerColor,
    opponentName: 'SENTINEL',
    opponentColor: '#a855f7',
    stakeId: 'free',
    payoutCents: 0,
    solo: true,
    towerCount: 4,
  }), []); // stable for this attempt's lifetime

  useEffect(() => {
    const startMs = Date.now();
    const iv = setInterval(() => {
      if (resultFiredRef.current) { clearInterval(iv); return; }
      const elapsed = Date.now() - startMs;
      const pct = Math.min(elapsed / BOT_CROSSING_MS, 1);
      setBotPct(pct);
      if (pct >= 1 && playerPhaseRef.current === 'playing') {
        clearInterval(iv);
        resultFiredRef.current = true;
        setOutcome('lost');
      }
    }, 100);
    return () => clearInterval(iv);
  }, []);

  function handlePhaseChange(phase: GamePhase) {
    playerPhaseRef.current = phase;
    if (resultFiredRef.current) return;
    if (phase === 'victory') {
      resultFiredRef.current = true;
      setOutcome('won');
    } else if (phase === 'dead') {
      resultFiredRef.current = true;
      setOutcome('lost');
    }
  }

  // fallback: onResult from GameScreen (e.g. player clicks Done button manually)
  function handleGameResult(r: ResultData) {
    if (resultFiredRef.current) return;
    resultFiredRef.current = true;
    setOutcome(r.won ? 'won' : 'lost');
  }

  const accentWon = '#22c55e';
  const accentLost = '#a855f7';
  const accent = outcome === 'won' ? accentWon : accentLost;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <GameScreen
        config={config}
        socket={null as any}
        onResult={handleGameResult}
        onPhaseChange={handlePhaseChange}
      />

      {/* SENTINEL progress bar — hidden once result is shown */}
      {outcome === null && (
        <div style={{
          position: 'absolute', bottom: 72, left: '50%',
          transform: 'translateX(-50%)', width: 260,
          pointerEvents: 'none', zIndex: 10,
        }}>
          <div style={{
            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: '#a855f7',
            marginBottom: 4, textAlign: 'center',
          }}>
            SENTINEL — {Math.round(botPct * 100)}%
          </div>
          <div style={{ height: 6, background: 'rgba(168,85,247,0.15)', borderRadius: 3 }}>
            <div style={{
              height: '100%', borderRadius: 3, background: '#a855f7',
              width: `${botPct * 100}%`, transition: 'width 0.1s linear',
            }} />
          </div>
        </div>
      )}

      {/* Result overlay */}
      {outcome !== null && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(3,3,10,0.93)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.3em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 24,
          }}>
            No Man's Land · Trial
          </div>

          <div style={{
            fontSize: 'clamp(2.4rem, 8vw, 4rem)', fontWeight: 900,
            letterSpacing: '0.1em', color: accent,
            textShadow: `0 0 60px ${accent}55`,
            marginBottom: 8,
          }}>
            {outcome === 'won' ? 'TRIAL PASSED' : 'SENTINEL WINS'}
          </div>

          <div style={{
            fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)', marginBottom: 36,
            textAlign: 'center', maxWidth: 340,
          }}>
            {outcome === 'won'
              ? 'Competitive lobbies unlocked — good luck out there'
              : "Cross No Man's Land in under 65 seconds to unlock competitive lobbies"}
          </div>

          {outcome === 'won' ? (
            <button onClick={onComplete} style={{
              padding: '13px 40px', borderRadius: 10, border: 'none',
              background: accentWon, color: '#000',
              fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.04em',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: `0 0 28px ${accentWon}44`,
            }}>
              UNLOCK COMPETITIVE →
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={onRetry} style={{
                padding: '13px 32px', borderRadius: 10, border: 'none',
                background: accentLost, color: '#fff',
                fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.04em',
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: `0 0 28px ${accentLost}44`,
              }}>
                TRY AGAIN
              </button>
              <button onClick={onBack} style={{
                padding: '13px 32px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'transparent', color: 'rgba(255,255,255,0.4)',
                fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.04em',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                BACK
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
