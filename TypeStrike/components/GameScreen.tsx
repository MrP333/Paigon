import { useRef, useState, useEffect, useMemo } from 'react';
import { Socket } from 'socket.io-client';
import { GameConfig, ResultData } from '../types';

// ── Passage library ────────────────────────────────────────────────────────────

const PASSAGES = [
  "the wind moved through the empty streets, carrying the smell of rain and old wood. somewhere in the distance, a dog barked twice and then went quiet again.",
  "she opened the window and looked out at the grey morning sky. the city was just waking up, and the first buses were already moving along the wide avenue below.",
  "the coffee had gone cold on the table while he read. outside the rain fell steadily, tapping against the glass in a rhythm that matched his slow turning of pages.",
  "they walked along the river path without speaking. the water was low from the dry summer, and stones that were usually hidden lay exposed along the muddy banks.",
  "the light in the hallway flickered twice before going out. she stood still in the dark for a moment, listening, then reached for the switch on the wall beside her.",
  "he had been waiting for nearly an hour when the train finally arrived. it was half empty, and he found a window seat without any trouble and settled in for the ride.",
  "the market was crowded that morning, with vendors calling out from every direction. she moved through the crowd slowly, checking each stall before making up her mind.",
  "a thick fog had rolled in overnight, covering the valley in a white blanket that muffled all sound. even the birds seemed to be waiting for the morning to clear.",
  "the book had been sitting on her shelf for three years before she finally picked it up. by the end of the first chapter, she already knew she would finish it tonight.",
  "the path through the forest was narrow and covered in fallen leaves. he walked carefully, keeping one eye on the trail and the other on the sky through the branches.",
  "she had never been good with silence, but she was learning. sitting on the back porch each evening, watching the light fade, was becoming something she looked forward to.",
  "the old clock on the mantle had stopped working years ago, but no one had ever removed it. it still felt important somehow, standing there among the photographs.",
  "the water in the bay was perfectly still that evening. a single boat moved slowly across the surface, leaving a thin white line that disappeared behind it as it went.",
  "he made coffee every morning at exactly the same time. it was one of the few constants left in his life, and he guarded it carefully against any kind of interruption.",
  "the letter had arrived three days ago, but she still had not opened it. it sat on the kitchen counter, slightly wrinkled from when she had almost thrown it away.",
  "they stayed up talking until the early hours, covering everything from childhood memories to plans they would probably never follow through on. it felt good anyway.",
  "the field behind the house had been empty for as long as anyone could remember. then one spring, without any explanation, flowers started growing along the far edge.",
  "she learned to drive on a flat road that ran through the middle of nowhere. her father sat beside her, calm and quiet, and she had never forgotten how patient he was.",
  "the restaurant was nearly empty when they arrived, but by the time their food came, every table had filled up around them and the noise had risen to a comfortable hum.",
  "he kept a small notebook in his jacket pocket and wrote things down whenever they occurred to him. most of it was useless, but occasionally something turned out to matter.",
  "the tide was coming in as they walked along the shore. they had to move up the beach every few minutes to stay ahead of the water, which neither of them minded.",
  "she found the key behind a loose brick near the back door, exactly where the note said it would be. the lock was stiff, but the door opened without any real trouble.",
  "the drive home took twice as long as usual because of the roadwork on the main route. he did not mind. the detour took him past roads he had not seen in years.",
  "it had rained for four days straight, turning the garden into a shallow lake. on the fifth morning she opened the curtains to blue sky and went straight outside.",
  "the library was almost always empty in the afternoons. he liked it that way. the silence felt different there than it did at home, more deliberate, easier to think in.",
  "they had agreed to meet at the bench by the fountain at noon. she arrived five minutes early and sat watching the pigeons until she heard footsteps on the gravel behind her.",
  "the power went out just as the film was reaching its end. they sat in the dark for a moment, laughing, then found candles in the drawer and moved to the kitchen.",
  "he pressed his hand flat against the old wall and tried to imagine all the years that had passed inside it. the stone was cool and rough and said nothing back to him.",
  "she noticed the cat sitting in the window of the apartment across the street every morning. it never seemed to move, just watched everything with a calm, steady gaze.",
  "the snow had started falling sometime in the night, and by morning the whole world outside looked different. quieter. softer. like a room someone had carefully tidied.",
  "he opened the box carefully, unsure what to expect. inside was a collection of small objects wrapped in cloth, each one obviously chosen with a great deal of thought.",
  "the road curved sharply to the left just past the old bridge. she knew this and slowed down early, which was why she was able to stop in time when the deer appeared.",
  "they sat on the roof of the building as the city went dark beneath them. one by one the lights came on in the apartments below, and they watched until it was too cold to stay.",
  "the bakery opened at six, and the smell reached the end of the block by half past. she always timed her morning walk to arrive just as the first loaves were coming out.",
  "he had not meant to stay so long, but the conversation kept finding new directions. by the time he looked at the clock, three hours had passed without him noticing.",
  "the old radio on the kitchen shelf still worked if you tuned it just right and did not move too quickly around the room. she turned it on every morning while she cooked.",
  "a single leaf fell from the tree and landed in the middle of the path. she stepped around it carefully, which she knew was slightly ridiculous but did anyway.",
  "the interview had gone better than she expected. walking back to the car in the cool afternoon air, she allowed herself a small moment of cautious optimism.",
  "he left the city every summer for two weeks and went somewhere with no plan. the lack of structure used to bother him. now it was the thing he looked forward to most.",
  "the paint on the ceiling was peeling in one corner of the room. she had meant to fix it for months and kept putting it off. today she finally got the ladder out.",
  "the village was so small that the road through it was also the main street. there was a post office, a general store, and a bench outside that always seemed to be occupied.",
  "she folded the map carefully and put it back in her bag. she had not needed it in the end, but having it there had made the walk feel less uncertain from the start.",
  "the morning light came through the curtains at an angle that crossed the floor and climbed the opposite wall. he lay still and watched it move as the sun came up higher.",
  "the cafe had been there for decades, long enough that the regulars had become part of the furniture. everyone knew everyone, and the owner remembered every usual order.",
  "they had promised to write, but neither of them had. years later, running into each other by accident, they picked up the conversation as if no time had passed at all.",
  "she sat in the garden until the last of the light was gone. the evenings had been getting longer, and she had started to think of this hour as belonging entirely to her.",
  "the notes he had made in the margin of the book were so small that she had to tilt it toward the lamp to read them. she was not sure she agreed, but they made her think.",
  "the harbour was quiet at that hour, with only a few boats moving slowly toward the open water. he stood at the end of the pier and watched until they disappeared.",
  "she had packed light on purpose, wanting to feel like she could change direction at any moment. the bag on her shoulder was the right weight for that kind of freedom.",
  "the afternoon moved slowly, which was exactly what he had wanted. he sat on the steps with a cold drink and watched the street and did not feel the need to be anywhere else.",
];

// ── Seeded RNG ─────────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function getPassage(roomCode: string): string {
  const rng = mulberry32(hashCode(roomCode));
  return PASSAGES[Math.floor(rng() * PASSAGES.length)];
}

function calcWpm(charsTyped: number, elapsedMs: number): number {
  if (elapsedMs <= 0 || charsTyped <= 0) return 0;
  return Math.round((charsTyped / 5) / (elapsedMs / 60000));
}

// ── CSS ────────────────────────────────────────────────────────────────────────

const CSS = `
@keyframes ts-cursor-blink { 0%,100%{opacity:1} 50%{opacity:0} }
@keyframes ts-countdown-pop { 0%{transform:scale(1.8);opacity:0} 40%{transform:scale(.92);opacity:1} 100%{transform:scale(1);opacity:1} }
@keyframes ts-go-burst { 0%{transform:scale(.5);opacity:0;filter:brightness(3)} 45%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1;filter:brightness(1)} }
@keyframes ts-shake { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-7px)} 30%{transform:translateX(7px)} 45%{transform:translateX(-4px)} 60%{transform:translateX(4px)} 80%{transform:translateX(-2px)} }
@keyframes ts-finish-pulse { 0%,100%{opacity:.6} 50%{opacity:1;filter:brightness(1.3)} }
@keyframes ts-blob-a { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-30px,25px) scale(1.15)} }
@keyframes ts-blob-b { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(28px,-20px) scale(.87)} }
.ts-cursor {
  display: inline-block;
  width: 2px;
  height: 1.1em;
  background: #00ff88;
  margin-left: 1px;
  vertical-align: text-bottom;
  border-radius: 1px;
  box-shadow: 0 0 8px #00ff88;
  animation: ts-cursor-blink .9s ease-in-out infinite;
}
.ts-cursor--err {
  background: #ff4444;
  box-shadow: 0 0 8px #ff4444;
}
.ts-shake { animation: ts-shake .38s ease-in-out; }
`;

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  config: GameConfig;
  socket: Socket;
  onResult: (r: ResultData) => void;
}

export default function GameScreen({ config, socket, onResult }: Props) {
  const passage = useMemo(() => getPassage(config.roomCode), [config.roomCode]);

  // Refs for keydown handler (avoids stale closures)
  const currentPosRef    = useRef(0);
  const errorDepthRef    = useRef(0);   // how many wrong chars are stacked on top of currentPos
  const totalErrorsRef   = useRef(0);
  const finishedRef      = useRef(false);
  const startTimeRef     = useRef(0);
  const keystampsRef     = useRef<number[]>([]);
  const errorStartRef    = useRef<number | null>(null); // when we entered error state
  const totalErrorTimeRef = useRef(0);                  // cumulative ms spent in error state
  const passageBoxRef    = useRef<HTMLDivElement>(null);

  // State for display
  const [displayPos,        setDisplayPos]        = useState(0);
  const [displayErrorDepth, setDisplayErrorDepth] = useState(0);
  const [liveWpm,           setLiveWpm]           = useState(0);
  const [countdown,         setCountdown]         = useState<number | string>(3);
  const [gameStarted,       setGameStarted]       = useState(false);
  const [finished,          setFinished]          = useState(false);

  // socketId → { name, color, pos }
  const [opponentProgress, setOpponentProgress] = useState<Record<string, { name: string; color: string; pos: number }>>({});

  useEffect(() => {
    if (document.getElementById('ts-game-css')) return;
    const el = document.createElement('style'); el.id = 'ts-game-css'; el.textContent = CSS;
    document.head.appendChild(el);
  }, []);

  // ── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const steps: (number | string)[] = [3, 2, 1, 'GO!'];
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      setCountdown(steps[i]);
      i++;
      if (i < steps.length) {
        t = setTimeout(tick, 1000);
      } else {
        t = setTimeout(() => {
          setCountdown('');
          setGameStarted(true);
          startTimeRef.current = Date.now();
        }, 600);
      }
    };
    t = setTimeout(tick, 600);
    return () => clearTimeout(t);
  }, []);

  // ── Live WPM (pauses during error time) ───────────────────────────────────
  useEffect(() => {
    if (!gameStarted || finished) return;
    const iv = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      if (elapsed > 0) {
        const ongoingErr = errorStartRef.current ? Date.now() - errorStartRef.current : 0;
        const effectiveMs = Math.max(1, elapsed - totalErrorTimeRef.current - ongoingErr);
        setLiveWpm(calcWpm(currentPosRef.current, effectiveMs));
      }
    }, 400);
    return () => clearInterval(iv);
  }, [gameStarted, finished]);

  // ── Socket listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    if (config.solo) return;

    const handleProgress = (data: { socketId: string; name: string; color: string; position: number }) => {
      setOpponentProgress(prev => ({ ...prev, [data.socketId]: { name: data.name, color: data.color, pos: data.position } }));
    };

    const handleResult = (data: { winnerId: string | null; players: Array<{ socketId: string; rank: number; name: string; color: string; wpm: number; accuracy: number; finishMs: number | null; won: boolean }> }) => {
      const myEntry = data.players.find(p => p.socketId === socket.id);
      onResult({
        won: myEntry?.won ?? false,
        myWpm: myEntry?.wpm ?? 0,
        myAccuracy: myEntry?.accuracy ?? 0,
        myFinishMs: myEntry?.finishMs ?? null,
        players: data.players.map(p => ({
          rank: p.rank,
          name: p.name,
          color: p.color,
          wpm: p.wpm,
          accuracy: p.accuracy,
          finishMs: p.finishMs,
          won: p.won,
          isMe: p.socketId === socket.id,
        })),
      });
    };

    socket.on('type:opponent-progress', handleProgress);
    socket.on('type:result', handleResult);
    return () => {
      socket.off('type:opponent-progress', handleProgress);
      socket.off('type:result', handleResult);
    };
  }, [socket, config.solo, onResult]);

  // ── Keydown handler ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameStarted) return;

    const IGNORE = new Set([
      'Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock', 'Enter',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape',
      'Home', 'End', 'PageUp', 'PageDown', 'Insert',
      'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
    ]);

    const triggerShake = () => {
      const el = passageBoxRef.current;
      if (!el) return;
      el.classList.remove('ts-shake');
      void el.offsetHeight; // force reflow so animation restarts
      el.classList.add('ts-shake');
      el.addEventListener('animationend', () => el.classList.remove('ts-shake'), { once: true });
    };

    const handleKey = (e: KeyboardEvent) => {
      if (finishedRef.current) return;
      if (IGNORE.has(e.key)) return;

      // Keystroke rate limit (>15/second = bot)
      const now = Date.now();
      keystampsRef.current = keystampsRef.current.filter(t => now - t < 1000);
      keystampsRef.current.push(now);
      if (keystampsRef.current.length > 15) return;

      if (e.key === 'Backspace') {
        e.preventDefault();
        if (errorDepthRef.current > 0) {
          errorDepthRef.current--;
          setDisplayErrorDepth(errorDepthRef.current);
          // If all errors cleared, record the time spent in error state
          if (errorDepthRef.current === 0 && errorStartRef.current !== null) {
            totalErrorTimeRef.current += Date.now() - errorStartRef.current;
            errorStartRef.current = null;
          }
        }
        return;
      }

      if (e.key.length !== 1) return;

      const curPos = currentPosRef.current;
      const errDepth = errorDepthRef.current;

      // ── Already in error state: stack another error (up to passage end) ──
      if (errDepth > 0) {
        if (curPos + errDepth < passage.length) {
          errorDepthRef.current++;
          totalErrorsRef.current++;
          setDisplayErrorDepth(errorDepthRef.current);
        }
        triggerShake();
        return;
      }

      // ── No errors: check character ──
      if (curPos >= passage.length) return;

      if (e.key === passage[curPos]) {
        const newPos = curPos + 1;
        currentPosRef.current = newPos;
        setDisplayPos(newPos);

        if (!config.solo && newPos % 10 === 0) {
          socket.emit('type:progress', { roomCode: config.roomCode, position: newPos });
        }

        if (newPos === passage.length) {
          const totalMs = Date.now() - startTimeRef.current;
          const ongoingErr = errorStartRef.current ? Date.now() - errorStartRef.current : 0;
          const effectiveMs = Math.max(1, totalMs - totalErrorTimeRef.current - ongoingErr);
          finishedRef.current = true;
          setFinished(true);
          const finalWpm = calcWpm(newPos, effectiveMs);
          const accuracy = totalErrorsRef.current > 0
            ? Math.round(newPos / (newPos + totalErrorsRef.current) * 100)
            : 100;

          if (config.solo) {
            onResult({
              won: true,
              myWpm: finalWpm,
              myAccuracy: accuracy,
              myFinishMs: totalMs,
              players: [{
                rank: 1,
                name: config.playerName,
                color: config.playerColor,
                wpm: finalWpm,
                accuracy,
                finishMs: totalMs,
                won: true,
                isMe: true,
              }],
            });
          } else {
            socket.emit('type:finish', {
              roomCode: config.roomCode,
              totalTimeMs: totalMs,
              wpm: finalWpm,
              accuracy,
            });
          }
        }
      } else {
        // Wrong character — enter error state
        errorDepthRef.current = 1;
        totalErrorsRef.current++;
        if (errorStartRef.current === null) {
          errorStartRef.current = Date.now();
        }
        setDisplayErrorDepth(1);
        triggerShake();
      }
    };

    const handlePaste = (e: ClipboardEvent) => e.preventDefault();

    document.addEventListener('keydown', handleKey);
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('paste', handlePaste);
    };
  }, [gameStarted, passage, config, socket, onResult]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const accuracy = totalErrorsRef.current > 0
    ? Math.round(displayPos / (displayPos + totalErrorsRef.current) * 100)
    : 100;

  const errEnd = displayPos + displayErrorDepth;

  const myPct = passage.length > 0 ? displayPos / passage.length : 0;

  const opponentBars = Object.entries(opponentProgress).map(([sid, p]) => ({
    socketId: sid,
    name: p.name,
    color: p.color,
    pct: Math.min(1, p.pos / passage.length),
  }));

  const allBars = [
    { name: config.playerName, color: config.playerColor, pct: myPct, isMe: true },
    ...opponentBars.map(b => ({ ...b, isMe: false })),
  ];

  return (
    <div
      style={{
        width: '100%', height: '100%',
        background: '#08080f',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Space Grotesk', sans-serif",
        position: 'relative', overflow: 'hidden',
        userSelect: 'none',
      }}
      tabIndex={0}
    >
      <style>{CSS}</style>

      {/* Background blobs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '10%', left: '15%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,255,136,.07) 0%, transparent 70%)', filter: 'blur(60px)', animation: 'ts-blob-a 14s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '15%', right: '10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,.05) 0%, transparent 70%)', filter: 'blur(60px)', animation: 'ts-blob-b 17s ease-in-out infinite' }} />
      </div>

      {/* ── Back link ── */}
      <a href="/" target="_top" style={{ position: 'absolute', top: 18, left: 20, zIndex: 10, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.25)', textDecoration: 'none', fontFamily: 'inherit' }}
        onMouseOver={e => (e.currentTarget.style.color = 'rgba(255,255,255,.55)')}
        onMouseOut={e  => (e.currentTarget.style.color = 'rgba(255,255,255,.25)')}>
        ← Paigon
      </a>

      {/* ── Stats bar ── */}
      <div style={{ position: 'absolute', top: 16, right: 20, display: 'flex', gap: 16, zIndex: 10, alignItems: 'center' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#00ff88', letterSpacing: '0.04em' }}>
          {liveWpm} <span style={{ fontWeight: 600, color: 'rgba(255,255,255,.35)', fontSize: '0.65rem' }}>WPM</span>
        </div>
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'rgba(255,255,255,.55)', letterSpacing: '0.04em' }}>
          {accuracy}<span style={{ fontWeight: 600, color: 'rgba(255,255,255,.25)', fontSize: '0.65rem' }}>%</span>
        </div>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,.25)', letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>
          {displayPos}<span style={{ fontSize: '0.6rem' }}>/{passage.length}</span>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 760, padding: '0 32px', display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* Game label */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(0,255,136,.4)', marginBottom: 4 }}>TypeStrike</div>
          {!config.solo && (
            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,.2)', letterSpacing: '0.04em' }}>
              vs {config.opponents?.map(o => o.name).join(', ') || config.opponentName}
            </div>
          )}
        </div>

        {/* ── Passage display ── */}
        <div
          ref={passageBoxRef}
          style={{
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: 'clamp(1.05rem, 2.2vw, 1.35rem)',
            lineHeight: 1.85,
            letterSpacing: '0.03em',
            wordSpacing: '0.15em',
            wordBreak: 'break-word',
            position: 'relative',
            padding: '28px 32px',
            background: 'rgba(255,255,255,.02)',
            border: '1px solid rgba(255,255,255,.07)',
            borderRadius: 16,
            boxShadow: finished ? '0 0 0 1.5px rgba(0,255,136,.3), 0 0 32px rgba(0,255,136,.12)' : 'none',
            transition: 'box-shadow 0.4s',
          }}
        >
          {Array.from(passage).map((ch, i) => {
            const isCorrect = i < displayPos;
            const isError   = i >= displayPos && i < errEnd;
            const isCursor  = i === errEnd && !finished;

            const color = isCorrect
              ? '#00ff88'
              : isError
                ? '#ff4444'
                : isCursor
                  ? 'rgba(255,255,255,0.9)'
                  : 'rgba(255,255,255,0.3)';

            const bg = isError
              ? 'rgba(255,68,68,0.18)'
              : isCursor
                ? 'rgba(255,255,255,0.1)'
                : 'transparent';

            return (
              <span
                key={i}
                style={{
                  color,
                  background: bg,
                  borderRadius: isError || isCursor ? 3 : 0,
                  transition: 'color 0.06s',
                  position: 'relative',
                  textShadow: isCorrect ? '0 0 10px rgba(0,255,136,.35)' : 'none',
                }}
              >
                {ch}
                {isCursor && (
                  <span className={`ts-cursor${displayErrorDepth > 0 ? ' ts-cursor--err' : ''}`} />
                )}
              </span>
            );
          })}
        </div>

        {/* ── Progress bars ── */}
        {!config.solo && allBars.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.57rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.2)', marginBottom: 2 }}>Progress</div>
            {allBars.map((bar, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: bar.color, flexShrink: 0, boxShadow: bar.isMe ? `0 0 8px ${bar.color}` : 'none' }} />
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${bar.pct * 100}%`,
                    background: bar.isMe
                      ? `linear-gradient(90deg, ${bar.color}cc, ${bar.color})`
                      : bar.color,
                    borderRadius: 99,
                    transition: 'width 0.2s ease',
                    boxShadow: bar.isMe ? `0 0 12px ${bar.color}88` : 'none',
                  }} />
                </div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: bar.isMe ? bar.color : 'rgba(255,255,255,.35)', minWidth: 60, textAlign: 'right', letterSpacing: '0.02em' }}>
                  {bar.name}{bar.isMe ? ' (you)' : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Waiting message after finish ── */}
        {finished && !config.solo && (
          <div style={{ textAlign: 'center', fontSize: '0.82rem', color: 'rgba(0,255,136,.65)', letterSpacing: '0.06em', fontWeight: 600, animation: 'ts-finish-pulse 1.6s ease-in-out infinite' }}>
            Finished — waiting for other players…
          </div>
        )}

        {/* ── Solo hint ── */}
        {!gameStarted && config.solo && (
          <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'rgba(255,255,255,.2)', letterSpacing: '0.04em' }}>
            Practice run — no opponents
          </div>
        )}
      </div>

      {/* ── Countdown overlay ── */}
      {!gameStarted && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(8,8,15,.75)',
          backdropFilter: 'blur(6px)',
          flexDirection: 'column', gap: 16,
        }}>
          <div style={{
            fontSize: 'clamp(5rem, 14vw, 9rem)',
            fontWeight: 900,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: countdown === 'GO!' ? '#00ff88' : '#ffffff',
            textShadow: countdown === 'GO!'
              ? '0 0 60px rgba(0,255,136,.8), 0 0 120px rgba(0,255,136,.4)'
              : '0 0 40px rgba(255,255,255,.2)',
            animation: countdown === 'GO!' ? 'ts-go-burst .5s cubic-bezier(.22,1,.36,1) both' : 'ts-countdown-pop .3s cubic-bezier(.22,1,.36,1) both',
          }} key={String(countdown)}>
            {countdown}
          </div>
          <div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.2)' }}>
            {countdown === 'GO!' ? 'Type!' : 'Get ready'}
          </div>
        </div>
      )}
    </div>
  );
}
