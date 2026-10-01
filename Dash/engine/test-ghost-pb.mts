(globalThis as any).localStorage = (() => { const m=new Map<string,string>(); return {
  get length(){return m.size;}, key:(i:number)=>[...m.keys()][i]??null,
  getItem:(k:string)=>m.get(k)??null, setItem:(k:string,v:string)=>{m.set(k,v);},
  removeItem:(k:string)=>{m.delete(k);}, clear:()=>m.clear(), }; })();
const C = await import('./RunnerCourse.ts');
const P = await import('./RunnerPhysics.ts');
const PB = await import('./RunnerPB.ts');
const { generateRun } = C; const { initialState, step, safeLanes, FIXED_DT } = P;
const mul=(a:number)=>()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};

function play(course:any, lat:number, trial:number) {
  const s:any=initialState(); let target=s.laneTarget; const q:number[]=[]; const rng=mul(trial*7919+13);
  const delay=Math.max(1,Math.round(lat/FIXED_DT)); let dr=-1,cm:number|null=null;
  const trace:[number,number][]=[]; let stepNo=0;
  while(!s.finished){ const r=course.rows[s.rowCursor];
    if(r&&s.rowCursor!==dr){ dr=s.rowCursor; cm=null; const ok=safeLanes(r);
      if(ok.length){ let pick=ok.reduce((a:number,b:number)=>Math.abs(b-target)<Math.abs(a-target)?b:a);
        if(rng()<0.05){const bad=[0,1,2].filter(l=>!ok.includes(l)); cm=bad.length?bad[0]:pick;} else cm=pick; } }
    const want=cm!==null?cm:target; q.push(want);
    const acted=q.length>delay?q[q.length-1-delay]:target;
    const steer=acted>target?1:acted<target?-1:0;
    if(steer!==0) trace.push([stepNo, steer]);
    step(course,s,{steer:steer as -1|0|1}); if(steer!==0) target=Math.round(s.laneTarget);
    stepNo++; }
  return {s, trace};
}

let bad=0;
// 1 — a stored trace must reproduce the run it came from, exactly
for (const code of ['SEED1','SEED2','SEED3']) {
  const course:any = generateRun(code);
  const orig = play(course, 0.25, 7);
  // replay the trace the way GhostRider does
  const g:any = initialState(); let cur=0;
  for (let i=0;!g.finished;i++){ let steer:any=0;
    while(cur<orig.trace.length && orig.trace[cur][0]===i){ steer=orig.trace[cur][1]; cur++; }
    step(course,g,{steer}); }
  const ok = g.tokens===orig.s.tokens && g.crashes===orig.s.crashes && Math.abs(g.z-orig.s.z)<1e-9;
  if(!ok) bad++;
  console.log(`${ok?'ok  ':'FAIL'} ${code}  live ${orig.s.tokens}tok/${orig.s.crashes}c  ghost ${g.tokens}tok/${g.crashes}c  dz ${Math.abs(g.z-orig.s.z)}`);
}
// 2 — PB storage round-trips and only overwrites on an improvement
const t1 = play(generateRun('PBTEST'), 0.30, 1);
const t2 = play(generateRun('PBTEST'), 0.15, 2);
const mk=(r:any)=>({tokens:r.s.tokens,streak:r.s.bestStreak,contacts:r.s.crashes,reactionMs:null,trace:r.trace,at:Date.now()});
console.log(`\nfirst save        : ${PB.savePB('PBTEST', mk(t1))} (expect true)`);
console.log(`worse run saves   : ${PB.savePB('PBTEST', mk(t1))} (expect false — equal is not better)`);
const better = t2.s.tokens > t1.s.tokens;
console.log(`better run saves  : ${PB.savePB('PBTEST', mk(t2))} (expect ${better})`);
const got = PB.loadPB('PBTEST');
console.log(`round-trips       : ${got?.tokens === Math.max(t1.s.tokens,t2.s.tokens)}  trace len ${got?.trace.length}`);
console.log(`other course null : ${PB.loadPB('UNSEEN') === null}`);
console.log(bad===0?'\nGHOST REPRODUCES THE RUN EXACTLY':`\n${bad} FAILURES`);
