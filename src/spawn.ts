import { CONFIG, TAU } from './config';
import { clearCastleRay } from './geometry';
import { angleDelta, wrap, wrappedDelta } from './math';
import type { Pose, Vec } from './math';
import type { Ring } from './game';
import type { Threats } from './threats';

function separation(a: Vec, b: Vec): number {
  return Math.hypot(wrappedDelta(a.x, b.x, CONFIG.arena.width), wrappedDelta(a.y, b.y, CONFIG.arena.height));
}

// Lower bound on travel time: allow immediate steering toward the spawn, but
// retain acceleration and the round's speed cap. Real turning can only delay it.
function travelTime(distance: number, initialSpeed: number, cap: number): number {
  const speed = Math.min(initialSpeed, cap);
  const acceleration = CONFIG.spark.acceleration;
  const rampTime = (cap - speed) / acceleration;
  const rampDistance = speed * rampTime + acceleration * rampTime * rampTime / 2;
  if (distance <= rampDistance) return (Math.sqrt(speed * speed + 2 * acceleration * distance) - speed) / acceleration;
  return rampTime + (distance - rampDistance) / cap;
}

// Called only after death/round cleanup: no orbs, and every spark is attached.
// This bounded runtime query predicts threats; it never advances the game or RNG.
export function safestSpawn(rings: readonly Ring[], threats: Threats): Pose {
  let best: Pose = { x: CONFIG.ship.spawnX, y: CONFIG.ship.spawnY, angle: CONFIG.ship.spawnAngle };
  let bestArrival = -Infinity; let bestSeparation = -Infinity;
  const hullRadius = CONFIG.ship.length * 2 / 3 * CONFIG.ship.hullInset;
  for (let index = 0; index < CONFIG.spawn.candidates; index++) {
    const bearing = Math.PI / 2 + index * TAU / CONFIG.spawn.candidates;
    const candidate = { x: CONFIG.castle.x + Math.cos(bearing) * CONFIG.spawn.radiusX,
      y: CONFIG.castle.y + Math.sin(bearing) * CONFIG.spawn.radiusY, angle: 0 };
    candidate.angle = Math.atan2(CONFIG.castle.y - candidate.y, CONFIG.castle.x - candidate.x);
    let arrival = Infinity; let nearest = Infinity;
    for (const spark of threats.sparks) {
      const ring = rings[spark.ring]; if (!ring) continue;
      const radius = ring.radius + CONFIG.spark.attachmentOffset;
      const releaseAngle = ring.angle + spark.mountAngle + ring.speed * spark.remaining;
      const release = { x: CONFIG.castle.x + Math.cos(releaseAngle) * radius, y: CONFIG.castle.y + Math.sin(releaseAngle) * radius };
      const distance = Math.max(0, separation(candidate, release) - hullRadius - CONFIG.spark.radius);
      arrival = Math.min(arrival, spark.remaining + travelTime(distance, Math.abs(ring.speed) * radius, threats.sparkSpeed));
      nearest = Math.min(nearest, separation(candidate, spark));
    }
    // Estimate the earliest cannon release after the inhibit and aim turn.
    // Project rotating shields to that instant. A blocked ray contributes no
    // immediate shot; future gap changes still remain the player's responsibility.
    const aim = candidate.angle + Math.PI;
    const turnTime = Math.max(0, Math.abs(angleDelta(threats.cannon.angle, aim)) - CONFIG.cannon.aimTolerance) / CONFIG.cannon.turnSpeed;
    const releaseTime = Math.max(threats.cannon.inhibit, turnTime) + CONFIG.cannon.charge;
    const futureRings = rings.map((ring) => {
      const angle = wrap(ring.angle + ring.speed * releaseTime, TAU);
      return { ...ring, angle, previousAngle: angle };
    });
    // Ellipse bearings differ from the actual ray angle at diagonal positions.
    const rayAngle = aim;
    const dx = Math.cos(rayAngle); const dy = Math.sin(rayAngle);
    const from = { x: CONFIG.castle.x + dx * CONFIG.castle.barrelLength, y: CONFIG.castle.y + dy * CONFIG.castle.barrelLength };
    const tx = Math.abs(dx) > 1e-12 ? ((dx > 0 ? CONFIG.arena.width : 0) - from.x) / dx : Infinity;
    const ty = Math.abs(dy) > 1e-12 ? ((dy > 0 ? CONFIG.arena.height : 0) - from.y) / dy : Infinity;
    const to = { x: from.x + dx * Math.min(tx, ty), y: from.y + dy * Math.min(tx, ty) };
    if (clearCastleRay(futureRings, from, to, CONFIG.cannon.orbRadius)) {
      // Orbs do not wrap, so their travel uses direct distance.
      arrival = Math.min(arrival, releaseTime + Math.max(0, Math.hypot(candidate.x - from.x, candidate.y - from.y) - hullRadius - CONFIG.cannon.orbRadius) / CONFIG.cannon.orbSpeed);
    }
    if (arrival > bestArrival + CONFIG.simulation.timerEpsilon
      || (Math.abs(arrival - bestArrival) <= CONFIG.simulation.timerEpsilon && nearest > bestSeparation)) {
      best = candidate; bestArrival = arrival; bestSeparation = nearest;
    }
  }
  return best;
}
