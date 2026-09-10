import './style.css';
import { CONFIG } from './config';
import { Game } from './game';
import { Input } from './input';
import { Renderer } from './render';
import { Synth } from './audio';

const canvas = document.querySelector<HTMLCanvasElement>('#arena');
if (!canvas) throw new Error('The game canvas is missing.');
const context = canvas.getContext('2d', { alpha: false });
if (!context) throw new Error('Canvas 2D is unavailable in this browser.');
const game = new Game();
const input = new Input();
const renderer = new Renderer(context);
const synth = new Synth();
const listeners = new AbortController();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let active = document.hasFocus() && !document.hidden;
let previousTime: number | undefined;
let accumulator = 0;
let frame = 0;
let hitStop = 0;
let snapWorld = false;

function resize(): void {
  if (!canvas || !context) return;
  const scale = Math.min(window.innerWidth / CONFIG.arena.width, window.innerHeight / CONFIG.arena.compositionHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.limits.maxDpr);
  const width = CONFIG.arena.width * scale;
  const height = CONFIG.arena.compositionHeight * scale;
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  context.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  renderer.draw(game, input, 1, synth.muted, reducedMotion.matches);
}

function focusChanged(): void {
  active = document.hasFocus() && !document.hidden;
  input.clear(); game.clearFireBuffer(); synth.silence();
  renderer.suspend();
  previousTime = undefined; accumulator = 0; hitStop = 0; snapWorld = true;
}

function consumeEvents(): void {
  const events = game.drainEvents();
  if (events.some((event) => event.type === 'clear-input' || event.type === 'reset')) input.clearPresses();
  for (const event of events) {
    if (event.type === 'reset') { hitStop = 0; snapWorld = true; }
    if (!reducedMotion.matches) {
      if (event.type === 'death') hitStop = Math.max(hitStop, CONFIG.feedback.deathStop);
      if (event.type === 'castle-kill') hitStop = Math.max(hitStop, CONFIG.feedback.castleStop);
    }
  }
  renderer.consume(events); synth.consume(events);
}

window.addEventListener('keydown', (event) => {
  if (!active || event.metaKey || event.ctrlKey || event.altKey) return;
  const action = input.key(event, true);
  if (action) {
    if (!event.repeat) renderer.keyPressed(action);
    if (!game.playable) input.take('fire');
    void synth.unlock();
  }
}, { signal: listeners.signal });
window.addEventListener('keyup', (event) => { input.key(event, false); }, { signal: listeners.signal });
window.addEventListener('pointerdown', () => { if (active) void synth.unlock(); }, { signal: listeners.signal });
window.addEventListener('blur', focusChanged, { signal: listeners.signal });
window.addEventListener('focus', focusChanged, { signal: listeners.signal });
document.addEventListener('visibilitychange', focusChanged, { signal: listeners.signal });
window.addEventListener('resize', resize, { signal: listeners.signal });

function animate(milliseconds: number): void {
  frame = requestAnimationFrame(animate);
  if (!active) { previousTime = undefined; return; }
  const elapsed = previousTime === undefined ? 0 : Math.max(0, (milliseconds - previousTime) / 1000);
  previousTime = milliseconds;
  const presentationDelta = Math.min(elapsed, CONFIG.simulation.maxPresentationDelta);
  if (input.take('mute')) { synth.toggle(); renderer.muteChanged(); }
  if (input.take('hint')) renderer.replayHint();
  if (input.take('restart')) {
    game.reset(); input.clearPresses(); accumulator = 0; consumeEvents();
  }
  // Presentation runs before new events so their attack is visible for a full
  // frame. A stopped frame discards elapsed simulation time, never banks a burst.
  renderer.update(presentationDelta, game, input, reducedMotion.matches);
  const stopped = hitStop > 0 && !reducedMotion.matches;
  const remainingStop = hitStop - presentationDelta;
  hitStop = reducedMotion.matches || remainingStop <= CONFIG.simulation.timerEpsilon ? 0 : remainingStop;
  if (stopped) { accumulator = 0; snapWorld = true; }
  else accumulator = Math.min(accumulator + elapsed, CONFIG.simulation.step * CONFIG.simulation.maxCatchUpTicks);
  let ticks = 0;
  while (accumulator >= CONFIG.simulation.step && ticks < CONFIG.simulation.maxCatchUpTicks) {
    game.update(CONFIG.simulation.step, input.snapshot());
    accumulator -= CONFIG.simulation.step; ticks++;
    snapWorld = false;
    consumeEvents();
    if (hitStop > 0) { accumulator = 0; snapWorld = true; break; }
  }
  synth.thrust(game.playable && game.ship.thrusting);
  synth.rebuild(game.rings, game.castleAlive);
  synth.cannon(game.threats.cannon, game.castleAlive);
  renderer.draw(game, input, snapWorld ? 1 : accumulator / CONFIG.simulation.step, synth.muted, reducedMotion.matches);
}

consumeEvents(); resize(); frame = requestAnimationFrame(animate);
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancelAnimationFrame(frame); listeners.abort(); input.clear(); synth.destroy();
  });
}
