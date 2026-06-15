import { WorldState, PlayerState, Tower, Bullet, Obstacle, Crater, ArtilleryStrike, ArtilleryStatus, Effect, InputCommands, GamePhase } from '../types';
import { rngFromKey } from './rng';
import {
  FIELD_W, FIELD_H, FINISH_Y, START_Y,
  PLAYER_R, PLAYER_SPEED, CRAWL_MULT, SPRINT_MULT, PLAYER_MAX_HEALTH,
  BULLET_DAMAGE, ARTILLERY_DAMAGE, WIRE_DAMAGE_PER_TICK,
  TOWER_Y, TOWER_COUNT, BULLET_SPEED, BULLET_LIFE,
  ARTILLERY_BLAST_RADIUS, ARTILLERY_WARN_DURATION, ARTILLERY_BLAST_DURATION,
  WIRE_BAND_YS, WIRE_GAP_W, FIXED_DT, CAMERA_LEAD,
} from '../constants';

function hypot(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function segmentIntersectsAABB(
  p1x: number, p1y: number, p2x: number, p2y: number,
  minX: number, minY: number, maxX: number, maxY: number
): boolean {
  const dx = p2x - p1x, dy = p2y - p1y;
  let tmin = 0, tmax = 1;
  for (let axis = 0; axis < 2; axis++) {
    const d = axis === 0 ? dx : dy;
    const lo = axis === 0 ? (minX - p1x) : (minY - p1y);
    const hi = axis === 0 ? (maxX - p1x) : (maxY - p1y);
    if (Math.abs(d) < 1e-9) {
      const p = axis === 0 ? p1x : p1y;
      if (p < (axis === 0 ? minX : minY) || p > (axis === 0 ? maxX : maxY)) return false;
    } else {
      const t1 = lo / d, t2 = hi / d;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    }
  }
  return tmax >= tmin;
}

export class Simulation {
  private state: WorldState;
  private towers: Tower[] = [];
  private bulletPool: Bullet[] = [];
  private artilleryIdx = 0;
  private blastDealt = new Set<number>();
  private rng: () => number;

  constructor(roomCode: string) {
    this.rng = rngFromKey(roomCode + ':game');
    const player: PlayerState = {
      pos: { x: FIELD_W / 2, y: START_Y },
      health: PLAYER_MAX_HEALTH,
      maxHealth: PLAYER_MAX_HEALTH,
      isCrawling: false,
      isSprinting: false,
      inCrater: false,
      inWire: false,
    };
    this.state = {
      phase: 'playing',
      timer: 0,
      player,
      bullets: [],
      obstacles: [],
      craters: [],
      artillerySchedule: [],
      artilleryStatus: { phase: 'none', x: 0, y: 0, progress: 0, blastRadius: 0 },
      effects: [],
      cameraY: START_Y,
      distancePct: 0,
    };
    this.buildTowers(roomCode);
    this.buildObstacles(roomCode);
    this.buildCraters(roomCode);
    this.buildArtillerySchedule(roomCode);
    for (let i = 0; i < 300; i++) {
      this.bulletPool.push({ pos: { x: 0, y: 0 }, prev: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, life: 0, active: false });
    }
  }

  private buildTowers(roomCode: string) {
    const rng = rngFromKey(roomCode + ':towers');
    const spacing = FIELD_W / (TOWER_COUNT + 1);
    for (let i = 0; i < TOWER_COUNT; i++) {
      const baseX = spacing * (i + 1);
      const sweep = 180 + rng() * 160;
      this.towers.push({
        x: baseX,
        aimX: baseX,
        targetAimX: baseX + rng() * sweep - sweep / 2,
        aimTimer: rng() * 0.6 + 0.2,
        fireTimer: rng() * 0.15,
        fireInterval: 0.07 + rng() * 0.06,
        sweepRange: sweep,
      });
    }
  }

  private buildObstacles(roomCode: string) {
    const rng = rngFromKey(roomCode + ':obstacles');
    const r = rng;

    // Barbed wire bands
    for (const bandY of WIRE_BAND_YS) {
      const gapX = 80 + r() * (FIELD_W - 160 - WIRE_GAP_W);
      this.state.obstacles.push({
        kind: 'barbedWire',
        x: FIELD_W / 2, y: bandY,
        w: FIELD_W, h: 22,
        rotation: 0,
        gapX: gapX + WIRE_GAP_W / 2,
        gapW: WIRE_GAP_W,
      });
    }

    // Cover objects in bands between wire
    const bands = [
      [FINISH_Y + 60, WIRE_BAND_YS[0] - 60],
      [WIRE_BAND_YS[0] + 60, WIRE_BAND_YS[1] - 60],
      [WIRE_BAND_YS[1] + 60, WIRE_BAND_YS[2] - 60],
      [WIRE_BAND_YS[2] + 60, START_Y - 80],
    ];

    const placed: { x: number; y: number }[] = [];
    const tryPlace = (kind: 'tankWreck' | 'sandbag', w: number, h: number, minY: number, maxY: number) => {
      for (let attempt = 0; attempt < 25; attempt++) {
        const x = 80 + r() * (FIELD_W - 160);
        const y = minY + r() * (maxY - minY);
        if (placed.some(p => hypot(p.x, p.y, x, y) < 130)) continue;
        placed.push({ x, y });
        this.state.obstacles.push({ kind, x, y, w, h, rotation: r() * Math.PI * 2 });
        return;
      }
    };

    for (const [minY, maxY] of bands) {
      for (let i = 0; i < 4; i++) tryPlace('tankWreck', 74, 36, minY, maxY);
      for (let i = 0; i < 3; i++) tryPlace('sandbag', 42, 22, minY, maxY);
    }
  }

  private buildCraters(roomCode: string) {
    const rng = rngFromKey(roomCode + ':craters');
    for (let i = 0; i < 22; i++) {
      const x = 50 + rng() * (FIELD_W - 100);
      const y = FINISH_Y + 80 + rng() * (FIELD_H - FINISH_Y - 240);
      const r = 22 + rng() * 18;
      if (this.state.craters.some(c => hypot(c.x, c.y, x, y) < c.r + r + 30)) continue;
      this.state.craters.push({ x, y, r });
    }
  }

  private buildArtillerySchedule(roomCode: string) {
    const rng = rngFromKey(roomCode + ':artillery');
    let t = 5.5;
    for (let i = 0; i < 30; i++) {
      t += 4.5 + rng() * 7.5;
      this.state.artillerySchedule.push({
        x: 70 + rng() * (FIELD_W - 140),
        y: FINISH_Y + 100 + rng() * (FIELD_H - FINISH_Y - 280),
        detonateAt: t,
        warnDuration: ARTILLERY_WARN_DURATION,
      });
    }
  }

  getState(): WorldState {
    return this.state;
  }

  tick(input: InputCommands): void {
    if (this.state.phase !== 'playing') return;
    const dt = FIXED_DT;
    this.state.timer += dt;
    this.updatePlayer(input);
    this.updateTowers();
    this.updateBullets();
    this.updateArtillery();
    this.updateEffects();
    this.updateCamera();
    this.checkWinLose();
  }

  private updatePlayer(input: InputCommands) {
    const p = this.state.player;

    if (input.crawl) {
      p.isCrawling = true;
      p.isSprinting = false;
    } else {
      p.isCrawling = false;
      p.isSprinting = !p.isCrawling && input.sprint && (input.dx !== 0 || input.dy !== 0);
    }

    let speed = PLAYER_SPEED;
    if (p.isCrawling) speed *= CRAWL_MULT;
    else if (p.isSprinting) speed *= SPRINT_MULT;

    const prevX = p.pos.x;
    const prevY = p.pos.y;

    let nx = p.pos.x + input.dx * speed;
    let ny = p.pos.y + input.dy * speed;

    nx = Math.max(PLAYER_R, Math.min(FIELD_W - PLAYER_R, nx));
    ny = Math.max(FINISH_Y + PLAYER_R, Math.min(FIELD_H - PLAYER_R, ny));

    // Wire collision
    p.inWire = false;
    for (const obs of this.state.obstacles) {
      if (obs.kind !== 'barbedWire') continue;
      const inBand = ny > obs.y - obs.h / 2 - PLAYER_R && ny < obs.y + obs.h / 2 + PLAYER_R;
      if (!inBand) continue;
      const gx = obs.gapX ?? FIELD_W / 2;
      const hw = obs.gapW ? obs.gapW / 2 : 40;
      const inGap = nx > gx - hw && nx < gx + hw;
      if (inGap) continue;
      p.inWire = true;
      if (!p.isCrawling) {
        ny = prevY;
      } else {
        p.health -= WIRE_DAMAGE_PER_TICK;
      }
    }

    p.pos.x = nx;
    p.pos.y = ny;

    // Cover check
    p.inCrater = this.state.craters.some(c => hypot(p.pos.x, p.pos.y, c.x, c.y) < c.r * 0.85);
  }

  private getBullet(): Bullet | null {
    for (const b of this.bulletPool) {
      if (!b.active) return b;
    }
    return null;
  }

  private updateTowers() {
    const dt = FIXED_DT;
    for (const t of this.towers) {
      t.aimTimer -= dt;
      if (t.aimTimer <= 0) {
        t.targetAimX = t.x + (this.rng() * 2 - 1) * t.sweepRange;
        t.targetAimX = Math.max(20, Math.min(FIELD_W - 20, t.targetAimX));
        t.aimTimer = 0.2 + this.rng() * 0.5;
      }
      t.aimX += (t.targetAimX - t.aimX) * 0.1;

      t.fireTimer -= dt;
      if (t.fireTimer <= 0) {
        t.fireTimer = t.fireInterval + this.rng() * 0.03;
        const b = this.getBullet();
        if (!b) continue;
        b.active = true;
        b.life = BULLET_LIFE;
        b.pos.x = t.x;
        b.pos.y = TOWER_Y;
        b.prev.x = t.x;
        b.prev.y = TOWER_Y;
        const spread = 20 + this.rng() * 12;
        const tx = t.aimX + (this.rng() * 2 - 1) * spread;
        const dx = tx - t.x;
        const dy = FIELD_H - TOWER_Y;
        const mag = Math.sqrt(dx * dx + dy * dy);
        b.vel.x = (dx / mag) * BULLET_SPEED;
        b.vel.y = (dy / mag) * BULLET_SPEED;
        this.state.bullets.push(b);
      }
    }
  }

  private updateBullets() {
    const dt = FIXED_DT;
    const p = this.state.player;
    const toRemove: number[] = [];

    for (let i = this.state.bullets.length - 1; i >= 0; i--) {
      const b = this.state.bullets[i];
      b.prev.x = b.pos.x;
      b.prev.y = b.pos.y;
      b.pos.x += b.vel.x;
      b.pos.y += b.vel.y;
      b.life -= dt;

      if (!b.active || b.life <= 0 || b.pos.y > FIELD_H + 50) {
        b.active = false;
        this.bulletPool.push(b);
        toRemove.push(i);
        continue;
      }

      // Check cover obstacle blocking
      let blocked = false;
      for (const obs of this.state.obstacles) {
        if (obs.kind === 'barbedWire') continue;
        const hw = obs.w / 2, hh = obs.h / 2;
        if (segmentIntersectsAABB(b.prev.x, b.prev.y, b.pos.x, b.pos.y, obs.x - hw, obs.y - hh, obs.x + hw, obs.y + hh)) {
          blocked = true;
          this.spawnDirt(obs.x + (Math.random() - 0.5) * obs.w * 0.8, obs.y + (Math.random() - 0.5) * obs.h * 0.8, 2);
          break;
        }
      }
      if (blocked) {
        b.active = false;
        this.bulletPool.push(b);
        toRemove.push(i);
        continue;
      }

      // Player hit
      const dist = hypot(b.pos.x, b.pos.y, p.pos.x, p.pos.y);
      if (dist < PLAYER_R + 6) {
        const inTrench = p.pos.y > FIELD_H - 160;
        if (inTrench) {
          // safe in trench
        } else {
          let hitChance: number;
          if (p.inCrater && p.isCrawling) hitChance = 0.04;
          else if (p.inCrater) hitChance = 0.22;
          else if (p.isCrawling) hitChance = 0.28;
          else hitChance = 0.82;
          if (Math.random() < hitChance) {
            p.health -= BULLET_DAMAGE;
            this.spawnBlood(p.pos.x, p.pos.y);
          }
        }
        b.active = false;
        this.bulletPool.push(b);
        toRemove.push(i);
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.state.bullets.splice(toRemove[i], 1);
    }
  }

  private updateArtillery() {
    const t = this.state.timer;
    const sched = this.state.artillerySchedule;

    while (this.artilleryIdx < sched.length && t > sched[this.artilleryIdx].detonateAt + ARTILLERY_BLAST_DURATION) {
      this.artilleryIdx++;
    }

    if (this.artilleryIdx >= sched.length) {
      this.state.artilleryStatus = { phase: 'none', x: 0, y: 0, progress: 0, blastRadius: 0 };
      return;
    }

    const s = sched[this.artilleryIdx];
    const warnStart = s.detonateAt - s.warnDuration;

    if (t < warnStart) {
      this.state.artilleryStatus = { phase: 'none', x: 0, y: 0, progress: 0, blastRadius: 0 };
      return;
    }

    if (t < s.detonateAt) {
      const progress = (t - warnStart) / s.warnDuration;
      this.state.artilleryStatus = { phase: 'warning', x: s.x, y: s.y, progress, blastRadius: 0 };
      return;
    }

    // Blast
    const blastAge = t - s.detonateAt;
    const blastProgress = 1 - blastAge / ARTILLERY_BLAST_DURATION;
    this.state.artilleryStatus = {
      phase: 'blast',
      x: s.x, y: s.y,
      progress: 1,
      blastRadius: ARTILLERY_BLAST_RADIUS * (1 + blastProgress * 0.4),
    };

    if (!this.blastDealt.has(this.artilleryIdx)) {
      this.blastDealt.add(this.artilleryIdx);
      const p = this.state.player;
      const dist = hypot(p.pos.x, p.pos.y, s.x, s.y);
      if (dist < ARTILLERY_BLAST_RADIUS) {
        const inTrench = p.pos.y > FIELD_H - 160;
        if (!inTrench) {
          const mult = (p.inCrater && p.isCrawling) ? 0.08 : (p.isCrawling ? 0.35 : 1.0);
          p.health -= ARTILLERY_DAMAGE * mult;
        }
      }
      this.spawnExplosion(s.x, s.y);
      this.state.craters.push({ x: s.x, y: s.y, r: 28 + Math.random() * 14 });
    }
  }

  private spawnDirt(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      this.state.effects.push({
        type: 'dirt', x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.5,
        size: 2 + Math.random() * 3,
      });
    }
  }

  private spawnBlood(x: number, y: number) {
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2;
      this.state.effects.push({
        type: 'blood', x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6 + Math.random() * 0.4,
        maxLife: 0.8,
        size: 3 + Math.random() * 4,
      });
    }
  }

  private spawnExplosion(x: number, y: number) {
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      this.state.effects.push({
        type: i < 10 ? 'dirt' : 'smoke', x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.8 + Math.random() * 0.8,
        maxLife: 1.4,
        size: 4 + Math.random() * 10,
      });
    }
  }

  private updateEffects() {
    const dt = FIXED_DT;
    for (const e of this.state.effects) {
      e.x += e.vx;
      e.y += e.vy;
      e.vx *= 0.92;
      e.vy *= 0.92;
      e.life -= dt;
    }
    this.state.effects = this.state.effects.filter(e => e.life > 0);
  }

  private updateCamera() {
    const target = this.state.player.pos.y - CAMERA_LEAD;
    this.state.cameraY += (target - this.state.cameraY) * 0.1;
    const totalDist = START_Y - FINISH_Y;
    const remaining = this.state.player.pos.y - FINISH_Y;
    this.state.distancePct = Math.max(0, Math.min(1, 1 - remaining / totalDist));
  }

  private checkWinLose() {
    if (this.state.player.pos.y <= FINISH_Y + PLAYER_R) {
      this.state.phase = 'victory';
    } else if (this.state.player.health <= 0) {
      this.state.player.health = 0;
      this.state.phase = 'dead';
    }
  }
}
