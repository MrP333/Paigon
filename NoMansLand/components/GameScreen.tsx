import { useEffect, useRef, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { GameConfig, ResultData, InputCommands, WorldState } from '../types';
import { Simulation } from '../engine/Simulation';
import {
  CW, CH, FIELD_W, FIELD_H,
  FINISH_Y, PLAYER_R,
  ARTILLERY_BLAST_RADIUS, ARTILLERY_WARN_DURATION,
  WIRE_BAND_YS, WIRE_GAP_W,
  FIXED_DT,
} from '../constants';

// ── Offscreen mud texture ────────────────────────────────────────────────────
function buildMudCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = FIELD_W; c.height = FIELD_H;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#0d0a06';
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  // Subtle mud variation
  for (let i = 0; i < 28000; i++) {
    const x = Math.random() * FIELD_W;
    const y = Math.random() * FIELD_H;
    const s = 1 + Math.random() * 2.5;
    const a = 0.015 + Math.random() * 0.04;
    ctx.fillStyle = `rgba(${30 + Math.random() * 20},${18 + Math.random() * 12},${6 + Math.random() * 8},${a})`;
    ctx.fillRect(x, y, s, s);
  }

  // Subtle horizontal mud streaks (shell drag lines)
  ctx.globalAlpha = 0.025;
  for (let i = 0; i < 120; i++) {
    const y = Math.random() * FIELD_H;
    const len = 40 + Math.random() * 200;
    const x = Math.random() * FIELD_W;
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 0.5 + Math.random() * 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y + (Math.random() - 0.5) * 6); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c;
}

// ── Draw helpers ─────────────────────────────────────────────────────────────
function drawTrenches(ctx: CanvasRenderingContext2D) {
  // Enemy trench (top — goal)
  ctx.fillStyle = 'rgba(0,200,90,0.08)';
  ctx.fillRect(0, 0, FIELD_W, FINISH_Y);
  ctx.strokeStyle = 'rgba(0,255,120,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, FINISH_Y); ctx.lineTo(FIELD_W, FINISH_Y); ctx.stroke();

  // "CROSS HERE" label
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#00ff88';
  ctx.font = 'bold 11px monospace';
  ctx.letterSpacing = '3px';
  ctx.textAlign = 'center';
  ctx.fillText('— ENEMY TRENCH —', FIELD_W / 2, FINISH_Y - 12);
  ctx.restore();

  // Allied trench (bottom — start)
  const startY = FIELD_H - 110;
  ctx.fillStyle = 'rgba(34,211,238,0.05)';
  ctx.fillRect(0, startY, FIELD_W, 110);
  ctx.strokeStyle = 'rgba(34,211,238,0.2)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, startY); ctx.lineTo(FIELD_W, startY); ctx.stroke();
}

function drawCrater(ctx: CanvasRenderingContext2D, crater: { x: number; y: number; r: number }) {
  const { x, y, r } = crater;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(4,3,2,0.9)');
  g.addColorStop(0.65, 'rgba(8,6,3,0.7)');
  g.addColorStop(1, 'rgba(20,14,8,0)');
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();

  // Rim highlight
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(60,40,20,0.4)'; ctx.lineWidth = 2; ctx.stroke();
}

function drawObstacle(ctx: CanvasRenderingContext2D, obs: { kind: string; x: number; y: number; w: number; h: number; rotation: number; gapX?: number; gapW?: number }) {
  if (obs.kind === 'barbedWire') {
    const gx = obs.gapX ?? obs.x;
    const hw = obs.gapW ? obs.gapW / 2 : 40;
    const leftEnd = obs.x - obs.w / 2;
    const rightEnd = obs.x + obs.w / 2;

    ctx.save();
    ctx.strokeStyle = '#6b4a2a';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.globalAlpha = 0.7;

    // Left segment
    if (gx - hw > leftEnd) {
      drawWireSegment(ctx, leftEnd, obs.y, gx - hw, obs.y);
    }
    // Right segment
    if (gx + hw < rightEnd) {
      drawWireSegment(ctx, gx + hw, obs.y, rightEnd, obs.y);
    }

    // Gap marker
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx - hw, obs.y - 8); ctx.lineTo(gx - hw, obs.y + 8);
    ctx.moveTo(gx + hw, obs.y - 8); ctx.lineTo(gx + hw, obs.y + 8);
    ctx.stroke();

    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(obs.x, obs.y);
  ctx.rotate(obs.rotation);

  if (obs.kind === 'tankWreck') {
    // Hull
    ctx.fillStyle = '#1c1408';
    ctx.strokeStyle = '#3a2810';
    ctx.lineWidth = 1.5;
    const hw = obs.w / 2, hh = obs.h / 2;
    ctx.fillRect(-hw, -hh, obs.w, obs.h);
    ctx.strokeRect(-hw, -hh, obs.w, obs.h);
    // Turret
    ctx.fillStyle = '#141008';
    ctx.beginPath(); ctx.ellipse(0, 0, obs.w * 0.28, obs.h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a1e0c'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, obs.w * 0.28, obs.h * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    // Barrel
    ctx.strokeStyle = '#2a1e0c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -obs.h * 0.3); ctx.lineTo(0, -obs.h * 0.8); ctx.stroke();
    // Rust streaks
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(-hw * 0.6, -hh * 0.4, obs.w * 0.15, obs.h * 0.8);
    ctx.fillRect(hw * 0.3, -hh * 0.6, obs.w * 0.12, obs.h * 0.5);
  } else {
    // Sandbag cluster
    const hw = obs.w / 2, hh = obs.h / 2;
    const bagColor = '#2a1f0e';
    const bagHighlight = '#3a2c14';
    ctx.fillStyle = bagColor;
    ctx.strokeStyle = bagHighlight;
    ctx.lineWidth = 1;
    // Draw 3-4 overlapping ovals
    for (let i = 0; i < 3; i++) {
      const bx = -hw + (i * obs.w / 2.5);
      ctx.beginPath();
      ctx.ellipse(bx, 0, obs.w * 0.22, obs.h * 0.45, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    for (let i = 0; i < 2; i++) {
      const bx = -hw * 0.5 + (i * obs.w * 0.55);
      ctx.beginPath();
      ctx.ellipse(bx, -obs.h * 0.3, obs.w * 0.2, obs.h * 0.35, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  }

  ctx.restore();
}

function drawWireSegment(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  const segs = Math.floor((x2 - x1) / 12);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = x1 + (x2 - x1) * t;
    const jitter = (i % 2 === 0) ? -4 : 4;
    ctx.lineTo(x, y1 + jitter);
  }
  ctx.stroke();
}

function drawPlayer(ctx: CanvasRenderingContext2D, player: WorldState['player']) {
  const { pos, health, maxHealth, isCrawling, isSprinting, inCrater } = player;
  const hRatio = health / maxHealth;
  const r = isCrawling ? PLAYER_R * 0.65 : PLAYER_R;

  // Glow
  const glowR = r * (isSprinting ? 3.5 : 2.8);
  const glowAlpha = isCrawling ? 0.08 : 0.18;
  const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, glowR);
  glow.addColorStop(0, `rgba(255,255,255,${glowAlpha})`);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2); ctx.fill();

  // Sprint trail
  if (isSprinting) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y + i * 5, r * (1 - i * 0.2), 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
    }
    ctx.restore();
  }

  // Main circle
  ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${0.65 + 0.3 * hRatio})`;
  ctx.fill();

  // Health arc
  if (hRatio < 1) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hRatio);
    ctx.strokeStyle = hRatio > 0.5 ? '#00ff88' : hRatio > 0.25 ? '#ffaa00' : '#ff3333';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // In-crater indicator (subtle cyan ring)
  if (inCrater) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, r + 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
}

function drawBullet(ctx: CanvasRenderingContext2D, b: WorldState['bullets'][number]) {
  if (!b.active) return;
  ctx.save();
  ctx.globalAlpha = 0.88;

  const g = ctx.createLinearGradient(b.prev.x, b.prev.y, b.pos.x, b.pos.y);
  g.addColorStop(0, 'rgba(255,220,80,0)');
  g.addColorStop(0.6, 'rgba(255,230,120,0.5)');
  g.addColorStop(1, 'rgba(255,245,180,1)');
  ctx.strokeStyle = g;
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(b.prev.x, b.prev.y); ctx.lineTo(b.pos.x, b.pos.y); ctx.stroke();

  ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 1.8, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.restore();
}

function drawArtillery(ctx: CanvasRenderingContext2D, status: WorldState['artilleryStatus']) {
  if (status.phase === 'warning') {
    const maxR = ARTILLERY_BLAST_RADIUS;
    const ringR = maxR * status.progress;
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.012);

    // Danger fill
    ctx.save();
    ctx.globalAlpha = 0.08 + 0.04 * status.progress;
    ctx.beginPath(); ctx.arc(status.x, status.y, maxR, 0, Math.PI * 2);
    ctx.fillStyle = '#ff5500'; ctx.fill();
    ctx.restore();

    // Expanding ring
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.35 * pulse;
    ctx.beginPath(); ctx.arc(status.x, status.y, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = status.progress > 0.7 ? '#ff2200' : '#ff7700';
    ctx.lineWidth = 2.2; ctx.stroke();
    ctx.restore();

    // Crosshair
    ctx.save();
    ctx.globalAlpha = 0.3 * status.progress;
    ctx.strokeStyle = '#ff5500'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(status.x - maxR * 0.6, status.y); ctx.lineTo(status.x + maxR * 0.6, status.y);
    ctx.moveTo(status.x, status.y - maxR * 0.6); ctx.lineTo(status.x, status.y + maxR * 0.6);
    ctx.stroke();
    ctx.restore();
  } else if (status.phase === 'blast') {
    const r = status.blastRadius;
    ctx.save();
    const g = ctx.createRadialGradient(status.x, status.y, 0, status.x, status.y, r);
    g.addColorStop(0, 'rgba(255,255,200,0.95)');
    g.addColorStop(0.25, 'rgba(255,180,60,0.8)');
    g.addColorStop(0.6, 'rgba(255,80,10,0.4)');
    g.addColorStop(1, 'rgba(100,30,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(status.x, status.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function drawEffect(ctx: CanvasRenderingContext2D, e: WorldState['effects'][number]) {
  const t = e.life / e.maxLife;
  ctx.save();
  ctx.globalAlpha = t * 0.8;
  if (e.type === 'dirt') {
    ctx.fillStyle = `rgba(${50 + Math.random() * 20},${32},${12},1)`;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.size * t, 0, Math.PI * 2); ctx.fill();
  } else if (e.type === 'smoke') {
    ctx.fillStyle = 'rgba(30,22,12,0.4)';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.size * (2 - t), 0, Math.PI * 2); ctx.fill();
  } else if (e.type === 'blood') {
    ctx.fillStyle = 'rgba(80,10,10,0.7)';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.size * t, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawTowers(ctx: CanvasRenderingContext2D) {
  const towerXs = [1, 2, 3, 4, 5, 6, 7].map(i => (FIELD_W / 8) * i);
  for (const tx of towerXs) {
    // Tower body
    ctx.fillStyle = '#0e0a05';
    ctx.strokeStyle = '#2a1e0c';
    ctx.lineWidth = 1;
    ctx.fillRect(tx - 10, -55, 20, 60);
    ctx.strokeRect(tx - 10, -55, 20, 60);
    // Gun barrel pointing down
    ctx.strokeStyle = '#1a1208';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(tx, -10); ctx.lineTo(tx, 20); ctx.stroke();
    // Muzzle flash (subtle always-on glow)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#ffd080';
    ctx.beginPath(); ctx.arc(tx, 18, 8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function render(ctx: CanvasRenderingContext2D, state: WorldState, mudCanvas: HTMLCanvasElement) {
  const camOffsetY = state.cameraY - CH * 0.5;

  ctx.save();
  ctx.translate(0, -camOffsetY);

  // Background mud
  ctx.drawImage(mudCanvas, 0, 0);

  // Trenches
  drawTrenches(ctx);

  // Towers (above enemy trench)
  drawTowers(ctx);

  // Craters
  for (const c of state.craters) drawCrater(ctx, c);

  // Obstacles
  for (const o of state.obstacles) drawObstacle(ctx, o as any);

  // Artillery
  if (state.artilleryStatus.phase !== 'none') drawArtillery(ctx, state.artilleryStatus);

  // Bullets
  for (const b of state.bullets) drawBullet(ctx, b);

  // Effects
  for (const e of state.effects) drawEffect(ctx, e);

  // Player
  drawPlayer(ctx, state.player);

  ctx.restore();

  drawHUD(ctx, state);
}

function drawHUD(ctx: CanvasRenderingContext2D, state: WorldState) {
  const p = state.player;
  const hRatio = p.health / p.maxHealth;

  // Top bar background
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, CW, 48);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 48); ctx.lineTo(CW, 48); ctx.stroke();

  // Health bar (left)
  const barW = 150, barH = 8, barX = 20, barY = 20;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.roundRect(barX, barY, barW, barH, 4);
  ctx.fill();
  const hColor = hRatio > 0.5 ? '#00ff88' : hRatio > 0.25 ? '#ffaa00' : '#ff3333';
  ctx.fillStyle = hColor;
  ctx.roundRect(barX, barY, barW * hRatio, barH, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '700 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`HP  ${Math.ceil(p.health)}`, barX, barY - 4);

  // Timer (center)
  const t = state.timer;
  const mins = Math.floor(t / 60);
  const secs = (t % 60).toFixed(2);
  const timeStr = `${mins > 0 ? mins + ':' : ''}${secs.padStart(5, '0')}`;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(timeStr, CW / 2, 30);

  // Stance indicator
  const stance = p.isCrawling ? '● CRAWL' : p.isSprinting ? '▶▶ SPRINT' : '▶ WALK';
  const stanceColor = p.isCrawling ? '#fb923c' : p.isSprinting ? '#22d3ee' : 'rgba(255,255,255,0.4)';
  ctx.fillStyle = stanceColor;
  ctx.font = 'bold 9px monospace';
  ctx.fillText(stance, CW / 2, 42);

  // Distance progress (right)
  const distBarW = 100, distBarH = 6, distBarX = CW - 130, distBarY = 21;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.roundRect(distBarX, distBarY, distBarW, distBarH, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,255,136,0.7)';
  ctx.roundRect(distBarX, distBarY, distBarW * state.distancePct, distBarH, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '700 10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`ADVANCE  ${Math.floor(state.distancePct * 100)}%`, CW - 20, distBarY - 4);

  // Artillery warning flash overlay
  if (state.artilleryStatus.phase === 'warning' && state.artilleryStatus.progress > 0.75) {
    ctx.save();
    ctx.globalAlpha = 0.06 + 0.08 * Math.sin(Date.now() * 0.018);
    ctx.fillStyle = '#ff4400';
    ctx.fillRect(0, 0, CW, CH);
    ctx.restore();

    ctx.fillStyle = 'rgba(255,80,0,0.85)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '4px';
    ctx.fillText('⚠ INCOMING', CW / 2, 64);
    ctx.letterSpacing = '0px';
  }

  // Controls reminder (bottom)
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('WASD · SHIFT sprint · C crawl', CW / 2, CH - 10);
}

// ── Input handler ─────────────────────────────────────────────────────────────
class InputHandler {
  private keys = new Set<string>();
  private _crawlToggle = false;

  constructor() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
  }

  private onDown = (e: KeyboardEvent) => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d',' '].includes(e.key)) e.preventDefault();
    this.keys.add(e.key.toLowerCase());
  };

  private onUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  getCommands(): InputCommands {
    const k = this.keys;
    const dx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const dy = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    const mag = Math.sqrt(dx * dx + dy * dy) || 1;
    return {
      dx: dx / mag,
      dy: dy / mag,
      crawl: k.has('c') || k.has('control'),
      sprint: k.has('shift'),
    };
  }

  destroy() {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  config: GameConfig;
  socket: Socket;
  onResult: (r: ResultData) => void;
}

export default function GameScreen({ config, socket, onResult }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [countdown, setCountdown] = useState(3);
  const [phase, setPhase] = useState<'countdown' | 'playing' | 'waiting' | 'done'>('countdown');
  const [opponentProgress, setOpponentProgress] = useState(0);
  const phaseRef = useRef<string>('countdown');

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    if (config.solo) return;
    socket.on('nml:opponent-progress', ({ pct }: { pct: number }) => setOpponentProgress(pct));
    socket.on('nml:result', (data: any) => {
      phaseRef.current = 'done';
      setPhase('done');
      onResult({
        won: data.winnerId === socket.id,
        draw: data.draw ?? false,
        myTimeMs: data.myTimeMs ?? null,
        opponentTimeMs: data.opponentTimeMs ?? null,
        winnerName: data.winnerName ?? '',
      });
    });
    return () => { socket.off('nml:opponent-progress'); socket.off('nml:result'); };
  }, [socket, onResult, config.solo]);

  useEffect(() => {
    let n = 3;
    const id = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(id);
        setCountdown(0);
        setPhase('playing');
        phaseRef.current = 'playing';
      } else setCountdown(n);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const mudCanvas = buildMudCanvas();
    const sim = new Simulation(config.roomCode);
    const input = new InputHandler();
    let raf = 0;
    let lastT = 0;
    let acc = 0;
    let started = false;
    let progressTimer = 0;
    let resultSent = false;

    const loop = (t: number) => {
      const dt = Math.min((t - lastT) / 1000, 0.05);
      lastT = t;

      if (phaseRef.current === 'playing') {
        started = true;
        acc += dt;
        while (acc >= FIXED_DT) {
          sim.tick(input.getCommands());
          acc -= FIXED_DT;
        }

        const state = sim.getState();

        // Opponent progress updates
        if (!config.solo) {
          progressTimer += dt;
          if (progressTimer > 0.5) {
            progressTimer = 0;
            socket.emit('nml:progress', { roomCode: config.roomCode, pct: state.distancePct });
          }
        }

        // Win/lose
        if (!resultSent && (state.phase === 'victory' || state.phase === 'dead')) {
          resultSent = true;
          const timeMs = Math.round(state.timer * 1000);
          if (config.solo) {
            phaseRef.current = 'done';
            setPhase('done');
            onResult({
              won: state.phase === 'victory',
              draw: false,
              myTimeMs: state.phase === 'victory' ? timeMs : null,
              opponentTimeMs: null,
              winnerName: state.phase === 'victory' ? config.playerName : '',
            });
          } else {
            if (state.phase === 'victory') {
              socket.emit('nml:crossed', { roomCode: config.roomCode, timeMs });
            } else {
              socket.emit('nml:died', { roomCode: config.roomCode });
            }
            setPhase('waiting');
            phaseRef.current = 'waiting';
          }
        }
      }

      render(ctx, sim.getState(), mudCanvas);

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); input.destroy(); };
  }, [config, socket, onResult]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#03030a', userSelect: 'none' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          width={CW} height={CH}
          style={{ width: '100%', height: '100%', display: 'block' }}
          tabIndex={0}
        />

        {phase === 'countdown' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(3,3,10,0.82)', backdropFilter: 'blur(4px)', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
              No Man's Land
            </div>
            <div style={{
              fontSize: countdown === 0 ? '4.5rem' : '7rem', fontWeight: 800, letterSpacing: '-0.04em',
              color: countdown === 0 ? '#00ff88' : '#fff',
              textShadow: `0 0 60px ${countdown === 0 ? '#00ff88' : 'rgba(255,255,255,0.3)'}`,
              animation: 'popIn 0.25s ease-out',
            }}>
              {countdown > 0 ? countdown : 'CHARGE!'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>
              WASD to move · SHIFT sprint · C crawl
            </div>
            <style>{`@keyframes popIn { from { transform:scale(0.5); opacity:0; } to { transform:scale(1); opacity:1; } }`}</style>
          </div>
        )}

        {phase === 'waiting' && (
          <div style={{
            position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
            padding: '10px 24px', fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em',
          }}>
            Waiting for opponent…
          </div>
        )}

        {/* Opponent progress bar (right edge) */}
        {!config.solo && (
          <div style={{
            position: 'absolute', right: 12, top: 60, bottom: 20,
            width: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3,
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden',
          }}>
            <div style={{
              height: `${opponentProgress * 100}%`,
              background: config.opponentColor || '#fb923c',
              borderRadius: 3,
              boxShadow: `0 0 8px ${config.opponentColor || '#fb923c'}`,
              transition: 'height 0.4s ease',
            }} />
          </div>
        )}
      </div>
    </div>
  );
}
