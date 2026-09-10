import { CONFIG, TAU } from './config';
import { angleDelta, mix, wrap, wrappedDelta } from './math';
import type { Pose, Vec } from './math';
import { arenaExitTime, clearCastleRay, sweepCastle } from './geometry';
import type { Contact } from './geometry';
import type { GameEvent, Ring, Ship } from './game';

export interface Cannon {
  angle: number; previousAngle: number; mode: 'tracking' | 'charging' | 'locked' | 'recovery';
  elapsed: number; remaining: number; inhibit: number;
}
export interface Spark extends Pose {
  id: number; previous: Pose; vx: number; vy: number; turnVelocity: number;
  mode: 'attached' | 'pursuing'; ring: number; mountAngle: number;
  remaining: number; replacementWait: number; warning: boolean; detachedAge: number; killedAt: number;
}
export interface Orb extends Pose {
  id: number; previous: Pose; vx: number; vy: number; expiresAt: number; absorbed: Contact | undefined;
}
export function sparkAt(spark: Spark, time: number): Pose {
  return { x: spark.previous.x + wrappedDelta(spark.previous.x, spark.x, CONFIG.arena.width) * time,
    y: spark.previous.y + wrappedDelta(spark.previous.y, spark.y, CONFIG.arena.height) * time,
    angle: spark.previous.angle + angleDelta(spark.previous.angle, spark.angle) * time };
}
export function orbAt(orb: Orb, time: number): Pose {
  return { x: mix(orb.previous.x, orb.x, time), y: mix(orb.previous.y, orb.y, time), angle: orb.angle };
}
function newCannon(): Cannon {
  return { angle: Math.PI / 2, previousAngle: Math.PI / 2, mode: 'tracking', elapsed: 0, remaining: 0, inhibit: CONFIG.cannon.spawnInhibit };
}
function approach(from: number, to: number, step: number): number { return from + Math.max(-step, Math.min(step, to - from)); }
function countdown(value: number, dt: number): number { return value - dt <= CONFIG.simulation.timerEpsilon ? 0 : value - dt; }

// This is part of the simulation, owned and stepped only by Game. Rendering and
// audio read its records. Its seeded random stream never services cosmetics.
export class Threats {
  cannon = newCannon();
  sparks: Spark[] = [];
  orbs: Orb[] = [];
  sparkSpeed: number = CONFIG.progression[0].sparkSpeed;
  private randomState: number = CONFIG.seed;
  private nextOrb = 0;

  reset(): void { this.randomState = CONFIG.seed; this.nextOrb = 0; this.clear(); }
  clear(): void { this.sparks.length = 0; this.orbs.length = 0; this.cannon = newCannon(); }
  private random(): number {
    let value = this.randomState;
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    this.randomState = value >>> 0;
    return this.randomState / 0x100000000;
  }
  castle(rings: readonly Ring[], first: boolean, sparkSpeed: number): void {
    this.clear();
    this.sparkSpeed = sparkSpeed;
    const delays = first ? CONFIG.spark.firstDelays : CONFIG.spark.laterDelays;
    this.sparks = Array.from({ length: CONFIG.limits.sparks }, (_, id) => this.attach(id, rings, delays[id] ?? CONFIG.spark.laterDelays[2]));
  }
  private attach(id: number, rings: readonly Ring[], delay: number, avoid?: Ship): Spark {
    const ringIndex = id % rings.length;
    const ring = rings[ringIndex];
    const sectors = ring?.segments.flatMap((segment, index) => segment.hp > 0 ? [index] : []) ?? [];
    const choice = this.random();
    const sector = sectors[Math.floor(choice * sectors.length)] ?? Math.floor(choice * CONFIG.castle.sectors);
    const radius = (ring?.radius ?? CONFIG.castle.ringRadii[0]) + CONFIG.spark.attachmentOffset;
    const candidate = (at: number): Spark => {
      const mountAngle = (at + 0.5) * TAU / CONFIG.castle.sectors;
      const angle = (ring?.angle ?? 0) + mountAngle;
      const pose = { x: CONFIG.castle.x + Math.cos(angle) * radius, y: CONFIG.castle.y + Math.sin(angle) * radius, angle };
      return { ...pose, previous: { ...pose }, id,
        vx: -(pose.y - CONFIG.castle.y) * (ring?.speed ?? 0), vy: (pose.x - CONFIG.castle.x) * (ring?.speed ?? 0), turnVelocity: 0,
        mode: 'attached', ring: ringIndex, mountAngle, remaining: delay, replacementWait: 0, warning: false, detachedAge: Infinity, killedAt: Infinity };
    };
    let best = candidate(sector);
    if (!avoid || this.safeToDetach(best, avoid)) return best;
    const separation = (spark: Spark): number => Math.hypot(wrappedDelta(avoid.x, spark.x, CONFIG.arena.width), wrappedDelta(avoid.y, spark.y, CONFIG.arena.height));
    // A replacement is already collidable while attached. Prefer another live
    // mount, then an empty sector bearing, over spawning it into the ship's path.
    const order = [...sectors, ...Array.from({ length: CONFIG.castle.sectors }, (_, index) => (sector + index + 1) % CONFIG.castle.sectors)];
    for (const at of new Set(order)) {
      const alternative = candidate(at);
      if (this.safeToDetach(alternative, avoid)) return alternative;
      if (separation(alternative) > separation(best)) best = alternative;
    }
    return best;
  }
  death(rings: readonly Ring[]): void {
    this.orbs.length = 0;
    this.cannon.mode = 'tracking'; this.cannon.elapsed = 0; this.cannon.remaining = 0;
    this.cannon.inhibit = CONFIG.cannon.spawnInhibit;
    this.cannon.previousAngle = this.cannon.angle;
    this.sparks = this.sparks.map((spark) => {
      const replacementWait = Number.isFinite(spark.killedAt) ? CONFIG.spark.replacementDelay : spark.replacementWait;
      const attached = this.attach(spark.id, rings, Math.max(replacementWait, CONFIG.spark.laterDelays[spark.id] ?? 6));
      attached.replacementWait = replacementWait;
      return attached;
    });
  }
  spawn(): void { this.cannon.inhibit = CONFIG.cannon.spawnInhibit; }

  advanceSparks(dt: number, rings: readonly Ring[], ship: Ship, playable: boolean): void {
    this.cannon.previousAngle = this.cannon.angle;
    for (const spark of this.sparks) {
      spark.previous = { x: spark.x, y: spark.y, angle: spark.angle }; spark.killedAt = Infinity;
      if (spark.mode === 'attached') {
        const ring = rings[spark.ring]; if (!ring) continue;
        spark.angle = wrap(ring.angle + spark.mountAngle, TAU);
        const radius = ring.radius + CONFIG.spark.attachmentOffset;
        spark.x = CONFIG.castle.x + Math.cos(spark.angle) * radius;
        spark.y = CONFIG.castle.y + Math.sin(spark.angle) * radius;
        spark.vx = -(spark.y - CONFIG.castle.y) * ring.speed; spark.vy = (spark.x - CONFIG.castle.x) * ring.speed;
      } else if (playable) {
        const dx = wrappedDelta(spark.x, ship.x, CONFIG.arena.width);
        const dy = wrappedDelta(spark.y, ship.y, CONFIG.arena.height);
        const error = angleDelta(spark.angle, Math.atan2(dy, dx));
        const desired = Math.sign(error) * Math.min(CONFIG.spark.turnSpeed, Math.sqrt(2 * CONFIG.spark.turnAcceleration * Math.abs(error)));
        spark.turnVelocity = approach(spark.turnVelocity, desired, CONFIG.spark.turnAcceleration * dt);
        spark.angle = wrap(spark.angle + spark.turnVelocity * dt, TAU);
        spark.vx += Math.cos(spark.angle) * CONFIG.spark.acceleration * dt;
        spark.vy += Math.sin(spark.angle) * CONFIG.spark.acceleration * dt;
        const speed = Math.hypot(spark.vx, spark.vy);
        if (speed > this.sparkSpeed) { spark.vx *= this.sparkSpeed / speed; spark.vy *= this.sparkSpeed / speed; }
        spark.x = wrap(spark.x + spark.vx * dt, CONFIG.arena.width);
        spark.y = wrap(spark.y + spark.vy * dt, CONFIG.arena.height);
        spark.detachedAge += dt;
      }
    }
  }
  private safeToDetach(spark: Spark, ship: Ship): boolean {
    const dx = wrappedDelta(ship.x, spark.x, CONFIG.arena.width);
    const dy = wrappedDelta(ship.y, spark.y, CONFIG.arena.height);
    if (Math.hypot(dx, dy) < CONFIG.spark.safetySeparation) return false;
    // Check all neighbouring images: a closest approach can cross a torus seam
    // during the prediction interval even when the current nearest image differs.
    const vx = spark.vx - ship.vx; const vy = spark.vy - ship.vy;
    for (const ox of [-CONFIG.arena.width, 0, CONFIG.arena.width]) for (const oy of [-CONFIG.arena.height, 0, CONFIG.arena.height]) {
      const x = dx + ox; const y = dy + oy;
      const t = Math.max(0, Math.min(CONFIG.spark.safetyHorizon, -(x * vx + y * vy) / (vx * vx + vy * vy || 1)));
      if (Math.hypot(x + vx * t, y + vy * t) < CONFIG.spark.safetyApproach) return false;
    }
    return true;
  }
  finishSparks(dt: number, rings: readonly Ring[], ship: Ship, playable: boolean, events: GameEvent[]): void {
    this.sparks = this.sparks.map((spark) => {
      if (Number.isFinite(spark.killedAt)) {
        const attached = this.attach(spark.id, rings, CONFIG.spark.replacementDelay, playable ? ship : undefined);
        attached.replacementWait = CONFIG.spark.replacementDelay;
        return attached;
      }
      if (spark.mode !== 'attached' || !playable) return spark;
      spark.remaining = countdown(spark.remaining, dt);
      spark.replacementWait = countdown(spark.replacementWait, dt);
      // Start at most one tick early so the visible warning is never shortened.
      if (!spark.warning && spark.remaining <= CONFIG.spark.warning + dt) {
        spark.warning = true; events.push({ type: 'spark-warning', x: spark.x, y: spark.y });
      }
      if (spark.remaining > 0) return spark;
      if (!this.safeToDetach(spark, ship)) {
        spark.remaining = CONFIG.spark.safetyDefer; spark.warning = false; return spark;
      }
      spark.mode = 'pursuing'; spark.warning = false; spark.detachedAge = 0; spark.turnVelocity = 0;
      // Keep the attachment's tangential velocity; accelerate from this modest
      // release speed along the visible outward heading, with no aim snap.
      events.push({ type: 'spark-detach', x: spark.x, y: spark.y });
      return spark;
    });
  }

  advanceOrbs(dt: number, rings: readonly Ring[]): void {
    for (const orb of this.orbs) {
      orb.previous = { x: orb.x, y: orb.y, angle: orb.angle };
      orb.x += orb.vx * dt; orb.y += orb.vy * dt;
      const exit = arenaExitTime(orb.previous, orb);
      orb.expiresAt = exit < 1 ? exit : Infinity;
      const end = orbAt(orb, exit);
      const hit = sweepCastle(rings, orb.previous, end, CONFIG.cannon.orbRadius, 0, exit, false);
      orb.absorbed = hit ? { ...hit, time: hit.time * exit } : undefined;
      if (orb.absorbed) orb.expiresAt = orb.absorbed.time;
    }
  }
  finishOrbs(events: GameEvent[]): void {
    this.orbs = this.orbs.filter((orb) => {
      if (orb.absorbed) events.push({ type: 'orb-absorbed', x: orb.absorbed.point.x, y: orb.absorbed.point.y });
      return !orb.absorbed && orb.x >= 0 && orb.x <= CONFIG.arena.width && orb.y >= 0 && orb.y <= CONFIG.arena.height;
    });
  }
  private ray(): { from: Vec; to: Vec } {
    const dx = Math.cos(this.cannon.angle); const dy = Math.sin(this.cannon.angle);
    const from = { x: CONFIG.castle.x + dx * CONFIG.castle.barrelLength, y: CONFIG.castle.y + dy * CONFIG.castle.barrelLength };
    const xDistance = dx > 1e-12 ? (CONFIG.arena.width - from.x) / dx : dx < -1e-12 ? -from.x / dx : Infinity;
    const yDistance = dy > 1e-12 ? (CONFIG.arena.height - from.y) / dy : dy < -1e-12 ? -from.y / dy : Infinity;
    const distance = Math.min(xDistance, yDistance);
    return { from, to: { x: from.x + dx * distance, y: from.y + dy * distance } };
  }
  advanceCannon(dt: number, rings: readonly Ring[], ship: Ship, events: GameEvent[]): void {
    const cannon = this.cannon;
    const target = Math.atan2(ship.y - CONFIG.castle.y, ship.x - CONFIG.castle.x);
    const track = (duration: number): void => {
      cannon.angle = wrap(cannon.angle + Math.max(-CONFIG.cannon.turnSpeed * duration, Math.min(CONFIG.cannon.turnSpeed * duration, angleDelta(cannon.angle, target))), TAU);
    };
    cannon.inhibit = countdown(cannon.inhibit, dt);
    let tracked = false;
    if (cannon.mode === 'recovery') {
      track(dt); cannon.remaining = countdown(cannon.remaining, dt);
      if (cannon.remaining > 0) return;
      cannon.mode = 'tracking'; tracked = true;
    }
    if (cannon.mode === 'charging' || cannon.mode === 'locked') {
      const lockAt = CONFIG.cannon.charge - CONFIG.cannon.lockedDuration;
      if (cannon.mode === 'charging') track(Math.min(dt, Math.max(0, lockAt - cannon.elapsed)));
      cannon.elapsed = Math.min(CONFIG.cannon.charge, cannon.elapsed + dt);
      if (CONFIG.cannon.charge - cannon.elapsed <= CONFIG.simulation.timerEpsilon) cannon.elapsed = CONFIG.cannon.charge;
      if (cannon.elapsed >= lockAt - CONFIG.simulation.timerEpsilon) cannon.mode = 'locked';
      if (cannon.elapsed < CONFIG.cannon.charge) return;
      const ray = this.ray();
      const clear = clearCastleRay(rings, ray.from, ray.to, CONFIG.cannon.orbRadius);
      if (clear && this.orbs.length < CONFIG.limits.enemyShots) {
        const pose = { ...ray.from, angle: cannon.angle };
        this.orbs.push({ ...pose, id: this.nextOrb++, previous: { ...pose },
          vx: Math.cos(cannon.angle) * CONFIG.cannon.orbSpeed, vy: Math.sin(cannon.angle) * CONFIG.cannon.orbSpeed, expiresAt: Infinity, absorbed: undefined });
        events.push({ type: 'cannon-fire', ...pose });
      } else events.push({ type: 'cannon-blocked', ...ray.from, angle: cannon.angle });
      cannon.mode = 'recovery'; cannon.remaining = CONFIG.cannon.recovery; cannon.elapsed = 0;
      return;
    }
    if (!tracked) track(dt);
    if (cannon.inhibit > 0 || Math.abs(angleDelta(cannon.angle, target)) > CONFIG.cannon.aimTolerance) return;
    const ray = this.ray();
    if (!clearCastleRay(rings, ray.from, ray.to, CONFIG.cannon.orbRadius)) return;
    cannon.mode = 'charging'; cannon.elapsed = 0;
    events.push({ type: 'cannon-charge' });
  }
}
