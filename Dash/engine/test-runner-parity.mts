const TS_C = await import('./RunnerCourse.ts');
const TS_P = await import('./RunnerPhysics.ts');
const CJS: any = (await import('../../MazerGame/server/runner.cjs')).default;

const mul=(a:number)=>()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
let bad = 0;

// 1 ── course generation must be identical
for (const code of ['ROOM1','7FYXG','TDN64','SOLO_PRACTICE','zz','A']) {
  const a: any = TS_C.generateRun(code);
  const b: any = CJS.generateRun(code);
  const rowsEq = JSON.stringify(a.rows) === JSON.stringify(b.rows);
  const tokEq  = JSON.stringify(a.tokens) === JSON.stringify(b.tokens);
  const swayEq = JSON.stringify(a.sway) === JSON.stringify(b.sway);
  // Closures come off their own PRNG stream, so they can drift without moving a
  // single row — and a lane shut on one side only would reject honest runs.
  const closEq = JSON.stringify(a.closures) === JSON.stringify(b.closures);
  if (!rowsEq || !tokEq || !swayEq || !closEq) {
    bad++;
    console.log(`FAIL course ${code} rows=${rowsEq} tokens=${tokEq} sway=${swayEq} closures=${closEq}`);
  }
}
console.log(`course generation: ${bad===0?'identical across 6 codes':'MISMATCH'}  (rows/tokens/sway/closures)`);

// 1b ── the middle lane must NEVER close, and parity cannot see this.
//
// Parity only proves TS and CJS agree. If a change let the middle lane close on
// both sides they would agree perfectly and every other check would still pass,
// while the track silently split into two corridors that cannot reach each other
// — crossing a shut lane is itself contact, and rowIsFair only checks whether a
// lane change fits in the time, never whether the path crosses something closed.
// That is the single most important invariant of the feature, so it is asserted
// rather than left to a comment.
{
  const MID = (TS_C.LANES - 1) / 2;
  let offenders = 0, seen = 0;
  for (let i = 0; i < 400; i++) {
    for (const c of (TS_C.generateRun('INV' + i) as any).closures) {
      seen++;
      if (c.lane !== 0 && c.lane !== TS_C.LANES - 1) offenders++;
      if (c.z1 <= c.z0) offenders++;
    }
  }
  if (offenders) { bad++; console.log(`FAIL ${offenders} closures on a middle lane or of zero length (mid=${MID})`); }
  console.log(`closure invariant  : ${seen} closures, ${offenders === 0 ? 'all on outer lanes' : 'VIOLATED'}`);
}

// 2 ── replaying the same trace must give bit-identical state
function makeTrace(seed:number, n:number) {
  const rng = mul(seed); const out: [number,number][] = [];
  let step = 0;
  for (let i=0;i<n;i++){ step += 20 + Math.floor(rng()*160); if (step >= CJS.TOTAL_STEPS) break;
    out.push([step, rng() < 0.5 ? -1 : 1]); }
  return out;
}
let worst = 0, cases = 0;
for (const code of ['ROOM1','7FYXG','TDN64']) {
  for (let t=0;t<40;t++) {
    const trace = makeTrace(t*31+7, 300);
    // TS side: drive the same inputs through the TS step()
    const s: any = TS_P.initialState();
    const course: any = TS_C.generateRun(code);
    let ti=0;
    for (let i=0;i<CJS.TOTAL_STEPS && !s.finished;i++){
      let steer=0; while(ti<trace.length && trace[ti][0]===i){steer=trace[ti][1];ti++;}
      TS_P.step(course, s, { steer: steer as -1|0|1 });
    }
    const r: any = CJS.replay(code, trace);
    cases++;
    const dz = Math.abs(s.z - r.z);
    worst = Math.max(worst, dz);
    if (s.tokens !== r.tokens || s.crashes !== r.crashes || dz > 0) {
      bad++;
      console.log(`FAIL ${code} trace ${t}: tokens ${s.tokens}/${r.tokens} crashes ${s.crashes}/${r.crashes} dz ${dz}`);
    }
  }
}
console.log(`replay parity: ${cases} traces, worst |dz| = ${worst}  ${worst===0&&bad===0?'BIT IDENTICAL':'MISMATCH'}`);

// 3 ── plausibility gate
const T = CJS.traceIsPlausible;
const checks: [string, any, boolean][] = [
  ['valid trace',        makeTrace(3,200),                    true],
  ['non-monotonic',      [[500,1],[10,-1]],                   false],
  ['step out of range',  [[CJS.TOTAL_STEPS+5,1]],             false],
  ['bad direction',      [[10,2]],                            false],
  ['malformed',          [[10]],                              false],
  ['autoclicker burst',  Array.from({length:40},(_,i)=>[100+i,1]), false],
  ['not an array',       'nope',                              false],
];
for (const [name, tr, want] of checks) {
  const got = T(tr).ok;
  if (got !== want) { bad++; console.log(`FAIL gate "${name}" expected ${want} got ${got}`); }
}
console.log(`plausibility gate: ${checks.length} cases ${bad===0?'all correct':'FAILURES'}`);

// ── Constant drift ───────────────────────────────────────────────────────────
// The two implementations diverged once on a single literal — a betrayal
// probability of 0.22 against 0.34 — and every other check still passed until
// the course comparison caught it three steps later. Compare the numbers
// directly so a drift names itself.
{
  const fs = await import('fs');
  const KEYS = ['TOKEN_SPACING','MIN_GAP','EASY_GAP','RESET_SPEED','SPEED_CAP',
    'CEILING_WINDOW_S','CEILING_LOOKAHEAD','RAMP_FULL_Z','CHARGE_RATE',
    'CONTACT_RETAIN','START_CLEAR','LANE_W','LANE_CHANGE_S','REACT_MARGIN_S',
    'PLAYER_HALF','CONTACT_IMMUNE_S','RACE_MS','LANES',
    'CLOSURE_MIN_LEN','CLOSURE_MAX_LEN','CLOSURE_OPEN_MIN','CLOSURE_OPEN_MAX',
    'CLOSURE_START_Z','CLOSURE_LEAD'];
  const tsSrc = fs.readFileSync(new URL('./RunnerCourse.ts', import.meta.url), 'utf8')
              + fs.readFileSync(new URL('./RunnerPhysics.ts', import.meta.url), 'utf8');
  const cjSrc = fs.readFileSync(new URL('../../MazerGame/server/runner.cjs', import.meta.url), 'utf8');
  const val = (src: string, k: string) => {
    const m = new RegExp(`\\b${k}\\s*=\\s*([0-9_.]+)`).exec(src);
    return m ? m[1].replace(/_/g, '') : null;
  };
  let drift = 0;
  for (const k of KEYS) {
    const a = val(tsSrc, k), b = val(cjSrc, k);
    if (a !== b) { drift++; console.log(`FAIL constant ${k}: TS ${a} vs CJS ${b}`); }
  }
  const pa = (tsSrc.match(/rng\(\) [<>] [0-9.]+/g) ?? []).join(',');
  const pb = (cjSrc.match(/rng\(\) [<>] [0-9.]+/g) ?? []).join(',');
  if (pa !== pb) { drift++; console.log(`FAIL rng thresholds: TS [${pa}] vs CJS [${pb}]`); }
  console.log(`shared constants   : ${KEYS.length} checked, ${drift === 0 ? 'all aligned' : drift + ' DRIFTED'}`);
  if (drift) bad++;
}

console.log(bad===0 ? '\nSERVER CAN REPRODUCE A RUN EXACTLY' : `\n${bad} FAILURES`);
