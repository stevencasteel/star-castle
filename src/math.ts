import { TAU } from './config';

export interface Vec { x: number; y: number; }
export interface Pose extends Vec { angle: number; }
export function wrap(value: number, size: number): number { return ((value % size) + size) % size; }
export function angleDelta(from: number, to: number): number { return wrap(to - from + Math.PI, TAU) - Math.PI; }
export function wrappedDelta(from: number, to: number, size: number): number { return wrap(to - from + size / 2, size) - size / 2; }
export function mix(a: number, b: number, t: number): number { return a + (b - a) * t; }
