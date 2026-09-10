export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

// Logical distances are arena units; speeds are units/second and angles radians.
export const CONFIG = {
  tuningVersion: 2,
  seed: 1980,
  arena: { width: 960, height: 720, hud: 48, compositionHeight: 816 },
  simulation: { step: 1 / 60, maxCatchUpTicks: 5, maxPresentationDelta: 0.05, timerEpsilon: 1e-9 },
  ship: {
    length: 24, width: 16, hullInset: 0.85,
    spawnX: 480, spawnY: 620, spawnAngle: -Math.PI / 2,
    turnSpeed: 270 * DEG, acceleration: 220, speedCap: 260,
    drag: 0, protection: 1.2,
  },
  bullet: { speed: 620, radius: 2, trail: 8, interval: 0.14, buffer: 0.08, velocityInheritance: 0 },
  zap: { duration: 2, shotSpeedMultiplier: 0.5, bounceSpeed: 180, restitution: 0.75, retriggerDelay: 0.2 },
  castle: {
    x: 480, y: 360, coreRadius: 22, barrelLength: 32,
    ringRadii: [144, 112, 80], thickness: 10, sectors: 12,
    offsets: [0, 10 * DEG, 20 * DEG],
    segmentHealth: 2, rebuildWarning: 0.65, coreHealth: 8,
  },
  cannon: {
    turnSpeed: 100 * DEG, aimTolerance: 6 * DEG,
    charge: 0.45, lockedDuration: 0.20, recovery: 0.65, spawnInhibit: 1.4,
    orbSpeed: 240, orbRadius: 7,
  },
  spark: {
    length: 18, width: 14, radius: 6, acceleration: 150,
    turnSpeed: 110 * DEG, turnAcceleration: 300 * DEG,
    firstDelays: [6, 9, 12], laterDelays: [2, 4, 6], replacementDelay: 3.5, warning: 0.45,
    safetySeparation: 96, safetyHorizon: 0.75, safetyApproach: 48, safetyDefer: 0.5,
    attachmentOffset: 12,
  },
  collision: { distanceEpsilon: 0.001, separation: 0.025, timeEpsilon: 0.000001, maxSlideContacts: 12 },
  transitions: { death: 0.8, castle: 1, reconstruction: 0.2 },
  spawn: { candidates: 8, radiusX: 360, radiusY: 260 },
  lives: { initial: 3, maximum: 5, clearInterval: 3 },
  progression: [
    { ringSpeeds: [12 * DEG, -16 * DEG, 20 * DEG], sparkSpeed: 110 },
    { ringSpeeds: [12 * DEG, -16 * DEG, 20 * DEG], sparkSpeed: 130 },
    { ringSpeeds: [15 * DEG, -20 * DEG, 25 * DEG], sparkSpeed: 130 },
    { ringSpeeds: [15 * DEG, -20 * DEG, 25 * DEG], sparkSpeed: 145 },
    { ringSpeeds: [18 * DEG, -24 * DEG, 30 * DEG], sparkSpeed: 145 },
  ],
  limits: { playerShots: 64, enemyShots: 16, sparks: 3, particles: 400, audioVoices: 16, maxDpr: 2 },
  feedback: {
    secondaryStroke: 1.5, silhouetteStroke: 2, emphasisStroke: 3,
    glowWidth: 6, glowOpacity: 0.16,
    muzzleDuration: 0.08, muzzleStart: 6, muzzleEnd: 9,
    thrustAttack: 0.04, thrustSettle: 0.08, thrustRelease: 0.10,
    plumePeak: 18, plumeRest: 14, engineStretch: 0.03,
    particleLifetime: 0.18, particleRate: 24,
    masterGain: 0.22, shotGain: 0.075, thrustGain: 0.055,
    shotDuration: 0.045, thrustAudioAttack: 0.04, thrustAudioRelease: 0.08,
    hintMinimum: 4, hintMaximum: 10, hintFade: 0.25,
    hitFlash: 0.09, hitFlecks: 4, hitLifetime: 0.16,
    breakFragments: 8, breakLifetime: 0.28, breakSpeedMin: 50, breakSpeedMax: 110,
    rebuildAccent: 0.12, deathFragments: 14, deathLifetime: 0.55,
    castleLifetime: 0.65, castleStagger: 0.12, waveLifetime: 0.45, waveRadius: 180,
    cannonRecoil: 3, cannonRelease: 0.12, cannonBlocked: 0.10,
    orbAbsorb: 0.10, orbAbsorbRadius: 5,
    sparkContraction: 0.15, sparkRelease: 0.08, sparkFragments: 6, sparkLifetime: 0.20,
    cannonToneGain: 0.065, cannonToneStart: 210, cannonToneRange: 520,
    lifeGain: 0.25, lifeScale: 0.15, lifeTone: 0.18, lifeLoss: 0.18, roundAccent: 0.25,
    coreHit: 0.16, zapFlash: 0.18, zapRadius: 20,
    weaponRecovery: 0.08, weaponOffset: 2, keyTravel: 2, keyRelease: 0.10,
    hintReveal: 0.15, demoInterval: 0.8, statusAccent: 0.15,
    shakeCap: 5, shakeImpulses: 16,
    breakShake: 0.6, breakShakeTime: 0.08,
    deathShake: 3, deathShakeTime: 0.25, castleShake: 5, castleShakeTime: 0.35,
    deathStop: 0.05, castleStop: 0.07,
    particleOpacity: 0.6, reducedParticleOpacity: 0.3, reducedParticleTravel: 0.35,
    orbHaloStretch: 0.7, sparkTail: 11,
  },
  audio: {
    ramp: 0.008, attack: 0.004, tail: 0.01, pitchVariation: 0.02,
    duckGain: 0.3, duckAttack: 0.012, duckHold: 0.12, duckRelease: 0.28,
    reservedVoices: 4, sustainedVoices: 3, noiseSeconds: 1,
    hitDuration: 0.06, hitGain: 0.07, breakDuration: 0.10, breakGain: 0.10,
    breakNoiseGain: 0.035, rebuildGain: 0.035, rebuiltGain: 0.045,
    spawnDuration: 0.10, spawnGain: 0.04, lifeGain: 0.07,
    sparkWarningDuration: 0.06, sparkWarningGain: 0.055,
    sparkKillDuration: 0.08, sparkKillGain: 0.075,
    cannonDuration: 0.12, cannonGain: 0.14, cannonChirpGain: 0.035,
    blockedDuration: 0.08, blockedGain: 0.035, absorbDuration: 0.06, absorbGain: 0.03,
    deathDuration: 0.25, deathGain: 0.20, deathNoiseGain: 0.10,
    castleDuration: 0.40, castleBassGain: 0.22, castleToneGain: 0.12, castleNoiseGain: 0.12,
    coreHitDuration: 0.12, coreHitGain: 0.10, zapDuration: 0.18, zapGain: 0.09,
  },
} as const;

export function roundParameters(round: number): (typeof CONFIG.progression)[number] {
  return CONFIG.progression[Math.min(CONFIG.progression.length - 1, Math.max(0, round - 1))] ?? CONFIG.progression[0];
}

export const PALETTE = {
  background: '#080B12', player: '#ECFCFF', playerAccent: '#66E3FF', playerShot: '#ECFCFF',
  shieldOuter: '#638DA8', shieldMiddle: '#927BAF', shieldInner: '#589B91',
  hostile: '#FF784F', warning: '#FFC56A', text: '#DCE5EF', textMuted: '#98A6B7',
  keyFill: '#111B29',
} as const;

export const BINDINGS = {
  left: { code: 'ArrowLeft', label: '←' },
  right: { code: 'ArrowRight', label: '→' },
  thrust: { code: 'ArrowUp', label: '↑' },
  fire: { code: 'KeyX', label: 'X' },
  restart: { code: 'KeyR', label: 'R' },
  mute: { code: 'KeyM', label: 'M' },
  hint: { code: 'KeyH', label: 'H' },
} as const;
export type Action = keyof typeof BINDINGS;
export const ACTIONS = Object.keys(BINDINGS) as Action[];
