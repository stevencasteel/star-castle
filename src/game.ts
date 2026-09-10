import { CONFIG, TAU, roundParameters } from './config';
import type { InputSnapshot } from './input';
import { angleDelta, mix, wrap } from './math';
import type { Pose, Vec } from './math';
import { arenaExitTime, hullOverlapsAnnulus, hullSeparationDistance, sectorAlive, splitWrappedPath, sweepCastle, sweepCircles, sweepHullCircle } from './geometry';
import type { Contact } from './geometry';
import { Threats, sparkAt, orbAt } from './threats';
import type { Spark } from './threats';
import { safestSpawn } from './spawn';
export { angleDelta, wrap, wrappedDelta } from './math';

export interface Transform extends Pose {}
export interface Ship extends Transform {
  previous: Transform; vx: number; vy: number; protection: number; thrusting: boolean; stun: number; zapCooldown: number;
}
export interface Shot {
  id: number; x: number; y: number; previousX: number; previousY: number;
  vx: number; vy: number; angle: number;
}
export interface Segment { hp: number; destroyedAt: number; }
export interface Ring {
  radius: number; angle: number; previousAngle: number; speed: number;
  segments: Segment[]; rebuild: 'solid' | 'warning' | 'pending'; warning: number; rebuiltAt: number;
}
interface Impact { x: number; y: number; nx: number; ny: number; vx: number; vy: number; }
export type GameEvent =
  | { type: 'fire'; x: number; y: number; angle: number }
  | { type: 'reset' | 'spawn' | 'clear-input' }
  | ({ type: 'shield-hit' | 'segment-break'; ring: number; sector: number; tangentialX: number; tangentialY: number } & Impact)
  | { type: 'rebuild-start' | 'rebuild-pending' | 'rebuilt'; ring: number }
  | { type: 'core-hit'; x: number; y: number }
  | { type: 'zap'; x: number; y: number }
  | { type: 'life-gain'; index: number }
  | { type: 'round-start' }
  | { type: 'cannon-charge' }
  | { type: 'cannon-fire' | 'cannon-blocked'; x: number; y: number; angle: number }
  | { type: 'orb-absorbed' | 'spark-warning' | 'spark-detach' | 'spark-kill'; x: number; y: number }
  | { type: 'death'; x: number; y: number; angle: number; lifeIndex: number }
  | { type: 'castle-kill'; arcs: { radius: number; angle: number; speed: number; ring: number }[] };
interface ShotHit extends Contact { spark?: Spark; }
interface ShotCandidate { shot: Shot; hit: ShotHit; }

export class Game {
  ship: Ship;
  rings: Ring[] = [];
  shots: Shot[] = [];
  events: GameEvent[] = [];
  readonly threats = new Threats();
  coreHealth: number = CONFIG.castle.coreHealth;
  lives: number = CONFIG.lives.initial;
  round = 1;
  clears = 0;
  time = 0;
  state: 'playing' | 'respawning' | 'castle-destroyed' = 'playing';
  transition = 0;
  private cooldown = 0;
  private bufferedFire = -1;
  private nextShot = 0;
  private coreHit = false;

  get playable(): boolean { return this.state === 'playing'; }
  get castleAlive(): boolean { return this.state !== 'castle-destroyed'; }

  constructor() { this.ship = this.createShip(); this.reset(); }

  private createShip(transform: Pose = { x: CONFIG.ship.spawnX, y: CONFIG.ship.spawnY, angle: CONFIG.ship.spawnAngle }): Ship {
    return { ...transform, previous: { ...transform }, vx: 0, vy: 0, protection: CONFIG.ship.protection, thrusting: false, stun: 0, zapCooldown: 0 };
  }
  private createCastle(): void {
    const parameters = roundParameters(this.round);
    this.rings = CONFIG.castle.ringRadii.map((radius, index) => {
      const angle = CONFIG.castle.offsets[index] ?? 0;
      return { radius, angle, previousAngle: angle, speed: parameters.ringSpeeds[index] ?? 0,
        segments: Array.from({ length: CONFIG.castle.sectors }, () => ({ hp: CONFIG.castle.segmentHealth, destroyedAt: Infinity })),
        rebuild: 'solid', warning: 0, rebuiltAt: -Infinity };
    });
    this.coreHealth = CONFIG.castle.coreHealth;
    this.threats.castle(this.rings, this.round === 1, parameters.sparkSpeed);
  }
  reset(): void {
    this.lives = CONFIG.lives.initial; this.round = 1; this.clears = 0; this.time = 0;
    this.threats.reset(); this.ship = this.createShip(); this.createCastle();
    this.shots.length = 0; this.events.length = 0; this.events.push({ type: 'reset' });
    this.cooldown = 0; this.bufferedFire = -1; this.nextShot = 0;
    this.state = 'playing'; this.transition = 0; this.coreHit = false;
  }
  private spawn(): void {
    this.threats.spawn();
    this.ship = this.createShip(safestSpawn(this.rings, this.threats));
    this.state = 'playing'; this.cooldown = 0;
    this.clearFireBuffer(); this.events.push({ type: 'spawn' }, { type: 'clear-input' });
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt; this.coreHit = false;
    if (!this.playable) {
      this.clearFireBuffer(); this.ship.thrusting = false;
      this.transition = this.transition - dt <= CONFIG.simulation.timerEpsilon ? 0 : this.transition - dt;
      if (this.transition === 0) {
        if (this.lives === 0) { this.reset(); return; }
        if (this.state === 'castle-destroyed') { this.round++; this.createCastle(); this.events.push({ type: 'round-start' }); }
        this.spawn();
        // A released tap from an unplayable tick cannot become a spawn shot.
        input = { ...input, firePressed: false };
      }
    }
    if (!this.castleAlive) return;
    for (const ring of this.rings) {
      ring.previousAngle = ring.angle; ring.angle = wrap(ring.angle + ring.speed * dt, TAU);
      for (const segment of ring.segments) segment.destroyedAt = segment.hp > 0 ? Infinity : -Infinity;
    }
    this.threats.advanceSparks(dt, this.rings, this.ship, this.playable);
    // Existing bullets resolve chronologically. Destruction timestamps then let
    // the ship sweep see which arcs still existed at the moment of contact.
    this.advanceShots(dt);
    this.threats.advanceOrbs(dt, this.rings);
    let died = false;
    if (this.playable) {
      died = this.moveShip(dt, input);
      if (!died) this.fire(dt, input);
    }
    this.finishOutcomes(died);
    if (this.castleAlive) {
      this.updateRebuilds(dt);
      if (!died) this.threats.finishSparks(dt, this.rings, this.ship, this.playable, this.events);
      this.threats.finishOrbs(this.events);
      if (this.playable) this.threats.advanceCannon(dt, this.rings, this.ship, this.events);
    }
  }

  private moveShip(dt: number, input: InputSnapshot): boolean {
    const ship = this.ship;
    ship.previous = { x: ship.x, y: ship.y, angle: ship.angle };
    const targetAngle = ship.angle + (Number(input.right) - Number(input.left)) * CONFIG.ship.turnSpeed * dt;
    const thrustTime = Math.max(0, dt - ship.stun);
    ship.stun = ship.stun - dt <= CONFIG.simulation.timerEpsilon ? 0 : ship.stun - dt;
    ship.zapCooldown = Math.max(0, ship.zapCooldown - dt);
    ship.thrusting = input.thrust && ship.stun === 0;
    if (input.thrust && thrustTime > 0) {
      ship.vx += Math.cos(targetAngle) * CONFIG.ship.acceleration * thrustTime;
      ship.vy += Math.sin(targetAngle) * CONFIG.ship.acceleration * thrustTime;
    }
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > CONFIG.ship.speedCap) { ship.vx *= CONFIG.ship.speedCap / speed; ship.vy *= CONFIG.ship.speedCap / speed; }
    let cursor = 0;
    let heading = targetAngle;
    let transportX = 0; let transportY = 0;
    for (let iteration = 0; iteration < CONFIG.collision.maxSlideContacts && cursor < 1; iteration++) {
      const from = { x: ship.x, y: ship.y, angle: ship.angle };
      const remaining = dt * (1 - cursor);
      const to = { x: ship.x + (ship.vx + transportX) * remaining, y: ship.y + (ship.vy + transportY) * remaining, angle: heading };
      let collision: Contact | undefined;
      let pose = to;
      for (const piece of splitWrappedPath(from, to)) {
        const start = mix(cursor, 1, piece.start); const end = mix(cursor, 1, piece.end);
        const hit = sweepCastle(this.rings, piece.from, piece.to, 'hull', start, end);
        const hazard = this.hazardContact(piece.from, piece.to, start, end, ship.protection / dt);
        if (hazard !== undefined && (!hit || hazard < mix(start, end, hit.time))) {
          const fraction = (hazard - start) / (end - start);
          ship.x = wrap(mix(piece.from.x, piece.to.x, fraction), CONFIG.arena.width);
          ship.y = wrap(mix(piece.from.y, piece.to.y, fraction), CONFIG.arena.height);
          ship.angle = wrap(piece.from.angle + angleDelta(piece.from.angle, piece.to.angle) * fraction, TAU);
          ship.protection = 0; ship.thrusting = false; return true;
        }
        if (!hit) continue;
        const time = mix(piece.start, piece.end, hit.time);
        pose = { x: mix(piece.from.x, piece.to.x, hit.time), y: mix(piece.from.y, piece.to.y, hit.time), angle: piece.from.angle + angleDelta(piece.from.angle, piece.to.angle) * hit.time };
        collision = { ...hit, time: mix(cursor, 1, time) }; break;
      }
      ship.x = wrap(pose.x, CONFIG.arena.width); ship.y = wrap(pose.y, CONFIG.arena.height); ship.angle = wrap(pose.angle, TAU);
      if (!collision) { cursor = 1; break; }
      cursor = collision.time;
      // Protection is checked at time of contact, not after the entire tick.
      const ring = this.rings[collision.ring];
      if (!ring && ship.protection <= dt * cursor) {
        ship.protection = 0; ship.thrusting = false; return true;
      }
      const { normal, point } = collision;
      if (ring) this.zapShip(collision, dt * (1 - cursor));
      ship.x += normal.x * CONFIG.collision.separation; ship.y += normal.y * CONFIG.collision.separation;
      const inward = ship.vx * normal.x + ship.vy * normal.y;
      if (inward < 0) { ship.vx -= inward * normal.x; ship.vy -= inward * normal.y; }
      // Stop only the blocked rotation for this tick. Moving radial ends can
      // carry a protected hull out of their path; this transport is not momentum.
      heading = ship.angle;
      const surfaceX = ring ? -(point.y - CONFIG.castle.y) * ring.speed : 0;
      const surfaceY = ring ? (point.x - CONFIG.castle.x) * ring.speed : 0;
      const outward = Math.max(0, (surfaceX - ship.vx) * normal.x + (surfaceY - ship.vy) * normal.y);
      transportX = normal.x * outward; transportY = normal.y * outward;
    }
    // The last projection uses protection at the end of this tick. Live arcs
    // remain solid while zapped, including a closing wedge after a rebound.
    ship.protection = Math.max(0, ship.protection - dt);
    if (this.separateHull()) { ship.protection = 0; ship.thrusting = false; return true; }
    return false;
  }

  private zapShip(contact: Contact, remainingTime: number): void {
    const ship = this.ship;
    const inward = ship.vx * contact.normal.x + ship.vy * contact.normal.y;
    const rebound = Math.max(CONFIG.zap.bounceSpeed, -inward * CONFIG.zap.restitution);
    ship.vx += contact.normal.x * (rebound - inward);
    ship.vy += contact.normal.y * (rebound - inward);
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > CONFIG.ship.speedCap) { ship.vx *= CONFIG.ship.speedCap / speed; ship.vy *= CONFIG.ship.speedCap / speed; }
    // Contact always blocks and bounces. Debounce only the stun/cue so a sliding
    // hull cannot generate a burst of zaps from adjacent sectors in one tick.
    if (ship.zapCooldown <= CONFIG.simulation.timerEpsilon) {
      ship.stun = CONFIG.zap.duration - remainingTime;
      ship.zapCooldown = CONFIG.zap.retriggerDelay - remainingTime;
      this.events.push({ type: 'zap', x: contact.point.x, y: contact.point.y });
    }
    ship.thrusting = false;
  }

  private separateHull(): boolean {
    for (let i = 0; i < CONFIG.collision.maxSlideContacts; i++) {
      const ship = this.ship;
      const contact = sweepCastle(this.rings, ship, ship, 'hull', 1, 1);
      if (!contact) return false;
      if (this.rings[contact.ring]) this.zapShip(contact, 0);
      else if (ship.protection <= 0) return true;
      // Resolve edge-only overlaps with a separating plane, then check adjacent
      // sectors again. Do not rely on an arbitrary number of epsilon nudges.
      const amount = contact.distance <= 0 ? hullSeparationDistance(ship, this.rings, contact) : CONFIG.collision.separation;
      ship.x += contact.normal.x * amount; ship.y += contact.normal.y * amount;
      const inward = ship.vx * contact.normal.x + ship.vy * contact.normal.y;
      if (inward < 0) { ship.vx -= inward * contact.normal.x; ship.vy -= inward * contact.normal.y; }
    }
    return false;
  }

  private hazardContact(from: Pose, to: Pose, start: number, end: number, protectionEnd: number): number | undefined {
    let first: number | undefined;
    const check = (at: (t: number) => Vec, radius: number, aliveUntil: number): void => {
      const low = Math.max(start, protectionEnd); const high = Math.min(end, aliveUntil, first ?? end);
      if (high < low || aliveUntil <= low || low > end || end <= start) return;
      const sampleHull = (time: number): Pose => {
        const t = (time - start) / (end - start);
        return { x: mix(from.x, to.x, t), y: mix(from.y, to.y, t), angle: from.angle + angleDelta(from.angle, to.angle) * t };
      };
      const a = at(low); const b = at(high);
      // The ship wraps even though cannon orbs do not: opposite-edge copies of
      // its hull can contact an orb still inside the opposite arena boundary.
      for (const dx of [-CONFIG.arena.width, 0, CONFIG.arena.width]) for (const dy of [-CONFIG.arena.height, 0, CONFIG.arena.height]) {
        const hit = sweepHullCircle(sampleHull(low), sampleHull(high), { x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }, radius);
        if (hit !== undefined) {
          const time = mix(low, high, hit);
          if (time < aliveUntil && (first === undefined || time < first)) first = time;
        }
      }
    };
    for (const spark of this.threats.sparks) check((t) => sparkAt(spark, t), CONFIG.spark.radius, spark.killedAt);
    for (const orb of this.threats.orbs) check((t) => orbAt(orb, t), CONFIG.cannon.orbRadius, orb.expiresAt);
    return first;
  }

  private projectileContact(from: Pose, to: Pose, timeStart: number, timeEnd: number): ShotHit | undefined {
    let best: ShotHit | undefined = sweepCastle(this.rings, from, to, CONFIG.bullet.radius, timeStart, timeEnd);
    for (const spark of this.threats.sparks) {
      if (spark.killedAt <= timeStart) continue;
      const aliveFraction = timeEnd > timeStart ? Math.min(1, (spark.killedAt - timeStart) / (timeEnd - timeStart)) : 1;
      const until = Math.min(aliveFraction, best?.time ?? 1);
      const a = sparkAt(spark, timeStart); const b = sparkAt(spark, mix(timeStart, timeEnd, until));
      const bulletEnd = { x: mix(from.x, to.x, until), y: mix(from.y, to.y, until) };
      for (const dx of [-CONFIG.arena.width, 0, CONFIG.arena.width]) for (const dy of [-CONFIG.arena.height, 0, CONFIG.arena.height]) {
        const hit = sweepCircles(from, bulletEnd, { x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }, CONFIG.bullet.radius + CONFIG.spark.radius);
        if (hit === undefined) continue;
        const time = hit * until;
        if (mix(timeStart, timeEnd, time) >= spark.killedAt || (best && time >= best.time - CONFIG.collision.timeEpsilon)) continue;
        const x = mix(from.x, to.x, time); const y = mix(from.y, to.y, time);
        const centerX = mix(a.x, b.x, hit) + dx; const centerY = mix(a.y, b.y, hit) + dy;
        const distance = Math.hypot(x - centerX, y - centerY) || 1;
        const normal = { x: (x - centerX) / distance, y: (y - centerY) / distance };
        best = { time, normal, point: { x: centerX + normal.x * CONFIG.spark.radius, y: centerY + normal.y * CONFIG.spark.radius }, distance: 0, ring: -1, sector: spark.id, spark };
      }
    }
    return best;
  }
  private shotContact(shot: Shot, start = 0): ShotHit | undefined {
    const end = arenaExitTime({ x: shot.previousX, y: shot.previousY }, shot);
    if (start > end) return undefined;
    const from = { x: mix(shot.previousX, shot.x, start), y: mix(shot.previousY, shot.y, start), angle: shot.angle };
    const to = { x: mix(shot.previousX, shot.x, end), y: mix(shot.previousY, shot.y, end), angle: shot.angle };
    const hit = this.projectileContact(from, to, start, end);
    return hit ? { ...hit, time: mix(start, end, hit.time) } : undefined;
  }
  private advanceShots(dt: number): void {
    const queue: ShotCandidate[] = [];
    for (const shot of this.shots) {
      shot.previousX = shot.x; shot.previousY = shot.y;
      shot.x += shot.vx * dt; shot.y += shot.vy * dt;
      const hit = this.shotContact(shot); if (hit) queue.push({ shot, hit });
    }
    const consumed = new Set<number>();
    while (queue.length > 0) {
      queue.sort((a, b) => a.hit.time - b.hit.time || a.shot.id - b.shot.id);
      const next = queue.shift(); if (!next) break;
      const ring = this.rings[next.hit.ring];
      if ((ring && !sectorAlive(ring, next.hit.sector, next.hit.time)) || (next.hit.spark && next.hit.spark.killedAt <= next.hit.time)) {
        // An earlier bullet opened this sector. Continue this bullet's remaining
        // path instead of consuming it at geometry that no longer exists.
        const hit = this.shotContact(next.shot, Math.min(1, next.hit.time + CONFIG.collision.timeEpsilon));
        if (hit) queue.push({ shot: next.shot, hit });
        continue;
      }
      this.impact(next.hit, next.shot.vx, next.shot.vy); consumed.add(next.shot.id);
    }
    this.shots = this.shots.filter((shot) => !consumed.has(shot.id) && shot.x >= 0 && shot.x <= CONFIG.arena.width && shot.y >= 0 && shot.y <= CONFIG.arena.height);
  }
  private fire(dt: number, input: InputSnapshot): void {
    const remainder = this.cooldown > 0 ? Math.min(0, this.cooldown - dt) : 0;
    this.cooldown = Math.max(0, this.cooldown - dt); this.bufferedFire -= dt;
    if (input.firePressed) this.bufferedFire = CONFIG.bullet.buffer;
    if (this.cooldown > 0 || (!input.fire && this.bufferedFire < 0) || this.shots.length >= CONFIG.limits.playerShots) return;
    const ship = this.ship;
    const nose = CONFIG.ship.length * 2 / 3;
    const muzzle = { x: ship.x + Math.cos(ship.angle) * nose, y: ship.y + Math.sin(ship.angle) * nose, angle: ship.angle };
    const shotSpeed = CONFIG.bullet.speed * (ship.stun > 0 ? CONFIG.zap.shotSpeedMultiplier : 1);
    const shot: Shot = { id: this.nextShot++, ...muzzle, previousX: muzzle.x, previousY: muzzle.y,
      vx: Math.cos(ship.angle) * shotSpeed, vy: Math.sin(ship.angle) * shotSpeed };
    // Sweep the entire center-to-muzzle path at the firing instant. The shot is
    // accepted even when immediately absorbed, with feedback at the true contact.
    const exit = arenaExitTime(ship, muzzle);
    const end = { x: mix(ship.x, muzzle.x, exit), y: mix(ship.y, muzzle.y, exit), angle: ship.angle };
    const hit = this.projectileContact(ship, end, 1, 1);
    const x = hit ? mix(ship.x, end.x, hit.time) : end.x;
    const y = hit ? mix(ship.y, end.y, hit.time) : end.y;
    this.events.push({ type: 'fire', x, y, angle: ship.angle });
    if (hit) this.impact({ ...hit, time: 1 }, shot.vx, shot.vy);
    else if (muzzle.x >= 0 && muzzle.x <= CONFIG.arena.width && muzzle.y >= 0 && muzzle.y <= CONFIG.arena.height) this.shots.push(shot);
    this.cooldown = CONFIG.bullet.interval + remainder; this.bufferedFire = -1;
  }
  private impact(hit: ShotHit, vx: number, vy: number): void {
    if (hit.spark) {
      if (Number.isFinite(hit.spark.killedAt)) return;
      hit.spark.killedAt = hit.time;
      this.events.push({ type: 'spark-kill', x: hit.point.x, y: hit.point.y });
      return;
    }
    const ring = this.rings[hit.ring];
    if (!ring) {
      if (this.coreHealth <= 0) return;
      this.coreHealth--;
      this.events.push({ type: 'core-hit', x: hit.point.x, y: hit.point.y });
      if (this.coreHealth === 0) this.coreHit = true;
      return;
    }
    const segment = ring.segments[hit.sector]; if (!segment || segment.hp === 0) return;
    segment.hp--;
    if (segment.hp === 0) segment.destroyedAt = hit.time;
    this.events.push({ type: segment.hp === 0 ? 'segment-break' : 'shield-hit', ring: hit.ring, sector: hit.sector,
      x: hit.point.x, y: hit.point.y, nx: hit.normal.x, ny: hit.normal.y, vx, vy,
      tangentialX: -(hit.point.y - CONFIG.castle.y) * ring.speed, tangentialY: (hit.point.x - CONFIG.castle.x) * ring.speed });
  }
  private finishOutcomes(died: boolean): void {
    // A bullet can reach the core during a death beat. Only a living ship at
    // this tick's start, with no lethal contact this tick, survived the clear.
    const survived = this.playable && !died && this.lives > 0;
    if (died) {
      this.threats.death(this.rings);
      this.lives--; this.events.push({ type: 'death', x: this.ship.x, y: this.ship.y, angle: this.ship.angle, lifeIndex: this.lives });
      this.state = 'respawning'; this.transition = CONFIG.transitions.death;
    }
    if (this.coreHit) {
      this.clears++;
      const arcs: { radius: number; angle: number; speed: number; ring: number }[] = [];
      this.rings.forEach((ring, index) => ring.segments.forEach((segment, sector) => {
        if (segment.hp > 0) arcs.push({ radius: ring.radius, angle: ring.angle + (sector + 0.5) * TAU / CONFIG.castle.sectors, speed: ring.speed, ring: index });
        segment.hp = 0; segment.destroyedAt = -Infinity;
      }));
      this.events.push({ type: 'castle-kill', arcs });
      if (survived && this.clears % CONFIG.lives.clearInterval === 0 && this.lives < CONFIG.lives.maximum) {
        this.events.push({ type: 'life-gain', index: this.lives }); this.lives++;
      }
      this.shots.length = 0;
      this.threats.clear();
      this.state = 'castle-destroyed';
      // An old shot may clear the castle after a final death. Keep the existing
      // death deadline instead of extending it on that later impact.
      this.transition = this.lives === 0 ? this.transition : CONFIG.transitions.castle;
    }
    if (died || this.coreHit) { this.ship.thrusting = false; this.ship.stun = 0; this.ship.zapCooldown = 0; this.clearFireBuffer(); this.events.push({ type: 'clear-input' }); }
  }
  private updateRebuilds(dt: number): void {
    this.rings.forEach((ring, index) => {
      if (ring.segments.some((segment) => segment.hp > 0)) return;
      const occupied = this.playable && hullOverlapsAnnulus(this.ship, ring.radius);
      if (occupied) {
        if (ring.rebuild !== 'pending') this.events.push({ type: 'rebuild-pending', ring: index });
        ring.rebuild = 'pending'; ring.warning = CONFIG.castle.rebuildWarning; return;
      }
      if (ring.rebuild !== 'warning') {
        ring.rebuild = 'warning'; ring.warning = CONFIG.castle.rebuildWarning;
        this.events.push({ type: 'rebuild-start', ring: index }); return;
      }
      ring.warning = Math.max(0, ring.warning - dt);
      if (ring.warning > 0) return;
      // Ring regeneration does not heal the boss.
      for (const segment of ring.segments) { segment.hp = CONFIG.castle.segmentHealth; segment.destroyedAt = Infinity; }
      ring.rebuild = 'solid'; ring.rebuiltAt = this.time;
      this.events.push({ type: 'rebuilt', ring: index });
    });
  }

  drainEvents(): GameEvent[] { return this.events.splice(0); }
  clearFireBuffer(): void { this.bufferedFire = -1; }
}
