import { useRef, useState, useEffect, useMemo } from 'react';
import GameScreen from './GameScreen';
import { GameConfig, ResultData } from '../types';

const NUM_TARGETS = 150;
const BOT_HITS = 10;                // SENTINEL hits 10 targets in 30s — beat this to pass
const GAME_DURATION_MS = 30000;
const BOT_INTERVAL_MS = GAME_DURATION_MS / BOT_HITS;
// SENTINEL avg reaction ~500ms after charge → ~68pts/hit → 680 total
const BOT_SCORE = 680;

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
  const [botHits, setBotHits] = useState(0);
  const [outcome, setOutcome] = useState<'won' | 'lost' | null>(null);
  const [playerResult, setPlayerResult] = useState<ResultData | null>(null);

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

  useEffect(() => {
    let hits = 0;
    const iv = setInterval(() => {
      if (resultFiredRef.current) { clearInterval(iv); return; }
      hits++;
      setBotHits(hits);
      if (hits >= BOT_HITS) clearInterval(iv);
    }, BOT_INTERVAL_MS);
    return () => clearInterval(iv);
  }, []);

  function handleGameResult(r: ResultData) {
    if (resultFiredRef.current) return;
    resultFiredRef.current = true;
    setPlayerResult(r);
    setOutcome(r.myScore > BOT_SCORE ? 'won' : 'lost');
  }

  const accentWon = '#00ff88';
  const accentLost = '#a855f7';
  const accent = outcome === 'won' ? accentWon : accentLost;

  function fmtTime(ms: number | null) {
    if (ms === null) return '—';
    return (ms / 1000).toFixed(2) + 's';
  }

  function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
          {label}
        </span>
        <span style={{ fontSize: '0.85rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: highlight ? '#22d3ee' : 'rgba(255,255,255,0.75)' }}>
          {value}
        </span>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <GameScreen
        config={config}
        socket={null as any}
        onResult={handleGameResult}
      />

      {/* SENTINEL bot progress overlay — shown while playing */}
      {outcome === null && (
        <div style={{
          position: 'absolute', top: 0, right: 0,
          padding: '6px 12px',
          pointerEvents: 'none', zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3,
        }}>
          <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#a855f7' }}>
            SENTINEL
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: BOT_HITS }, (_, i) => (
              <div key={i} style={{
                width: 7, height: 7, borderRadius: '50%',
                background: i < botHits ? '#a855f7' : 'rgba(168,85,247,0.15)',
                boxShadow: i < botHits ? '0 0 5px #a855f7' : 'none',
                transition: 'all 0.12s',
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Result overlay */}
      {outcome !== null && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: `radial-gradient(ellipse 80% 60% at 50% 40%, ${outcome === 'won' ? 'rgba(0,255,136,0.05)' : 'rgba(168,85,247,0.05)'} 0%, transparent 70%), rgba(3,3,10,0.95)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: '100%', maxWidth: 380, padding: '40px 32px', margin: '0 16px',
            background: outcome === 'won' ? 'rgba(0,255,136,0.07)' : 'rgba(168,85,247,0.07)',
            border: `1px solid ${outcome === 'won' ? 'rgba(0,255,136,0.2)' : 'rgba(168,85,247,0.2)'}`,
            borderRadius: 20,
            display: 'flex', flexDirection: 'column', gap: 20,
            boxShadow: `0 0 80px ${outcome === 'won' ? 'rgba(0,255,136,0.08)' : 'rgba(168,85,247,0.08)'}`,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 10 }}>
                Reflex Chains · Trial
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 900, color: accent, letterSpacing: '0.06em', lineHeight: 1 }}>
                {outcome === 'won' ? 'TRIAL PASSED' : 'SENTINEL WINS'}
              </div>
              <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                {outcome === 'won'
                  ? 'Competitive lobbies unlocked — good luck out there'
                  : "Beat the SENTINEL's score to unlock competitive lobbies"}
              </div>
            </div>

            {playerResult && (
              <div style={{ padding: '0 4px' }}>
                <StatRow label="Your score" value={playerResult.myScore.toLocaleString()} highlight />
                <StatRow label="Bot score" value={BOT_SCORE.toLocaleString()} />
                <StatRow label="Your time" value={fmtTime(playerResult.myTimeMs)} />
                <StatRow label="Targets hit" value={`${playerResult.myHits} / ${NUM_TARGETS}`} />
              </div>
            )}

            {outcome === 'won' ? (
              <button onClick={onComplete} style={{
                padding: '13px', borderRadius: 12,
                border: `1px solid rgba(0,255,136,0.2)`,
                background: 'rgba(0,255,136,0.12)', color: accentWon,
                fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.06em',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                PLAY COMPETITIVE →
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onRetry} style={{
                  flex: 1, padding: '13px', borderRadius: 12,
                  border: `1px solid rgba(168,85,247,0.2)`,
                  background: 'rgba(168,85,247,0.12)', color: accentLost,
                  fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.06em',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  TRY AGAIN
                </button>
                <button onClick={onBack} style={{
                  padding: '13px 20px', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'transparent', color: 'rgba(255,255,255,0.35)',
                  fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.06em',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
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
