import {
  WorldState, PlayerState, Tower, Bullet, Obstacle, Crater,
  ArtilleryStrike, ArtilleryStatus, Effect, InputCommands, Vec3,
} from '../types';
import { rngFromKey } from './rng';
import {
  FIELD_W, FIELD_D, FINISH_Z, START_Z,
  PLAYER_R, PLAYER_SPEED, CRAWL_MULT, SPRINT_MULT, PLAYER_MAX_HEALTH,
  BULLET_DAMAGE, BULLET_SPEED, BULLET_LIFE, BULLET_SPREAD,
  ARTILLERY_DAMAGE, WIRE_DAMAGE_PER_TICK,
  TOWER_Y, TOWER_Z,
  ARTILLERY_BLAST_RADIUS, ARTILLERY_WARN_DURATION, ARTILLERY_BLAST_DURATION,
  WIRE_BAND_ZS, WIRE_GAP_W, FIXED_DT,
} from '../constants';

// ── Helpers ──────────────────────────────────────────────────────────────────

function dist3(a: Vec3, b: Vec3) {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
}

// 3D segment vs AABB — p1 and p2 are world-space endpoints, min/max are AABB corners.
function segmentIntersectsAABB(
  p1: Vec3, p2: Vec3,
  min: Vec3, max: Vec3,
): boolean {
  const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
  const axes = [
    { d: dx, lo: min.x - p1.x, hi: max.x - p1.x, p: p1.x, mn: min.x, mx: max.x },
    { d: dy, lo: min.y - p1.y, hi: max.y - p1.y, p: p1.y, mn: min.y, mx: max.y },
    { d: dz, lo: min.z - p1.z, hi: max.z - p1.z, p: p1.z, mn: min.z, mx: max.z },
  ];
  let tmin = 0, tmax = 1;
  for (const { d, lo, hi, p, mn, mx } of axes) {
    if (Math.abs(d) < 1e-9) {
      if (p < mn || p > mx) return false;
    } else {
      const t1 = lo / d, t2 = hi / d;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    }
  }
  return tmax >= tmin;
}

function obstacleAABB(o: Obstacle): { min: Vec3; max: Vec3 } {
  return {
    min: { x: o.pos.x - o.halfX, y: 0,          z: o.pos.z - o.halfZ },
    max: { x: o.pos.x + o.halfX, y: o.halfY * 2, z: o.pos.z + o.halfZ },
  };
}

function bulletBlockedBy3D(from: Vec3, to: Vec3, obstacles: Obstacle[]): boolean {
  for (const obs of obstacles) {
    if (obs.kind === 'barbedWire') continue; // wire doesn't stop bullets
    const { min, max } = obstacleAABB(obs);
    if (segmentIntersectsAABB(from, to, min, max)) return true;
  }
  return false;
}

// ── Simulation ────────────────────────────────────────────────────────────────

export class Simulation {
  private state: WorldState;
  private towers: Tower[] = [];
  private bulletPool: Bullet[] = [];
  private artIdx = 0;
  private blastDealt = new Set<number>();
  private rng: () => number;

  constructor(roomCode: string, towerCount = 5) {
    this.rng = rngFromKey(roomCode + ':tick');
    const player: PlayerState = {
      pos: { x: 0, y: 0, z: START_Z },
      health: PLAYER_MAX_HEALTH,
      maxHealth: PLAYER_MAX_HEALTH,
      isCrawling: false, isSprinting: false,
      inCrater: false, inWire: false,
      hitFlash: 0,
    };
    this.state = {
      phase: 'playing',
      timer: 0,
      player,
      bullets: [],
      obstacles: [],
      craters: [],
      artillerySchedule: [],
      artilleryStatus: { phase: 'none', x: 0, z: 0, progress: 0, blastRadius: 0 },
      effects: [],
      distancePct: 0,
    };
    this.buildTowers(roomCode, towerCount);
    this.buildObstacles(roomCode);
    this.buildCraters(roomCode);
    this.buildArtillerySchedule(roomCode);
    for (let i = 0; i < 300; i++) {
      this.bulletPool.push({
        pos: { x:0,y:0,z:0 }, prev: { x:0,y:0,z:0 },
        vel: { x:0,y:0,z:0 }, life: 0, active: false,
      });
    }
  }

  private buildTowers(roomCode: string, towerCount: number) {
    const rng = rngFromKey(roomCode + ':towers');
    const spacing = FIELD_W / (towerCount + 1);
    for (let i = 0; i < towerCount; i++) {
      const x = -FIELD_W / 2 + spacing * (i + 1);
      const sweep = 22 + rng() * 16;
      this.towers.push({
        x, y: TOWER_Y, z: TOWER_Z,
        aimX: x,
        targetAimX: x + (rng() - 0.5) * sweep * 2,
        aimTimer: rng() * 0.8,
        fireTimer: rng() * 0.3,
        fireInterval: 0.07 + rng() * 0.06,
        sweepRange: sweep,
      });
    }
  }

  private buildObstacles(roomCode: string) {
    const rng = rngFromKey(roomCode + ':obstacles');
    const obs = this.state.obstacles;

    // 3 barbed wire bands
    for (const wz of WIRE_BAND_ZS) {
      const gapX = -FIELD_W / 2 + 2 + rng() * (FIELD_W - 4 - WIRE_GAP_W);
      obs.push({
        kind: 'barbedWire',
        pos: { x: 0, y: 0, z: wz },
        halfX: FIELD_W / 2, halfY: 0.8, halfZ: 0.6,
        rotation: 0, gapX, gapW: WIRE_GAP_W,
      });
    }

    // 7 tank wrecks — thick enough to actually block elevated fire
    for (let i = 0; i < 7; i++) {
      const x = -FIELD_W / 2 + 6 + rng() * (FIELD_W - 12);
      const z = 12 + rng() * 104;
      obs.push({
        kind: 'tankWreck',
        pos: { x, y: 0, z },
        halfX: 2.1, halfY: 1.4, halfZ: 3.2,
        rotation: rng() * Math.PI,
      });
    }

    // 7 sandbag walls
    for (let i = 0; i < 7; i++) {
      const x = -FIELD_W / 2 + 4 + rng() * (FIELD_W - 8);
      const z = 9 + rng() * 107;
      obs.push({
        kind: 'sandbag',
        pos: { x, y: 0, z },
        halfX: 2.5, halfY: 0.65, halfZ: 0.45,
        rotation: rng() * Math.PI,
      });
    }
  }

  private buildCraters(roomCode: string) {
    const rng = rngFromKey(roomCode + ':craters');
    for (let i = 0; i < 4; i++) {
      this.state.craters.push({
        x: -FIELD_W / 2 + 6 + rng() * (FIELD_W - 12),
        z: 29 + rng() * 72,
        r: 2.0 + rng() * 1.5,
      });
    }
  }

  private buildArtillerySchedule(roomCode: string) {
    const rng = rngFromKey(roomCode + ':artillery');
    let t = 4.0;
    for (let i = 0; i < 30; i++) {
      this.state.artillerySchedule.push({
        x: -FIELD_W / 2 + 4 + rng() * (FIELD_W - 8),
        z: 12 + rng() * 104,
        detonateAt: t + ARTILLERY_WARN_DURATION,
        warnDuration: ARTILLERY_WARN_DURATION,
      });
      t += 4.5 + rng() * 7.5;
    }
  }

  // ── Tick ──────────────────────────────────────────────────────────────────

  tick(input: InputCommands) {
    if (this.state.phase !== 'playing') return;
    this.state.timer += FIXED_DT;
    this.updatePlayer(input);
    this.updateTowers();
    this.updateBullets();
    this.updateArtillery();
    this.updateEffects();
    this.checkWinLose();
  }

  private updatePlayer(input: InputCommands) {
    const p = this.state.player;

    p.isCrawling = input.crawl;
    p.isSprinting = !input.crawl && input.sprint;
    let speed = PLAYER_SPEED;
    if (p.isCrawling) speed *= CRAWL_MULT;
    else if (p.isSprinting) speed *= SPRINT_MULT;

    // Wire slows extra
    if (p.inWire && !p.isCrawling) speed *= 0.4;

    const len = Math.hypot(input.dx, input.dz);
    if (len > 0.01) {
      const nx = input.dx / len, nz = input.dz / len;
      p.pos.x = Math.max(-FIELD_W / 2 + 0.6, Math.min(FIELD_W / 2 - 0.6, p.pos.x + nx * speed * FIXED_DT));
      p.pos.z = Math.max(FINISH_Z, Math.min(FIELD_D, p.pos.z + nz * speed * FIXED_DT));
    }

    // Collision push-out: solid obstacles (tanks, sandbags)
    for (const obs of this.state.obstacles) {
      if (obs.kind === 'barbedWire') continue;
      const r    = PLAYER_R;
      const eMinX = obs.pos.x - obs.halfX - r;
      const eMaxX = obs.pos.x + obs.halfX + r;
      const eMinZ = obs.pos.z - obs.halfZ - r;
      const eMaxZ = obs.pos.z + obs.halfZ + r;
      if (p.pos.x <= eMinX || p.pos.x >= eMaxX) continue;
      if (p.pos.z <= eMinZ || p.pos.z >= eMaxZ) continue;
      const dxL = p.pos.x - eMinX, dxR = eMaxX - p.pos.x;
      const dzN = p.pos.z - eMinZ, dzF = eMaxZ - p.pos.z;
      if (Math.min(dxL, dxR) <= Math.min(dzN, dzF)) {
        p.pos.x = dxL < dxR ? eMinX : eMaxX;
      } else {
        p.pos.z = dzN < dzF ? eMinZ : eMaxZ;
      }
    }

    // Player Y: standing = 0, crawling = flat on ground (visual only via GroupRef)
    p.pos.y = 0;

    // Crater detection
    p.inCrater = this.state.craters.some(c => Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < c.r);

    // Barbed wire detection & damage
    p.inWire = false;
    for (const obs of this.state.obstacles) {
      if (obs.kind !== 'barbedWire') continue;
      const nearZ = Math.abs(p.pos.z - obs.pos.z) < 1.1;
      if (!nearZ) continue;
      const inGap = obs.gapX !== undefined && p.pos.x >= obs.gapX && p.pos.x <= obs.gapX! + obs.gapW!;
      if (!inGap) {
        p.inWire = true;
        p.health -= WIRE_DAMAGE_PER_TICK;
      }
    }

    // Distance percent
    this.state.distancePct = Math.max(0, Math.min(1, 1 - (p.pos.z - FINISH_Z) / (START_Z - FINISH_Z)));

    if (p.hitFlash > 0) p.hitFlash -= FIXED_DT;
  }

  private updateTowers() {
    const p   = this.state.player;
    const rng = this.rng;

    for (const tower of this.towers) {
      // All towers track the player — each lerps its aim independently
      tower.aimX += (p.pos.x - tower.aimX) * Math.min(1, 2.5 * FIXED_DT);

      tower.fireTimer -= FIXED_DT;
      if (tower.fireTimer <= 0) {
        tower.fireTimer = tower.fireInterval;

        // 50% of shots are poorly aimed, 50% are on-target (more accurate than before)
        const badShot = rng() < 0.50;
        this.fireBullet(
          { x: tower.x, y: tower.y, z: tower.z },
          {
            x: tower.aimX + (rng() - 0.5) * (badShot ? 14 : 1.8),
            y: p.pos.y + (p.isCrawling ? 0.15 : 0.85),
            z: p.pos.z  + (rng() - 0.5) * (badShot ? 10 : 1.2),
          },
        );
      }
    }
  }

  private fireBullet(from: Vec3, target: Vec3) {
    const bullet = this.bulletPool.find(b => !b.active);
    if (!bullet) return;
    const dx = target.x - from.x, dy = target.y - from.y, dz = target.z - from.z;
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
    bullet.active = true;
    bullet.life = BULLET_LIFE;
    bullet.pos = { ...from };
    bullet.prev = { ...from };
    bullet.vel = { x: dx/len * BULLET_SPEED, y: dy/len * BULLET_SPEED, z: dz/len * BULLET_SPEED };
  }

  private updateBullets() {
    const p = this.state.player;
    const playerHeight = p.isCrawling ? 0.3 : 0.9;

    for (const b of this.bulletPool) {
      if (!b.active) continue;
      b.life -= FIXED_DT;
      if (b.life <= 0) { b.active = false; continue; }

      b.prev = { ...b.pos };
      b.pos.x += b.vel.x * FIXED_DT;
      b.pos.y += b.vel.y * FIXED_DT;
      b.pos.z += b.vel.z * FIXED_DT;

      // Out of field bounds
      if (b.pos.z > FIELD_D + 10 || b.pos.z < -10 ||
          Math.abs(b.pos.x) > FIELD_W) {
        b.active = false;
        continue;
      }

      // Check player hit (sphere collision)
      const playerCenter: Vec3 = { x: p.pos.x, y: playerHeight, z: p.pos.z };
      if (dist3(b.pos, playerCenter) < PLAYER_R + 0.1) {
        b.active = false;
        const towerOrigin: Vec3 = { x: b.prev.x, y: TOWER_Y, z: TOWER_Z };
        const blocked = bulletBlockedBy3D(towerOrigin, playerCenter, this.state.obstacles);
        if (blocked) continue;
        let hitChance = 1.0;
        if (p.isCrawling) hitChance *= 0.18;
        if (p.inCrater)   hitChance *= 0.38;
        if (this.rng() < hitChance) {
          this.damagePLayer(BULLET_DAMAGE);
        }
        continue;
      }

      // Check cover collision — bullet despawns if it hits solid obstacle
      for (const obs of this.state.obstacles) {
        if (obs.kind === 'barbedWire') continue;
        const { min, max } = obstacleAABB(obs);
        if (
          b.pos.x >= min.x && b.pos.x <= max.x &&
          b.pos.y >= min.y && b.pos.y <= max.y &&
          b.pos.z >= min.z && b.pos.z <= max.z
        ) {
          b.active = false;
          // Dirt spark effect on obstacle
          this.spawnDirt(b.pos.x, b.pos.y, b.pos.z);
          break;
        }
      }
    }

    // Expose active bullets to state
    this.state.bullets = this.bulletPool.filter(b => b.active);
  }

  private damagePLayer(amount: number) {
    const p = this.state.player;
    p.health = Math.max(0, p.health - amount);
    p.hitFlash = 0.25;
    // Blood effect at player position
    for (let i = 0; i < 10; i++) {
      const ang = this.rng() * Math.PI * 2;
      const spd = 2 + this.rng() * 4;
      this.state.effects.push({
        type: 'blood',
        x: p.pos.x + (this.rng() - 0.5) * 0.4,
        y: 0.8 + this.rng() * 0.7,
        z: p.pos.z + (this.rng() - 0.5) * 0.4,
        vx: Math.cos(ang) * spd * 0.4,
        vy: 1.5 + this.rng() * 2,
        vz: Math.sin(ang) * spd * 0.4,
        life: 0.6 + this.rng() * 0.4,
        maxLife: 1.0,
        size: 0.06 + this.rng() * 0.07,
      });
    }
  }

  private spawnDirt(x: number, y: number, z: number) {
    for (let i = 0; i < 5; i++) {
      const ang = this.rng() * Math.PI * 2;
      const spd = 1.5 + this.rng() * 3;
      this.state.effects.push({
        type: 'dirt',
        x, y, z,
        vx: Math.cos(ang) * spd * 0.5,
        vy: 1.2 + this.rng() * 2.5,
        vz: Math.sin(ang) * spd * 0.5,
        life: 0.4 + this.rng() * 0.4,
        maxLife: 0.8,
        size: 0.08 + this.rng() * 0.1,
      });
    }
  }

  private updateArtillery() {
    const t = this.state.timer;
    const sched = this.state.artillerySchedule;
    const status = this.state.artilleryStatus;

    if (this.artIdx < sched.length) {
      const strike = sched[this.artIdx];
      const warnStart = strike.detonateAt - strike.warnDuration;

      if (t >= warnStart && status.phase === 'none') {
        status.phase = 'warning';
        status.x = strike.x;
        status.z = strike.z;
        status.progress = 0;
        status.blastRadius = ARTILLERY_BLAST_RADIUS;
      }

      if (status.phase === 'warning') {
        status.progress = Math.min(1, (t - warnStart) / strike.warnDuration);
        if (t >= strike.detonateAt) {
          status.phase = 'blast';
          status.progress = 0;
          // Dynamically create a new crater at impact site
          this.state.craters.push({ x: strike.x, z: strike.z, r: 2.5 + this.rng() * 1.8 });
          // Explosion effects
          for (let i = 0; i < 20; i++) {
            const ang = this.rng() * Math.PI * 2;
            const spd = 3 + this.rng() * 8;
            this.state.effects.push({
              type: 'explosion',
              x: strike.x + (this.rng()-0.5)*2, y: 0, z: strike.z + (this.rng()-0.5)*2,
              vx: Math.cos(ang)*spd, vy: 2+this.rng()*6, vz: Math.sin(ang)*spd,
              life: 0.8 + this.rng() * 0.8, maxLife: 1.6,
              size: 0.2 + this.rng() * 0.3,
            });
          }
        }
      }

      if (status.phase === 'blast') {
        status.progress += FIXED_DT / ARTILLERY_BLAST_DURATION;
        if (status.progress >= 1) {
          status.phase = 'none';
          this.artIdx++;
        }
        // Damage player if in blast radius (once per strike)
        if (!this.blastDealt.has(this.artIdx)) {
          const p = this.state.player;
          const dist = Math.hypot(p.pos.x - strike.x, p.pos.z - strike.z);
          if (dist < ARTILLERY_BLAST_RADIUS) {
            this.blastDealt.add(this.artIdx);
            const dmg = p.inCrater ? ARTILLERY_DAMAGE * 0.3 : ARTILLERY_DAMAGE;
            this.damagePLayer(dmg);
          }
        }

      }
    }
  }

  private updateEffects() {
    for (const fx of this.state.effects) {
      fx.x += fx.vx * FIXED_DT;
      fx.y += fx.vy * FIXED_DT;
      fx.z += fx.vz * FIXED_DT;
      fx.vy -= 9.8 * FIXED_DT; // gravity
      fx.life -= FIXED_DT;
    }
    this.state.effects = this.state.effects.filter(fx => fx.life > 0);
  }

  private checkWinLose() {
    const p = this.state.player;
    if (p.health <= 0) this.state.phase = 'dead';
    if (p.pos.z <= FINISH_Z) this.state.phase = 'victory';
  }

  getState(): WorldState { return this.state; }
  getTowers(): Tower[]   { return this.towers; }
}
