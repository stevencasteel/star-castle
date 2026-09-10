import { ACTIONS, BINDINGS, CONFIG, PALETTE, TAU } from './config';
import type { Action } from './config';
import { angleDelta, wrappedDelta } from './math';
import { sparkAt } from './threats';
import type { Game, GameEvent } from './game';
import type { Input } from './input';
import { ringBounds, ringAngle, SECTOR_ANGLE } from './geometry';

interface Particle { x: number; y: number; vx: number; vy: number; age: number; lifetime: number; color: string; size: number; angle: number; spin: number; arcRadius?: number; points?: readonly (readonly [number, number])[]; }
interface Pulse { x: number; y: number; age: number; lifetime: number; start: number; end: number; color: string; wave: boolean; }
interface Shake { age: number; duration: number; strength: number; phase: number; }
interface KeyFeedback { level: number; actual: boolean; pressed?: boolean; }
const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const RING_COLORS = [PALETTE.shieldOuter, PALETTE.shieldMiddle, PALETTE.shieldInner];

export class Renderer {
  private particles: Particle[] = [];
  private pulses: Pulse[] = [];
  private thrustAge = 0;
  private plume = 0;
  private emission = 0;
  private hintAge = 0;
  private hintOpacity = 1;
  private hintFading = false;
  private triedRotate = false;
  private triedThrust = false;
  private triedFire = false;
  private presentationTime = 0;
  private coreAccent = 0;
  private roundAccent = 0;
  private lifeGain = 0;
  private earnedLife = -1;
  private lifeLoss = 0;
  private lostLife = -1;
  private cannonRecoil = 0;
  private weapon = 0;
  private muteAccent = 0;
  private shipDestroyed = false;
  private shakes: Shake[] = [];
  private keys = new Map<Action, KeyFeedback>();
  private rebuildAccents = CONFIG.castle.ringRadii.map(() => 0);

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  replayHint(): void {
    this.hintAge = 0; this.hintOpacity = 0; this.hintFading = false;
    this.triedRotate = false; this.triedThrust = false; this.triedFire = false;
    this.keys.clear();
  }

  muteChanged(): void { this.muteAccent = CONFIG.feedback.statusAccent; }
  keyPressed(action: Action): void {
    this.keys.set(action, { level: 1, actual: true, pressed: true });
    if (action === 'left' || action === 'right') this.triedRotate = true;
    if (action === 'thrust') this.triedThrust = true;
  }
  suspend(): void {
    this.keys.clear(); this.shakes.length = 0;
    this.plume = 0; this.thrustAge = 0; this.emission = 0; this.weapon = 0;
  }
  private shake(strength: number, duration: number): void {
    if (this.shakes.length >= CONFIG.feedback.shakeImpulses) this.shakes.shift();
    this.shakes.push({ age: 0, duration, strength, phase: Math.random() * TAU });
  }

  consume(events: readonly GameEvent[]): void {
    for (const event of events) {
      if (event.type === 'reset') {
        this.particles.length = 0; this.pulses.length = 0;
        this.plume = 0; this.thrustAge = 0; this.emission = 0;
        this.coreAccent = 0;
        this.roundAccent = 0; this.lifeGain = 0; this.lifeLoss = 0;
        this.earnedLife = -1; this.lostLife = -1;
        this.cannonRecoil = 0;
        this.weapon = 0; this.shipDestroyed = false;
        this.shakes.length = 0; this.keys.clear(); this.muteAccent = 0;
        this.rebuildAccents.fill(0);
      } else if (event.type === 'fire') {
        this.weapon = CONFIG.feedback.weaponRecovery;
        this.pulse(event.x, event.y, CONFIG.feedback.muzzleDuration, CONFIG.feedback.muzzleStart, CONFIG.feedback.muzzleEnd, PALETTE.playerAccent);
        this.triedFire = true;
      } else if (event.type === 'zap') {
        this.plume = 0; this.thrustAge = 0; this.emission = 0;
        this.pulse(event.x, event.y, CONFIG.feedback.zapFlash, 8, 0, PALETTE.warning);
      } else if (event.type === 'core-hit') {
        this.coreAccent = CONFIG.feedback.coreHit;
        this.pulse(event.x, event.y, CONFIG.feedback.coreHit, 6, 0, PALETTE.player);
      } else if (event.type === 'cannon-fire' || event.type === 'cannon-blocked') {
        this.cannonRecoil = CONFIG.feedback.cannonRelease;
        const blocked = event.type === 'cannon-blocked';
        this.pulse(event.x, event.y, blocked ? CONFIG.feedback.cannonBlocked : CONFIG.feedback.cannonRelease,
          blocked ? 10 : 5, blocked ? 0 : 11, PALETTE.hostile);
      } else if (event.type === 'orb-absorbed') {
        this.pulse(event.x, event.y, CONFIG.feedback.orbAbsorb, CONFIG.feedback.orbAbsorbRadius, 0, PALETTE.hostile);
      } else if (event.type === 'spark-kill') {
        for (let i = 0; i < CONFIG.feedback.sparkFragments; i++) {
          const angle = i * TAU / CONFIG.feedback.sparkFragments;
          this.particle({ x: event.x, y: event.y, vx: Math.cos(angle) * 65, vy: Math.sin(angle) * 65,
            age: 0, lifetime: CONFIG.feedback.sparkLifetime, color: PALETTE.warning, size: 3, angle, spin: 0 });
        }
      } else if (event.type === 'shield-hit' || event.type === 'segment-break') {
        const broken = event.type === 'segment-break';
        if (broken) this.shake(CONFIG.feedback.breakShake, CONFIG.feedback.breakShakeTime);
        const color = RING_COLORS[event.ring] ?? PALETTE.shieldOuter;
        this.pulse(event.x, event.y, CONFIG.feedback.hitFlash, 5, 0, PALETTE.player);
        const count = broken ? CONFIG.feedback.breakFragments : CONFIG.feedback.hitFlecks;
        for (let i = 0; i < count; i++) {
          const incoming = Math.hypot(event.vx, event.vy) || 1;
          const direction = Math.atan2(event.ny - event.vy / incoming * 0.35, event.nx - event.vx / incoming * 0.35) + (Math.random() - 0.5) * 1.6;
          const speed = CONFIG.feedback.breakSpeedMin + Math.random() * (CONFIG.feedback.breakSpeedMax - CONFIG.feedback.breakSpeedMin);
          this.particle({ x: event.x, y: event.y,
            vx: Math.cos(direction) * speed + (broken ? event.tangentialX : 0),
            vy: Math.sin(direction) * speed + (broken ? event.tangentialY : 0),
            age: 0, lifetime: broken ? CONFIG.feedback.breakLifetime : CONFIG.feedback.hitLifetime,
            color, size: broken ? 3 + Math.random() * 3 : 2, angle: direction, spin: (Math.random() - 0.5) * 10 });
        }
      } else if (event.type === 'death') {
        this.particles.splice(0, Math.max(0, this.particles.length + CONFIG.feedback.deathFragments - CONFIG.limits.particles));
        this.shipDestroyed = true; this.weapon = 0;
        this.shake(CONFIG.feedback.deathShake, CONFIG.feedback.deathShakeTime);
        this.lostLife = event.lifeIndex; this.lifeLoss = CONFIG.feedback.lifeLoss;
        this.plume = 0;
        this.cannonRecoil = 0;
        // Fourteen edge pieces initially assemble the actual hull outline.
        const hull = [[16, 0], [-8, -8], [-8, 8], [16, 0]] as const;
        for (let edge = 0; edge < 3; edge++) {
          const a = hull[edge]!; const b = hull[edge + 1]!;
          const count = edge === 1 ? 4 : 5;
          for (let part = 0; part < count; part++) {
            const x1 = a[0] + (b[0] - a[0]) * part / count;
            const y1 = a[1] + (b[1] - a[1]) * part / count;
            const x2 = a[0] + (b[0] - a[0]) * (part + 1) / count;
            const y2 = a[1] + (b[1] - a[1]) * (part + 1) / count;
            const x = (x1 + x2) / 2; const y = (y1 + y2) / 2;
            const direction = event.angle + Math.atan2(y, x); const speed = 35 + Math.random() * 70;
            this.particle({ x: event.x + Math.cos(event.angle) * x - Math.sin(event.angle) * y,
              y: event.y + Math.sin(event.angle) * x + Math.cos(event.angle) * y,
              vx: Math.cos(direction) * speed, vy: Math.sin(direction) * speed,
              age: 0, lifetime: CONFIG.feedback.deathLifetime, color: PALETTE.player, size: 1,
              angle: event.angle, spin: (Math.random() - 0.5) * 8, points: [[x1 - x, y1 - y], [x2 - x, y2 - y]] });
          }
        }
      } else if (event.type === 'castle-kill') {
        this.rebuildAccents.fill(0);
        this.particles.splice(0, Math.max(0, this.particles.length + event.arcs.length * 3 + 12 - CONFIG.limits.particles));
        this.weapon = 0;
        this.shake(CONFIG.feedback.castleShake, CONFIG.feedback.castleShakeTime);
        this.plume = 0;
        this.cannonRecoil = 0;
        this.pulse(CONFIG.castle.x, CONFIG.castle.y, CONFIG.feedback.waveLifetime, CONFIG.castle.coreRadius, CONFIG.feedback.waveRadius, PALETTE.warning, true);
        event.arcs.forEach((arc, index) => {
          const color = RING_COLORS[arc.ring] ?? PALETTE.shieldOuter;
          for (let i = 0; i < 3; i++) {
            const angle = arc.angle + (i - 1) * SECTOR_ANGLE / 3;
            const x = Math.cos(angle) * arc.radius; const y = Math.sin(angle) * arc.radius;
            const delay = event.arcs.length > 0 ? index / event.arcs.length * CONFIG.feedback.castleStagger : 0;
            this.particle({ x: CONFIG.castle.x + x, y: CONFIG.castle.y + y,
              vx: Math.cos(angle) * 95 - y * arc.speed, vy: Math.sin(angle) * 95 + x * arc.speed,
              age: -delay, lifetime: CONFIG.feedback.castleLifetime - delay, color, size: arc.radius * SECTOR_ANGLE / 7, angle: angle + Math.PI / 2, spin: arc.speed * 3, arcRadius: arc.radius });
          }
        });
        for (let i = 0; i < 12; i++) {
          const angle = i * TAU / 12;
          this.particle({ x: CONFIG.castle.x, y: CONFIG.castle.y, vx: Math.cos(angle) * 120, vy: Math.sin(angle) * 120,
            age: 0, lifetime: 0.4, color: PALETTE.hostile, size: 5, angle, spin: 4, points: [[-4, -3], [4, -3], [6, 2]] });
        }
      } else if (event.type === 'life-gain') {
        this.earnedLife = event.index; this.lifeGain = CONFIG.feedback.lifeGain;
      } else if (event.type === 'round-start') {
        this.coreAccent = 0;
        this.roundAccent = CONFIG.feedback.roundAccent;
      } else if (event.type === 'rebuilt') {
        this.rebuildAccents[event.ring] = CONFIG.feedback.rebuildAccent;
      } else if (event.type === 'spawn') {
        this.weapon = 0; this.shipDestroyed = false;
        this.plume = 0; this.thrustAge = 0; this.emission = 0;
      }
    }
  }

  private particle(particle: Particle): void {
    if (this.particles.length < CONFIG.limits.particles) this.particles.push(particle);
  }
  private pulse(x: number, y: number, lifetime: number, start: number, end: number, color: string, wave = false): void {
    if (this.pulses.length < CONFIG.limits.playerShots * 2) this.pulses.push({ x, y, lifetime, start, end, color, wave, age: 0 });
  }

  update(dt: number, game: Game, input: Input, reducedMotion: boolean): void {
    this.presentationTime += dt;
    this.coreAccent = Math.max(0, this.coreAccent - dt);
    this.muteAccent = Math.max(0, this.muteAccent - dt);
    this.weapon = Math.max(0, this.weapon - dt);
    this.rebuildAccents = this.rebuildAccents.map((remaining) => Math.max(0, remaining - dt));
    this.shakes = reducedMotion ? [] : this.shakes.filter((shake) => { shake.age += dt; return shake.age < shake.duration; });
    this.roundAccent = Math.max(0, this.roundAccent - dt);
    this.lifeGain = Math.max(0, this.lifeGain - dt);
    this.lifeLoss = Math.max(0, this.lifeLoss - dt);
    this.cannonRecoil = Math.max(0, this.cannonRecoil - dt);
    this.hintAge += dt;
    this.triedRotate ||= input.isHeld('left') || input.isHeld('right');
    this.triedThrust ||= input.isHeld('thrust');
    if ((this.hintAge >= CONFIG.feedback.hintMinimum && this.triedRotate && this.triedThrust && this.triedFire)
      || this.hintAge >= CONFIG.feedback.hintMaximum) this.hintFading = true;
    this.hintOpacity = this.hintFading
      ? Math.max(0, this.hintOpacity - dt / CONFIG.feedback.hintFade)
      : Math.min(1, this.hintOpacity + dt / CONFIG.feedback.hintReveal);
    for (const action of ACTIONS) {
      const key = this.keys.get(action) ?? { level: 0, actual: false };
      key.actual ||= input.isHeld(action);
      const demo = !key.actual && this.demoActive(action, reducedMotion);
      key.level = key.pressed || input.isHeld(action) || demo ? 1 : Math.max(0, key.level - dt / CONFIG.feedback.keyRelease);
      key.pressed = false;
      this.keys.set(action, key);
    }

    if (game.playable && game.ship.stun <= 0 && input.isHeld('thrust')) {
      this.thrustAge += dt;
      const { thrustAttack, thrustSettle, plumePeak, plumeRest } = CONFIG.feedback;
      this.plume = this.thrustAge < thrustAttack
        ? plumePeak * this.thrustAge / thrustAttack
        : plumeRest + (plumePeak - plumeRest) * Math.pow(1 - Math.min(1, (this.thrustAge - thrustAttack) / thrustSettle), 3);
      this.emission += dt * CONFIG.feedback.particleRate * (reducedMotion ? 0.3 : 1);
      while (this.emission >= 1) {
        this.emission--;
        if (this.particles.length >= CONFIG.limits.particles) continue;
        const direction = game.ship.angle + Math.PI + (Math.random() - 0.5) * 0.5;
        this.particles.push({
          x: game.ship.x - Math.cos(game.ship.angle) * 9,
          y: game.ship.y - Math.sin(game.ship.angle) * 9,
          vx: game.ship.vx + Math.cos(direction) * 65, vy: game.ship.vy + Math.sin(direction) * 65,
          age: 0, lifetime: CONFIG.feedback.particleLifetime, color: PALETTE.playerAccent, size: 1.5, angle: direction, spin: 0,
        });
      }
    } else {
      this.thrustAge = 0; this.emission = 0;
      this.plume = Math.max(0, this.plume - CONFIG.feedback.plumePeak * dt / CONFIG.feedback.thrustRelease);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!p) continue;
      const travel = Math.max(0, dt + Math.min(0, p.age)); p.age += dt;
      if (p.age >= 0) { p.x += p.vx * travel * (reducedMotion ? CONFIG.feedback.reducedParticleTravel : 1); p.y += p.vy * travel * (reducedMotion ? CONFIG.feedback.reducedParticleTravel : 1); p.angle += reducedMotion ? 0 : p.spin * travel; }
      if (p.age >= p.lifetime) this.particles.splice(i, 1);
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pulse = this.pulses[i];
      if (!pulse) continue;
      pulse.age += dt;
      if (pulse.age >= pulse.lifetime) this.pulses.splice(i, 1);
    }
  }

  draw(game: Game, input: Input, alpha: number, muted: boolean, reducedMotion: boolean): void {
    const c = this.ctx;
    c.globalAlpha = 1;
    c.fillStyle = PALETTE.background;
    c.fillRect(0, 0, CONFIG.arena.width, CONFIG.arena.compositionHeight);
    c.save();
    c.beginPath(); c.rect(0, CONFIG.arena.hud, CONFIG.arena.width, CONFIG.arena.height); c.clip();
    c.translate(0, CONFIG.arena.hud);
    if (!reducedMotion) {
      let sx = 0; let sy = 0;
      for (const shake of this.shakes) {
        const strength = shake.strength * Math.pow(1 - shake.age / shake.duration, 3);
        sx += Math.cos(shake.phase + shake.age * 85) * strength;
        sy += Math.sin(shake.phase + shake.age * 97) * strength;
      }
      const scale = Math.min(1, CONFIG.feedback.shakeCap / (Math.hypot(sx, sy) || 1));
      c.translate(sx * scale, sy * scale);
    }
    this.castle(game, alpha);
    this.effects(reducedMotion);
    this.threats(game, alpha, reducedMotion);
    for (const shot of game.shots) {
      const x = shot.previousX + (shot.x - shot.previousX) * alpha;
      const y = shot.previousY + (shot.y - shot.previousY) * alpha;
      c.beginPath(); c.moveTo(x, y);
      c.lineTo(x - Math.cos(shot.angle) * CONFIG.bullet.trail, y - Math.sin(shot.angle) * CONFIG.bullet.trail);
      this.stroke(PALETTE.playerAccent, 1.5);
      c.fillStyle = PALETTE.playerShot;
      c.beginPath(); c.arc(x, y, CONFIG.bullet.radius, 0, TAU); c.fill();
    }
    const ship = game.ship;
    const shipAlpha = game.playable ? alpha : 1;
    const x = ship.previous.x + wrappedDelta(ship.previous.x, ship.x, CONFIG.arena.width) * shipAlpha;
    const y = ship.previous.y + wrappedDelta(ship.previous.y, ship.y, CONFIG.arena.height) * shipAlpha;
    // Local heading reads the latest authoritative tick to avoid extra steering latency.
    // Nine clipped copies keep both position interpolation and protection continuous at edges.
    if (!this.shipDestroyed) for (const dx of [-CONFIG.arena.width, 0, CONFIG.arena.width]) {
      for (const dy of [-CONFIG.arena.height, 0, CONFIG.arena.height]) {
        if (x + dx < -36 || x + dx > CONFIG.arena.width + 36 || y + dy < -36 || y + dy > CONFIG.arena.height + 36) continue;
        this.ship(x + dx, y + dy, ship.angle, ship.protection, ship.stun, reducedMotion);
      }
    }
    this.rebuildWarnings(game);
    this.cannonTelegraph(game);
    c.restore();
    this.hud(game, input, muted, reducedMotion);
  }

  private stroke(color: string, width: number = CONFIG.feedback.silhouetteStroke, glow = true): void {
    const c = this.ctx;
    c.strokeStyle = color;
    if (glow) {
      const alpha = c.globalAlpha;
      c.globalAlpha = alpha * CONFIG.feedback.glowOpacity;
      c.lineWidth = CONFIG.feedback.glowWidth; c.stroke(); c.globalAlpha = alpha;
    }
    c.lineWidth = width; c.stroke();
  }

  private castle(game: Game, alpha: number): void {
    const c = this.ctx;
    const reconstructing = !game.castleAlive && game.lives > 0 && game.transition <= CONFIG.transitions.reconstruction;
    if (!game.castleAlive && !reconstructing) return;
    c.save(); c.translate(CONFIG.castle.x, CONFIG.castle.y);
    const visibility = reconstructing ? 1 - game.transition / CONFIG.transitions.reconstruction : 1;
    game.rings.forEach((ring, index) => {
      const angle = reconstructing ? (CONFIG.castle.offsets[index] ?? 0) : ringAngle(ring, alpha);
      const { inner, outer } = ringBounds(ring.radius);
      const color = RING_COLORS[index] ?? PALETTE.shieldOuter;
      for (let sector = 0; sector < CONFIG.castle.sectors; sector++) {
        const segment = ring.segments[sector];
        if (!segment || (!reconstructing && segment.hp === 0)) continue;
        const a = angle + sector * SECTOR_ANGLE; const b = a + SECTOR_ANGLE;
        c.beginPath(); c.arc(0, 0, outer, a, b); c.arc(0, 0, inner, b, a, true); c.closePath();
        c.fillStyle = color; c.globalAlpha = 0.13 * visibility; c.fill();
        c.globalAlpha = visibility;
        c.beginPath(); c.arc(0, 0, outer, a, b);
        c.moveTo(Math.cos(a) * inner, Math.sin(a) * inner); c.arc(0, 0, inner, a, b);
        this.stroke(color, CONFIG.feedback.secondaryStroke);
        // Live neighbours share a muted material joint. An exposed sector end
        // gets a solid radial boundary; there are no artificial seam gaps.
        const previousAlive = reconstructing || (ring.segments[(sector + CONFIG.castle.sectors - 1) % CONFIG.castle.sectors]?.hp ?? 0) > 0;
        c.globalAlpha = visibility * (previousAlive ? 0.55 : 1);
        c.beginPath(); c.moveTo(Math.cos(a) * inner, Math.sin(a) * inner); c.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
        this.stroke(color, CONFIG.feedback.secondaryStroke, false);
        if (!reconstructing && (ring.segments[(sector + 1) % CONFIG.castle.sectors]?.hp ?? 0) === 0) {
          c.globalAlpha = visibility; c.beginPath(); c.moveTo(Math.cos(b) * inner, Math.sin(b) * inner); c.lineTo(Math.cos(b) * outer, Math.sin(b) * outer);
          this.stroke(color, CONFIG.feedback.secondaryStroke, false);
        }
        if (!reconstructing && segment.hp === 1) {
          c.globalAlpha = 1; c.beginPath();
          for (let mark = 0; mark < 5; mark++) {
            const theta = a + SECTOR_ANGLE * (0.28 + mark * 0.11);
            const radius = ring.radius + (mark % 2 === 0 ? -2 : 2);
            if (mark === 0) c.moveTo(Math.cos(theta) * radius, Math.sin(theta) * radius);
            else c.lineTo(Math.cos(theta) * radius, Math.sin(theta) * radius);
          }
          this.stroke(PALETTE.text, 1.5, false);
        }
      }
    });
    c.globalAlpha = visibility;
    c.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = i * TAU / 8 + Math.PI / 8;
      const x = Math.cos(a) * CONFIG.castle.coreRadius;
      const y = Math.sin(a) * CONFIG.castle.coreRadius;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.fillStyle = PALETTE.keyFill; c.fill(); this.stroke(PALETTE.hostile);
    c.beginPath(); c.arc(0, 0, CONFIG.castle.coreRadius, 0, TAU); this.stroke(PALETTE.hostile, 1.5, false);
    c.beginPath(); c.arc(0, 0, 8, 0, TAU); this.stroke(PALETTE.warning, 1.5, false);
    // A segmented inner charge meter mirrors the HUD without expanding the
    // collision silhouette. Missing cells stay dark; damage never heals on death.
    const health = reconstructing ? CONFIG.castle.coreHealth : game.coreHealth;
    for (let cell = 0; cell < CONFIG.castle.coreHealth; cell++) {
      const a = -Math.PI / 2 + cell * TAU / CONFIG.castle.coreHealth;
      c.globalAlpha = visibility * (cell < health ? 1 : 0.18);
      c.beginPath(); c.arc(0, 0, 13, a + 0.12, a + TAU / CONFIG.castle.coreHealth - 0.12);
      this.stroke(PALETTE.warning, 2, false);
    }
    if (!reconstructing && this.coreAccent > 0) {
      c.globalAlpha = Math.pow(this.coreAccent / CONFIG.feedback.coreHit, 3);
      c.beginPath(); c.arc(0, 0, CONFIG.castle.coreRadius, 0, TAU); this.stroke(PALETTE.player, 2, false);
    }
    c.globalAlpha = visibility;
    const cannon = game.threats.cannon;
    const cannonAngle = cannon.mode === 'locked' ? cannon.angle : cannon.previousAngle + angleDelta(cannon.previousAngle, cannon.angle) * alpha;
    c.save(); c.rotate(cannonAngle);
    const recoil = CONFIG.feedback.cannonRecoil * Math.pow(this.cannonRecoil / CONFIG.feedback.cannonRelease, 3);
    c.beginPath(); c.moveTo(16, -5); c.lineTo(CONFIG.castle.barrelLength - recoil, -5);
    c.lineTo(CONFIG.castle.barrelLength - recoil, 5); c.lineTo(16, 5);
    this.stroke(PALETTE.hostile);
    c.restore();
    c.restore();
  }

  private threats(game: Game, alpha: number, reducedMotion: boolean): void {
    if (!game.castleAlive) return;
    const c = this.ctx;
    for (const orb of game.threats.orbs) {
      const x = orb.previous.x + (orb.x - orb.previous.x) * alpha;
      const y = orb.previous.y + (orb.y - orb.previous.y) * alpha;
      c.save(); c.translate(x, y); c.rotate(orb.angle);
      c.fillStyle = PALETTE.hostile; c.globalAlpha = 0.15;
      const stretch = reducedMotion ? 0 : CONFIG.feedback.orbHaloStretch * Math.sin(this.presentationTime * 18 + orb.id);
      c.beginPath(); c.ellipse(0, 0, CONFIG.cannon.orbRadius + 4 + stretch, CONFIG.cannon.orbRadius + 2, 0, 0, TAU); c.fill();
      c.globalAlpha = 1;
      c.beginPath(); c.arc(0, 0, CONFIG.cannon.orbRadius, 0, TAU); c.fill();
      c.fillStyle = PALETTE.warning; c.beginPath(); c.arc(1, 0, 3, 0, TAU); c.fill();
      c.restore();
    }
    for (const spark of game.threats.sparks) {
      const pose = sparkAt(spark, alpha);
      const warningProgress = spark.warning ? Math.max(0, 1 - spark.remaining / CONFIG.spark.warning) : 0;
      let scale = 1;
      if (!reducedMotion) {
        if (spark.warning) scale -= CONFIG.feedback.sparkContraction * warningProgress;
        else if (spark.detachedAge < CONFIG.feedback.sparkRelease) scale -= CONFIG.feedback.sparkContraction * Math.pow(1 - spark.detachedAge / CONFIG.feedback.sparkRelease, 3);
      }
      for (const dx of [-CONFIG.arena.width, 0, CONFIG.arena.width]) for (const dy of [-CONFIG.arena.height, 0, CONFIG.arena.height]) {
        const x = pose.x + dx; const y = pose.y + dy;
        if (x < -30 || x > CONFIG.arena.width + 30 || y < -30 || y > CONFIG.arena.height + 30) continue;
        c.save(); c.translate(x, y); c.rotate(pose.angle);
        if (spark.mode === 'attached') {
          c.globalAlpha = 0.65; c.beginPath();
          c.moveTo(-CONFIG.spark.attachmentOffset, -3); c.lineTo(-CONFIG.spark.attachmentOffset, 3);
          c.moveTo(-CONFIG.spark.attachmentOffset, 0); c.lineTo(-6, 0);
          this.stroke(PALETTE.warning, 1.5, false); c.globalAlpha = 1;
        } else {
          const turn = Math.atan2(spark.vy, spark.vx) - pose.angle;
          c.globalAlpha = 0.4; c.beginPath(); c.moveTo(-6, 0);
          const tailX = -6 - Math.cos(turn) * CONFIG.feedback.sparkTail;
          const tailY = -Math.sin(turn) * CONFIG.feedback.sparkTail;
          c.quadraticCurveTo(-10, reducedMotion ? 0 : spark.turnVelocity * 1.5, tailX, tailY);
          this.stroke(PALETTE.warning, 1.5, false); c.globalAlpha = 1;
        }
        // Only the outer spikes contract. The collision center stays visible.
        c.fillStyle = PALETTE.warning; c.globalAlpha = 0.2;
        c.beginPath(); c.arc(0, 0, CONFIG.spark.radius, 0, TAU); c.fill(); c.globalAlpha = 1;
        c.beginPath();
        const points = [[9, 0], [6, -2], [5, -6], [1, -6], [-3, -7], [-5, -4], [-9, -1], [-6, 2], [-5, 6], [-1, 6], [3, 7], [5, 4]];
        points.forEach(([px = 0, py = 0], index) => {
          const radius = Math.hypot(px, py);
          const factor = radius > CONFIG.spark.radius ? Math.max(CONFIG.spark.radius, radius * scale) / radius : 1;
          if (index === 0) c.moveTo(px * factor, py * factor); else c.lineTo(px * factor, py * factor);
        });
        c.closePath(); this.stroke(PALETTE.warning, 2);
        if (spark.warning) {
          // Opposing spikes signal a pending launch even with sound muted.
          const offset = 13 - (reducedMotion ? 0 : warningProgress * 2);
          c.beginPath();
          for (const side of [-1, 1]) {
            c.moveTo(-4, side * offset); c.lineTo(0, side * (offset - 3)); c.lineTo(4, side * offset);
          }
          this.stroke(PALETTE.warning, 2, false);
        }
        c.restore();
      }
    }
  }

  private cannonTelegraph(game: Game): void {
    const cannon = game.threats.cannon;
    if (!game.castleAlive || (cannon.mode !== 'charging' && cannon.mode !== 'locked')) return;
    const c = this.ctx;
    const progress = Math.min(1, cannon.elapsed / CONFIG.cannon.charge);
    c.save(); c.translate(CONFIG.castle.x, CONFIG.castle.y); c.rotate(cannon.angle);
    const muzzle = CONFIG.castle.barrelLength;
    const spacing = 13 - progress * 7;
    c.beginPath();
    for (const side of [-1, 1]) {
      c.moveTo(muzzle - 5, side * spacing); c.lineTo(muzzle + 3, side * spacing); c.lineTo(muzzle + 3, side * (spacing - 3));
    }
    this.stroke(PALETTE.warning, cannon.mode === 'locked' ? 3 : 2);
    c.globalAlpha = 0.2 + progress * 0.55; c.fillStyle = PALETTE.hostile;
    c.beginPath(); c.arc(muzzle, 0, 3 + progress * 2, 0, TAU); c.fill(); c.globalAlpha = 1;
    if (cannon.mode === 'locked') {
      c.beginPath(); c.moveTo(muzzle + 7, -4); c.lineTo(muzzle + 11, 0); c.lineTo(muzzle + 7, 4);
      this.stroke(PALETTE.warning, 2, false);
    }
    c.restore();
  }

  private rebuildWarnings(game: Game): void {
    if (!game.castleAlive) return;
    const c = this.ctx;
    c.save(); c.translate(CONFIG.castle.x, CONFIG.castle.y);
    game.rings.forEach((ring, index) => {
      const color = RING_COLORS[index] ?? PALETTE.shieldOuter;
      const { inner, outer } = ringBounds(ring.radius);
      if (ring.rebuild === 'solid') {
        const accent = this.rebuildAccents[index] ?? 0;
        if (accent <= 0) return;
        c.globalAlpha = 0.35 * Math.pow(accent / CONFIG.feedback.rebuildAccent, 3);
        ring.segments.forEach((segment, sector) => {
          if (segment.hp === 0) return;
          const start = ring.angle + sector * SECTOR_ANGLE;
          c.beginPath(); c.arc(0, 0, ring.radius, start, start + SECTOR_ANGLE); this.stroke(color, 2, false);
        });
        return;
      }
      // Both pending and warning remain visibly dashed and physically absent.
      // Convergence and solidity use simulation time, including focus suspension.
      const offset = 6 * (ring.rebuild === 'pending' ? 1 : ring.warning / CONFIG.castle.rebuildWarning);
      c.globalAlpha = 0.85; c.setLineDash([5, 5]);
      c.beginPath(); c.arc(0, 0, outer + offset, 0, TAU); c.moveTo(inner - offset, 0); c.arc(0, 0, inner - offset, 0, TAU);
      this.stroke(color, 1.5, false); c.setLineDash([]);
    });
    c.restore();
  }

  private ship(x: number, y: number, angle: number, protection: number, stun: number, reducedMotion: boolean): void {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(angle);
    if (this.plume > 0 && stun <= 0) {
      const flicker = reducedMotion ? 1 : 0.9 + 0.1 * Math.sin(this.presentationTime * 67);
      c.beginPath(); c.moveTo(-7, -4); c.lineTo(-8 - this.plume * flicker, 0); c.lineTo(-7, 4);
      c.globalAlpha = Math.min(1, this.plume / CONFIG.feedback.plumeRest);
      this.stroke(PALETTE.playerAccent, 1.5); c.globalAlpha = 1;
    }
    // Keep the 85% triangle strictly within the visible hull. The rear notch is
    // an interior engine detail rather than a cutout through the collision hull.
    c.beginPath(); c.moveTo(16, 0); c.lineTo(-8, -8); c.lineTo(-8, 8); c.closePath();
    this.stroke(PALETTE.player);
    c.beginPath(); c.moveTo(-8, -6); c.lineTo(-4, 0); c.lineTo(-8, 6); this.stroke(PALETTE.playerAccent, 1.5, false);
    c.save();
    if (!reducedMotion && this.plume > 0) c.scale(1 + CONFIG.feedback.engineStretch * Math.min(1, this.plume / 18), 1);
    c.beginPath(); c.moveTo(-3, -3); c.lineTo(3, 0); c.lineTo(-3, 3);
    this.stroke(PALETTE.playerAccent, 1.5, false); c.restore();
    if (this.weapon > 0) {
      const recovery = Math.pow(this.weapon / CONFIG.feedback.weaponRecovery, 3);
      const offset = reducedMotion ? 0 : CONFIG.feedback.weaponOffset * recovery;
      c.globalAlpha = recovery; c.beginPath();
      c.moveTo(6 - offset, -2); c.lineTo(10 - offset, 0); c.lineTo(6 - offset, 2);
      this.stroke(PALETTE.playerAccent, 1.5, false); c.globalAlpha = 1;
    }
    if (protection > 0) {
      const length = 5 * Math.min(1, protection / 0.3);
      c.beginPath();
      for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
        const px = sx > 0 ? 22 : -14; const py = sy * 14;
        c.moveTo(px, py - sy * length); c.lineTo(px, py); c.lineTo(px - sx * length, py);
      }
      this.stroke(PALETTE.playerAccent, 1.5, false);
    }
    if (stun > 0) {
      // Electrical brackets surround a stable, fully visible hull. No fake
      // displacement, whiteout, or blink: the timer is authoritative simulation.
      const phase = reducedMotion ? 0 : (CONFIG.zap.duration - stun) * TAU * 2;
      c.globalAlpha = reducedMotion ? 0.85 : 0.8 + Math.sin(phase) * 0.15;
      c.beginPath();
      for (const side of [-1, 1]) {
        c.moveTo(-12, side * 11); c.lineTo(-5, side * 13);
        c.lineTo(-2, side * 9); c.lineTo(5, side * 12);
        c.lineTo(8, side * 8); c.lineTo(18, side * 6);
      }
      this.stroke(PALETTE.warning, 2, false);
      c.globalAlpha = 0.7; c.beginPath();
      c.arc(0, 0, CONFIG.feedback.zapRadius, -Math.PI / 2, -Math.PI / 2 + TAU * stun / CONFIG.zap.duration);
      this.stroke(PALETTE.warning, 1.5, false);
    }
    c.restore();
    if (stun > 0) {
      c.save(); c.textAlign = 'center';
      this.text(`ZAPPED ${stun.toFixed(1)}s`, x, y + 36, PALETTE.warning, 12);
      c.restore();
    }
  }

  private effects(reducedMotion: boolean): void {
    const c = this.ctx;
    c.strokeStyle = PALETTE.playerAccent; c.lineWidth = 1.5;
    for (const p of this.particles) {
      if (p.age < 0) continue;
      const fade = 1 - p.age / p.lifetime;
      c.globalAlpha = (reducedMotion ? CONFIG.feedback.reducedParticleOpacity : CONFIG.feedback.particleOpacity) * fade * fade * fade;
      c.strokeStyle = p.color;
      if (p.points || p.arcRadius) {
        c.save(); c.translate(p.x, p.y); c.rotate(p.angle); c.scale(fade, fade); c.beginPath();
        if (p.points) p.points.forEach(([x, y], index) => { if (index === 0) c.moveTo(x, y); else c.lineTo(x, y); });
        else if (p.arcRadius) c.arc(0, p.arcRadius, p.arcRadius, -Math.PI / 2 - p.size / p.arcRadius, -Math.PI / 2 + p.size / p.arcRadius);
        c.stroke(); c.restore(); continue;
      }
      const dx = Math.cos(p.angle) * p.size * fade; const dy = Math.sin(p.angle) * p.size * fade;
      c.beginPath(); c.moveTo(p.x - dx, p.y - dy); c.lineTo(p.x, p.y); c.lineTo(p.x + dx - dy * 0.35, p.y + dy + dx * 0.35); c.stroke();
    }
    for (const pulse of this.pulses) {
      if (pulse.wave && reducedMotion) continue;
      const t = pulse.age / pulse.lifetime;
      c.globalAlpha = Math.pow(1 - t, 3) * (pulse.wave ? 0.6 : 1); c.strokeStyle = pulse.color;
      c.beginPath(); c.arc(pulse.x, pulse.y, Math.max(0, pulse.start + t * (pulse.end - pulse.start)), 0, TAU); c.stroke();
    }
    c.globalAlpha = 1;
  }

  private text(value: string, x: number, y: number, color: string = PALETTE.text, size = 16, weight = 400): void {
    this.ctx.font = `${weight} ${size}px ${FONT}`;
    this.ctx.fillStyle = color; this.ctx.fillText(value, x, y);
  }

  private accentedText(value: string, x: number, y: number, amount: number, base: string = PALETTE.text, size = 16, weight = 400): void {
    this.text(value, x, y, base, size, weight);
    if (amount <= 0) return;
    this.ctx.save(); this.ctx.globalAlpha *= Math.min(1, amount);
    this.text(value, x, y, PALETTE.playerAccent, size, weight); this.ctx.restore();
  }

  private hud(game: Game, input: Input, muted: boolean, reducedMotion: boolean): void {
    const c = this.ctx;
    c.textAlign = 'left';
    this.text('CORE', 16, 31, PALETTE.textMuted);
    for (let cell = 0; cell < CONFIG.castle.coreHealth; cell++) {
      c.beginPath(); c.rect(72 + cell * 18, 18, 13, 14);
      if (cell < game.coreHealth) { c.fillStyle = PALETTE.hostile; c.fill(); }
      else this.stroke(PALETTE.textMuted, 1.5, false);
    }
    this.accentedText(`${game.coreHealth}/${CONFIG.castle.coreHealth}`, 228, 31, Math.pow(this.coreAccent / CONFIG.feedback.coreHit, 3));
    c.textAlign = 'center'; this.accentedText(`ROUND ${String(game.round).padStart(2, '0')}`, 480, 31, Math.pow(this.roundAccent / CONFIG.feedback.roundAccent, 3));
    c.textAlign = 'right'; this.text('LIVES', 844, 31, PALETTE.textMuted); c.textAlign = 'left';
    for (let i = 0; i < CONFIG.lives.maximum; i++) {
      const earned = i === this.earnedLife && this.lifeGain > 0;
      const lost = i === this.lostLife && this.lifeLoss > 0;
      c.save(); c.translate(944 - (CONFIG.lives.maximum - 1 - i) * 18 - 6, 26); c.rotate(-Math.PI / 2);
      if (earned && !reducedMotion) {
        const scale = 1 + CONFIG.feedback.lifeScale * Math.sin(Math.PI * this.lifeGain / CONFIG.feedback.lifeGain);
        c.scale(scale, scale);
      }
      c.beginPath(); c.moveTo(6, 0); c.lineTo(-6, -4.5); c.lineTo(-3, 0); c.lineTo(-6, 4.5); c.closePath();
      c.globalAlpha = i < game.lives ? 1 : 0.3 + (lost ? 0.7 * this.lifeLoss / CONFIG.feedback.lifeLoss : 0);
      this.stroke(earned ? PALETTE.playerAccent : lost ? PALETTE.hostile : i < game.lives ? PALETTE.player : PALETTE.textMuted, 1.5, false); c.restore();
    }
    if (this.hintOpacity > 0) {
      c.save(); c.globalAlpha = this.hintOpacity;
      this.hintGroup(16, ['left', 'right'], 'Rotate', input, reducedMotion, 0);
      this.hintGroup(258, ['thrust'], 'Thrust', input, reducedMotion, 1);
      this.hintGroup(470, ['fire'], 'Fire', input, reducedMotion, 2);
      this.text('Break a path', 726, 788, PALETTE.textMuted);
      this.text('to the core', 726, 804, PALETTE.textMuted);
      c.restore();
    } else {
      this.text(`${BINDINGS.hint.label} controls · ${BINDINGS.restart.label} restart`, 16, 799, PALETTE.textMuted);
      if (game.playable && game.ship.stun > 0) {
        c.textAlign = 'center'; this.text('THRUST OFF · SHOTS ½ SPEED', 480, 799, PALETTE.warning, 12);
      }
      c.textAlign = 'right'; this.accentedText(`${BINDINGS.mute.label} sound ${muted ? 'off' : 'on'}`, 944, 799, Math.pow(this.muteAccent / CONFIG.feedback.statusAccent, 3), PALETTE.textMuted); c.textAlign = 'left';
    }
  }

  private demoActive(action: Action, reducedMotion: boolean): boolean {
    if (reducedMotion) return false;
    const interval = CONFIG.feedback.demoInterval;
    if (action === 'left') return this.hintAge < interval / 2;
    if (action === 'right') return this.hintAge >= interval / 2 && this.hintAge < interval;
    if (action === 'thrust') return this.hintAge >= interval && this.hintAge < interval * 2;
    if (action === 'fire') return this.hintAge >= interval * 2 && this.hintAge < interval * 3;
    return false;
  }

  private hintGroup(x: number, actions: Action[], label: string, input: Input, reducedMotion: boolean, group: number): void {
    const c = this.ctx;
    const demoTime = this.hintAge - group * CONFIG.feedback.demoInterval;
    const demo = actions.some((action) => !this.keys.get(action)?.actual && this.demoActive(action, reducedMotion));
    actions.forEach((action, index) => {
      const level = input.isHeld(action) ? 1 : Math.pow(this.keys.get(action)?.level ?? 0, 3);
      const y = 779 + (reducedMotion ? 0 : CONFIG.feedback.keyTravel * level);
      c.beginPath(); c.roundRect(x + index * 32, y, 26, 26, 4);
      c.fillStyle = PALETTE.keyFill; c.fill();
      this.stroke(PALETTE.textMuted, 1.5, false);
      c.save(); c.globalAlpha *= level * 0.18; c.fillStyle = PALETTE.playerAccent; c.fill(); c.restore();
      c.save(); c.globalAlpha *= level; this.stroke(PALETTE.playerAccent, 1.5, false); c.restore();
      c.textAlign = 'center'; this.accentedText(BINDINGS[action].label, x + index * 32 + 13, y + 19, level);
    });
    c.textAlign = 'left';
    const labelX = x + actions.length * 32 + 8;
    this.text(label, labelX, 798);
    c.save(); c.translate(labelX + label.length * 9.6 + 28, 792);
    c.rotate(-Math.PI / 2 + (demo && group === 0 ? Math.sin(demoTime * 8) * 0.8 : 0));
    c.beginPath(); c.moveTo(9, 0); c.lineTo(-5, -5); c.lineTo(-2, 0); c.lineTo(-5, 5); c.closePath();
    this.stroke(PALETTE.playerAccent, 1.5, false);
    if (demo && group === 1) {
      c.beginPath(); c.moveTo(-5, -2); c.lineTo(-11, 0); c.lineTo(-5, 2); this.stroke(PALETTE.playerAccent, 1.5, false);
    }
    if (demo && group === 2) {
      const distance = 12 + (demoTime * 20) % 10;
      c.beginPath(); c.moveTo(distance, 0); c.lineTo(distance + 3, 0); this.stroke(PALETTE.playerShot, 1.5, false);
    }
    c.restore();
  }
}
