import { ACTIONS, BINDINGS } from './config';
import type { Action } from './config';

export interface InputSnapshot {
  left: boolean; right: boolean; thrust: boolean; fire: boolean; firePressed: boolean;
}

export class Input {
  private held = new Set<Action>();
  private pressed = new Set<Action>();

  key(event: KeyboardEvent, down: boolean): Action | undefined {
    const action = ACTIONS.find((candidate) => BINDINGS[candidate].code === event.code);
    if (!action) return undefined;
    event.preventDefault();
    if (down) {
      if (!event.repeat && !this.held.has(action)) this.pressed.add(action);
      this.held.add(action);
    } else this.held.delete(action);
    return action;
  }

  isHeld(action: Action): boolean { return this.held.has(action); }

  take(action: Action): boolean {
    const value = this.pressed.has(action);
    this.pressed.delete(action);
    return value;
  }

  snapshot(): InputSnapshot {
    return {
      left: this.isHeld('left'), right: this.isHeld('right'),
      thrust: this.isHeld('thrust'), fire: this.isHeld('fire'), firePressed: this.take('fire'),
    };
  }

  clearPresses(): void { this.pressed.clear(); }
  clear(): void { this.held.clear(); this.pressed.clear(); }
}
