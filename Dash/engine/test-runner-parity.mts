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
  if (!rowsEq || !tokEq || !swayEq) { bad++; console.log(`FAIL course ${code} rows=${rowsEq} tokens=${tokEq} sway=${swayEq}`); }
}
console.log(`course generation: ${bad===0?'identical across 6 codes':'MISMATCH'}  (rows/tokens/sway)`);

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
console.log(bad===0 ? '\nSERVER CAN REPRODUCE A RUN EXACTLY' : `\n${bad} FAILURES`);
