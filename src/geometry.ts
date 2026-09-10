import { CONFIG, TAU } from './config';
import { angleDelta, mix, wrap } from './math';
import type { Vec, Pose } from './math';
import type { Ring } from './game';

export interface Separation { distance: number; point: Vec; normal: Vec; }
export interface Contact extends Separation { time: number; ring: number; sector: number; }
interface Sector { inner: number; outer: number; start: number; }
export const SECTOR_ANGLE = TAU / CONFIG.castle.sectors;
const EPS = CONFIG.collision.distanceEpsilon;
const CENTER = { x: CONFIG.castle.x, y: CONFIG.castle.y };
const HULL_RADIUS = CONFIG.ship.length * 2 / 3 * CONFIG.ship.hullInset;

export function ringAngle(ring: Ring, time: number): number {
  return ring.previousAngle + angleDelta(ring.previousAngle, ring.angle) * time;
}
export function ringBounds(radius: number): { inner: number; outer: number } {
  return { inner: radius - CONFIG.castle.thickness / 2, outer: radius + CONFIG.castle.thickness / 2 };
}
export function sectorAlive(ring: Ring, index: number, time: number): boolean {
  const segment = ring.segments[index];
  return !!segment && (segment.hp > 0 || time < segment.destroyedAt);
}
function length(a: Vec): number { return Math.hypot(a.x, a.y); }
function subtract(a: Vec, b: Vec): Vec { return { x: a.x - b.x, y: a.y - b.y }; }
function dot(a: Vec, b: Vec): number { return a.x * b.x + a.y * b.y; }
function cross(a: Vec, b: Vec): number { return a.x * b.y - a.y * b.x; }
function polar(r: number, a: number): Vec { return { x: Math.cos(a) * r, y: Math.sin(a) * r }; }
function normalized(a: Vec): Vec { const size = length(a); return size > 1e-12 ? { x: a.x / size, y: a.y / size } : { x: 1, y: 0 }; }
function relative(point: Vec): Vec { return subtract(point, CENTER); }
function within(angle: number, start: number): boolean { return wrap(angle - start, TAU) <= SECTOR_ANGLE + 1e-12; }
function closestOnSegment(point: Vec, a: Vec, b: Vec): Vec {
  const direction = subtract(b, a);
  const t = Math.max(0, Math.min(1, dot(subtract(point, a), direction) / (dot(direction, direction) || 1)));
  return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) };
}
function closestOnArc(point: Vec, radius: number, start: number): Vec {
  const angle = Math.atan2(point.y, point.x);
  if (within(angle, start)) return polar(radius, angle);
  const a = polar(radius, start); const b = polar(radius, start + SECTOR_ANGLE);
  return length(subtract(point, a)) <= length(subtract(point, b)) ? a : b;
}
function sectorNormal(point: Vec, sector: Sector): Vec {
  const radial = normalized(point);
  const radius = length(point);
  if (Math.abs(radius - sector.inner) < EPS * 2) return { x: -radial.x, y: -radial.y };
  if (Math.abs(radius - sector.outer) < EPS * 2) return radial;
  const atStart = Math.abs(angleDelta(sector.start, Math.atan2(point.y, point.x))) < SECTOR_ANGLE / 2;
  return atStart ? { x: radial.y, y: -radial.x } : { x: -radial.y, y: radial.x };
}
function pointSector(point: Vec, sector: Sector): Separation {
  const { inner, outer, start } = sector;
  const candidates = [
    closestOnArc(point, inner, start), closestOnArc(point, outer, start),
    closestOnSegment(point, polar(inner, start), polar(outer, start)),
    closestOnSegment(point, polar(inner, start + SECTOR_ANGLE), polar(outer, start + SECTOR_ANGLE)),
  ];
  let nearest = candidates[0] ?? point;
  let distance = Infinity;
  for (const candidate of candidates) {
    const d = length(subtract(point, candidate));
    if (d < distance) { distance = d; nearest = candidate; }
  }
  const radius = length(point);
  const inside = radius >= inner && radius <= outer && within(Math.atan2(point.y, point.x), start);
  const normal = distance > 1e-12 ? normalized(inside ? subtract(nearest, point) : subtract(point, nearest)) : sectorNormal(nearest, sector);
  return { distance: inside ? -distance : distance, point: nearest, normal };
}

export function hullVertices(pose: Pose): [Vec, Vec, Vec] {
  const f = CONFIG.ship.hullInset;
  const c = Math.cos(pose.angle); const s = Math.sin(pose.angle);
  const transform = (x: number, y: number): Vec => ({ x: pose.x + (x * c - y * s) * f, y: pose.y + (x * s + y * c) * f });
  return [transform(16, 0), transform(-8, -8), transform(-8, 8)];
}
function insideTriangle(p: Vec, vertices: readonly Vec[]): boolean {
  let positive = false; let negative = false;
  for (let i = 0; i < 3; i++) {
    const a = vertices[i]; const b = vertices[(i + 1) % 3];
    if (!a || !b) continue;
    const value = cross(subtract(b, a), subtract(p, a));
    positive ||= value > 1e-10; negative ||= value < -1e-10;
  }
  return !(positive && negative);
}
function triangleCircle(vertices: readonly Vec[], radius: number): Separation {
  let nearest = vertices[0] ?? { x: 1, y: 0 };
  for (let i = 0; i < 3; i++) {
    const a = vertices[i]; const b = vertices[(i + 1) % 3];
    if (!a || !b) continue;
    const candidate = closestOnSegment({ x: 0, y: 0 }, a, b);
    if (length(candidate) < length(nearest)) nearest = candidate;
  }
  const normal = normalized(nearest);
  return { distance: insideTriangle({ x: 0, y: 0 }, vertices) ? -radius : length(nearest) - radius,
    normal, point: { x: normal.x * radius, y: normal.y * radius } };
}

// Exact static closest features: triangle vertices, radial edges, circular arcs,
// arc endpoints, circle/edge intersections, and the line's radial stationary point.
// No polygon approximation of a circle and no enclosing-disc ship collision.
function triangleSector(vertices: readonly Vec[], sector: Sector): Separation {
  let best: Separation = { distance: Infinity, point: { x: 0, y: 0 }, normal: { x: 1, y: 0 } };
  const accept = (shipPoint: Vec, obstaclePoint: Vec): void => {
    const distance = length(subtract(shipPoint, obstaclePoint));
    if (distance < best.distance) best = { distance, point: obstaclePoint,
      normal: distance > 1e-12 ? normalized(subtract(shipPoint, obstaclePoint)) : sectorNormal(obstaclePoint, sector) };
  };
  for (const vertex of vertices) {
    const candidate = pointSector(vertex, sector);
    if (candidate.distance < best.distance) best = candidate;
  }
  if (best.distance <= 0) return best;
  for (const a of [sector.start, sector.start + SECTOR_ANGLE]) {
    for (const r of [sector.inner, sector.outer]) {
      const corner = polar(r, a);
      if (insideTriangle(corner, vertices)) return { distance: 0, point: corner, normal: sectorNormal(corner, sector) };
    }
  }
  for (let i = 0; i < 3; i++) {
    const a = vertices[i]; const b = vertices[(i + 1) % 3];
    if (!a || !b) continue;
    const d = subtract(b, a);
    for (const angle of [sector.start, sector.start + SECTOR_ANGLE]) {
      const p = polar(sector.inner, angle); const q = polar(sector.outer, angle);
      accept(closestOnSegment(p, a, b), p); accept(closestOnSegment(q, a, b), q);
      const edge = subtract(q, p); const denominator = cross(d, edge);
      if (Math.abs(denominator) > 1e-12) {
        const delta = subtract(p, a);
        const t = cross(delta, edge) / denominator; const u = cross(delta, d) / denominator;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { const at = { x: a.x + d.x * t, y: a.y + d.y * t }; accept(at, at); }
      }
    }
    for (const radius of [sector.inner, sector.outer]) {
      for (const angle of [sector.start, sector.start + SECTOR_ANGLE]) {
        const endpoint = polar(radius, angle); accept(closestOnSegment(endpoint, a, b), endpoint);
      }
      const foot = closestOnSegment({ x: 0, y: 0 }, a, b);
      if (length(foot) > 1e-12 && within(Math.atan2(foot.y, foot.x), sector.start)) accept(foot, polar(radius, Math.atan2(foot.y, foot.x)));
      const aa = dot(d, d); const bb = 2 * dot(a, d); const cc = dot(a, a) - radius * radius;
      const discriminant = bb * bb - 4 * aa * cc;
      if (discriminant >= 0 && aa > 1e-12) {
        for (const t of [(-bb - Math.sqrt(discriminant)) / (2 * aa), (-bb + Math.sqrt(discriminant)) / (2 * aa)]) {
          if (t < 0 || t > 1) continue;
          const at = { x: a.x + d.x * t, y: a.y + d.y * t };
          if (within(Math.atan2(at.y, at.x), sector.start)) accept(at, at);
        }
      }
    }
  }
  return best;
}

// Distance is Lipschitz-bounded by the sum of each body's maximum travel.
// Midpoint bounds discard only intervals proven clear. Remaining intervals are
// bisected until their entire uncertainty is <= 0.001 logical units. Searching
// the left interval first gives a deterministic earliest conservative contact.
function sweepDistance(query: (t: number) => Separation, motionBound: number, from: number, to: number): (Separation & { time: number }) | undefined {
  const initial = query(from);
  if (initial.distance <= EPS) return { ...initial, time: from };
  if (to <= from) return undefined;
  const search = (low: number, high: number): (Separation & { time: number }) | undefined => {
    const mid = (low + high) / 2;
    const sample = query(mid);
    const uncertainty = motionBound * (high - low) / 2;
    if (sample.distance > uncertainty + EPS) return undefined;
    if (uncertainty <= EPS / 2 || high - low <= CONFIG.collision.timeEpsilon) return { ...sample, time: low };
    return search(low, mid) ?? search(mid, high);
  };
  return search(from, to);
}
function worldContact(hit: Separation & { time: number }, ring: number, sector: number): Contact {
  return { ...hit, ring, sector, point: { x: hit.point.x + CENTER.x, y: hit.point.y + CENTER.y } };
}
function earlier(a: Contact | undefined, b: Contact | undefined): Contact | undefined {
  if (!a) return b;
  if (!b) return a;
  if (Math.abs(a.time - b.time) > CONFIG.collision.timeEpsilon) return a.time < b.time ? a : b;
  // Outer-to-inner ring, then lowest sector identity, wins equal-time contacts.
  return a.ring < b.ring || (a.ring === b.ring && a.sector <= b.sector) ? a : b;
}

export function sweepCastle(rings: readonly Ring[], from: Pose, to: Pose, radius: number | 'hull', timeStart = 0, timeEnd = 1, includeCore = true): Contact | undefined {
  const movement = length(subtract(to, from));
  const turn = angleDelta(from.angle, to.angle);
  const hullRadius = radius === 'hull' ? HULL_RADIUS : radius;
  const ownMotion = movement + (radius === 'hull' ? Math.abs(turn) * HULL_RADIUS : 0);
  const at = (t: number): Pose => ({ x: mix(from.x, to.x, t), y: mix(from.y, to.y, t), angle: from.angle + turn * t });
  const vertices = (t: number): Vec[] => hullVertices(at(t)).map(relative);
  const nearestPath = closestOnSegment(CENTER, from, to);
  const minRadius = length(subtract(nearestPath, CENTER)) - hullRadius;
  const maxRadius = Math.max(length(relative(from)), length(relative(to))) + hullRadius;
  let best: Contact | undefined;
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    if (!ring) continue;
    const { inner, outer } = ringBounds(ring.radius);
    if (minRadius > outer + EPS || maxRadius < inner - EPS) continue;
    const rotation = Math.abs(angleDelta(ring.previousAngle, ring.angle) * (timeEnd - timeStart));
    for (let s = 0; s < ring.segments.length; s++) {
      const segment = ring.segments[s];
      if (!segment || !sectorAlive(ring, s, timeStart)) continue;
      let end = 1;
      if (segment.hp === 0 && timeEnd > timeStart) end = Math.min(1, (segment.destroyedAt - timeStart) / (timeEnd - timeStart));
      if (end <= 0) continue;
      const query = (t: number): Separation => {
        const sector = { inner, outer, start: ringAngle(ring, mix(timeStart, timeEnd, t)) + s * SECTOR_ANGLE };
        if (radius === 'hull') return triangleSector(vertices(t), sector);
        const separation = pointSector(relative(at(t)), sector);
        return { ...separation, distance: separation.distance - radius };
      };
      const hit = sweepDistance(query, ownMotion + outer * rotation, 0, Math.min(end, best?.time ?? 1));
      if (hit) best = earlier(best, worldContact(hit, r, s));
    }
  }
  if (includeCore && minRadius <= CONFIG.castle.coreRadius + EPS) {
    const query = (t: number): Separation => {
      if (radius === 'hull') return triangleCircle(vertices(t), CONFIG.castle.coreRadius);
      const point = relative(at(t)); const normal = normalized(point);
      return { distance: length(point) - CONFIG.castle.coreRadius - radius, normal, point: polar(CONFIG.castle.coreRadius, Math.atan2(point.y, point.x)) };
    };
    const hit = sweepDistance(query, ownMotion, 0, best?.time ?? 1);
    if (hit) best = earlier(best, worldContact(hit, rings.length, -1));
  }
  return best;
}

// This same radius-aware query is the Phase 3 cannon's static clearance check.
export function clearCastleRay(rings: readonly Ring[], from: Vec, to: Vec, radius: number): boolean {
  return !sweepCastle(rings, { ...from, angle: 0 }, { ...to, angle: 0 }, radius, 1, 1, false);
}

export function hullOverlapsAnnulus(pose: Pose, radius: number): boolean {
  const vertices = hullVertices(pose).map(relative);
  const { inner, outer } = ringBounds(radius);
  const nearest = triangleCircle(vertices, 0).distance;
  const farthest = Math.max(...vertices.map(length));
  return nearest <= outer + CONFIG.collision.separation && farthest >= inner - CONFIG.collision.separation;
}

// A separating-plane correction also handles edge-only overlaps where unsigned
// closest distance is zero. Incrementing an arbitrary epsilon there could leave
// a protected hull embedded when a moving sector end catches up with it.
export function hullSeparationDistance(pose: Pose, rings: readonly Ring[], contact: Contact): number {
  const normal = contact.normal;
  const minimumHull = Math.min(...hullVertices(pose).map((point) => dot(relative(point), normal)));
  const ring = rings[contact.ring];
  let maximumObstacle: number = CONFIG.castle.coreRadius;
  if (ring) {
    const { inner, outer } = ringBounds(ring.radius);
    const start = ring.angle + contact.sector * SECTOR_ANGLE;
    const direction = Math.atan2(normal.y, normal.x);
    maximumObstacle = Math.max(
      dot(polar(inner, start), normal), dot(polar(outer, start), normal),
      dot(polar(inner, start + SECTOR_ANGLE), normal), dot(polar(outer, start + SECTOR_ANGLE), normal),
      within(direction, start) ? outer : -Infinity,
    );
  }
  return Math.max(CONFIG.collision.separation, maximumObstacle - minimumHull + CONFIG.collision.separation);
}

/** Fraction of a straight path for which a non-wrapping projectile is in arena. */
export function arenaExitTime(from: Vec, to: Vec): number {
  let end = 1;
  for (const [a, b, size] of [[from.x, to.x, CONFIG.arena.width], [from.y, to.y, CONFIG.arena.height]]) {
    if (a === undefined || b === undefined || size === undefined) continue;
    if (b < 0 && b < a) end = Math.min(end, -a / (b - a));
    if (b > size && b > a) end = Math.min(end, (size - a) / (b - a));
  }
  return Math.max(0, end);
}

/** Relative-motion circle sweep, used for bullets versus moving spark centers. */
export function sweepCircles(a0: Vec, a1: Vec, b0: Vec, b1: Vec, radius: number): number | undefined {
  const start = subtract(a0, b0);
  const velocity = subtract(subtract(a1, a0), subtract(b1, b0));
  const c = dot(start, start) - radius * radius;
  if (c <= 0) return 0;
  const a = dot(velocity, velocity); if (a <= 1e-12) return undefined;
  const b = 2 * dot(start, velocity);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return undefined;
  const time = (-b - Math.sqrt(discriminant)) / (2 * a);
  return time >= 0 && time <= 1 ? time : undefined;
}

/** Moving circular hazard versus the actual translating/rotating inset hull. */
export function sweepHullCircle(from: Pose, to: Pose, circleFrom: Vec, circleTo: Vec, radius: number): number | undefined {
  const shipMovement = length(subtract(to, from));
  const circleMovement = length(subtract(circleTo, circleFrom));
  const turn = angleDelta(from.angle, to.angle);
  // Cheap enclosing discs reject most pairs, but never decide a hit.
  if (sweepCircles(from, to, circleFrom, circleTo, HULL_RADIUS + radius + EPS) === undefined) return undefined;
  const query = (t: number): Separation => {
    const pose = { x: mix(from.x, to.x, t) - mix(circleFrom.x, circleTo.x, t),
      y: mix(from.y, to.y, t) - mix(circleFrom.y, circleTo.y, t), angle: from.angle + turn * t };
    return triangleCircle(hullVertices(pose), radius);
  };
  return sweepDistance(query, shipMovement + circleMovement + Math.abs(turn) * HULL_RADIUS, 0, 1)?.time;
}

export interface WrappedPiece { from: Pose; to: Pose; start: number; end: number; }
export function splitWrappedPath(from: Pose, to: Pose): WrappedPiece[] {
  const cuts = [0, 1];
  for (const [start, end, size] of [[from.x, to.x, CONFIG.arena.width], [from.y, to.y, CONFIG.arena.height]]) {
    if (start === undefined || end === undefined || size === undefined || start === end) continue;
    if (end < 0) cuts.push((0 - start) / (end - start));
    if (end >= size) cuts.push((size - start) / (end - start));
  }
  cuts.sort((a, b) => a - b);
  const pieces: WrappedPiece[] = [];
  for (let i = 1; i < cuts.length; i++) {
    const start = cuts[i - 1]; const end = cuts[i];
    if (start === undefined || end === undefined || end - start < 1e-12) continue;
    const mid = (start + end) / 2;
    const dx = Math.floor(mix(from.x, to.x, mid) / CONFIG.arena.width) * CONFIG.arena.width;
    const dy = Math.floor(mix(from.y, to.y, mid) / CONFIG.arena.height) * CONFIG.arena.height;
    const sample = (t: number): Pose => ({ x: mix(from.x, to.x, t) - dx, y: mix(from.y, to.y, t) - dy, angle: from.angle + angleDelta(from.angle, to.angle) * t });
    pieces.push({ from: sample(start), to: sample(end), start, end });
  }
  return pieces;
}
