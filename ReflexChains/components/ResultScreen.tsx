import { ResultData } from '../types';

interface Props {
  result: ResultData;
  onPlayAgain: () => void;
  solo?: boolean;
}

const NUM_TARGETS = 10;

function fmtTime(ms: number | null) {
  if (ms === null) return '—';
  return (ms / 1000).toFixed(2) + 's';
}

function fmtScore(s: number | null) {
  if (s === null) return '—';
  return s.toLocaleString();
}

export default function ResultScreen({ result, onPlayAgain, solo }: Props) {
  const { won, myTimeMs, myScore, myHits, opponentTimeMs, opponentScore, opponentHits, winnerName } = result;

  const accent   = won ? '#00ff88' : '#ff6b6b';
  const accentDim = won ? 'rgba(0,255,136,0.15)' : 'rgba(255,107,107,0.1)';
  const borderCol = won ? 'rgba(0,255,136,0.2)' : 'rgba(255,107,107,0.15)';
  const glow      = won ? 'rgba(0,255,136,0.12)' : 'rgba(255,107,107,0.08)';

  // ── Shared stat row ──────────────────────────────────────────────────────────
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

  // ── Solo result ──────────────────────────────────────────────────────────────
  if (solo) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(34,211,238,0.05) 0%, transparent 70%), #03030a',
      }}>
        <div style={{
          width: '100%', maxWidth: 420, padding: '44px 40px',
          background: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(34,211,238,0.18)',
          borderRadius: 20,
          display: 'flex', flexDirection: 'column', gap: 28, textAlign: 'center',
          boxShadow: '0 0 80px rgba(34,211,238,0.06)',
        }}>
          {/* Header */}
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(34,211,238,0.5)', textTransform: 'uppercase', marginBottom: 10 }}>
              Solo Practice
            </div>
            <div style={{
              fontSize: '3.2rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg, #22d3ee 0%, #00ff88 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              {fmtScore(myScore)}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', marginTop: 6, letterSpacing: '0.06em' }}>
              points
            </div>
          </div>

          {/* Breakdown */}
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', padding: '16px 20px' }}>
            <StatRow label="Targets hit" value={`${myHits} / ${NUM_TARGETS}`} highlight />
            <StatRow label="Time" value={fmtTime(myTimeMs)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 7 }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
                Score formula
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
                hits×1000 − time/10
              </span>
            </div>
          </div>

          <button
            onClick={onPlayAgain}
            style={{
              width: '100%', padding: '14px',
              background: '#22d3ee', color: '#03030a',
              border: 'none', borderRadius: 12,
              fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.04em',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 0 28px rgba(34,211,238,0.3)',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#38bdf8'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#22d3ee'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            Try Again →
          </button>
          <p style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.15)', margin: 0 }}>
            Ready to beat a real opponent? Hit Find Match.
          </p>
        </div>
      </div>
    );
  }

  // ── Multiplayer result ───────────────────────────────────────────────────────
  const myRow    = { label: 'You',             score: myScore,       hits: myHits,       timeMs: myTimeMs,       winner: won };
  const oppRow   = { label: winnerName || 'Opponent', score: opponentScore, hits: opponentHits, timeMs: opponentTimeMs, winner: !won };
  const rows     = won ? [myRow, oppRow] : [oppRow, myRow];

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `radial-gradient(ellipse 80% 60% at 50% 40%, ${glow} 0%, transparent 70%), #03030a`,
    }}>
      <div style={{
        width: '100%', maxWidth: 460, padding: '44px 40px',
        background: 'rgba(255,255,255,0.025)',
        border: `1px solid ${borderCol}`,
        borderRadius: 20,
        display: 'flex', flexDirection: 'column', gap: 28, textAlign: 'center',
        boxShadow: `0 0 80px ${glow}`,
      }}>

        {/* Banner */}
        <div>
          <div style={{
            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.22em',
            color: won ? 'rgba(0,255,136,0.55)' : 'rgba(255,107,107,0.55)',
            textTransform: 'uppercase', marginBottom: 10,
          }}>
            {won ? 'Victory' : 'Defeated'}
          </div>
          <div style={{
            fontSize: '3rem', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.03em',
            background: won
              ? 'linear-gradient(135deg, #00ff88 0%, #22d3ee 100%)'
              : 'linear-gradient(135deg, #ff6b6b 0%, #fb923c 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {won ? 'YOU WIN' : 'YOU LOSE'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.25)', marginTop: 8, letterSpacing: '0.04em' }}>
            {won ? 'Your score was higher' : `${winnerName} scored higher`}
          </div>
        </div>

        {/* Score comparison */}
        <div style={{ display: 'flex', gap: 10 }}>
          {rows.map((r, i) => (
            <div key={i} style={{
              flex: 1, padding: '18px 14px', borderRadius: 14, textAlign: 'center',
              background: r.winner ? accentDim : 'rgba(255,255,255,0.02)',
              border: `1px solid ${r.winner ? borderCol : 'rgba(255,255,255,0.06)'}`,
            }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>
                {r.label}
              </div>
              {/* Score */}
              <div style={{
                fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                color: r.winner ? accent : 'rgba(255,255,255,0.55)',
              }}>
                {fmtScore(r.score)}
              </div>
              <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em', marginTop: 3, marginBottom: 12 }}>
                pts
              </div>
              {/* Hits bar */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: 8 }}>
                {Array.from({ length: NUM_TARGETS }, (_, j) => (
                  <div key={j} style={{
                    width: 6, height: 6, borderRadius: 2,
                    background: j < (r.hits ?? 0) ? (r.winner ? accent : 'rgba(255,255,255,0.4)') : 'rgba(255,255,255,0.08)',
                  }} />
                ))}
              </div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
                {r.hits ?? '?'}/{NUM_TARGETS} hits · {fmtTime(r.timeMs)}
              </div>
            </div>
          ))}
        </div>

        {/* Formula hint */}
        <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.15)', letterSpacing: '0.06em', marginTop: -10 }}>
          Score = hits × 1000 − time_ms / 10 · Wild misses add +0.2s penalty
        </div>

        <button
          onClick={onPlayAgain}
          style={{
            width: '100%', padding: '15px',
            background: accent, color: '#03030a',
            border: 'none', borderRadius: 12,
            fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.04em',
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: `0 0 32px ${won ? 'rgba(0,255,136,0.3)' : 'rgba(255,107,107,0.2)'}`,
            transition: 'all 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          Play Again →
        </button>
      </div>
    </div>
  );
}
