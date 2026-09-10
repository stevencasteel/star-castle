import { CONFIG } from './config';
import type { GameEvent, Ring } from './game';
import type { Cannon } from './threats';

type Source = OscillatorNode | AudioBufferSourceNode;
interface Voice { source: Source; gain: GainNode; filter?: BiquadFilterNode; priority: number; endsAt: number; }
const A = CONFIG.audio;

// One graph per page; cosmetic audio never writes simulation state.
export class Synth {
  muted = false;
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private routine: GainNode | undefined;
  private compressor: DynamicsCompressorNode | undefined;
  private noiseBuffer: AudioBuffer | undefined;
  private engine: OscillatorNode | undefined;
  private engineGain: GainNode | undefined;
  private warning: OscillatorNode | undefined;
  private warningGain: GainNode | undefined;
  private warningActive = false;
  private charge: OscillatorNode | undefined;
  private chargeGain: GainNode | undefined;
  private chargeActive = false;
  private voices = new Set<Voice>();
  private thrusting = false;

  async unlock(): Promise<void> {
    try {
      if (!this.context) {
        const context = new AudioContext(); this.context = context;
        this.master = context.createGain();
        this.master.gain.value = this.muted ? 0 : CONFIG.feedback.masterGain;
        this.compressor = context.createDynamicsCompressor();
        this.compressor.threshold.value = -16; this.compressor.knee.value = 20; this.compressor.ratio.value = 4;
        this.master.connect(this.compressor).connect(context.destination);
        this.routine = context.createGain(); this.routine.connect(this.master);
        this.noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * A.noiseSeconds), context.sampleRate);
        const samples = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        this.engine = context.createOscillator(); this.engine.type = 'triangle'; this.engine.frequency.value = 48;
        this.engineGain = context.createGain(); this.engineGain.gain.value = 0;
        this.engine.connect(this.engineGain).connect(this.routine); this.engine.start();
        this.warning = context.createOscillator(); this.warning.type = 'sine';
        this.warningGain = context.createGain(); this.warningGain.gain.value = 0;
        this.warning.connect(this.warningGain).connect(this.master); this.warning.start();
        this.charge = context.createOscillator(); this.charge.type = 'triangle';
        this.chargeGain = context.createGain(); this.chargeGain.gain.value = 0;
        this.charge.connect(this.chargeGain).connect(this.master); this.charge.start();
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { this.teardownGraph(); }
  }

  consume(events: readonly GameEvent[]): void {
    // One dominant blast for a same-tick trade; both gameplay outcomes remain intact.
    const castleKill = events.some((event) => event.type === 'castle-kill');
    for (const event of events) {
      if (event.type === 'reset') this.silence();
      if (event.type === 'fire') this.tone(1080, 320, CONFIG.feedback.shotDuration, CONFIG.feedback.shotGain, 'triangle');
      if (event.type === 'core-hit' && !castleKill) this.tone(260, 70, A.coreHitDuration, A.coreHitGain, 'triangle', 1);
      if (event.type === 'zap') {
        this.thrust(false);
        this.tone(920, 160, A.zapDuration, A.zapGain, 'sawtooth', 1);
        this.noise(3200, 500, A.zapDuration, A.zapGain / 2, 1);
      }
      if (event.type === 'shield-hit') this.tone(720 + event.ring * 150, 400, A.hitDuration, A.hitGain, 'triangle');
      if (event.type === 'segment-break') {
        this.tone(420 + event.ring * 100, 85, A.breakDuration, A.breakGain, 'sawtooth');
        this.noise(2600, 600, A.breakDuration, A.breakNoiseGain);
      }
      if (event.type === 'rebuilt') this.tone(310, 470, CONFIG.feedback.rebuildAccent, A.rebuiltGain, 'sine');
      if (event.type === 'spawn') this.tone(500, 720, A.spawnDuration, A.spawnGain, 'sine');
      if (event.type === 'life-gain') {
        const half = CONFIG.feedback.lifeTone / 2;
        this.tone(660, 660, half, A.lifeGain, 'sine', 2);
        this.tone(880, 880, half, A.lifeGain, 'sine', 2, half);
      }
      if (event.type === 'spark-warning') this.tone(990, 1150, A.sparkWarningDuration, A.sparkWarningGain, 'sine', 1);
      if (event.type === 'spark-kill') this.tone(620, 150, A.sparkKillDuration, A.sparkKillGain, 'triangle');
      if (event.type === 'cannon-fire') {
        this.tone(160, 55, A.cannonDuration, A.cannonGain, 'triangle', 1);
        this.tone(880, 330, A.cannonDuration / 2, A.cannonChirpGain, 'sine', 1);
      }
      if (event.type === 'cannon-blocked') this.noise(1700, 350, A.blockedDuration, A.blockedGain);
      if (event.type === 'orb-absorbed') this.noise(3400, 900, A.absorbDuration, A.absorbGain);
      if (event.type === 'death' && !castleKill) {
        this.silence(); this.duck();
        this.tone(115, 30, A.deathDuration, A.deathGain, 'sawtooth', 3);
        this.noise(1500, 100, A.deathDuration, A.deathNoiseGain, 3);
      }
      if (event.type === 'castle-kill') {
        this.silence(); this.duck();
        this.tone(170, 32, A.castleDuration, A.castleBassGain, 'sawtooth', 3);
        this.tone(780, 90, A.castleDuration * 0.75, A.castleToneGain, 'triangle', 3);
        this.noise(3000, 80, A.castleDuration, A.castleNoiseGain, 3);
      }
    }
  }

  // Account for scheduled intervals, including retiring voices. A higher-priority
  // cue may replace a routine voice only AFTER its click-preventing fade ends.
  // Three reusable oscillators plus at most thirteen transient sources can sound.
  private startTime(priority: number, delay: number): number | undefined {
    const context = this.context;
    if (!context || !this.master || context.state !== 'running' || this.muted) return undefined;
    let start = context.currentTime + delay;
    const cap = CONFIG.limits.audioVoices - A.sustainedVoices - (priority === 0 ? A.reservedVoices : 0);
    const remaining = (): Voice[] => [...this.voices].filter((voice) => voice.endsAt > start);
    if (remaining().length < cap) return start;
    if (priority === 0) return undefined;
    const victim = remaining().filter((voice) => voice.priority < priority).sort((a, b) => a.priority - b.priority || a.endsAt - b.endsAt)[0];
    if (!victim) {
      // A transition may already have silenced the entire previous burst.
      start = Math.max(start, context.currentTime + A.ramp);
      return remaining().length < cap ? start : undefined;
    }
    this.stopVoice(victim);
    start = Math.max(start, victim.endsAt);
    return remaining().length < cap ? start : undefined;
  }

  private connect(source: Source, start: number, duration: number, volume: number, priority: number, filter?: BiquadFilterNode): void {
    const context = this.context!;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + A.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    if (filter) source.connect(filter).connect(gain); else source.connect(gain);
    gain.connect(priority === 0 ? this.routine! : this.master!);
    const voice: Voice = { source, gain, filter, priority, endsAt: start + duration + A.tail };
    this.voices.add(voice);
    source.onended = () => { source.disconnect(); gain.disconnect(); filter?.disconnect(); this.voices.delete(voice); };
    source.start(start); source.stop(voice.endsAt);
  }

  private tone(from: number, to: number, duration: number, volume: number, type: OscillatorType, priority = 0, delay = 0): void {
    const start = this.startTime(priority, delay); if (start === undefined) return;
    const source = this.context!.createOscillator(); source.type = type;
    const variation = 1 + (Math.random() * 2 - 1) * A.pitchVariation;
    source.frequency.setValueAtTime(from * variation, start);
    source.frequency.exponentialRampToValueAtTime(to * variation, start + duration);
    this.connect(source, start, duration, volume, priority);
  }

  private noise(from: number, to: number, duration: number, volume: number, priority = 0): void {
    const start = this.startTime(priority, 0); if (start === undefined || !this.noiseBuffer) return;
    const source = this.context!.createBufferSource(); source.buffer = this.noiseBuffer;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * A.pitchVariation;
    const filter = this.context!.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(from, start); filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    this.connect(source, start, duration, volume, priority, filter);
  }

  private duck(): void {
    if (!this.context || !this.routine) return;
    const now = this.context.currentTime; const gain = this.routine.gain;
    gain.cancelAndHoldAtTime(now); gain.linearRampToValueAtTime(A.duckGain, now + A.duckAttack);
    gain.setValueAtTime(A.duckGain, now + A.duckAttack + A.duckHold);
    gain.linearRampToValueAtTime(1, now + A.duckAttack + A.duckHold + A.duckRelease);
  }

  cannon(cannon: Cannon, castleAlive: boolean): void {
    const context = this.context;
    if (!context || !this.charge || !this.chargeGain) return;
    const active = castleAlive && !this.muted && (cannon.mode === 'charging' || cannon.mode === 'locked');
    if (this.chargeActive !== active) {
      this.chargeActive = active;
      this.chargeGain.gain.cancelAndHoldAtTime(context.currentTime);
      this.chargeGain.gain.linearRampToValueAtTime(active ? CONFIG.feedback.cannonToneGain : 0, context.currentTime + A.ramp);
    }
    if (active) this.charge.frequency.setTargetAtTime(CONFIG.feedback.cannonToneStart + CONFIG.feedback.cannonToneRange * cannon.elapsed / CONFIG.cannon.charge, context.currentTime, A.ramp);
  }

  rebuild(rings: readonly Ring[], castleAlive: boolean): void {
    const context = this.context;
    if (!context || !this.warning || !this.warningGain) return;
    const warnings = castleAlive ? rings.filter((ring) => ring.rebuild === 'warning') : [];
    const active = warnings.length > 0 && !this.muted;
    if (active !== this.warningActive) {
      this.warningActive = active; this.warningGain.gain.cancelAndHoldAtTime(context.currentTime);
      this.warningGain.gain.linearRampToValueAtTime(active ? A.rebuildGain : 0, context.currentTime + A.ramp);
    }
    if (active) {
      const progress = Math.max(...warnings.map((ring) => 1 - ring.warning / CONFIG.castle.rebuildWarning));
      this.warning.frequency.setTargetAtTime(170 + progress * 220, context.currentTime, A.ramp);
    }
  }

  thrust(active: boolean): void {
    active = active && !this.muted;
    if (this.thrusting === active) return;
    this.thrusting = active;
    if (!this.context || !this.engineGain) { this.thrusting = false; return; }
    const now = this.context.currentTime; this.engineGain.gain.cancelAndHoldAtTime(now);
    this.engineGain.gain.linearRampToValueAtTime(active ? CONFIG.feedback.thrustGain : 0,
      now + (active ? CONFIG.feedback.thrustAudioAttack : CONFIG.feedback.thrustAudioRelease));
  }

  toggle(): void {
    this.muted = !this.muted; this.silence();
    if (this.context && this.master) {
      const now = this.context.currentTime; this.master.gain.cancelAndHoldAtTime(now);
      this.master.gain.linearRampToValueAtTime(this.muted ? 0 : CONFIG.feedback.masterGain, now + A.ramp);
    }
  }

  private stopVoice(voice: Voice): void {
    const now = this.context!.currentTime;
    voice.endsAt = Math.min(voice.endsAt, now + A.ramp);
    voice.gain.gain.cancelAndHoldAtTime(now); voice.gain.gain.linearRampToValueAtTime(0, voice.endsAt);
    voice.source.stop(voice.endsAt);
  }

  silence(): void {
    this.thrusting = false; this.warningActive = false; this.chargeActive = false;
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const node of [this.chargeGain, this.warningGain, this.engineGain]) {
      if (!node) continue;
      node.gain.cancelAndHoldAtTime(now); node.gain.linearRampToValueAtTime(0, now + A.ramp);
    }
    for (const voice of this.voices) this.stopVoice(voice);
    if (this.routine) { this.routine.gain.cancelScheduledValues(now); this.routine.gain.setValueAtTime(1, now); }
  }

  private teardownGraph(): void {
    this.silence();
    this.engine?.stop(); this.engine?.disconnect(); this.engineGain?.disconnect();
    this.warning?.stop(); this.warning?.disconnect(); this.warningGain?.disconnect();
    this.charge?.stop(); this.charge?.disconnect(); this.chargeGain?.disconnect();
    this.routine?.disconnect(); this.master?.disconnect(); this.compressor?.disconnect();
    for (const voice of this.voices) { voice.source.disconnect(); voice.gain.disconnect(); voice.filter?.disconnect(); }
    void this.context?.close().catch(() => undefined); this.voices.clear();
    this.context = undefined; this.master = undefined; this.routine = undefined; this.compressor = undefined; this.noiseBuffer = undefined;
    this.engine = undefined; this.engineGain = undefined; this.warning = undefined; this.warningGain = undefined;
    this.charge = undefined; this.chargeGain = undefined;
  }

  destroy(): void { this.teardownGraph(); }
}
