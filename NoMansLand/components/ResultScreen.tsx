import { ResultData } from '../types';

interface Props {
  result: ResultData;
  playerName: string;
  solo: boolean;
  onPlayAgain: () => void;
}

function fmt(ms: number | null) {
  if (ms === null) return '—';
  return (ms / 1000).toFixed(2) + 's';
}

export default function ResultScreen({ result, playerName, solo, onPlayAgain }: Props) {
  const { won, draw, myTimeMs, opponentTimeMs, winnerName } = result;

  let headline: string;
  let headlineColor: string;
  let sub: string;

  if (solo) {
    if (myTimeMs !== null) {
      headline = 'CROSSED';
      headlineColor = '#00ff88';
      sub = 'You made it across No Man\'s Land';
    } else {
      headline = 'K.I.A.';
      headlineColor = '#ff3333';
      sub = 'You didn\'t make it — try again';
    }
  } else if (draw) {
    headline = 'DRAW';
    headlineColor = '#ffaa00';
    sub = 'Both soldiers fell in No Man\'s Land';
  } else if (won) {
    headline = 'VICTORY';
    headlineColor = '#00ff88';
    sub = 'First to the enemy trench';
  } else {
    headline = 'DEFEATED';
    headlineColor = '#ff3333';
    sub = myTimeMs === null ? 'You were cut down in No Man\'s Land' : `${winnerName} crossed first`;
  }

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#03030a', gap: 0,
    }}>
      <div style={{
        fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.3em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 24,
      }}>
        No Man's Land · Result
      </div>

      <div style={{
        fontSize: 'clamp(2.4rem, 8vw, 4rem)', fontWeight: 900,
        letterSpacing: '0.1em', color: headlineColor,
        textShadow: `0 0 60px ${headlineColor}55`,
        marginBottom: 8,
      }}>
        {headline}
      </div>
      <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)', marginBottom: 36 }}>
        {sub}
      </div>

      {/* Time cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 36 }}>
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: `1px solid ${won || (solo && myTimeMs !== null) ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 12, padding: '18px 28px', textAlign: 'center', minWidth: 120,
        }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
            {solo ? 'Your Time' : playerName}
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: myTimeMs !== null ? '#fff' : '#ff3333', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
            {myTimeMs !== null ? fmt(myTimeMs) : 'KIA'}
          </div>
        </div>

        {!solo && (
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07) 1px solid',
            borderRadius: 12, padding: '18px 28px', textAlign: 'center', minWidth: 120,
          }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
              Opponent
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'rgba(255,255,255,0.6)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {opponentTimeMs !== null ? fmt(opponentTimeMs) : 'KIA'}
            </div>
          </div>
        )}
      </div>

      <button onClick={onPlayAgain} style={{
        padding: '13px 40px', borderRadius: 10, border: 'none',
        background: headlineColor, color: headlineColor === '#ff3333' ? '#fff' : '#000',
        fontSize: '0.88rem', fontWeight: 800, letterSpacing: '0.04em',
        cursor: 'pointer', fontFamily: 'inherit',
        boxShadow: `0 0 28px ${headlineColor}44`,
        transition: 'all 0.15s',
      }}>
        Play Again →
      </button>
    </div>
  );
}
